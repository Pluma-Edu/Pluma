import Link from 'next/link';
import { requireTeacher } from '@/lib/auth/require';
import { listClasses } from '@/lib/classroom/teacher';
import { signOut } from '../login/actions';
import { NewClassForm } from './new-class-form';

export const dynamic = 'force-dynamic';

export default async function TeacherHome() {
  const teacherId = await requireTeacher();
  const classes = await listClasses(teacherId);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Your classes</h1>
        <form action={signOut}>
          <button className="text-sm text-neutral-500 underline underline-offset-4">Sign out</button>
        </form>
      </div>

      {classes.length === 0 && (
        <p className="mt-6 text-sm text-neutral-600">
          No classes yet. Making one takes about fifteen seconds.
        </p>
      )}

      <ul className="mt-6 divide-y divide-neutral-200 border-y border-neutral-200">
        {classes.map((c) => (
          <li key={c.id} className="flex items-center justify-between py-3">
            <div>
              <Link href={`/teacher/${c.id}`} className="font-medium underline underline-offset-4">
                {c.name}
              </Link>
              <p className="text-sm text-neutral-500">
                {c.course_name} &middot; {c.student_count} student{c.student_count === '1' ? '' : 's'}
              </p>
            </div>
            <code className="rounded bg-neutral-100 px-2 py-1 font-mono text-sm tracking-widest">
              {c.class_code}
            </code>
          </li>
        ))}
      </ul>

      <NewClassForm />
    </main>
  );
}
