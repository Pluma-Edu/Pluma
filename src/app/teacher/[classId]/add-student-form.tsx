'use client';

import { useActionState } from 'react';
import { addStudentAction } from '../actions';

export function AddStudentForm({ classId }: { classId: string }) {
  const [error, action, pending] = useActionState(addStudentAction, null);
  return (
    <form action={action} className="mt-6 flex flex-wrap items-end gap-3 text-sm">
      <input type="hidden" name="classId" value={classId} />
      <label className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-neutral-500">First name</span>
        <input name="firstName" required className="w-36 rounded border border-neutral-300 px-2 py-1.5" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-neutral-500">Last initial</span>
        <input name="lastInitial" maxLength={1} className="w-16 rounded border border-neutral-300 px-2 py-1.5" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-neutral-500">Grade</span>
        <input name="gradeLevel" type="number" min={0} max={16}
               className="w-20 rounded border border-neutral-300 px-2 py-1.5" />
      </label>
      <label className="flex min-w-64 flex-1 flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-neutral-500">
          Note (optional, stays in your gradebook)
        </span>
        <input name="note" placeholder="struggles with ser/estar, reads well, needs shorter passages"
               className="rounded border border-neutral-300 px-2 py-1.5" />
      </label>
      <button disabled={pending} className="rounded bg-neutral-900 px-3 py-1.5 text-white disabled:opacity-50">
        Add
      </button>
      {error && <span className="text-sm text-red-700">{error}</span>}
    </form>
  );
}
