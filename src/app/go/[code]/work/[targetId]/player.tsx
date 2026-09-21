'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { submitAction, type SubmitState } from '../../../actions';
import type { StudentItem } from '@/lib/classroom/student';

const ACCENTS = ['á', 'é', 'í', 'ó', 'ú', 'ñ', 'ü', '¿', '¡'];

/**
 * The accent palette is not a nicety. Without it, a student on a Chromebook
 * cannot type habló, and grading that leniently would mark wrong conjugations
 * correct. Giving them the characters is what makes strict grading fair.
 */
function AccentBar() {
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {ACCENTS.map((ch) => (
        <button key={ch} type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            const el = document.activeElement as HTMLInputElement | null;
            if (!el || el.tagName !== 'INPUT') return;
            const start = el.selectionStart ?? el.value.length;
            const end = el.selectionEnd ?? start;
            el.value = el.value.slice(0, start) + ch + el.value.slice(end);
            el.selectionStart = el.selectionEnd = start + ch.length;
          }}
          className="rounded border border-neutral-300 px-2 py-0.5 font-serif text-sm hover:bg-neutral-100">
          {ch}
        </button>
      ))}
    </div>
  );
}

export function Player({
  code, targetId, items, alreadyDone,
}: { code: string; targetId: string; items: StudentItem[]; alreadyDone: boolean }) {
  const [state, action, pending] = useActionState<SubmitState, FormData>(
    submitAction, { done: alreadyDone });

  if (state.done && state.feedback) {
    const right = state.feedback.filter((f) => f.correct).length;
    return (
      <div className="mt-6">
        <p className="text-lg">
          {right} of {state.feedback.length} right.
        </p>
        <ol className="mt-6 space-y-4">
          {items.map((item, i) => {
            const f = state.feedback!.find((x) => x.itemId === item.id);
            return (
              <li key={item.id} className="border-b border-neutral-100 pb-3">
                <p className="font-serif">
                  <span className="mr-2 font-semibold">{i + 1}.</span>{item.stem}
                </p>
                <p className={`mt-1 text-sm ${f?.correct ? 'text-green-800' : 'text-neutral-700'}`}>
                  {f?.correct ? '✓ Correct' : '✗ Not quite'}
                  {f?.note && <span className="ml-2 italic">{f.note}</span>}
                  {f?.correctAnswer && !f.correct && (
                    <span className="ml-2">Answer: <strong>{f.correctAnswer}</strong></span>
                  )}
                </p>
                {f?.rationale && <p className="mt-1 text-sm italic text-neutral-600">{f.rationale}</p>}
              </li>
            );
          })}
        </ol>
        <Link href={`/go/${code}/work`}
              className="mt-8 inline-block rounded bg-neutral-900 px-4 py-2 text-white">
          Done
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="mt-6">
      <input type="hidden" name="targetId" value={targetId} />
      <ol className="space-y-6">
        {items.map((item, i) => (
          <li key={item.id}>
            <p className="font-serif text-[15px]">
              <span className="mr-2 font-semibold">{i + 1}.</span>{item.stem}
            </p>

            {item.item_type === 'mcq' ? (
              <ul className="mt-2 space-y-1">
                {item.choices.map((c) => (
                  <li key={c.key}>
                    <label className="flex items-center gap-2 font-serif">
                      <input type="radio" name={`r:${item.id}`} value={c.key} required />
                      <span className="font-semibold">{c.key}.</span> {c.text}
                    </label>
                  </li>
                ))}
              </ul>
            ) : item.item_type === 'cloze' ? (
              <div className="mt-2 space-y-2">
                {item.blanks.map((b, bi) => (
                  <input key={b.key} name={`r:${item.id}:${bi}`} autoComplete="off" autoCapitalize="off"
                         className="w-56 rounded border border-neutral-300 px-2 py-1.5 font-serif" />
                ))}
                <AccentBar />
              </div>
            ) : (
              <div className="mt-2">
                <input name={`r:${item.id}`} autoComplete="off" autoCapitalize="off"
                       className="w-full rounded border border-neutral-300 px-2 py-1.5 font-serif" />
                <AccentBar />
              </div>
            )}
          </li>
        ))}
      </ol>

      {state.error && <p className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p>}

      <button disabled={pending || alreadyDone}
              className="mt-8 w-full rounded bg-neutral-900 px-4 py-3 text-white disabled:opacity-50">
        {pending ? 'Checking…' : 'Turn in'}
      </button>
      <p className="mt-3 text-center text-xs text-neutral-500">
        No timer, no streak. You can come back to this.
      </p>
    </form>
  );
}
