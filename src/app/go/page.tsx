'use client';

import { useActionState } from 'react';
import { enterCodeAction } from './actions';

export default function GoPage() {
  const [error, action, pending] = useActionState(enterCodeAction, null);
  return (
    <main className="mx-auto max-w-sm px-6 py-24 text-center">
      <h1 className="text-lg font-semibold tracking-tight">Join your class</h1>
      <p className="mt-1 text-sm text-neutral-600">Type the code your teacher gave you.</p>

      <form action={action} className="mt-8">
        <input
          name="code" required autoFocus autoComplete="off" autoCapitalize="characters"
          placeholder="ABC123"
          className="w-full rounded border-2 border-neutral-300 px-4 py-4 text-center font-mono text-3xl tracking-[0.3em] uppercase"
        />
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
        <button disabled={pending}
                className="mt-5 w-full rounded bg-neutral-900 px-4 py-3 text-white disabled:opacity-50">
          {pending ? 'Checking…' : 'Go'}
        </button>
      </form>

      <p className="mt-10 text-xs text-neutral-500">
        You do not need an account, an email, or a password.
      </p>
    </main>
  );
}
