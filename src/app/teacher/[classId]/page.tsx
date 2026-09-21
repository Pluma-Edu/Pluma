import Link from 'next/link';
import { requireTeacher, requireOwnedClass } from '@/lib/auth/require';
import { listRoster, listLearnerParams } from '@/lib/classroom/teacher';
import { listAssignments } from '@/lib/classroom/assignment';
import { classMasteryGrid, BAND_LABEL, BAND_CLASS, type Band } from '@/lib/classroom/mastery';
import { AddStudentForm } from './add-student-form';
import { confirmChipAction } from '../actions';

export const dynamic = 'force-dynamic';

const CHIP_LABEL: Record<string, string> = {
  focus_skill: 'focus on', avoid_skill: 'already solid', difficulty_offset: 'difficulty',
  passage_length: 'passage length', reading_level: 'reading level', register: 'register',
  item_type_pref: 'item type', max_items: 'max items', render_accommodation: 'print',
};

export default async function ClassPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  const teacherId = await requireTeacher();
  const klass = await requireOwnedClass(teacherId, classId);

  const [roster, assignments, grid] = await Promise.all([
    listRoster(classId, teacherId),
    listAssignments(classId),
    classMasteryGrid(classId),
  ]);

  const chipsByStudent = new Map(
    await Promise.all(roster.map(async (r) =>
      [r.id, await listLearnerParams(r.id)] as const)),
  );

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <Link href="/teacher" className="text-sm text-neutral-500 underline underline-offset-4">
        ← all classes
      </Link>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{klass.name}</h1>
          <p className="text-sm text-neutral-500">{klass.course_name}</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-neutral-500">Class code</p>
          <code className="font-mono text-2xl tracking-[0.3em]">{klass.class_code}</code>
        </div>
      </div>

      {/* ------------------------------------------------------------ grid */}
      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Where the class is
        </h2>

        {grid.skills.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-600">
            Nothing assigned yet. The grid fills in as work comes back.
          </p>
        ) : (
          <>
            {grid.weakest[0] && grid.weakest[0].needingHelp > 0 && (
              <p className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
                <strong>{grid.weakest[0].needingHelp} of {grid.weakest[0].of}</strong> students need
                help with <strong>{grid.weakest[0].skill.name}</strong>.
              </p>
            )}
            <div className="mt-4 overflow-x-auto">
              <table className="border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="sticky left-0 bg-white p-2 text-left font-medium">Student</th>
                    {grid.skills.map((s) => (
                      <th key={s.id} className="w-28 p-2 text-left align-bottom font-medium">
                        <span className="block max-w-28 text-xs leading-tight">{s.name}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grid.students.map((student) => (
                    <tr key={student.id} className="border-t border-neutral-100">
                      <td className="sticky left-0 bg-white p-2 whitespace-nowrap">{student.display_name}</td>
                      {grid.skills.map((skill) => {
                        const cell = grid.cells.get(`${student.id}:${skill.id}`);
                        const band = (cell?.band ?? 'insufficient') as Band;
                        return (
                          <td key={skill.id} className="w-28 p-1">
                            <span
                              title={`${BAND_LABEL[band]}${cell ? ` · ${cell.attempts} attempts` : ''}`}
                              className={`block rounded px-2 py-1 text-center text-xs ${BAND_CLASS[band]}`}>
                              {band === 'insufficient' ? '—'
                                : band === 'stale' ? '?'
                                : `${Math.round(Number(cell!.mastery_estimate) * 100)}`}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 flex flex-wrap gap-3 text-xs text-neutral-500">
              {(['secure', 'developing', 'shaky', 'needs_help', 'stale', 'insufficient'] as Band[]).map((b) => (
                <span key={b} className="flex items-center gap-1">
                  <span className={`inline-block h-3 w-4 rounded ${BAND_CLASS[b]}`} />{BAND_LABEL[b]}
                </span>
              ))}
            </p>
            <p className="mt-2 text-xs text-neutral-500">
              A dash means not enough evidence to say anything. A question mark means the
              evidence is old enough that it is worth re-checking. Neither is a score.
            </p>
          </>
        )}
      </section>

      {/* ------------------------------------------------------ assignments */}
      <section className="mt-12">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Assignments</h2>
          <Link href={`/teacher/${classId}/assign`}
                className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white">
            New assignment
          </Link>
        </div>
        <ul className="mt-3 divide-y divide-neutral-200 border-y border-neutral-200">
          {assignments.map((a) => (
            <li key={a.id} className="flex items-center justify-between py-3 text-sm">
              <div>
                <span className="font-medium">{a.title}</span>
                {a.due_at && (
                  <span className="ml-2 text-neutral-500">
                    due {new Date(a.due_at).toLocaleDateString()}
                  </span>
                )}
              </div>
              <span className="text-neutral-500">
                {a.submitted}/{a.targets} in{a.avg_score ? ` · avg ${a.avg_score}%` : ''}
              </span>
            </li>
          ))}
          {assignments.length === 0 && (
            <li className="py-3 text-sm text-neutral-500">Nothing assigned yet.</li>
          )}
        </ul>
      </section>

      {/* ----------------------------------------------------------- roster */}
      <section className="mt-12">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Roster</h2>

        <ul className="mt-3 divide-y divide-neutral-200 border-y border-neutral-200">
          {roster.map((r) => {
            const chips = chipsByStudent.get(r.id) ?? [];
            return (
              <li key={r.id} className="py-3">
                <div className="flex items-baseline gap-3">
                  <span className="font-medium">
                    {r.first_name}{r.last_initial ? ` ${r.last_initial}.` : ''}
                  </span>
                  <span className="text-xs text-neutral-500">
                    {r.grade_level ? `grade ${r.grade_level} · ` : ''}
                    {r.age_band === 'under_13' ? 'no account (under 13)' : 'may hold an account'}
                  </span>
                </div>

                {r.context_note && (
                  <p className="mt-1 text-sm italic text-neutral-600">“{r.context_note}”</p>
                )}

                {chips.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-neutral-500">Read as:</span>
                    {chips.map((chip) => (
                      <form key={chip.id} action={confirmChipAction}>
                        <input type="hidden" name="paramId" value={chip.id} />
                        <input type="hidden" name="confirmed" value={chip.confirmed_by_teacher ? '0' : '1'} />
                        <input type="hidden" name="path" value={`/teacher/${classId}`} />
                        <button
                          title={chip.confirmed_by_teacher
                            ? 'Confirmed — this reaches the generator. Click to withdraw.'
                            : 'Proposed — click to confirm before it affects anything.'}
                          className={`rounded-full border px-2 py-0.5 text-xs ${
                            chip.confirmed_by_teacher
                              ? 'border-neutral-900 bg-neutral-900 text-white'
                              : 'border-dashed border-neutral-400 text-neutral-600'}`}>
                          {CHIP_LABEL[chip.key] ?? chip.key}: {chip.value}
                          {chip.confirmed_by_teacher ? ' ✓' : ''}
                        </button>
                      </form>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
          {roster.length === 0 && (
            <li className="py-3 text-sm text-neutral-500">No students yet.</li>
          )}
        </ul>

        <AddStudentForm classId={classId} />

        <p className="mt-6 max-w-2xl text-xs text-neutral-500">
          The note stays here. It is never sent to a model, scrubbed or otherwise. What can reach
          generation is the confirmed chips above, whose values come from a fixed list — which is
          why a student&rsquo;s name has nowhere to travel. Clinical, immigration and family terms
          are never turned into chips at all.
        </p>
      </section>
    </main>
  );
}
