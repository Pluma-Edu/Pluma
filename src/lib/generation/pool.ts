/**
 * Pools.
 *
 * A pool is every item ever generated for one exact parameter set. Requests
 * draw from it; only a short pool triggers generation, and generation fills to
 * target rather than to the deficit — the marginal cost of more items in one
 * call is far below a second call later.
 */
import { createHash } from 'node:crypto';
import { query, one, tx } from '../db/client.ts';
import { canonicalJson, generationHash, type GenerationParams } from './params.ts';
import { generateTemplateItems, templateSupports, type GeneratedItem, type Lexeme } from './template/index.ts';
import { generateWithModel, modelPathAvailable } from './model/client.ts';
import { validateItem, type ValidationOutcome } from '../validation/index.ts';

export const DEFAULT_TARGET_SIZE = 24;

export function contentFingerprint(item: GeneratedItem): string {
  return createHash('sha256').update(canonicalJson({
    skill: item.skill,
    item_type: item.item_type,
    stem: item.stem.trim().toLowerCase(),
    body: item.body,
    answer: item.answer,
  })).digest('hex');
}

export async function loadLexicon(version: number): Promise<Lexeme[]> {
  return query<Lexeme>(
    `SELECT l.lemma, l.pos, l.gloss_en AS gloss, l.introduced_at_course, l.tags
       FROM lexeme l JOIN lexicon x ON x.id = l.lexicon_id
      WHERE x.version = $1
      ORDER BY l.lemma`, [version]);
}

async function ids(params: GenerationParams): Promise<{ skillId: string; courseId: string }> {
  const row = await one<{ skill_id: string; course_id: string }>(
    `SELECT sk.id AS skill_id, co.id AS course_id
       FROM skill sk, course co
      WHERE sk.slug = $1 AND co.slug = $2`, [params.skill, params.course]);
  return { skillId: row.skill_id, courseId: row.course_id };
}

export async function ensurePool(params: GenerationParams, targetSize = DEFAULT_TARGET_SIZE): Promise<string> {
  const hash = generationHash(params);
  const { skillId, courseId } = await ids(params);
  await query(
    `INSERT INTO generation_pool (generation_hash, params, skill_id, course_id, item_type,
        difficulty, generator_kind, template_name, template_version, model_id,
        lexicon_version, target_size)
     VALUES ($1,$2::jsonb,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (generation_hash) DO NOTHING`,
    [hash, canonicalJson(params), skillId, courseId, params.item_type, params.difficulty,
      params.model_id ? 'model' : 'template', params.template.name, params.template.version,
      params.model_id, params.constraints.lexicon_version, targetSize]);
  return hash;
}

export async function servableCount(hash: string): Promise<number> {
  const [row] = await query<{ n: string }>(
    `SELECT count(*)::text AS n
       FROM item_pool mp JOIN item i ON i.id = mp.item_id
      WHERE mp.generation_hash = $1 AND i.is_servable`, [hash]);
  return Number(row.n);
}

export type TopUpReport = {
  hash: string;
  generated: number;
  persisted: number;
  rejected: number;
  duplicates: number;
  /** Items that already existed in the bank and were linked into this pool. */
  linked: number;
  servable: number;
  source: 'template' | 'model' | 'none';
};

/** Fill a pool to target. Template first; the model only where no template exists. */
export async function topUpPool(
  params: GenerationParams,
  targetSize = DEFAULT_TARGET_SIZE,
): Promise<TopUpReport> {
  const hash = await ensurePool(params, targetSize);
  const have = await servableCount(hash);
  const report: TopUpReport = {
    hash, generated: 0, persisted: 0, rejected: 0, duplicates: 0, linked: 0,
    servable: have, source: 'none',
  };
  if (have >= targetSize) return report;

  const [pool] = await query<{ generation_disabled: boolean }>(
    `SELECT generation_disabled FROM generation_pool WHERE generation_hash = $1`, [hash]);
  if (pool?.generation_disabled) return report;

  const lexicon = await loadLexicon(params.constraints.lexicon_version);
  const want = targetSize - have;

  let candidates: GeneratedItem[] = [];
  if (templateSupports(params.skill)) {
    report.source = 'template';
    // Over-generate: duplicates against what the pool already holds are free to
    // discard, and a short pool would otherwise need a second pass.
    candidates = generateTemplateItems(params, lexicon, targetSize * 2);
  } else if (modelPathAvailable() && params.model_id) {
    report.source = 'model';
    const allowed = lexicon
      .filter((l) => l.introduced_at_course <= params.constraints.lexicon_ceiling)
      .map((l) => l.lemma);
    const result = await generateWithModel(params, allowed, want);
    candidates = result.items;
    await query(
      `INSERT INTO generation_run (generation_hash, requested_count, status, model_id,
          input_tokens, output_tokens, items_returned, finished_at)
       VALUES ($1,$2,'succeeded',$3,$4,$5,$6, now())`,
      [hash, want, result.model, result.usage.input_tokens, result.usage.output_tokens,
        result.items.length]);
  } else {
    return report;
  }

  report.generated = candidates.length;
  const { skillId, courseId } = await ids(params);
  const ctx = {
    lexicon,
    lexiconCeiling: params.constraints.lexicon_ceiling,
    stemMaxChars: params.constraints.stem_max_chars,
  };

  for (const item of candidates) {
    if (report.servable + report.persisted + report.linked >= targetSize) break;
    const outcome: ValidationOutcome = validateItem(item, ctx);
    const fingerprint = contentFingerprint(item);

    const outcome_row = await tx(async (c) => {
      const res = await c.query(
        `INSERT INTO item (skill_id, course_id, item_type, difficulty, locale, stem, body,
            answer, accepted_answers, answer_match_mode, rationale, render_meta, grammar_claim,
            lexemes_used, auto_gradable, generation_hash, generator_kind, content_fingerprint,
            validation_state, validated_at)
         VALUES ($1,$2,$3,$4,'es',$5,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10,$11::jsonb,$12::jsonb,
            $13,$14,$15,$16,$17,$18, now())
         ON CONFLICT (content_fingerprint) WHERE validation_state <> 'rejected'
         DO NOTHING
         RETURNING id`,
        [skillId, courseId, item.item_type, item.difficulty, item.stem,
          JSON.stringify(item.body), JSON.stringify(item.answer),
          JSON.stringify(item.accepted_answers), item.answer_match_mode, item.rationale,
          JSON.stringify(item.render_meta), item.grammar_claim ? JSON.stringify(item.grammar_claim) : null,
          item.lexemes_used, item.auto_gradable, hash, item.generator_kind, fingerprint,
          outcome.state]);

      if (res.rows.length === 0) {
        // The bank already holds this exact question. That is not waste — it
        // belongs in this pool too, so link it rather than discarding it and
        // drawing short later.
        const { rows: found } = await c.query(
          `SELECT id, is_servable FROM item WHERE content_fingerprint = $1
            AND validation_state <> 'rejected'`, [fingerprint]);
        if (found.length === 0) return { kind: 'duplicate' as const };
        const { rowCount } = await c.query(
          `INSERT INTO item_pool (generation_hash, item_id) VALUES ($1,$2)
           ON CONFLICT DO NOTHING`, [hash, found[0].id]);
        return rowCount === 1 && found[0].is_servable
          ? { kind: 'linked' as const }
          : { kind: 'duplicate' as const };
      }

      const itemId = res.rows[0].id as string;
      await c.query(
        `INSERT INTO item_pool (generation_hash, item_id) VALUES ($1,$2)
         ON CONFLICT DO NOTHING`, [hash, itemId]);
      for (const check of outcome.checks) {
        await c.query(
          `INSERT INTO validation_result (item_id, layer, check_name, passed, detail)
           VALUES ($1,$2,$3,$4,$5::jsonb)`,
          [itemId, check.layer, check.name, check.passed,
            check.detail ? JSON.stringify(check.detail) : null]);
      }
      return { kind: 'inserted' as const };
    });

    if (outcome_row.kind === 'duplicate') report.duplicates++;
    else if (outcome_row.kind === 'linked') report.linked++;
    else if (outcome.state === 'auto_validated') report.persisted++;
    else report.rejected++;
  }

  report.servable = await servableCount(hash);
  await query(
    `UPDATE generation_pool
        SET servable_count = $2, rejected_count = rejected_count + $3, last_generated_at = now()
      WHERE generation_hash = $1`, [hash, report.servable, report.rejected]);

  // Circuit breaker: a pool that cannot reach target is telling you which skill
  // wants a template generator, not that it should be retried forever.
  if (report.servable < targetSize && report.generated > 0 && report.rejected > report.persisted) {
    await query(`UPDATE generation_pool SET generation_disabled = true WHERE generation_hash = $1`, [hash]);
  }

  return report;
}

export type ItemRow = {
  id: string;
  item_type: string;
  difficulty: number;
  stem: string;
  body: Record<string, unknown>;
  answer: unknown;
  accepted_answers: unknown;
  rationale: string;
  render_meta: Record<string, unknown>;
  skill_name: string;
};

/**
 * Draw from the pool. Never generates; call topUpPool first if you need to.
 *
 * The order is a round-robin across grammatical person rather than insertion
 * order. Taking the first N by created_at produces a page of ten verbs in one
 * person — every item reading "Yo ______" — which is a correct item bank and a
 * useless worksheet. Variety is the composer's job, not the generator's, so it
 * lives here where it also fixes pools that were already built.
 */
export async function drawFromPool(hash: string, count: number): Promise<ItemRow[]> {
  return query<ItemRow>(
    `SELECT id, item_type, difficulty, stem, body, answer, accepted_answers,
            rationale, render_meta, skill_name
       FROM (
         SELECT i.id, i.item_type, i.difficulty, i.stem, i.body, i.answer,
                i.accepted_answers, i.rationale, i.render_meta, sk.name AS skill_name,
                row_number() OVER (PARTITION BY i.grammar_claim->>'person'
                                   ORDER BY mp.added_at, i.id) AS cycle,
                dense_rank() OVER (ORDER BY i.grammar_claim->>'person')  AS person_rank
           FROM item_pool mp
           JOIN item i ON i.id = mp.item_id
           JOIN skill sk ON sk.id = i.skill_id
          WHERE mp.generation_hash = $1 AND i.is_servable
       ) spread
      ORDER BY cycle, person_rank
      LIMIT $2`, [hash, count]);
}
