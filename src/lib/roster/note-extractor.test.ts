import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractChips, CLOSED_VALUES, type Chip } from './note-extractor.ts';

const has = (chips: Chip[], key: string, value: string) =>
  chips.some((c) => c.key === key && c.value === value);

test('the example from the brief', () => {
  const { chips } = extractChips('struggles with ser/estar, reads well, needs shorter passages');
  assert.ok(has(chips, 'focus_skill', 'ser-vs-estar'));
  assert.ok(has(chips, 'reading_level', 'above'));
  assert.ok(has(chips, 'passage_length', 'short'));
});

test('polarity is read per clause, not per note', () => {
  const { chips } = extractChips('solid on the preterite but really struggles with the subjunctive');
  assert.ok(has(chips, 'avoid_skill', 'preterite-regular'));
  assert.ok(has(chips, 'focus_skill', 'present-subjunctive'));
  assert.ok(!has(chips, 'focus_skill', 'preterite-regular'));
});

test('the longest skill phrase wins', () => {
  const { chips } = extractChips('needs work on the irregular preterite');
  assert.ok(has(chips, 'focus_skill', 'preterite-irregular'));
  assert.ok(!has(chips, 'focus_skill', 'preterite-regular'),
    '"irregular preterite" must not also match plain "preterite"');
});

// ---------------------------------------------------------------------------
// The property that matters: a note can say anything; a chip can only ever be
// a member of the closed vocabulary. This is what makes constraint 2 hold
// without relying on a scrubber's recall.
// ---------------------------------------------------------------------------

test('no note can produce a chip outside the closed vocabulary', () => {
  const notes = [
    'Maria S. keeps mixing up ser and estar with her brother Jose in 4th period',
    'struggles with ser/estar; mother is Guadalupe Hernandez, call 555-0199',
    'José-Luis reads well. Lives at 42 Oak Street. Needs shorter passages.',
    'she/her, prefers Alex, struggles with the subjunctive',
    '<script>alert(1)</script> needs a challenge',
    'ДЕТИ struggles with preterite 你好',
    '',
    'nothing useful here at all',
  ];
  for (const note of notes) {
    const { chips } = extractChips(note);
    for (const chip of chips) {
      assert.ok(
        CLOSED_VALUES[chip.key].includes(chip.value),
        `note ${JSON.stringify(note)} produced ${chip.key}=${chip.value}, which is not in the closed set`,
      );
    }
  }
});

test('names in a note never reach a chip', () => {
  const note = 'Maria and Jose both struggle with ser/estar; Jose reads well';
  const { chips } = extractChips(note);
  const serialised = JSON.stringify(chips.map((c) => ({ key: c.key, value: c.value })));
  for (const name of ['maria', 'jose', 'josé']) {
    assert.ok(!serialised.toLowerCase().includes(name), `${name} leaked into ${serialised}`);
  }
  // still extracted the useful part
  assert.ok(has(chips, 'focus_skill', 'ser-vs-estar'));
});

// ---------------------------------------------------------------------------
// Things we refuse to act on even though we could parse them.
// ---------------------------------------------------------------------------

test('clinical, immigration and family terms are suppressed, not extracted', () => {
  const cases: Array<[string, string]> = [
    ['has an IEP, needs shorter passages', 'iep'],
    ['ADHD, gets a challenge easily', 'adhd'],
    ['newcomer, arrived six months ago, reads below level', 'immigration status'],
    ['parents are divorcing, struggles with the subjunctive', 'divorce'],
    ['dyslexic; needs large print', 'dyslexia'],
  ];
  for (const [note, term] of cases) {
    const { chips, suppressed } = extractChips(note);
    assert.ok(suppressed.includes(term), `${term} should be reported as suppressed`);
    const values = chips.map((c) => c.value).join(' ');
    assert.ok(!values.includes(term), `${term} must not become a chip value`);
    assert.ok(!values.includes(note.split(/[ ,;]/)[0].toLowerCase()),
      'the note\'s own wording must not survive into a chip value');
  }
});

test('an instructional accommodation still survives alongside a suppressed term', () => {
  // The teacher may write why; we act only on the what.
  const { chips, suppressed } = extractChips('dyslexic, so please use large print and fewer questions');
  assert.ok(suppressed.includes('dyslexia'));
  assert.ok(has(chips, 'render_accommodation', 'large_print'));
  assert.ok(has(chips, 'max_items', '8'));
});

test('render accommodations are separated from generation parameters', () => {
  const { chips } = extractChips('needs large print and extra space to write');
  const accommodations = chips.filter((c) => c.key === 'render_accommodation');
  assert.equal(accommodations.length, 2);
  // the generation-safe view excludes these; see generation_safe_param in the schema
});

test('an unparseable note yields nothing rather than guessing', () => {
  const { chips, suppressed } = extractChips('a really lovely kid, glad to have them');
  assert.deepEqual(chips, []);
  assert.deepEqual(suppressed, []);
});
