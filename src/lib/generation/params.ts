import { createHash } from 'node:crypto';
import type { Tense, Person } from './template/conjugator.ts';

export type ItemType = 'mcq' | 'cloze' | 'short_answer' | 'matching' | 'ordering' | 'free_response';
export type Difficulty = 1 | 2 | 3 | 4 | 5;
export type Register = 'neutral' | 'formal' | 'informal';
export type Theme = 'school' | 'food' | 'travel' | 'family' | 'sports' | 'city' | 'daily_routine';
export type CourseSlug = 'spanish-1' | 'spanish-2' | 'spanish-3';

/**
 * The complete input to generation.
 *
 * Every string in here is drawn from a closed set: a skill slug, a lemma that
 * exists in the lexicon, or a member of a union type. There is no free-text
 * field, and that is the enforcement mechanism for constraint 2 — a student
 * name has no field it could travel in. `paramsAreClosed` checks it at runtime
 * and params.test.ts checks it in CI.
 */
export type GenerationParams = {
  subject: 'spanish';
  course: CourseSlug;
  skill: string;
  item_type: ItemType;
  difficulty: Difficulty;
  content_locale: 'es';
  ui_locale: 'en';
  constraints: {
    lexicon_version: number;
    lexicon_ceiling: 1 | 2 | 3;
    allowed_tenses?: Tense[];
    allowed_persons?: Person[];
    forbidden_lemmas?: string[];
    register: Register;
    theme?: Theme;
    stem_max_chars: number;
    passage_max_chars?: number;
  };
  template: { name: string; version: number };
  model_id: string | null;   // null for the template path, which uses no model
};

/** Deterministic JSON: keys sorted at every level, undefined dropped. */
export function canonicalJson(value: unknown): string {
  const walk = (v: unknown): unknown => {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(walk);
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      const child = (v as Record<string, unknown>)[k];
      if (child !== undefined) out[k] = walk(child);
    }
    return out;
  };
  return JSON.stringify(walk(value));
}

/**
 * The pool key.
 *
 * `count` and `seed` are not part of GenerationParams and so cannot enter the
 * hash: a request for 10 items when 8 are cached must top up by 2, not miss and
 * pay for 10 more. Everything that changes an item's MEANING is in here,
 * including the template version and model id, so a prompt edit opens a fresh
 * pool beside the old one rather than silently reusing it.
 */
export function generationHash(params: GenerationParams): string {
  return createHash('sha256').update(canonicalJson(params)).digest('hex');
}

const ALLOWED_TOP_LEVEL_STRINGS = new Set([
  'subject', 'course', 'skill', 'item_type', 'content_locale', 'ui_locale', 'model_id',
]);

/**
 * Runtime assertion that nothing free-text has been smuggled in. Slugs and
 * lemmas are bounded shapes; anything with whitespace or punctuation is prose,
 * and prose is how a student's name would get here.
 */
export function paramsAreClosed(params: GenerationParams): { ok: true } | { ok: false; reason: string } {
  const slugLike = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
  const lemmaLike = /^[a-záéíóúüñ]+$/i;

  for (const key of Object.keys(params) as (keyof GenerationParams)[]) {
    const v = params[key];
    if (typeof v === 'string' && !ALLOWED_TOP_LEVEL_STRINGS.has(key)) {
      return { ok: false, reason: `unexpected string field: ${key}` };
    }
    if (typeof v === 'string' && !slugLike.test(v)) {
      return { ok: false, reason: `${key} is not slug-shaped: ${JSON.stringify(v)}` };
    }
  }
  for (const lemma of params.constraints.forbidden_lemmas ?? []) {
    if (!lemmaLike.test(lemma)) {
      return { ok: false, reason: `forbidden_lemmas contains non-lemma: ${JSON.stringify(lemma)}` };
    }
  }
  if (params.template.name && !slugLike.test(params.template.name)) {
    return { ok: false, reason: `template.name is not slug-shaped` };
  }
  return { ok: true };
}
