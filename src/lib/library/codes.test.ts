import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skillCode, estimatedMinutes, pdfPageCount } from './codes.ts';

test('skill codes read like something a teacher would say out loud', () => {
  assert.equal(skillCode('spanish-2', 'Unidad 3', 2), 'SP2-U03-02');
  assert.equal(skillCode('spanish-1', 'Unidad 10', 7), 'SP1-U10-07');
  assert.equal(skillCode('spanish-3', null, 1), 'SP3-01');
  assert.equal(skillCode('spanish-2', 'Repaso', 4), 'SP2-04');
});

test('estimated time is rounded to something a teacher can plan around', () => {
  assert.equal(estimatedMinutes(20, 'cloze'), 15);
  assert.equal(estimatedMinutes(16, 'mcq'), 10);
  assert.equal(estimatedMinutes(2, 'cloze'), 10, 'never claim a worksheet takes under ten minutes');
  assert.ok(estimatedMinutes(12, 'mcq') >= 10, 'a two-page quiz is not a five minute task');
});

test('page count reads the pdf rather than guessing', () => {
  const onePage = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Page /Parent 2 0 R >>\ntrailer');
  assert.equal(pdfPageCount(onePage), 1);
  const twoPage = Buffer.from(
    '%PDF-1.4\n1 0 obj << /Type /Pages /Count 2 >>\n'
    + '2 0 obj << /Type /Page /Parent 1 0 R >>\n3 0 obj << /Type /Page /Parent 1 0 R >>\n');
  assert.equal(pdfPageCount(twoPage), 2, '/Type /Pages must not be counted as a page');
});
