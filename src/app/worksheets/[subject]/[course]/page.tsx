import Link from 'next/link';
import { SiteNav, SiteFooter } from '@/components/site-chrome';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { listSkills, listCourses } from '@/lib/library/queries';

export const revalidate = 3600;

type Props = { params: Promise<{ subject: string; course: string }> };

export async function generateStaticParams() {
  return (await listCourses()).map((c) => ({ subject: c.subject_slug, course: c.course_slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { subject, course } = await params;
  const match = (await listCourses()).find((c) => c.subject_slug === subject && c.course_slug === course);
  if (!match) return {};
  return {
    title: `${match.course_name} Worksheets — Free Printable PDFs | Pluma`,
    description: `Free ${match.course_name} worksheets by topic. Printable PDFs, no account needed.`,
  };
}

export default async function CoursePage({ params }: Props) {
  const { subject, course } = await params;
  const match = (await listCourses()).find((c) => c.subject_slug === subject && c.course_slug === course);
  if (!match) notFound();
  const skills = await listSkills(subject, course);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav />
      <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <nav className="text-sm text-neutral-500">
        <Link href="/worksheets" className="underline underline-offset-4">Worksheets</Link>
        <span className="mx-2">/</span>{match.course_name}
      </nav>

      <h1 className="mt-3 text-2xl font-semibold tracking-tight">{match.course_name} worksheets</h1>
      <p className="mt-2 text-neutral-600">
        {match.worksheet_count} printable worksheets across {skills.length} topics.
      </p>

      <ul className="mt-10 divide-y divide-neutral-200 border-y border-neutral-200">
        {skills.map((s) => (
          <li key={s.skill_slug} className="flex items-baseline justify-between py-3">
            <div>
              <Link href={`/worksheets/${subject}/${course}/${s.skill_slug}`}
                    className="font-medium underline underline-offset-4">
                {s.skill_name}
              </Link>
              {s.unit_label && <span className="ml-2 text-xs text-neutral-500">{s.unit_label}</span>}
            </div>
            <span className="text-sm text-neutral-500">{s.worksheet_count}</span>
          </li>
        ))}
      </ul>
      </main>
      <SiteFooter />
    </div>
  );
}
