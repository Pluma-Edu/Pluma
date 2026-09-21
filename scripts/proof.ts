/**
 * Phase 0 proof.
 *
 * Runs the real pipeline end to end — pool lookup, generation, validation,
 * persistence, draw, render — and then INDEPENDENTLY re-verifies every answer
 * key that landed on the printed page against the conjugator.
 *
 * Usage:
 *   npm run proof -- --skill preterite-regular --type cloze --count 12 --difficulty 2
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { query, one, close } from '../src/lib/db/client.ts';
import { topUpPool, drawFromPool, ensurePool, type ItemRow } from '../src/lib/generation/pool.ts';
import { generationHash, type GenerationParams, type Difficulty, type ItemType } from '../src/lib/generation/params.ts';
import { conjugate, type Person, type Tense } from '../src/lib/generation/template/conjugator.ts';
import { publicSkillName } from "../src/lib/taxonomy/seed-spanish.ts";
import { renderWorksheetHtml } from '../src/lib/render/worksheet.ts';
import { htmlToPdf, closeBrowser } from '../src/lib/render/pdf.ts';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/**
 * The check that matters: for every item on the page, recompute the answer from
 * the stored grammar claim and compare. This deliberately does not trust the
 * validator that already ran — it is a second, independent pass over what was
 * actually printed.
 */
async function verifyPrintedKeys(items: ItemRow[]): Promise<{ checked: number; wrong: string[] }> {
  const wrong: string[] = [];
  let checked = 0;

  const rows = await query<{ id: string; grammar_claim: { lemma: string; tense: Tense; person: Person } | null; answer: unknown; body: Record<string, unknown> }>(
    `SELECT id, grammar_claim, answer, body FROM item WHERE id = ANY($1::uuid[])`,
    [items.map((i) => i.id)]);

  for (const row of rows) {
    if (!row.grammar_claim) continue;
    const { lemma, tense, person } = row.grammar_claim;
    const expected = conjugate(lemma, tense, person);
    const printed = Array.isArray(row.answer)
      ? String(row.answer[0])
      : typeof row.answer === 'string' && /^[a-f]$/.test(row.answer)
        ? ((row.body.choices ?? []) as Array<{ key: string; text: string }>)
            .find((c) => c.key === row.answer)?.text ?? ''
        : String(row.answer);
    checked++;
    if (printed !== expected) {
      wrong.push(`${row.id}: ${lemma}/${tense}/${person} printed "${printed}" but should be "${expected}"`);
    }
  }
  return { checked, wrong };
}

async function main() {
  const skill = arg('skill', 'preterite-regular');
  const course = arg('course', 'spanish-2') as GenerationParams['course'];
  const item_type = arg('type', 'cloze') as ItemType;
  const difficulty = Number(arg('difficulty', '2')) as Difficulty;
  const count = Number(arg('count', '12'));
  const ceiling = Number(arg('ceiling', course === 'spanish-1' ? '1' : course === 'spanish-2' ? '2' : '3')) as 1 | 2 | 3;

  const params: GenerationParams = {
    subject: 'spanish', course, skill, item_type, difficulty,
    content_locale: 'es', ui_locale: 'en',
    constraints: {
      lexicon_version: 1, lexicon_ceiling: ceiling, register: 'neutral', stem_max_chars: 160,
    },
    template: { name: 'conjugation-drill', version: 1 },
    model_id: null,
  };

  const hash = generationHash(params);
  console.log(`pool ${hash.slice(0, 12)}  ${skill} / ${item_type} / difficulty ${difficulty}`);

  await ensurePool(params);
  const before = await drawFromPool(hash, count);
  const report = await topUpPool(params, Math.max(24, count));
  console.log(`  cache: ${before.length} servable before, top-up generated ${report.generated} `
    + `(persisted ${report.persisted}, duplicates ${report.duplicates}, rejected ${report.rejected}, source ${report.source})`);

  const items = await drawFromPool(hash, count);
  if (items.length < count) {
    console.error(`  only ${items.length} servable items for ${count} requested`);
  }

  const meta = await one<{ course_name: string; skill_name: string; unit_label: string | null; skill_code: string }>(
    `SELECT co.name AS course_name, sk.name AS skill_name, cs.unit_label,
            $3::text AS skill_code
       FROM course co
       JOIN skill sk ON sk.slug = $2
       LEFT JOIN course_skill cs ON cs.course_id = co.id AND cs.skill_id = sk.id
      WHERE co.slug = $1`, [course, skill, 'SP2-U01-01']);

  const worksheetHtml = renderWorksheetHtml(items, {
    title: publicSkillName(skill, meta.skill_name), courseName: meta.course_name, skillName: meta.skill_name,
    unitLabel: meta.unit_label, skillCode: meta.skill_code,
  });
  const keyHtml = renderWorksheetHtml(items, {
    title: publicSkillName(skill, meta.skill_name), courseName: meta.course_name, skillName: meta.skill_name,
    unitLabel: meta.unit_label, skillCode: meta.skill_code,
  }, { answerKey: true });

  const outDir = join(process.cwd(), 'out');
  await mkdir(outDir, { recursive: true });
  const base = `${skill}-${item_type}-d${difficulty}`;
  await writeFile(join(outDir, `${base}.html`), worksheetHtml);
  await writeFile(join(outDir, `${base}-key.html`), keyHtml);
  await writeFile(join(outDir, `${base}.pdf`), await htmlToPdf(worksheetHtml));
  await writeFile(join(outDir, `${base}-key.pdf`), await htmlToPdf(keyHtml));
  await closeBrowser();

  const { checked, wrong } = await verifyPrintedKeys(items);
  console.log(`  rendered ${items.length} items -> out/${base}.pdf and out/${base}-key.pdf`);
  console.log(`  independent key check: ${checked} recomputed, ${wrong.length} wrong`);
  for (const w of wrong) console.error(`    WRONG ${w}`);

  await close();
  process.exit(wrong.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
