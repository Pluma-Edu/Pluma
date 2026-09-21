/**
 * Validation, cheapest layer first.
 *
 *   L0 structural  — shape, charset, leakage. Deterministic, free.
 *   L1 linguistic  — the answer key recomputed from the grammar claim, plus the
 *                    lexicon ceiling. Deterministic, free, and the reason
 *                    Spanish is the right subject to start with.
 *   L2 semantic    — one independent model solve. Not run for template items,
 *                    which have nothing to hallucinate. Lives in ../generation/model.
 *   L3 human       — the per-pool gate; teacher flags feed it.
 *
 * A failure at L0 or L1 rejects. A failure at L2 flags for a human, because the
 * independent solver can be wrong too.
 */
import { conjugate, UnsupportedForm, stripAccents, type Person, type Tense } from '../generation/template/conjugator.ts';
import type { GeneratedItem, Lexeme } from '../generation/template/index.ts';

export type CheckResult = {
  layer: 'structural' | 'linguistic' | 'semantic' | 'human';
  name: string;
  passed: boolean;
  detail?: Record<string, unknown>;
};

export type ValidationOutcome = {
  state: 'auto_validated' | 'flagged' | 'rejected';
  checks: CheckResult[];
};

export type ValidationContext = {
  lexicon: Lexeme[];
  lexiconCeiling: 1 | 2 | 3;
  stemMaxChars: number;
};

// Spanish plus the punctuation a worksheet legitimately needs. Anything else is
// mojibake or smart-quote contamination, which wrecks the PDF silently.
const ALLOWED_CHARS = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 ¿?¡!.,;:()'"—–_\-/\n]*$/;
const MARKUP = /(<\/?[a-z][^>]*>)|(\*\*)|(^#{1,6}\s)|(```)/im;
const ANSWER_PREFIX = /^\s*(answer|respuesta)\s*:/i;

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Whole words, Unicode-aware. Shared by the leak check and the ceiling check. */
function words(s: string): string[] {
  return s.toLowerCase().split(/[^a-záéíóúüñ]+/i).filter(Boolean);
}

function structural(item: GeneratedItem, ctx: ValidationContext): CheckResult[] {
  const out: CheckResult[] = [];
  const add = (name: string, passed: boolean, detail?: Record<string, unknown>) =>
    out.push({ layer: 'structural', name, passed, detail });

  add('stem_present', item.stem.trim().length > 0);
  add('stem_within_length', item.stem.length <= ctx.stemMaxChars,
    { length: item.stem.length, max: ctx.stemMaxChars });
  add('stem_charset', ALLOWED_CHARS.test(item.stem),
    { offending: [...item.stem].filter((c) => !ALLOWED_CHARS.test(c)).slice(0, 5) });
  add('stem_no_markup', !MARKUP.test(item.stem));
  add('stem_no_answer_prefix', !ANSWER_PREFIX.test(item.stem));

  add('rationale_present', item.rationale.trim().length >= 10);
  add('rationale_is_not_bare_answer',
    norm(item.rationale) !== norm(String(item.answer)) && item.rationale.trim().length > 15);

  const canonical = Array.isArray(item.answer) ? String(item.answer[0]) : String(item.answer);
  add('accepted_answers_include_canonical',
    item.item_type === 'mcq' || item.accepted_answers.some((a) => norm(a) === norm(canonical)),
    { canonical, accepted: item.accepted_answers });

  // A free-text answer must not be sitting in the stem already.
  //
  // Tokenised rather than regex-matched on purpose: JavaScript's \b is
  // ASCII-only, so it both misses leaks next to accented letters and fires
  // falsely on substrings — "oí" sits inside the hint "(oír)" without being a
  // leak at all.
  if (item.item_type === 'cloze' || item.item_type === 'short_answer') {
    const leaked = words(item.stem).includes(canonical.toLowerCase());
    add('stem_does_not_leak_answer', !leaked, { canonical });
  }

  if (item.item_type === 'mcq') {
    const choices = (item.body.choices ?? []) as Array<{ key: string; text: string }>;
    add('mcq_choice_count', choices.length >= 2 && choices.length <= 6, { count: choices.length });
    const texts = choices.map((c) => norm(c.text));
    add('mcq_choices_distinct', new Set(texts).size === texts.length, { texts });
    add('mcq_answer_is_a_choice', choices.some((c) => c.key === item.answer),
      { answer: item.answer, keys: choices.map((c) => c.key) });
    add('mcq_choices_distinct_ignoring_accents',
      new Set(texts.map(stripAccents)).size === texts.length,
      { note: 'two choices differing only by accent make the item a typo test, not a grammar test' });
  }

  if (item.item_type === 'cloze') {
    const blanks = (item.body.blanks ?? []) as unknown[];
    const answers = Array.isArray(item.answer) ? item.answer : [item.answer];
    add('cloze_blank_count_matches_answers', blanks.length === answers.length,
      { blanks: blanks.length, answers: answers.length });
    add('cloze_stem_has_blank_marker', /_{3,}/.test(item.stem));
  }

  if (item.item_type === 'free_response') {
    add('free_response_not_auto_gradable', item.auto_gradable === false);
  }

  return out;
}

function linguistic(item: GeneratedItem, ctx: ValidationContext): CheckResult[] {
  const out: CheckResult[] = [];
  const add = (name: string, passed: boolean, detail?: Record<string, unknown>) =>
    out.push({ layer: 'linguistic', name, passed, detail });

  const claim = item.grammar_claim as
    { lemma?: string; tense?: Tense; person?: Person } | null;

  if (claim?.lemma && claim.tense && claim.person) {
    let computed: string | null = null;
    let why = '';
    try {
      computed = conjugate(claim.lemma, claim.tense, claim.person);
    } catch (e) {
      why = e instanceof UnsupportedForm ? e.message : String(e);
    }

    add('grammar_claim_is_conjugable', computed !== null, { why });

    if (computed !== null) {
      // The whole trick: the answer key is recomputed, not trusted.
      const stated = item.item_type === 'mcq'
        ? ((item.body.choices ?? []) as Array<{ key: string; text: string }>)
            .find((c) => c.key === item.answer)?.text ?? ''
        : Array.isArray(item.answer) ? String(item.answer[0]) : String(item.answer);

      add('answer_matches_computed_form', stated === computed, { stated, computed });

      // Right word, wrong accents is a distinct and much more common failure.
      add('answer_accents_correct',
        stated === computed || stripAccents(stated) !== stripAccents(computed),
        { stated, computed, note: 'differs from the correct form only by diacritics' });

      if (item.item_type === 'mcq') {
        const choices = (item.body.choices ?? []) as Array<{ key: string; text: string }>;
        const alsoCorrect = choices.filter((c) => c.text === computed && c.key !== item.answer);
        add('no_distractor_is_also_correct', alsoCorrect.length === 0, { alsoCorrect });
      }
    }
  } else if (item.skill.startsWith('present-') || item.skill.startsWith('preterite-')
             || item.skill.startsWith('imperfect') || item.skill.startsWith('future')) {
    add('grammar_claim_required_for_verb_skill', false, { skill: item.skill });
  }

  // Lexicon ceiling. Verify against the stem rather than trusting lexemes_used:
  // a generator that under-reports its own vocabulary would otherwise walk past.
  const byLemma = new Map(ctx.lexicon.map((l) => [l.lemma, l]));
  const tokens = words(item.stem);
  const overCeiling = tokens
    .map((t) => byLemma.get(t))
    .filter((l): l is Lexeme => !!l && l.introduced_at_course > ctx.lexiconCeiling);
  add('stem_within_lexicon_ceiling', overCeiling.length === 0,
    { ceiling: ctx.lexiconCeiling, over: overCeiling.map((l) => l.lemma) });

  const claimedOver = item.lexemes_used
    .map((t) => byLemma.get(t))
    .filter((l): l is Lexeme => !!l && l.introduced_at_course > ctx.lexiconCeiling);
  add('claimed_lexemes_within_ceiling', claimedOver.length === 0,
    { over: claimedOver.map((l) => l.lemma) });

  return out;
}

export function validateItem(item: GeneratedItem, ctx: ValidationContext): ValidationOutcome {
  const checks = [...structural(item, ctx), ...linguistic(item, ctx)];
  const failed = checks.filter((c) => !c.passed);

  if (failed.length === 0) {
    // Template items carry a computed key and skip L2 entirely.
    return { state: 'auto_validated', checks };
  }
  const semanticOnly = failed.every((c) => c.layer === 'semantic');
  return { state: semanticOnly ? 'flagged' : 'rejected', checks };
}

export function failedCheckNames(outcome: ValidationOutcome): string[] {
  return outcome.checks.filter((c) => !c.passed).map((c) => c.name);
}
