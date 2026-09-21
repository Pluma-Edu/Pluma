/**
 * Auto-grading.
 *
 * Accents are significant wherever they carry the grammar, because hablo and
 * habló are different answers and marking one as the other is worse than
 * useless in a Spanish product. But a student whose keyboard has no dead keys
 * deserves to be told that is what went wrong, so a near-miss is graded
 * incorrect AND labelled — the feedback says "check your accents" instead of
 * just "wrong".
 */
import { stripAccents } from '../generation/template/conjugator.ts';

export type MatchMode =
  | 'exact' | 'case_insensitive' | 'accent_insensitive' | 'numeric' | 'set_equal' | 'regex';

export type NearMiss = 'accent_only' | 'case_only' | 'whitespace_only' | 'empty';

export type GradedPart = {
  key: string;
  given: string;
  correct: boolean;
  nearMiss?: NearMiss;
};

export type GradedResponse = {
  parts: GradedPart[];
  correct: boolean;           // every part correct
  score: number;              // fraction of parts correct, for partial credit
};

export type GradableItem = {
  item_type: string;
  answer: unknown;
  accepted_answers: unknown;
  answer_match_mode?: MatchMode;
  body: Record<string, unknown>;
};

const collapse = (s: string) => s.normalize('NFC').trim().replace(/\s+/g, ' ');

function equalUnder(mode: MatchMode, given: string, accepted: string): boolean {
  const g = collapse(given);
  const a = collapse(accepted);
  switch (mode) {
    case 'exact': return g === a;
    case 'case_insensitive': return g.toLowerCase() === a.toLowerCase();
    case 'accent_insensitive':
      return stripAccents(g).toLowerCase() === stripAccents(a).toLowerCase();
    case 'numeric': return Number(g) === Number(a) && g.trim() !== '';
    case 'set_equal': {
      const norm = (s: string) => s.split(/[,;]/).map((x) => collapse(x).toLowerCase()).filter(Boolean).sort().join('|');
      return norm(g) === norm(a);
    }
    case 'regex':
      try { return new RegExp(`^${a}$`, 'iu').test(g); } catch { return false; }
  }
}

/** Why a wrong answer was wrong, when it was nearly right. */
function diagnose(given: string, accepted: string[]): NearMiss | undefined {
  if (collapse(given) === '') return 'empty';
  for (const a of accepted) {
    const g = collapse(given);
    const acc = collapse(a);
    if (g.toLowerCase() === acc.toLowerCase()) return 'case_only';
    if (stripAccents(g).toLowerCase() === stripAccents(acc).toLowerCase()) return 'accent_only';
    if (g.replace(/\s/g, '') === acc.replace(/\s/g, '')) return 'whitespace_only';
  }
  return undefined;
}

function acceptedFor(item: GradableItem): string[] {
  const listed = Array.isArray(item.accepted_answers) ? item.accepted_answers.map(String) : [];
  const canonical = Array.isArray(item.answer) ? item.answer.map(String) : [String(item.answer)];
  return [...new Set([...canonical, ...listed])];
}

export function gradeResponse(item: GradableItem, response: unknown): GradedResponse {
  const mode: MatchMode = item.answer_match_mode ?? 'exact';

  // Multiple choice is a key comparison, not a text comparison.
  if (item.item_type === 'mcq') {
    const given = String(response ?? '').trim();
    const correct = given === String(item.answer);
    return {
      parts: [{ key: '1', given, correct, nearMiss: given === '' ? 'empty' : undefined }],
      correct,
      score: correct ? 1 : 0,
    };
  }

  // Cloze grades per blank, so a two-blank item contributes two pieces of
  // evidence to the same skill rather than one all-or-nothing verdict.
  if (item.item_type === 'cloze') {
    const answers = (Array.isArray(item.answer) ? item.answer : [item.answer]).map(String);
    const given = Array.isArray(response) ? response.map((r) => String(r ?? '')) : [String(response ?? '')];
    const blanks = (item.body.blanks ?? []) as Array<{ key?: string }>;

    const parts: GradedPart[] = answers.map((expected, i) => {
      const g = given[i] ?? '';
      const accepted = [expected];
      const correct = accepted.some((a) => equalUnder(mode, g, a));
      return {
        key: blanks[i]?.key ?? String(i + 1),
        given: g,
        correct,
        nearMiss: correct ? undefined : diagnose(g, accepted),
      };
    });
    const right = parts.filter((p) => p.correct).length;
    return { parts, correct: right === parts.length, score: parts.length ? right / parts.length : 0 };
  }

  if (item.item_type === 'free_response') {
    // Never auto-graded, and a student's writing never goes to a model.
    return {
      parts: [{ key: '1', given: String(response ?? ''), correct: false }],
      correct: false,
      score: 0,
    };
  }

  const given = String(response ?? '');
  const accepted = acceptedFor(item);
  const correct = accepted.some((a) => equalUnder(mode, given, a));
  return {
    parts: [{ key: '1', given, correct, nearMiss: correct ? undefined : diagnose(given, accepted) }],
    correct,
    score: correct ? 1 : 0,
  };
}

/** Student-facing wording for a near miss. Never scolds, always specific. */
export function feedbackFor(part: GradedPart): string | null {
  switch (part.nearMiss) {
    case 'accent_only': return 'Right word — check the accent.';
    case 'case_only': return 'Right word — check the capital letter.';
    case 'whitespace_only': return 'Right word — check the spacing.';
    case 'empty': return null;
    default: return null;
  }
}

/** Is this item type gradable without a human at all? */
export function isAutoGradable(itemType: string): boolean {
  return itemType !== 'free_response';
}
