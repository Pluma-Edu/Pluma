import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getWorksheet, previewItems, relatedWorksheets, allWorksheetPaths } from '@/lib/library/queries';
import { publicUrlFor } from '@/lib/storage';

export const revalidate = 3600;

type Props = { params: Promise<{ subject: string; course: string; skill: string; slug: string }> };

export async function generateStaticParams() {
  return (await allWorksheetPaths()).map((p) => ({
    subject: p.subject, course: p.course, skill: p.skill, slug: p.slug,
  }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await params;
  const w = await getWorksheet(p.subject, p.course, p.skill, p.slug);
  if (!w) return {};
  return {
    title: `${w.title} | Free PDF`,
    description: w.meta_description ?? undefined,
    alternates: { canonical: `/worksheets/${p.subject}/${p.course}/${p.skill}/${p.slug}` },
    openGraph: { title: w.title, description: w.meta_description ?? undefined, type: 'article' },
  };
}

export default async function WorksheetPage({ params }: Props) {
  const p = await params;
  const w = await getWorksheet(p.subject, p.course, p.skill, p.slug);
  if (!w) notFound();

  // Deliberately no session read here. This page is the acquisition surface and
  // must stay fully cacheable; a per-visitor label would freeze into the cache
  // and lie to whoever got it second. The gate page owns the auth decision.
  const [preview, related] = await Promise.all([
    previewItems(w.item_set_id),
    relatedWorksheets(w.id, 6),
  ]);

  const base = `/worksheets/${p.subject}/${p.course}/${p.skill}`;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <script
        type="application/ld+json"
        // Structured data: teachers find these through search, not through us.
        dangerouslySetInnerHTML={{ __html: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'LearningResource',
          name: w.title,
          description: w.meta_description,
          learningResourceType: 'Worksheet',
          educationalLevel: w.course_name,
          teaches: w.skill_name,
          inLanguage: 'es',
          isAccessibleForFree: true,
          encodingFormat: 'application/pdf',
        }) }}
      />

      <nav className="text-sm text-neutral-500">
        <Link href="/worksheets" className="underline underline-offset-4">Worksheets</Link>
        <span className="mx-2">/</span>
        <Link href={`/worksheets/${p.subject}/${p.course}`} className="underline underline-offset-4">
          {w.course_name}
        </Link>
        <span className="mx-2">/</span>
        <Link href={base} className="underline underline-offset-4">{w.skill_name}</Link>
      </nav>

      <h1 className="mt-3 text-2xl font-semibold tracking-tight">{w.title}</h1>
      <p className="mt-2 text-neutral-600">{w.meta_description}</p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <a href={publicUrlFor(w.pdf_key ?? '')} download
           className="rounded bg-neutral-900 px-4 py-2.5 text-white">
          Download the PDF
        </a>
        <Link href={`${base}/${p.slug}/answer-key`}
              className="rounded border border-neutral-300 px-4 py-2.5">
          Answer key
        </Link>
        <span className="text-sm text-neutral-500">
          {w.item_count} questions · the worksheet needs no account
        </span>
      </div>

      {/* The preview is real text on the page, not a picture of a PDF. It is
          what makes the page worth indexing and what lets a teacher judge the
          sheet before downloading it. */}
      <section className="mt-12">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Preview</h2>
        <ol className="mt-4 space-y-4 rounded border border-neutral-200 p-6">
          {preview.map((item) => (
            <li key={item.position} className="font-serif">
              <span className="mr-2 font-semibold">{item.position}.</span>{item.stem}
              {item.choices.length > 0 && (
                <ul className="mt-1 grid grid-cols-2 gap-x-6 text-[15px]">
                  {item.choices.map((c) => (
                    <li key={c.key}><span className="font-semibold">{c.key}.</span> {c.text}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
          <li className="pt-2 text-sm italic text-neutral-500">
            …and {Number(w.item_count) - preview.length} more in the PDF.
          </li>
        </ol>
      </section>

      {related.length > 0 && (
        <section className="mt-12">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Related</h2>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {related.map((r) => (
              <li key={r.id}>
                <Link href={`/worksheets/${r.subject_slug}/${r.course_slug}/${r.skill_slug}/${r.slug}`}
                      className="block rounded border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50">
                  {r.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
