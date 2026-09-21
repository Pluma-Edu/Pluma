import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateTemplateItems, type Lexeme } from './index.ts';
import type { GenerationParams, ItemType } from '../params.ts';
import { LEXEMES } from '../../taxonomy/seed-spanish.ts';

const lexicon: Lexeme[] = LEXEMES.map((l) => ({
  lemma: l.lemma, pos: l.pos, gloss: l.gloss, introduced_at_course: l.course, tags: l.tags ?? [],
}));

function rationaleFor(skill: string, lemma: string, person: string, item_type: ItemType = 'cloze'): string {
  const params: GenerationParams = {
    subject: 'spanish', course: 'spanish-3', skill, item_type, difficulty: 5,
    content_locale: 'es', ui_locale: 'en',
    constraints: { lexicon_version: 1, lexicon_ceiling: 3, register: 'neutral', stem_max_chars: 160 },
    template: { name: 'conjugation-drill', version: 1 }, model_id: null,
  };
  const items = generateTemplateItems(params, lexicon, 400);
  const hit = items.find((i) => {
    const c = i.grammar_claim as { lemma: string; person: string } | null;
    return c?.lemma === lemma && c?.person === person;
  });
  assert.ok(hit, `no generated item for ${lemma}/${person} in ${skill}`);
  return hit.rationale;
}

// The rationale must describe the tense being drilled, not the present tense.
// empezar is stem-changing in the present and entirely regular in the preterite;
// an answer key that says otherwise teaches a rule that does not exist.

test('a present-tense stem changer is not called stem-changing in the preterite', () => {
  const r = rationaleFor('preterite-irregular', 'empezar', '3p');
  assert.match(r, /empezaron/);
  assert.doesNotMatch(r, /stem changes from empez/,
    'empezar takes no stem change in the preterite');
  assert.match(r, /not here|regular/i,
    'it should say the present-tense change does not apply');
});

test('a verb irregular only in the present yo is not called irregular in the preterite', () => {
  const r = rationaleFor('preterite-irregular', 'conocer', '1s');
  assert.match(r, /conocí/);
  assert.doesNotMatch(r, /irregular in the preterite/,
    'conocer is regular throughout the preterite');
});

test('an -ir stem change in the preterite third person IS described', () => {
  const r = rationaleFor('preterite-irregular', 'dormir', '3s');
  assert.match(r, /durmió/);
  assert.match(r, /dorm-? to durm/, 'the o>u shift is the rule being taught here');
});

test('a genuinely irregular preterite is called irregular', () => {
  const r = rationaleFor('preterite-irregular', 'estar', '3s');
  assert.match(r, /estuvo/);
  assert.match(r, /irregular/);
});

test('spelling changes are explained as spelling, not as a stem change', () => {
  const r = rationaleFor('preterite-irregular', 'empezar', '1s');
  assert.match(r, /empecé/);
  assert.match(r, /sound|spell/i, 'z -> c before -é keeps the sound; it is not a stem change');
});

test('a regular verb explains stem plus ending', () => {
  const r = rationaleFor('preterite-regular', 'hablar', '1p');
  assert.match(r, /hablamos/);
  assert.match(r, /habl-/);
});

test('generation covers every verb-person combination, at every person count', () => {
  // The coverage gap that hid the bugs above: at five persons the old walk
  // produced one person per verb and never revisited.
  for (const difficulty of [1, 2, 3, 4, 5] as const) {
    const params: GenerationParams = {
      subject: 'spanish', course: 'spanish-3', skill: 'preterite-regular',
      item_type: 'cloze', difficulty, content_locale: 'es', ui_locale: 'en',
      constraints: { lexicon_version: 1, lexicon_ceiling: 3, register: 'neutral', stem_max_chars: 160 },
      template: { name: 'conjugation-drill', version: 1 }, model_id: null,
    };
    const items = generateTemplateItems(params, lexicon, 100000);
    const pairs = new Set(items.map((i) => {
      const c = i.grammar_claim as { lemma: string; person: string };
      return `${c.lemma}/${c.person}`;
    }));
    const verbs = new Set([...pairs].map((p) => p.split('/')[0]));
    const persons = new Set([...pairs].map((p) => p.split('/')[1]));
    assert.equal(pairs.size, verbs.size * persons.size,
      `difficulty ${difficulty}: ${pairs.size} pairs for ${verbs.size} verbs x ${persons.size} persons`);
  }
});

test('any short prefix of a pool is varied in person', () => {
  const params: GenerationParams = {
    subject: 'spanish', course: 'spanish-2', skill: 'preterite-regular',
    item_type: 'cloze', difficulty: 3, content_locale: 'es', ui_locale: 'en',
    constraints: { lexicon_version: 1, lexicon_ceiling: 2, register: 'neutral', stem_max_chars: 160 },
    template: { name: 'conjugation-drill', version: 1 }, model_id: null,
  };
  const first10 = generateTemplateItems(params, lexicon, 10);
  const persons = new Set(first10.map((i) => (i.grammar_claim as { person: string }).person));
  assert.ok(persons.size >= 4, `a 10-item worksheet used only ${persons.size} person(s)`);
  const verbs = new Set(first10.map((i) => (i.grammar_claim as { lemma: string }).lemma));
  assert.equal(verbs.size, 10, 'a worksheet should not repeat a verb');
});
