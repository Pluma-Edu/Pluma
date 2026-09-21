import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson, generationHash, paramsAreClosed, type GenerationParams } from './params.ts';
import type { Person } from './template/conjugator.ts';

const base: GenerationParams = {
  subject: 'spanish',
  course: 'spanish-2',
  skill: 'preterite-regular',
  item_type: 'cloze',
  difficulty: 2,
  content_locale: 'es',
  ui_locale: 'en',
  constraints: {
    lexicon_version: 1, lexicon_ceiling: 2, register: 'neutral', stem_max_chars: 160,
    allowed_tenses: ['preterite'],
  },
  template: { name: 'conjugation-drill', version: 1 },
  model_id: null,
};

test('key order does not change the hash', () => {
  const reordered = JSON.parse(JSON.stringify({
    model_id: null, template: { version: 1, name: 'conjugation-drill' },
    constraints: {
      stem_max_chars: 160, register: 'neutral', lexicon_ceiling: 2,
      lexicon_version: 1, allowed_tenses: ['preterite'],
    },
    ui_locale: 'en', content_locale: 'es', difficulty: 2,
    item_type: 'cloze', skill: 'preterite-regular', course: 'spanish-2', subject: 'spanish',
  }));
  assert.equal(generationHash(reordered), generationHash(base));
});

test('array order DOES change the hash (a different constraint set is a different pool)', () => {
  const swapped = { ...base, constraints: { ...base.constraints, allowed_persons: ['1s', '3s'] as Person[] } };
  const other = { ...base, constraints: { ...base.constraints, allowed_persons: ['3s', '1s'] as Person[] } };
  assert.notEqual(generationHash(swapped), generationHash(other));
});

test('undefined fields are dropped, so optional absent === omitted', () => {
  assert.equal(canonicalJson({ a: 1, b: undefined }), canonicalJson({ a: 1 }));
});

test('meaning-changing fields change the pool', () => {
  const h = generationHash(base);
  assert.notEqual(h, generationHash({ ...base, difficulty: 3 }));
  assert.notEqual(h, generationHash({ ...base, skill: 'preterite-irregular' }));
  assert.notEqual(h, generationHash({ ...base, item_type: 'mcq' }));
  assert.notEqual(h, generationHash({ ...base, template: { name: 'conjugation-drill', version: 2 } }));
  assert.notEqual(h, generationHash({ ...base, model_id: 'some-model' }));
  assert.notEqual(h, generationHash({
    ...base, constraints: { ...base.constraints, lexicon_ceiling: 1 },
  }));
});

test('count and seed have no field to travel in', () => {
  // the type has no such property; this is the runtime half of that guarantee
  assert.ok(!('count' in base));
  assert.ok(!('seed' in base));
  const withExtra = { ...base, count: 10, seed: 42 } as unknown as GenerationParams;
  assert.notEqual(generationHash(withExtra), generationHash(base),
    'sanity: extra keys would change the hash, which is why callers must not pass them');
});

test('free text is rejected at runtime', () => {
  assert.equal(paramsAreClosed(base).ok, true);

  const withName = { ...base, skill: 'struggles with ser/estar, reads well' };
  const r1 = paramsAreClosed(withName as GenerationParams);
  assert.equal(r1.ok, false);

  const withLemmaProse = {
    ...base,
    constraints: { ...base.constraints, forbidden_lemmas: ['Maria S. keeps mixing these up'] },
  };
  assert.equal(paramsAreClosed(withLemmaProse as GenerationParams).ok, false);

  const goodLemma = { ...base, constraints: { ...base.constraints, forbidden_lemmas: ['hablar'] } };
  assert.equal(paramsAreClosed(goodLemma as GenerationParams).ok, true);
});
