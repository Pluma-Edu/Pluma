'use client';

import { useActionState } from 'react';
import { createAssignmentAction } from '../../actions';

export function AssignForm({
  classId, skills,
}: { classId: string; skills: Array<{ slug: string; name: string; unit_label: string | null }> }) {
  const [error, action, pending] = useActionState(createAssignmentAction, null);

  return (
    <form action={action} className="mt-8 space-y-5 text-sm">
      <input type="hidden" name="classId" value={classId} />

      <label className="block">
        <span className="text-xs uppercase tracking-wide text-neutral-500">Title</span>
        <input name="title" defaultValue="Practice" required
               className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
      </label>

      <label className="block">
        <span className="text-xs uppercase tracking-wide text-neutral-500">Skill</span>
        <select name="skill" required className="mt-1 w-full rounded border border-neutral-300 px-3 py-2">
          {skills.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.unit_label ? `${s.unit_label} — ` : ''}{s.name}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-neutral-500">Type</span>
          <select name="itemType" defaultValue="cloze" className="rounded border border-neutral-300 px-2 py-2">
            <option value="cloze">Fill in the blank</option>
            <option value="mcq">Multiple choice</option>
            <option value="short_answer">Short answer</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-neutral-500">Difficulty</span>
          <select name="difficulty" defaultValue="2" className="rounded border border-neutral-300 px-2 py-2">
            {[1, 2, 3, 4, 5].map((d) => <option key={d}>{d}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-neutral-500">Questions</span>
          <input name="count" type="number" defaultValue={10} min={1} max={40}
                 className="w-24 rounded border border-neutral-300 px-2 py-2" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-neutral-500">Due</span>
          <input name="dueAt" type="date" className="rounded border border-neutral-300 px-2 py-2" />
        </label>
      </div>

      {error && <p className="rounded bg-red-50 px-3 py-2 text-red-800">{error}</p>}

      <button disabled={pending}
              className="rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-50">
        {pending ? 'Building…' : 'Assign'}
      </button>
    </form>
  );
}
