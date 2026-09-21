/**
 * The Phase 0 proof page. The only user-facing surface that exists.
 *
 * It runs the real pipeline — pool lookup, generation, validation, persistence,
 * draw — and shows what came out, including the per-item rationale that the
 * answer key prints. If this page is right, the worksheet is right.
 */
import { query, one } from '@/lib/db/client';
import { ensurePool, topUpPool, drawFromPool } from '@/lib/generation/pool';
import { generationHash, type GenerationParams, type Difficulty, type ItemType } from '@/lib/generation/params';
import { templateSupports } from '@/lib/generation/template/index';

export const dynamic = 'force-dynamic';

type Search = { skill?: string; type?: string; difficulty?: string; count?: string; course?: string };

const CEILING: Record<string, 1 | 2 | 3> = { 'spanish-1': 1, 'spanish-2': 2, 'spanish-3': 3 };

export default async function ProofPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const course = (sp.course ?? 'spanish-2') as GenerationParams['course'];
  const skill = sp.skill ?? 'preterite-regular';
  const item_type = (sp.type ?? 'cloze') as ItemType;
  const difficulty = Number(sp.difficulty ?? 2) as Difficulty;
  const count = Math.min(Number(sp.count ?? 12), 40);

  const skills = await query<{ slug: string; name: string }>(
    `SELECT sk.slug, sk.name FROM skill sk
       JOIN course_skill cs ON cs.skill_id = sk.id
       JOIN course co ON co.id = cs.course_id
      WHERE co.slug = $1 AND sk.is_leaf
      ORDER BY cs.sequence_index`, [course]);

  const params: GenerationParams = {
    subject: 'spanish', course, skill, item_type, difficulty,
    content_locale: 'es', ui_locale: 'en',
    constraints: {
      lexicon_version: 1, lexicon_ceiling: CEILING[course], register: 'neutral', stem_max_chars: 160,
    },
    template: { name: 'conjugation-drill', version: 1 },
    model_id: null,
  };

  const hash = generationHash(params);
  let report = null;
  if (templateSupports(skill)) {
    await ensurePool(params);
    report = await topUpPool(params, Math.max(24, count));
  }
  const items = await drawFromPool(hash, count);
  const meta = await one<{ course_name: string; skill_name: string }>(
    `SELECT co.name AS course_name, sk.name AS skill_name
       FROM course co, skill sk WHERE co.slug = $1 AND sk.slug = $2`, [course, skill]);

  const qs = new URLSearchParams({ course, skill, type: item_type, difficulty: String(difficulty), count: String(count) });

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-xl font-semibold tracking-tight">Proof</h1>
      <p className="mt-1 text-sm text-neutral-600">
        Pool <code className="font-mono text-xs">{hash.slice(0, 16)}</code>
      </p>

      <form className="mt-6 flex flex-wrap items-end gap-3 border-y border-neutral-200 py-4 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-neutral-500">Course</span>
          <select name="course" defaultValue={course} className="rounded border border-neutral-300 px-2 py-1">
            {['spanish-1', 'spanish-2', 'spanish-3'].map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-neutral-500">Skill</span>
          <select name="skill" defaultValue={skill} className="rounded border border-neutral-300 px-2 py-1">
            {skills.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-neutral-500">Type</span>
          <select name="type" defaultValue={item_type} className="rounded border border-neutral-300 px-2 py-1">
            {['cloze', 'mcq', 'short_answer'].map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-neutral-500">Difficulty</span>
          <select name="difficulty" defaultValue={difficulty} className="rounded border border-neutral-300 px-2 py-1">
            {[1, 2, 3, 4, 5].map((d) => <option key={d}>{d}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-neutral-500">Items</span>
          <input name="count" defaultValue={count} type="number" min={1} max={40}
                 className="w-20 rounded border border-neutral-300 px-2 py-1" />
        </label>
        <button className="rounded bg-neutral-900 px-3 py-1.5 text-white">Generate</button>
      </form>

      <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
        <a href={`/proof/pdf?${qs}`} className="underline underline-offset-4">Worksheet PDF</a>
        <a href={`/proof/pdf?${qs}&key=1`} className="underline underline-offset-4">Answer key PDF</a>
        {report && (
          <span className="text-neutral-500">
            {report.source === 'none'
              ? `served from cache (${items.length} of ${report.servable} in pool)`
              : `generated ${report.generated}, kept ${report.persisted}, rejected ${report.rejected}, duplicates ${report.duplicates}`}
          </span>
        )}
      </div>

      {!templateSupports(skill) && (
        <p className="mt-6 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
          No template generator covers <code>{skill}</code>. This skill needs the model path,
          which is off until credentials are configured — so nothing is generated rather than
          something being guessed.
        </p>
      )}

      <ol className="mt-8 space-y-5">
        {items.map((item, i) => {
          const choices = (item.body.choices ?? []) as Array<{ key: string; text: string }>;
          return (
            <li key={item.id} className="border-b border-neutral-100 pb-4">
              <div className="flex gap-3">
                <span className="w-6 shrink-0 text-right font-semibold tabular-nums">{i + 1}.</span>
                <div className="min-w-0 flex-1">
                  <p className="font-serif text-[15px]">{item.stem}</p>
                  {choices.length > 0 && (
                    <ul className="mt-1 grid grid-cols-2 gap-x-6 font-serif text-[14px]">
                      {choices.map((c) => (
                        <li key={c.key}>
                          <span className="font-semibold">{c.key}.</span> {c.text}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-2 text-sm">
                    <span className="bg-neutral-200 px-1 font-semibold">
                      {Array.isArray(item.answer)
                        ? item.answer.join(', ')
                        : choices.find((c) => c.key === item.answer)?.text ?? String(item.answer)}
                    </span>
                    <span className="ml-2 italic text-neutral-600">{item.rationale}</span>
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {items.length === 0 && (
        <p className="mt-8 text-sm text-neutral-500">No servable items. Nothing unvalidated is ever shown.</p>
      )}

      <p className="mt-10 border-t border-neutral-200 pt-4 text-xs text-neutral-500">
        {meta.course_name} &middot; {meta.skill_name}. Every item here passed structural and
        linguistic validation; the answer keys are recomputed from the conjugator, not trusted.
      </p>
    </main>
  );
}
