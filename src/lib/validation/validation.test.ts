import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateItem, failedCheckNames, type ValidationContext } from './index.ts';
import { generateTemplateItems, type GeneratedItem, type Lexeme } from '../generation/template/index.ts';
import type { GenerationParams, Difficulty, ItemType } from '../generation/params.ts';
import { LEXEMES } from '../taxonomy/seed-spanish.ts';

const lexicon: Lexeme[] = LEXEMES.map((l) => ({
  lemma: l.lemma, pos: l.pos, gloss: l.gloss,
  introduced_at_course: l.course, tags: l.tags ?? [],
}));

const ctx: ValidationContext = { lexicon, lexiconCeiling: 2, stemMaxChars: 160 };

function params(over: Partial<GenerationParams> = {}): GenerationParams {
  return {
    subject: 'spanish', course: 'spanish-2', skill: 'preterite-regular',
    item_type: 'cloze', difficulty: 2, content_locale: 'es', ui_locale: 'en',
    constraints: { lexicon_version: 1, lexicon_ceiling: 2, register: 'neutral', stem_max_chars: 160 },
    template: { name: 'conjugation-drill', version: 1 },
    model_id: null,
    ...over,
  };
}

const oneItem = (over: Partial<GenerationParams> = {}): GeneratedItem =>
  generateTemplateItems(params(over), lexicon, 1)[0];

test('a template item passes every layer', () => {
  const item = oneItem();
  const out = validateItem(item, ctx);
  assert.equal(out.state, 'auto_validated', failedCheckNames(out).join(', '));
});

test('a wrong answer key is rejected by recomputation', () => {
  const item = { ...oneItem(), answer: ['comieron'], accepted_answers: ['comieron'] };
  const out = validateItem(item, ctx);
  assert.equal(out.state, 'rejected');
  assert.ok(failedCheckNames(out).includes('answer_matches_computed_form'));
});

test('an answer that is right except for its accents is caught specifically', () => {
  const good = oneItem();
  const canonical = (good.answer as string[])[0];
  const stripped = canonical.normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC');
  if (stripped === canonical) return;   // this verb form carries no accent
  const item = { ...good, answer: [stripped], accepted_answers: [stripped] };
  const out = validateItem(item, ctx);
  assert.equal(out.state, 'rejected');
  assert.ok(failedCheckNames(out).includes('answer_accents_correct'),
    'accent-only errors must be distinguishable from ordinary wrong answers');
});

test('an mcq whose distractor is also correct is rejected', () => {
  const item = oneItem({ item_type: 'mcq' });
  const choices = item.body.choices as Array<{ key: string; text: string }>;
  const correct = choices.find((c) => c.key === item.answer)!;
  const poisoned = {
    ...item,
    body: { choices: choices.map((c) => (c.key === 'a' || c.key === correct.key ? c : { ...c, text: correct.text })) },
  };
  const out = validateItem(poisoned, ctx);
  assert.equal(out.state, 'rejected');
  const names = failedCheckNames(out);
  assert.ok(names.includes('no_distractor_is_also_correct') || names.includes('mcq_choices_distinct'));
});

test('a stem that leaks its own answer is rejected', () => {
  const item = oneItem();
  const canonical = (item.answer as string[])[0];
  const out = validateItem({ ...item, stem: `Ella ${canonical} ______ (comer).` }, ctx);
  assert.equal(out.state, 'rejected');
  assert.ok(failedCheckNames(out).includes('stem_does_not_leak_answer'));
});

test('vocabulary above the course ceiling is rejected', () => {
  // conducir is introduced in Spanish 3; this context allows up to Spanish 2
  const item = { ...oneItem(), stem: 'Yo ______ (conducir).', lexemes_used: ['conducir'] };
  const out = validateItem(item, ctx);
  assert.equal(out.state, 'rejected');
  assert.ok(failedCheckNames(out).includes('stem_within_lexicon_ceiling'));
});

test('markup and mojibake in a stem are rejected', () => {
  const item = oneItem();
  assert.equal(validateItem({ ...item, stem: '<b>Yo</b> ______ (comer).' }, ctx).state, 'rejected');
  assert.equal(validateItem({ ...item, stem: 'Yo â€œ______â€ (comer).' }, ctx).state, 'rejected');
});

test('a missing grammar claim on a verb skill is rejected', () => {
  const out = validateItem({ ...oneItem(), grammar_claim: null }, ctx);
  assert.equal(out.state, 'rejected');
  assert.ok(failedCheckNames(out).includes('grammar_claim_required_for_verb_skill'));
});

test('the whole template surface validates: every skill, type and difficulty', () => {
  const skills = [
    'present-regular-ar', 'present-regular-er', 'present-regular-ir',
    'present-stem-changing', 'preterite-regular', 'preterite-irregular',
    'imperfect-regular', 'future-simple', 'present-subjunctive',
  ];
  const types: ItemType[] = ['cloze', 'mcq', 'short_answer'];
  let generated = 0;
  const failures: string[] = [];

  for (const skill of skills) {
    for (const item_type of types) {
      for (const difficulty of [1, 2, 3, 4, 5] as Difficulty[]) {
        const p = params({
          skill, item_type, difficulty,
          course: 'spanish-3',
          constraints: {
            lexicon_version: 1, lexicon_ceiling: 3, register: 'neutral', stem_max_chars: 160,
          },
        });
        const items = generateTemplateItems(p, lexicon, 40);
        for (const item of items) {
          generated++;
          const out = validateItem(item, { ...ctx, lexiconCeiling: 3 });
          if (out.state !== 'auto_validated') {
            failures.push(`${skill}/${item_type}/d${difficulty} "${item.stem}" -> ${failedCheckNames(out).join(',')}`);
          }
        }
      }
    }
  }

  console.log(`    generated and validated ${generated} items across ${skills.length} skills`);
  assert.ok(generated > 1000, `expected a real bank, got ${generated}`);
  assert.deepEqual(failures.slice(0, 10), [], `${failures.length} item(s) failed validation`);
});
