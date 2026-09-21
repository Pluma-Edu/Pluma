import type { GenerationParams } from '../params.ts';

export const PROMPT_TEMPLATE_NAME = 'spanish-items';
export const PROMPT_TEMPLATE_VERSION = 1;

/**
 * The prompt is built from GenerationParams and an allow-list of lemmas that
 * the caller derived from the lexicon at this course's ceiling. No other input
 * exists. There is nowhere for a student name, a roster id, or a teacher's note
 * to enter, because none of them is a parameter of this function.
 */
export function buildGenerationPrompt(
  params: GenerationParams,
  allowedLemmas: string[],
  count: number,
): { system: string; user: string } {
  const c = params.constraints;

  const system = [
    'You write practice items for a secondary-school Spanish course.',
    'You are given a skill, a difficulty, and a closed vocabulary list.',
    '',
    'Rules, in order of importance:',
    '1. The answer key must be correct. If you are not certain a form is',
    '   correct, do not write the item at all. Returning fewer items is always',
    '   better than returning one wrong answer key.',
    '2. Use only lemmas from the supplied vocabulary list. Do not introduce a',
    '   verb, noun or adjective that is not on it.',
    '3. Every item must test the named skill and nothing else. Do not require a',
    '   second grammar point the student has not been taught.',
    '4. Accents are part of the answer. hablo and habló are different answers.',
    '5. The rationale explains why the answer is right in one or two sentences,',
    '   addressed to a student. It must not merely restate the answer.',
    '6. For any item about verb morphology, fill in grammar_claim with the exact',
    '   lemma, mood, tense and person your answer uses. This is checked against',
    '   a conjugator, so it must match the answer you wrote.',
    '7. For multiple choice, every distractor must be a real Spanish form that is',
    '   wrong in this sentence. Never write a distractor that is also correct.',
    '8. Write nothing about any specific person. Items are about generic',
    '   subjects, never about named individuals.',
  ].join('\n');

  const user = [
    `Skill: ${params.skill}`,
    `Course: ${params.course} (vocabulary ceiling: course ${c.lexicon_ceiling})`,
    `Item type: ${params.item_type}`,
    `Difficulty: ${params.difficulty} of 5`,
    `Register: ${c.register}`,
    c.theme ? `Theme: ${c.theme}` : null,
    c.allowed_tenses?.length ? `Allowed tenses: ${c.allowed_tenses.join(', ')}` : null,
    c.allowed_persons?.length ? `Allowed persons: ${c.allowed_persons.join(', ')}` : null,
    c.forbidden_lemmas?.length ? `Do not use: ${c.forbidden_lemmas.join(', ')}` : null,
    `Maximum stem length: ${c.stem_max_chars} characters`,
    '',
    `Vocabulary you may use (${allowedLemmas.length} lemmas):`,
    allowedLemmas.join(', '),
    '',
    `Write ${count} items.`,
    params.item_type === 'mcq'
      ? 'Each item needs exactly four choices, keys a through d.'
      : 'Leave choices empty.',
  ].filter(Boolean).join('\n');

  return { system, user };
}
