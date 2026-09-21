import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { findClassByCode, targetsFor } from '@/lib/classroom/student';
import { currentStudent } from '@/lib/auth/session';
import { leaveAction } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function WorkPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const klass = await findClassByCode(code);
  if (!klass) notFound();

  const student = await currentStudent();
  if (!student || student.classId !== klass.id) redirect(`/go/${code}`);

  const targets = await targetsFor(student.rosterEntryId, klass.id);
  const open = targets.filter((t) => !t.submitted_at);
  const done = targets.filter((t) => t.submitted_at);

  return (
    <main className="mx-auto max-w-md px-6 py-14">
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-semibold tracking-tight">{klass.name}</h1>
        <form action={leaveAction}>
          <input type="hidden" name="code" value={code.toUpperCase()} />
          <button className="text-xs text-neutral-500 underline underline-offset-4">not me</button>
        </form>
      </div>

      <h2 className="mt-8 text-xs uppercase tracking-wide text-neutral-500">To do</h2>
      <ul className="mt-2 space-y-2">
        {open.map((t) => (
          <li key={t.target_id}>
            <Link href={`/go/${code.toUpperCase()}/work/${t.target_id}`}
                  className="block rounded border border-neutral-300 px-4 py-3 hover:bg-neutral-50">
              <span className="font-medium">{t.title}</span>
              <span className="block text-sm text-neutral-500">
                {t.item_count} questions
                {t.due_at ? ` · due ${new Date(t.due_at).toLocaleDateString()}` : ''}
              </span>
            </Link>
          </li>
        ))}
        {open.length === 0 && (
          <li className="text-sm text-neutral-500">Nothing to do right now.</li>
        )}
      </ul>

      {done.length > 0 && (
        <>
          <h2 className="mt-8 text-xs uppercase tracking-wide text-neutral-500">Finished</h2>
          <ul className="mt-2 space-y-1 text-sm text-neutral-600">
            {done.map((t) => <li key={t.target_id}>{t.title} ✓</li>)}
          </ul>
        </>
      )}
    </main>
  );
}
