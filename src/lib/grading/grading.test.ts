import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gradeResponse, feedbackFor, type GradableItem } from './index.ts';

const cloze = (answer: string[]): GradableItem => ({
  item_type: 'cloze', answer, accepted_answers: answer,
  answer_match_mode: 'exact', body: { blanks: answer.map((_, i) => ({ key: String(i + 1) })) },
});

test('exact match grades correct', () => {
  const r = gradeResponse(cloze(['hablé']), ['hablé']);
  assert.equal(r.correct, true);
  assert.equal(r.score, 1);
});

test('a missing accent is wrong, and says so', () => {
  const r = gradeResponse(cloze(['hablé']), ['hable']);
  assert.equal(r.correct, false, 'hable is a different form; it cannot be marked right');
  assert.equal(r.parts[0].nearMiss, 'accent_only');
  assert.equal(feedbackFor(r.parts[0]), 'Right word — check the accent.');
});

test('hablo and habló are never conflated', () => {
  // the exact case the brief calls out: accent-insensitive matching here would
  // mark a present-tense answer correct on a preterite item
  const r = gradeResponse(cloze(['habló']), ['hablo']);
  assert.equal(r.correct, false);
  assert.equal(r.parts[0].nearMiss, 'accent_only');
});

test('a plain wrong answer is not labelled a near miss', () => {
  const r = gradeResponse(cloze(['hablé']), ['comí']);
  assert.equal(r.correct, false);
  assert.equal(r.parts[0].nearMiss, undefined);
  assert.equal(feedbackFor(r.parts[0]), null);
});

test('case and surrounding whitespace do not fail a student', () => {
  const r = gradeResponse(cloze(['hablé']), ['  hablé  ']);
  assert.equal(r.correct, true, 'trimming is not leniency, it is not punishing the space bar');
  const cased = gradeResponse(cloze(['hablé']), ['Hablé']);
  assert.equal(cased.correct, false);
  assert.equal(cased.parts[0].nearMiss, 'case_only');
});

test('cloze gives partial credit per blank', () => {
  const r = gradeResponse(cloze(['hablé', 'comimos']), ['hablé', 'comemos']);
  assert.equal(r.correct, false);
  assert.equal(r.score, 0.5);
  assert.equal(r.parts[0].correct, true);
  assert.equal(r.parts[1].correct, false);
  assert.equal(r.parts.length, 2, 'two blanks are two pieces of evidence, not one');
});

test('a blank answer is empty, not merely wrong', () => {
  const r = gradeResponse(cloze(['hablé']), ['']);
  assert.equal(r.parts[0].nearMiss, 'empty');
});

test('mcq compares keys', () => {
  const item: GradableItem = {
    item_type: 'mcq', answer: 'b', accepted_answers: ['b'],
    body: { choices: [{ key: 'a', text: 'hablo' }, { key: 'b', text: 'habló' }] },
  };
  assert.equal(gradeResponse(item, 'b').correct, true);
  assert.equal(gradeResponse(item, 'a').correct, false);
  assert.equal(gradeResponse(item, '').parts[0].nearMiss, 'empty');
});

test('accent-insensitive mode exists for skills where accents carry nothing', () => {
  const item: GradableItem = {
    item_type: 'short_answer', answer: 'la casa', accepted_answers: ['la casa'],
    answer_match_mode: 'accent_insensitive', body: {},
  };
  assert.equal(gradeResponse(item, 'la cása').correct, true);
});

test('free response is never auto-graded', () => {
  const item: GradableItem = {
    item_type: 'free_response', answer: '', accepted_answers: [], body: {},
  };
  const r = gradeResponse(item, 'Yo fui al mercado con mi familia.');
  assert.equal(r.correct, false, 'awaiting a human is not the same as being right');
  assert.equal(r.score, 0);
});
