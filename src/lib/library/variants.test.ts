import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VARIANTS, worksheetTitle, metaDescription } from './variants.ts';
import { SKILL_SYNONYMS, SKILL_SEO_NAME, publicSkillName } from '../taxonomy/seed-spanish.ts';

test('every skill has a public name written for a search box', () => {
  for (const slug of Object.keys(SKILL_SYNONYMS)) {
    const name = SKILL_SEO_NAME[slug];
    assert.ok(name, `${slug} has no SEO name`);
    assert.ok(!name.includes(':'),
      `${slug} public name "${name}" still reads like a gradebook column`);
  }
});

test('publicSkillName falls back rather than throwing', () => {
  assert.equal(publicSkillName('not-a-skill', 'Fallback Name'), 'Fallback Name');
  assert.equal(publicSkillName('preterite-irregular', 'Preterite: irregular verbs'),
    'Irregular Preterite Verbs');
});

test('variants are distinct in a way a teacher would notice', () => {
  const signatures = VARIANTS.map((v) => `${v.itemType}/${v.difficulty}`);
  assert.equal(new Set(signatures).size, signatures.length,
    'two variants with the same format and difficulty are near-duplicate pages');
  assert.ok(VARIANTS.length >= 3 && VARIANTS.length <= 8,
    'thin near-duplicate pages at scale is a doorway-page pattern');
});

test('titles lead with the topic, not the format', () => {
  const title = worksheetTitle('Irregular Preterite Verbs', 'Spanish 2', VARIANTS[0]);
  assert.ok(title.startsWith('Irregular Preterite Verbs'), title);
  assert.ok(title.includes('Spanish 2'), title);
});

test('descriptions say the worksheet is free and the key needs an account', () => {
  const d = metaDescription('Irregular Preterite Verbs', 'Spanish 2', VARIANTS[0]);
  assert.match(d, /free/i);
  assert.match(d, /no account/i);
  assert.match(d, /answer key/i);
  assert.ok(d.length <= 200, `meta description is ${d.length} chars; search engines truncate`);
});
