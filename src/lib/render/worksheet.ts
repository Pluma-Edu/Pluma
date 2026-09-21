import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ItemRow } from '../generation/pool.ts';

const CSS = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'print.css'), 'utf8');

export type WorksheetMeta = {
  title: string;
  courseName: string;
  skillName: string;
  instructions?: string;
};

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The run of underscores the generator writes becomes a ruled blank in print. */
function renderStem(stem: string): string {
  return esc(stem).replace(/_{3,}/g, '<span class="blank"></span>');
}

function defaultInstructions(items: ItemRow[]): string {
  const label = items.find((i) => i.render_meta?.tense_label)?.render_meta?.tense_label as string | undefined;
  const type = items[0]?.item_type;
  if (type === 'mcq') {
    return label
      ? `Circle the correct ${label} form of the verb in parentheses.`
      : 'Circle the correct answer.';
  }
  if (type === 'short_answer') return 'Write your answer on the line.';
  return label
    ? `Complete each sentence with the correct ${label} form of the verb in parentheses.`
    : 'Complete each sentence.';
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
  const instructions = meta.instructions ?? defaultInstructions(items);

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
      <h1>${esc(meta.title)}</h1>
      <p class="course">${esc(meta.courseName)}${meta.skillName && meta.skillName !== meta.title ? " &middot; " + esc(meta.skillName) : ""}</p>
    </div>
    <div class="brand">Pluma</div>
  </div>
  ${key
    ? '<div class="keybanner">Answer key</div>'
    : `<div class="nameline">
    <span>Name<span class="rule"></span></span>
    <span>Date<span class="rule short"></span></span>
  </div>`}
  <p class="instructions">${esc(instructions)}</p>
  <ol class="items">
    ${items.map((i) => renderItem(i, key)).join('\n    ')}
  </ol>
</div>
</body>
</html>`;
}
