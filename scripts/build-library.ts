/**
 * Build the public library.
 *
 * Surface 1's content is a byproduct of the same generator surface 2 uses —
 * there is no second content pipeline. This walks the skills a template
 * generator covers, fills their pools, composes a handful of genuinely
 * distinct worksheets each, and renders both PDFs ONCE. Anonymous traffic
 * afterwards is static file serving; nothing a crawler does can cost a model
 * call or launch a browser.
 *
 *   npm run library:build            build everything missing
 *   npm run library:build -- --force re-render even if unchanged
 */
import { createHash } from 'node:crypto';
import { query, one, tx, close } from '../src/lib/db/client.ts';
import { ensurePool, topUpPool, drawFromPool, type ItemRow } from '../src/lib/generation/pool.ts';
import { generationHash, type GenerationParams } from '../src/lib/generation/params.ts';
import { templateSupports } from '../src/lib/generation/template/index.ts';
import { renderWorksheetHtml } from '../src/lib/render/worksheet.ts';
import { htmlToPdf, closeBrowser } from '../src/lib/render/pdf.ts';
import { put, exists } from '../src/lib/storage/index.ts';
import { VARIANTS, worksheetTitle, metaDescription, type Variant } from '../src/lib/library/variants.ts';
import { publicSkillName } from '../src/lib/taxonomy/seed-spanish.ts';
import { skillCode, pdfPageCount } from '../src/lib/library/codes.ts';

const CEILING: Record<string, 1 | 2 | 3> = { 'spanish-1': 1, 'spanish-2': 2, 'spanish-3': 3 };
const force = process.argv.includes('--force');

type Target = {
  subject_id: string; subject_slug: string;
  course_id: string; course_slug: string; course_name: string;
  grade_low: number | null; grade_high: number | null;
  skill_id: string; skill_slug: string; skill_name: string;
  unit_label: string | null; skill_sequence: number;
};

/**
 * Identity of a rendered sheet: the items on it plus how it is presented. If
 * neither changed there is nothing to re-render, and the URL can be cached
 * forever because the bytes cannot change under it.
 */
function renderHash(items: ItemRow[], variant: Variant, title: string): string {
  return createHash('sha256').update(JSON.stringify({
    items: items.map((i) => i.id), variant: variant.slugSuffix, title, renderer: 2,
  })).digest('hex').slice(0, 32);
}

async function buildOne(t: Target, variant: Variant): Promise<'built' | 'skipped' | 'empty'> {
  const params: GenerationParams = {
    subject: 'spanish', course: t.course_slug as GenerationParams['course'],
    skill: t.skill_slug, item_type: variant.itemType, difficulty: variant.difficulty,
    content_locale: 'es', ui_locale: 'en',
    constraints: {
      lexicon_version: 1, lexicon_ceiling: CEILING[t.course_slug] ?? 2,
      register: 'neutral', stem_max_chars: 160,
    },
    template: { name: 'conjugation-drill', version: 1 },
    model_id: null,
  };

  await ensurePool(params);
  await topUpPool(params, Math.max(24, variant.count));
  const items = await drawFromPool(generationHash(params), variant.count);
  if (items.length < Math.min(8, variant.count)) return 'empty';

  const publicName = publicSkillName(t.skill_slug, t.skill_name);
  const title = worksheetTitle(publicName, t.course_name, variant);
  const hash = renderHash(items, variant, title);
  const pdfKey = `${hash}.pdf`;
  const keyKey = `${hash}-key.pdf`;

  const existing = await query<{ id: string; render_hash: string | null }>(
    `SELECT id, render_hash FROM worksheet
      WHERE course_id = $1 AND primary_skill_id = $2 AND slug = $3`,
    [t.course_id, t.skill_id, variant.slugSuffix]);

  const unchanged = existing[0]?.render_hash === hash
    && await exists('public', pdfKey) && await exists('private', keyKey);
  if (unchanged && !force) return 'skipped';

  const code = skillCode(t.course_slug, t.unit_label, t.skill_sequence);
  const meta = {
    title: publicName, courseName: t.course_name, skillName: t.skill_name,
    unitLabel: t.unit_label, skillCode: code,
  };
  const sheetPdf = await htmlToPdf(renderWorksheetHtml(items, meta));
  await put('public', pdfKey, sheetPdf);
  await put('private', keyKey, await htmlToPdf(renderWorksheetHtml(items, meta, { answerKey: true })));
  const pageCount = pdfPageCount(sheetPdf);

  await tx(async (c) => {
    const { rows: [set] } = await c.query(
      `INSERT INTO item_set (kind, course_id, title, selection_params)
       VALUES ('worksheet', $1, $2, $3::jsonb) RETURNING id`,
      [t.course_id, title, JSON.stringify({ ...params, variant: variant.slugSuffix })]);

    let position = 1;
    for (const item of items) {
      await c.query(
        `INSERT INTO item_set_item (item_set_id, position, item_id) VALUES ($1,$2,$3)`,
        [set.id, position++, item.id]);
    }

    if (existing[0]) {
      await c.query(
        `UPDATE worksheet SET item_set_id = $2, title = $3, meta_description = $4,
                render_hash = $5, pdf_key = $6, answer_key_pdf_key = $7,
                page_count = $8, skill_code = $9, published_at = now()
          WHERE id = $1`,
        [existing[0].id, set.id, title, metaDescription(publicName, t.course_name, variant),
          hash, pdfKey, keyKey, pageCount, code]);
    } else {
      await c.query(
        `INSERT INTO worksheet (item_set_id, subject_id, course_id, primary_skill_id, slug,
            title, meta_description, grade_band_low, grade_band_high, render_hash,
            pdf_key, answer_key_pdf_key, page_count, skill_code, published_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now())`,
        [set.id, t.subject_id, t.course_id, t.skill_id, variant.slugSuffix, title,
          metaDescription(publicName, t.course_name, variant),
          t.grade_low, t.grade_high, hash, pdfKey, keyKey, pageCount, code]);
    }
  });

  return 'built';
}

async function main() {
  const targets = await query<Target>(
    `SELECT su.id AS subject_id, su.slug AS subject_slug,
            co.id AS course_id, co.slug AS course_slug, co.name AS course_name,
            co.typical_grade_low AS grade_low, co.typical_grade_high AS grade_high,
            sk.id AS skill_id, sk.slug AS skill_slug, sk.name AS skill_name,
            cs.unit_label, cs.sequence_index AS skill_sequence
       FROM course_skill cs
       JOIN course co ON co.id = cs.course_id
       JOIN skill sk ON sk.id = cs.skill_id
       JOIN subject su ON su.id = co.subject_id
      WHERE sk.is_leaf AND cs.emphasis = 'core'
      ORDER BY co.sequence_index, cs.sequence_index`);

  let built = 0, skipped = 0, empty = 0, noTemplate = 0;

  for (const t of targets) {
    if (!templateSupports(t.skill_slug)) {
      // No template covers this skill, and the model path is off without
      // credentials. Publishing nothing beats publishing a guess.
      noTemplate++;
      continue;
    }
    for (const variant of VARIANTS) {
      const result = await buildOne(t, variant);
      if (result === 'built') { built++; process.stdout.write('.'); }
      else if (result === 'skipped') { skipped++; process.stdout.write('-'); }
      else { empty++; process.stdout.write('x'); }
    }
  }

  await closeBrowser();
  console.log(`\n\nbuilt ${built}, unchanged ${skipped}, too few items ${empty}`);
  console.log(`${noTemplate} skill/course pairs have no template generator and were not published`);

  const published = await one<{ n: string }>(
    `SELECT count(*)::text AS n FROM worksheet WHERE published_at IS NOT NULL`);
  console.log(`${published.n} worksheets live`);
  await close();
}

main().catch(async (e) => { console.error(e); await closeBrowser(); await close(); process.exit(1); });
