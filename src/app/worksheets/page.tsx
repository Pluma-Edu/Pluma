import Link from 'next/link';
import type { Metadata } from 'next';
import { listCourses } from '@/lib/library/queries';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Free Spanish Worksheets — Printable PDFs | Pluma',
  description:
    'Thousands of free printable Spanish worksheets by course and skill. '
    + 'PDF download, no account needed. Answer keys free for teachers.',
};

export default async function LibraryIndex() {
  const courses = await listCourses();
  const total = courses.reduce((n, c) => n + Number(c.worksheet_count), 0);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Free printable worksheets</h1>
      <p className="mt-2 max-w-xl text-neutral-600">
        {total} worksheets, every one a PDF you can download and photocopy without an account.
        Answer keys are free too — they just need a teacher login.
      </p>

      <ul className="mt-10 divide-y divide-neutral-200 border-y border-neutral-200">
        {courses.map((c) => (
          <li key={c.course_slug} className="py-4">
            <Link href={`/worksheets/${c.subject_slug}/${c.course_slug}`}
                  className="text-lg font-medium underline underline-offset-4">
              {c.course_name}
            </Link>
            <p className="text-sm text-neutral-500">
              {c.worksheet_count} worksheets
              {c.grade_low && c.grade_high ? ` · typically grades ${c.grade_low}–${c.grade_high}` : ''}
            </p>
          </li>
        ))}
      </ul>
    </main>
  );
}
