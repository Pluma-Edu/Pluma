import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ItemRow } from '../generation/pool.ts';
import { instructionsFor } from './instructions.ts';

const CSS = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'print.css'), 'utf8');

export type WorksheetMeta = {
  title: string;
  courseName: string;
  skillName: string;
  /** e.g. "Unidad 3" — printed in the masthead eyebrow. */
  unitLabel?: string | null;
  /** e.g. SP2-U03-02 — printed in the footer so a teacher can re-find the sheet. */
  skillCode?: string | null;
  instructions?: string;
};

/** The quill, inlined so the PDF has no external reference to resolve. */
const MARK = '<svg viewBox="0 0 100 200" fill="#000"><path fill-rule="evenodd" '
  + 'd="M86 12 C98 48 86 96 66 130 C60 140 52 152 45 161 C50 163 54 164 58 165 '
  + 'C50 172 42 178 36 183 L28 199 L22 196 L31 175 C18 146 20 106 31 78 C42 50 62 24 86 12 Z '
  + 'M82 22 C58 54 42 96 34 176 L30 175 C38 94 58 50 79 19 Z"/></svg>';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The run of underscores the generator writes becomes a ruled blank in print. */
function renderStem(stem: string): string {
  return esc(stem).replace(/_{3,}/g, '<span class="blank"></span>');
}

function answerText(item: ItemRow): string {
  if (item.item_type === 'mcq') {
    const choices = (item.body.choices ?? []) as Array<{ key: string; text: string }>;
    const chosen = choices.find((c) => c.key === item.answer);
    return chosen ? `${chosen.key}. ${chosen.text}` : String(item.answer);
  }
  return Array.isArray(item.answer) ? item.answer.join(', ') : String(item.answer);
}

function renderItem(item: ItemRow, key: boolean): string {
  const parts: string[] = [`<p class="stem">${renderStem(item.stem)}</p>`];

  if (item.item_type === 'mcq') {
    const choices = (item.body.choices ?? []) as Array<{ key: string; text: string }>;
    parts.push('<ul class="choices">' + choices.map((c) =>
      `<li><span class="key">${esc(c.key)}.</span>${esc(c.text)}</li>`).join('') + '</ul>');
  } else if (!key && item.item_type === 'short_answer') {
    parts.push('<span class="answer-line"></span>');
  }

  if (key) {
    parts.push(`<span class="why"><span class="answer">${esc(answerText(item))}</span> &mdash; ${esc(item.rationale)}</span>`);
  }
  return `<li>${parts.join('')}</li>`;
}

export function renderWorksheetHtml(
  items: ItemRow[],
  meta: WorksheetMeta,
  opts: { answerKey?: boolean } = {},
): string {
  const key = opts.answerKey === true;
  const instructions = meta.instructions ?? instructionsFor(items);

  const eyebrow = [meta.courseName, meta.unitLabel].filter(Boolean).join(' · ');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(meta.title)}${key ? ' — Answer Key' : ''}</title>
<style>${CSS}</style>
</head>
<body>
<div class="sheet${key ? ' keysheet' : ''}">
  <div class="masthead">
    <div>
      <p class="eyebrow">${esc(eyebrow)}</p>
      <h1>${esc(meta.title)}</h1>
    </div>
    <div class="lockup">${MARK}<span class="wordmark">Pluma</span></div>
  </div>
  ${key
    ? '<div class="keybanner">Answer key</div>'
    : `<div class="fields">
    <div><div class="label">Name</div><div class="rule"></div></div>
    <div><div class="label">Date</div><div class="rule"></div></div>
    <div><div class="label">Class / Period</div><div class="rule"></div></div>
  </div>`}
  <p class="instructions">${esc(instructions)}</p>
  <ol class="items">
    ${items.map((i) => renderItem(i, key)).join('\n    ')}
  </ol>
</div>
</body>
</html>`;
}
