import Link from 'next/link';
import { SiteNav, SiteFooter } from '@/components/site-chrome';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { listWorksheets, allWorksheetPaths } from '@/lib/library/queries';

export const revalidate = 3600;

type Props = { params: Promise<{ subject: string; course: string; skill: string }> };

export async function generateStaticParams() {
  const seen = new Set<string>();
  const out: Array<{ subject: string; course: string; skill: string }> = [];
  for (const p of await allWorksheetPaths()) {
    const key = `${p.subject}/${p.course}/${p.skill}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ subject: p.subject, course: p.course, skill: p.skill });
  }
  return out;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { subject, course, skill } = await params;
  const sheets = await listWorksheets(subject, course, skill);
  if (sheets.length === 0) return {};
  const s = sheets[0];
  return {
    title: `${s.skill_name} Worksheets — ${s.course_name} | Pluma`,
    description: `Free printable ${s.course_name} worksheets on ${s.skill_name.toLowerCase()}. `
      + `${sheets.length} PDFs at different levels, with answer keys.`,
  };
}

export default async function SkillPage({ params }: Props) {
  const { subject, course, skill } = await params;
  const sheets = await listWorksheets(subject, course, skill);
  if (sheets.length === 0) notFound();
  const head = sheets[0];

  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav />
      <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <nav className="text-sm text-neutral-500">
        <Link href="/worksheets" className="underline underline-offset-4">Worksheets</Link>
        <span className="mx-2">/</span>
        <Link href={`/worksheets/${subject}/${course}`} className="underline underline-offset-4">
          {head.course_name}
        </Link>
        <span className="mx-2">/</span>{head.skill_name}
      </nav>

      <h1 className="mt-3 text-2xl font-semibold tracking-tight">
        {head.skill_name} worksheets
      </h1>
      <p className="mt-2 text-neutral-600">
        {sheets.length} printable PDFs for {head.course_name}, at different levels and formats.
      </p>

      <ul className="mt-10 space-y-3">
        {sheets.map((w) => (
          <li key={w.id} className="rounded border border-neutral-200 p-4">
            <Link href={`/worksheets/${subject}/${course}/${skill}/${w.slug}`}
                  className="font-medium underline underline-offset-4">
              {w.title}
            </Link>
            <p className="mt-1 text-sm text-neutral-500">{w.item_count} questions</p>
          </li>
        ))}
      </ul>
      </main>
      <SiteFooter />
    </div>
  );
}
