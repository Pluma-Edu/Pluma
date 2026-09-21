/**
 * Deterministic item generation over the lexicon.
 *
 * Nothing here calls a model. The answer key is computed, not written, so it is
 * correct by construction and L2 validation is skipped entirely. This is the
 * front half that costs nothing and can never hallucinate; the model front half
 * exists for the items that genuinely need language rather than morphology.
 */
import {
  conjugate, isSupported, UnsupportedForm, regularForm, regularEnding, hasPresentStemChange,
  PERSONS, type Person, type Tense,
} from './conjugator.ts';
import type { Difficulty, GenerationParams, ItemType } from '../params.ts';

export type Lexeme = {
  lemma: string;
  pos: 'verb' | 'noun' | 'adj';
  gloss: string;
  introduced_at_course: number;
  tags: string[];
};

export type GeneratorKind = 'template' | 'model' | 'hybrid';

export type GeneratedItem = {
  skill: string;
  item_type: ItemType;
  difficulty: Difficulty;
  stem: string;
  body: Record<string, unknown>;
  answer: unknown;
  accepted_answers: string[];
  answer_match_mode: 'exact' | 'case_insensitive' | 'accent_insensitive';
  rationale: string;
  render_meta: Record<string, unknown>;
  grammar_claim: Record<string, unknown> | null;
  lexemes_used: string[];
  auto_gradable: boolean;
  generator_kind: GeneratorKind;
};

/** Which tense each skill drills, and which verbs belong in it. */
const SKILL_SPEC: Record<string, { tense: Tense; accepts: (l: Lexeme) => boolean; label: string }> = {
  'present-regular-ar': {
    tense: 'present', label: 'present tense',
    accepts: (l) => l.tags.includes('regular') && l.lemma.endsWith('ar'),
  },
  'present-regular-er': {
    tense: 'present', label: 'present tense',
    accepts: (l) => l.tags.includes('regular') && l.lemma.endsWith('er'),
  },
  'present-regular-ir': {
    tense: 'present', label: 'present tense',
    accepts: (l) => l.tags.includes('regular') && l.lemma.endsWith('ir'),
  },
  'present-stem-changing': {
    tense: 'present', label: 'present tense',
    accepts: (l) => l.tags.includes('stem'),
  },
  'preterite-regular': {
    tense: 'preterite', label: 'preterite',
    accepts: (l) => l.tags.includes('regular'),
  },
  'preterite-irregular': {
    tense: 'preterite', label: 'preterite',
    accepts: (l) => l.tags.includes('irregular') || l.tags.includes('stem'),
  },
  'imperfect-regular': {
    tense: 'imperfect', label: 'imperfect',
    accepts: (l) => l.pos === 'verb',
  },
  'future-simple': {
    tense: 'future', label: 'simple future',
    accepts: (l) => l.pos === 'verb',
  },
  'present-subjunctive': {
    tense: 'present_subjunctive', label: 'present subjunctive',
    accepts: (l) => l.pos === 'verb',
  },
};

export function templateSupports(skill: string): boolean {
  return skill in SKILL_SPEC;
}

/** The pronoun printed in the carrier sentence, one per person. */
const SUBJECT: Record<Person, string> = {
  '1s': 'Yo', '2s': 'Tú', '3s': 'Ella', '1p': 'Nosotros', '2p': 'Vosotros', '3p': 'Ellos',
};

const PERSON_NAME: Record<Person, string> = {
  '1s': 'yo', '2s': 'tú', '3s': 'él/ella/usted', '1p': 'nosotros',
  '2p': 'vosotros', '3p': 'ellos/ellas/ustedes',
};

/** Difficulty widens the verb pool and then the person set. */
function personsFor(d: Difficulty): Person[] {
  if (d === 1) return ['1s', '2s', '3s'];
  if (d === 2) return ['1s', '2s', '3s', '3p'];
  if (d >= 5) return PERSONS;
  return ['1s', '2s', '3s', '1p', '3p'];
}

function verbsFor(d: Difficulty, all: Lexeme[]): Lexeme[] {
  const regular = (l: Lexeme) => l.tags.includes('regular');
  const stem = (l: Lexeme) => l.tags.includes('stem');
  if (d <= 2) return all.filter(regular);
  if (d === 3) return all.filter((l) => regular(l) || stem(l));
  return all;
}

function endingOf(lemma: string): 'ar' | 'er' | 'ir' {
  const e = lemma.normalize('NFD').replace(/[̀-ͯ]/g, '').slice(-2);
  return e as 'ar' | 'er' | 'ir';
}

function buildRationale(l: Lexeme, tense: Tense, person: Person, form: string, label: string): string {
  const stem = l.lemma.slice(0, -2);
  const who = PERSON_NAME[person];
  const regular = regularForm(l.lemma, tense, person);
  const ending = regularEnding(l.lemma, tense, person);

  // Regular in THIS tense — which a verb can be while being irregular in another.
  if (regular !== null && form === regular) {
    const note = hasPresentStemChange(l.lemma) && tense !== 'present'
      ? ` ${l.lemma} changes its stem in the present, but not here.`
      : '';
    return `Keep the stem ${stem}- and add the ${who} ${label} ending -${ending}: ${form}.${note}`;
  }

  // Regular ending, different stem: say which stem, because that is the rule
  // the student is actually learning.
  if (ending !== null && form.endsWith(ending) && form.length > ending.length) {
    const actualStem = form.slice(0, -ending.length);
    if (SPELLING_CHANGE_NOTE[l.lemma.slice(-3)] && person === '1s' && tense === 'preterite') {
      return `The ending is the regular ${who} ${label} -${ending}, but ${stem}- is spelled `
        + `${actualStem}- to keep the sound: ${form}.`;
    }
    return `The ending is the regular ${who} ${label} -${ending}, but the stem changes from `
      + `${stem}- to ${actualStem}-: ${form}.`;
  }

  return `${l.lemma} is irregular in the ${label}. The ${who} form is ${form}.`;
}

/** -car, -gar and -zar change spelling before -é rather than changing stem. */
const SPELLING_CHANGE_NOTE: Record<string, boolean> = { car: true, gar: true, zar: true };

/** Real forms of the same verb that are wrong for this stem. */
function distractorsFor(lemma: string, tense: Tense, person: Person, answer: string, want: number): string[] {
  const out: string[] = [];
  const seen = new Set([answer]);
  const push = (f: string) => {
    if (!seen.has(f)) { seen.add(f); out.push(f); }
  };

  // Other persons in the same tense first: that is the confusion being tested.
  for (const p of PERSONS) {
    if (p === person || out.length >= want) continue;
    try { push(conjugate(lemma, tense, p)); } catch { /* skip forms we will not vouch for */ }
  }
  // Then the same person in a neighbouring tense.
  const others: Tense[] = ['present', 'preterite', 'imperfect', 'future'];
  for (const t of others) {
    if (t === tense || out.length >= want) continue;
    try { push(conjugate(lemma, t, person)); } catch { /* ignore */ }
  }
  return out.slice(0, want);
}

export function generateTemplateItems(
  params: GenerationParams,
  lexicon: Lexeme[],
  limit: number,
): GeneratedItem[] {
  const spec = SKILL_SPEC[params.skill];
  if (!spec) return [];

  const forbidden = new Set(params.constraints.forbidden_lemmas ?? []);

  // The skill decides which verbs belong at all; difficulty then narrows within
  // that set. Applying difficulty first empties skills that are ABOUT a verb
  // class — "preterite: irregular verbs" at difficulty 2 asked for verbs that
  // are both regular and irregular, and got none. Difficulty must never empty
  // a skill; where it would, the skill's own set stands.
  const inSkill = lexicon
    .filter((l) => l.pos === 'verb')
    .filter((l) => spec.accepts(l))
    .filter((l) => l.introduced_at_course <= params.constraints.lexicon_ceiling)
    .filter((l) => !forbidden.has(l.lemma));

  const narrowed = verbsFor(params.difficulty, inSkill);
  const eligible = (narrowed.length >= 4 ? narrowed : inSkill)
    .sort((a, b) => a.lemma.localeCompare(b.lemma, 'es'));

  const persons = (params.constraints.allowed_persons ?? personsFor(params.difficulty))
    .filter((p) => PERSONS.includes(p));

  const items: GeneratedItem[] = [];
  // Walk the verb list once per pass, offsetting the person by the pass number.
  // Within a pass consecutive items differ in both verb and person, so any
  // prefix of the pool is varied; across P passes every verb is paired with
  // every person, so coverage is complete. (An earlier version advanced the
  // person by k + k/V, which only reaches every person when gcd(V+1, P) = 1 —
  // at five persons it silently generated one person per verb.)
  const combos: Array<{ person: Person; l: Lexeme }> = [];
  const V = eligible.length;
  const P = persons.length;
  for (let pass = 0; pass < P; pass++) {
    for (let v = 0; v < V; v++) {
      combos.push({ l: eligible[v], person: persons[(v + pass) % P] });
    }
  }

  {
    for (const { person, l } of combos) {
      if (items.length >= limit) break;
      if (!isSupported(l.lemma, spec.tense, person)) continue;

      let form: string;
      try {
        form = conjugate(l.lemma, spec.tense, person);
      } catch (e) {
        if (e instanceof UnsupportedForm) continue;
        throw e;
      }

      const carrier = `${SUBJECT[person]} ______ (${l.lemma}).`;
      const rationale = buildRationale(l, spec.tense, person, form, spec.label);
      const claim = {
        lemma: l.lemma, pos: 'verb', mood: spec.tense === 'present_subjunctive' ? 'subjunctive' : 'indicative',
        tense: spec.tense, person,
      };
      const common = {
        skill: params.skill,
        difficulty: params.difficulty,
        rationale,
        grammar_claim: claim,
        lexemes_used: [l.lemma],
        auto_gradable: true,
        generator_kind: 'template' as const,
        // accents carry the grammar here, so matching cannot ignore them
        answer_match_mode: 'exact' as const,
      };

      if (params.item_type === 'mcq') {
        const distractors = distractorsFor(l.lemma, spec.tense, person, form, 3);
        if (distractors.length < 3) continue;     // no weak 2-choice items
        const choices = [form, ...distractors]
          .sort((a, b) => a.localeCompare(b, 'es'))
          .map((text, i) => ({ key: 'abcd'[i], text }));
        const correct = choices.find((c) => c.text === form)!;
        items.push({
          ...common, item_type: 'mcq', stem: carrier,
          body: { choices },
          answer: correct.key,
          accepted_answers: [correct.key],
          render_meta: { tense: spec.tense, tense_label: spec.label, answer_slot: 'inline' },
        });
      } else if (params.item_type === 'cloze') {
        items.push({
          ...common, item_type: 'cloze', stem: carrier,
          body: { blanks: [{ key: '1', hint: l.lemma }] },
          answer: [form],
          accepted_answers: [form],
          render_meta: { tense: spec.tense, tense_label: spec.label, answer_slot: 'line' },
        });
      } else if (params.item_type === 'short_answer') {
        items.push({
          ...common, item_type: 'short_answer',
          stem: `Write the ${PERSON_NAME[person]} ${spec.label} form of ${l.lemma}.`,
          body: {},
          answer: form,
          accepted_answers: [form],
          render_meta: { tense: spec.tense, tense_label: spec.label, answer_slot: 'line' },
        });
      }
    }
  }
  return items;
}
