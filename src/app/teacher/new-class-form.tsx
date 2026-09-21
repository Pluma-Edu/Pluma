'use client';

import { useActionState } from 'react';
import { createClassAction } from './actions';

export function NewClassForm() {
  const [error, action, pending] = useActionState(createClassAction, null);
  return (
    <form action={action} className="mt-8 flex flex-wrap items-end gap-3 text-sm">
      <label className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-neutral-500">New class</span>
        <input name="name" placeholder="Period 3 Spanish 2" required
               className="w-56 rounded border border-neutral-300 px-2 py-1.5" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-neutral-500">Course</span>
        <select name="course" defaultValue="spanish-2"
                className="rounded border border-neutral-300 px-2 py-1.5">
          <option value="spanish-1">Spanish 1</option>
          <option value="spanish-2">Spanish 2</option>
          <option value="spanish-3">Spanish 3</option>
        </select>
      </label>
      <button disabled={pending} className="rounded bg-neutral-900 px-3 py-1.5 text-white disabled:opacity-50">
        Create
      </button>
      {error && <span className="text-sm text-red-700">{error}</span>}
    </form>
  );
}
