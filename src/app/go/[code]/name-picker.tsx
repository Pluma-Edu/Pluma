'use client';

import { useActionState, useState } from 'react';
import { pickNameAction } from '../actions';

type Entry = { id: string; display_name: string; has_pin: boolean };

export function NamePicker({ code, roster }: { code: string; roster: Entry[] }) {
  const [error, action, pending] = useActionState(pickNameAction, null);
  const [selected, setSelected] = useState<Entry | null>(null);

  if (selected?.has_pin) {
    return (
      <form action={action} className="mt-8">
        <input type="hidden" name="code" value={code} />
        <input type="hidden" name="rosterEntryId" value={selected.id} />
        <p className="text-sm">Hi {selected.display_name} — enter your PIN.</p>
        <input name="pin" inputMode="numeric" autoFocus required maxLength={6}
               className="mt-3 w-full rounded border-2 border-neutral-300 px-4 py-3 text-center font-mono text-2xl tracking-[0.3em]" />
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
        <button disabled={pending}
                className="mt-4 w-full rounded bg-neutral-900 px-4 py-3 text-white disabled:opacity-50">
          {pending ? 'Checking…' : 'Start'}
        </button>
        <button type="button" onClick={() => setSelected(null)}
                className="mt-3 w-full text-sm text-neutral-500 underline underline-offset-4">
          not me
        </button>
      </form>
    );
  }

  return (
    <>
      {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
      <ul className="mt-6 grid grid-cols-2 gap-2">
        {roster.map((r) => (
          <li key={r.id}>
            {r.has_pin ? (
              <button onClick={() => setSelected(r)}
                      className="w-full rounded border border-neutral-300 px-3 py-3 text-left hover:bg-neutral-50">
                {r.display_name}
              </button>
            ) : (
              <form action={action}>
                <input type="hidden" name="code" value={code} />
                <input type="hidden" name="rosterEntryId" value={r.id} />
                <button disabled={pending}
                        className="w-full rounded border border-neutral-300 px-3 py-3 text-left hover:bg-neutral-50 disabled:opacity-50">
                  {r.display_name}
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
      {roster.length === 0 && (
        <p className="mt-6 text-sm text-neutral-500">
          Your teacher has not added any names yet.
        </p>
      )}
    </>
  );
}
