'use client';

import { useActionState, useState } from 'react';
import { signIn, signUp } from './actions';

export function LoginForm({ next }: { next: string | null }) {
  const [mode, setMode] = useState<'in' | 'up'>(next ? 'up' : 'in');
  const action = mode === 'in' ? signIn : signUp;
  const [error, formAction, pending] = useActionState(action, null);

  return (
    <main className="mx-auto max-w-sm px-6 py-20">
      <h1 className="text-xl font-semibold tracking-tight">Pluma</h1>
      <p className="mt-1 text-sm text-neutral-600">
        {next
          ? 'Answer keys are free — they just need a teacher account.'
          : mode === 'in' ? 'Sign in to your classes.' : 'Create a free teacher account.'}
      </p>

      <form action={formAction} className="mt-8 space-y-4">
        {next && <input type="hidden" name="next" value={next} />}
        {mode === 'up' && (
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-neutral-500">Name</span>
            <input name="name" autoComplete="name"
                   className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
        )}
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-neutral-500">Email</span>
          <input name="email" type="email" required autoComplete="email"
                 className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-neutral-500">Password</span>
          <input name="password" type="password" required minLength={10}
                 autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
                 className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
        </label>

        {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

        <button disabled={pending}
                className="w-full rounded bg-neutral-900 px-3 py-2 text-white disabled:opacity-50">
          {pending ? 'Working…' : mode === 'in' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <button onClick={() => setMode(mode === 'in' ? 'up' : 'in')}
              className="mt-6 text-sm underline underline-offset-4">
        {mode === 'in' ? 'Create a teacher account' : 'I already have an account'}
      </button>

      <p className="mt-10 border-t border-neutral-200 pt-4 text-xs text-neutral-500">
        Students never need an account. They join with a class code.
      </p>
    </main>
  );
}
