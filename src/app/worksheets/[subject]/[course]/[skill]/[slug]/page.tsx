import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  getWorksheet, previewItems, relatedWorksheets, allWorksheetPaths,
} from '@/lib/library/queries';
import { publicUrlFor } from '@/lib/storage';
import { instructionsFor } from '@/lib/render/instructions';
import { estimatedMinutes } from '@/lib/library/codes';
import { PaperPreview, PaperThumb } from '@/components/paper-preview';
import { SiteNav, SiteFooter, Pill, CheckLine } from '@/components/site-chrome';
import { PlumaMark } from '@/components/logo';
import { publicSkillName } from '@/lib/taxonomy/seed-spanish';

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

  // Deliberately no session read. This is the acquisition surface and must stay
  // fully cacheable; a per-visitor label would freeze into the cache and be
  // wrong for whoever got it second. The answer-key route owns that decision.
  const [preview, related] = await Promise.all([
    previewItems(w.item_set_id),
    relatedWorksheets(w.id, 4),
  ]);

  // The masthead title must be the one the PDF actually carries — the builder
  // prints publicSkillName, so the preview has to resolve it the same way or it
  // shows a document that does not exist.
  const mastheadTitle = publicSkillName(w.skill_slug, w.skill_name);
  const base = `/worksheets/${p.subject}/${p.course}/${p.skill}`;
  const href = `${base}/${p.slug}`;
  const itemCount = Number(w.item_count);
  const pages = w.page_count ?? 1;
  const minutes = estimatedMinutes(itemCount, w.item_type ?? 'cloze');
  const grades = w.grade_band_low && w.grade_band_high
    ? `Grades ${w.grade_band_low}–${Math.min(w.grade_band_high, 12)}${w.grade_band_high > 12 ? ' + college' : ''}`
    : null;

  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav />

      <div className="mx-auto flex w-full max-w-[1180px] flex-wrap gap-2 px-5 pt-5 text-sm text-ink-muted">
        <Link href="/worksheets" className="text-ink-muted no-underline hover:text-ink">Worksheets</Link>
        <span>/</span>
        <Link href={`/worksheets/${p.subject}/${p.course}`} className="text-ink-muted no-underline hover:text-ink">
          {w.course_name}
        </Link>
        <span>/</span>
        <Link href={base} className="text-ink-muted no-underline hover:text-ink">{w.skill_name}</Link>
      </div>

      <header className="mx-auto flex w-full max-w-[1180px] flex-col gap-3.5 px-5 pt-4 pb-6">
        <h1 className="m-0 max-w-[22ch] text-balance font-bold leading-[1.12] tracking-[-0.025em]
                       text-[clamp(28px,4vw,42px)]">
          {w.title}
        </h1>
        <p className="m-0 max-w-[62ch] text-[18px] leading-[1.6] text-ink-soft">
          {w.meta_description}
        </p>
        <div className="flex flex-wrap gap-2">
          <Pill>{[w.course_name, w.unit_label].filter(Boolean).join(' · ')}</Pill>
          {w.skill_code && <Pill>{w.skill_code}</Pill>}
          {grades && <Pill>{grades}</Pill>}
          <Pill>{pages} {pages === 1 ? 'page' : 'pages'} · {itemCount} items · ~{minutes} min</Pill>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1180px] grid-cols-[repeat(auto-fit,minmax(310px,1fr))]
                       items-start gap-8 px-5 pb-16">

        <div className="flex min-w-0 flex-col gap-3.5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-muted">
              Page 1 of {pages} — full preview
            </div>
            <a href={publicUrlFor(w.pdf_key ?? '')} className="text-sm">Open the PDF →</a>
          </div>

          <PaperPreview
            title={mastheadTitle}
            eyebrow={[w.course_name, w.unit_label].filter(Boolean).join(' · ')}
            instructions={instructionsFor(preview.map((i) => ({
              item_type: i.item_type, tenseLabel: i.instructions,
            })))}
            items={preview}
            footerLeft={w.skill_code ?? undefined}
            footerRight={`Page 1 of ${pages}`}
          />

          <div className="flex flex-wrap items-center gap-4 text-sm text-ink-muted">
            <CheckLine>Prints clean in black and white</CheckLine>
            <CheckLine>US Letter</CheckLine>
            <CheckLine>No watermark</CheckLine>
          </div>
        </div>

        <div className="sticky top-[76px] flex min-w-0 flex-col gap-4">

          <a href={publicUrlFor(w.pdf_key ?? '')} download
             className="flex items-center gap-3.5 rounded-lg bg-primary px-5 py-5 text-paper no-underline
                        hover:bg-primary-hover">
            <span className="text-[26px] leading-none">↓</span>
            <span className="flex flex-col gap-0.5">
              <span className="text-[20px] font-bold">Download the worksheet</span>
              <span className="text-[15px] opacity-90">
                PDF · {pages} {pages === 1 ? 'page' : 'pages'} · free, no account, no email
              </span>
            </span>
          </a>

          {/*
            One card, not two. The design has a signed-in variant; rendering it
            would mean reading the session, which would make this page
            uncacheable for the anonymous visitors it exists to serve. The copy
            is true either way, and /answer-key sends a signed-in teacher
            straight to the file without stopping here.
          */}
          <div className="overflow-hidden rounded-lg border-2 border-teal-deep">
            <div className="flex items-center justify-between gap-2.5 bg-teal-deep px-5 py-3
                            text-[15px] font-bold text-paper">
              <span>Answer key</span>
              <span className="rounded-full bg-paper px-2.5 py-1 font-mono text-[11px]
                               uppercase tracking-[0.08em] text-teal-ink">Free account</span>
            </div>
            <div className="flex flex-col gap-3.5 bg-paper p-5">
              <p className="m-0 text-[16px] leading-[1.55] text-ink-soft">
                The worksheet above is yours either way. The key is behind a free account so we
                know a teacher is asking — that is the whole reason.
              </p>
              <div className="flex flex-col gap-2.5">
                <CheckLine>All {itemCount} answers, laid out like the worksheet</CheckLine>
                <CheckLine>Why each answer is right, in one line per item</CheckLine>
                <CheckLine>Same page size, ready to photocopy</CheckLine>
              </div>
              <Link href={`${href}/answer-key`}
                    className="rounded-[11px] bg-teal-deep px-5 py-3.5 text-center text-[17px]
                               font-bold text-paper no-underline hover:opacity-90">
                Get the answer key
              </Link>
              <p className="m-0 text-[13px] leading-[1.5] text-ink-muted">
                Email and a password. No card, no school approval, no trial clock.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3.5 rounded-lg border border-rule bg-paper-sunk p-5">
            <div className="flex items-center gap-2.5">
              <PlumaMark height={25} tone="tangerine" />
              <div className="text-[19px] font-bold tracking-[-0.01em]">Make this for my class</div>
            </div>
            <p className="m-0 text-[16px] leading-[1.55] text-ink-soft">
              Same skill, drawn for your students: shorter for the ones who need it, harder for
              the ones who are bored, and you see who actually got it.
            </p>
            <div className="flex flex-col gap-2 text-sm text-ink-soft">
              {['Pick a class or a single student',
                'They join with a class code — no student accounts',
                'Per-skill results, not just a percentage'].map((line) => (
                <div key={line} className="flex items-center gap-2.5">
                  <span className="h-1.5 w-1.5 flex-none rounded-full bg-tangerine-bright" />
                  {line}
                </div>
              ))}
            </div>
            <Link href="/teacher"
                  className="rounded-[11px] border-2 border-ink bg-paper px-5 py-3 text-center
                             text-[16px] font-bold text-ink no-underline hover:bg-paper-sunk">
              Make a version for my students
            </Link>
          </div>

          <dl className="m-0 rounded-lg border border-rule px-5 py-1.5">
            {[
              ['Skill', w.skill_name],
              ['Course', [w.course_name, w.unit_label].filter(Boolean).join(' · ')],
              ...(grades ? [['Grade band', grades]] : []),
              ['Items', `${itemCount}`],
              ['Time', `About ${minutes} minutes`],
            ].map(([label, value], i, all) => (
              <div key={label}
                   className={`flex justify-between gap-3.5 py-2.5 text-[15px] ${
                     i < all.length - 1 ? 'border-b border-dotted border-rule' : ''}`}>
                <dt className="text-ink-muted">{label}</dt>
                <dd className="m-0 text-right font-bold">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </main>

      {related.length > 0 && (
        <section className="border-t border-rule bg-paper-sunk px-5 py-14">
          <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
            <div className="flex flex-wrap items-baseline gap-3.5">
              <h2 className="m-0 text-[26px] font-bold tracking-[-0.02em]">
                Where this sits in {w.course_name}
              </h2>
              <span className="text-[16px] text-ink-muted">
                the same skill at other levels, and what comes next
              </span>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-4">
              {related.map((r) => {
                const sameSkill = r.skill_slug === w.skill_slug;
                return (
                  <Link key={r.id}
                        href={`/worksheets/${r.subject_slug}/${r.course_slug}/${r.skill_slug}/${r.slug}`}
                        className="flex flex-col gap-3 rounded-lg border border-rule bg-paper p-4.5
                                   text-ink no-underline hover:border-ink-muted">
                    <div className="flex items-start gap-3 p-0.5">
                      <PaperThumb accent={sameSkill} />
                      <div className="flex flex-col gap-1.5">
                        <div className={`font-mono text-[10px] uppercase tracking-[0.08em] ${
                          sameSkill ? 'text-teal-ink' : 'text-ink-muted'}`}>
                          {sameSkill ? 'Same skill' : 'Next in the course'} · {r.skill_code ?? r.slug}
                        </div>
                        <div className="text-[16px] font-bold leading-[1.3]">
                          {r.title.replace(` (${w.course_name})`, '')}
                        </div>
                      </div>
                    </div>
                    <div className="text-sm text-ink-muted">
                      {r.item_count} items · ~{estimatedMinutes(Number(r.item_count), r.item_type ?? 'cloze')} min
                      {r.page_count ? ` · ${r.page_count} pages` : ''}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <SiteFooter />
    </div>
  );
}
