import { notFound, redirect } from 'next/navigation';
import { findClassByCode, loadTargetItems } from '@/lib/classroom/student';
import { currentStudent } from '@/lib/auth/session';
import { Player } from './player';

export const dynamic = 'force-dynamic';

export default async function PlayPage({
  params,
}: { params: Promise<{ code: string; targetId: string }> }) {
  const { code, targetId } = await params;
  const klass = await findClassByCode(code);
  if (!klass) notFound();

  const student = await currentStudent();
  if (!student || student.classId !== klass.id) redirect(`/go/${code}`);

  // Scoped to this student's own target. The payload carries no answers.
  const { title, submitted, items } = await loadTargetItems(targetId, student.rosterEntryId);

  return (
    <main className="mx-auto max-w-lg px-6 py-12">
      <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
      {submitted && (
        <p className="mt-2 rounded bg-neutral-100 px-3 py-2 text-sm">You already turned this in.</p>
      )}
      <Player code={code.toUpperCase()} targetId={targetId} items={items} alreadyDone={submitted} />
    </main>
  );
}
