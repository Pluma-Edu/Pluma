import { query, one, tx } from '../db/client.ts';
import { generateClassCode } from './codes.ts';
import { extractChips, type Chip } from '../roster/note-extractor.ts';

export type ClassRow = {
  id: string; name: string; class_code: string; course_slug: string;
  course_name: string; student_count: string; require_pin: boolean;
};

export async function listClasses(teacherId: string): Promise<ClassRow[]> {
  return query<ClassRow>(
    `SELECT c.id, c.name, c.class_code, c.require_pin, co.slug AS course_slug, co.name AS course_name,
            (SELECT count(*) FROM enrollment e
              WHERE e.class_id = c.id AND e.removed_at IS NULL)::text AS student_count
       FROM class c JOIN course co ON co.id = c.course_id
      WHERE c.teacher_account_id = $1 AND c.archived_at IS NULL
      ORDER BY c.created_at DESC`, [teacherId]);
}

export async function createClass(
  teacherId: string, name: string, courseSlug: string,
): Promise<string> {
  // Retry on the astronomically unlikely code collision rather than trusting luck.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateClassCode();
    try {
      const row = await one<{ id: string }>(
        `INSERT INTO class (teacher_account_id, course_id, name, class_code, term_ends_on)
         SELECT $1, co.id, $2, $3, (now() + interval '10 months')::date
           FROM course co WHERE co.slug = $4
         RETURNING id`, [teacherId, name, code, courseSlug]);
      return row.id;
    } catch (e) {
      if (!String((e as Error).message).includes('class_class_code_key')) throw e;
    }
  }
  throw new Error('could not allocate a unique class code');
}

export type RosterRow = {
  id: string; first_name: string; last_initial: string | null;
  grade_level: number | null; age_band: 'under_13' | '13_plus';
  context_note: string | null; has_pin: boolean;
};

export async function listRoster(classId: string, teacherId: string): Promise<RosterRow[]> {
  return query<RosterRow>(
    `SELECT r.id, r.first_name, r.last_initial, r.grade_level, r.age_band, r.context_note,
            (r.access_pin_hash IS NOT NULL) AS has_pin
       FROM roster_entry r
       JOIN enrollment e ON e.roster_entry_id = r.id
       JOIN class c ON c.id = e.class_id
      WHERE e.class_id = $1 AND c.teacher_account_id = $2
        AND r.deleted_at IS NULL AND e.removed_at IS NULL
      ORDER BY r.first_name, r.last_initial`, [classId, teacherId]);
}

/**
 * Add a student. The note is stored as written and never sent anywhere; what
 * the generator may see is the chips, and only once the teacher confirms them.
 */
export async function addRosterEntry(args: {
  teacherId: string; classId: string; firstName: string; lastInitial: string | null;
  gradeLevel: number | null; ageBand: 'under_13' | '13_plus'; note: string | null;
}): Promise<{ rosterEntryId: string; chips: Chip[]; suppressed: string[] }> {
  const extraction = args.note ? extractChips(args.note) : { chips: [], suppressed: [] };

  const rosterEntryId = await tx(async (c) => {
    const { rows: [owned] } = await c.query(
      `SELECT 1 FROM class WHERE id = $1 AND teacher_account_id = $2`,
      [args.classId, args.teacherId]);
    if (!owned) throw new Error('class not found for this teacher');

    const { rows: [r] } = await c.query(
      `INSERT INTO roster_entry
         (teacher_account_id, first_name, last_initial, grade_level, age_band, context_note, note_updated_at)
       VALUES ($1,$2,$3,$4,$5,$6, CASE WHEN $6::text IS NULL THEN NULL ELSE now() END)
       RETURNING id`,
      [args.teacherId, args.firstName.trim(), args.lastInitial?.trim() || null,
        args.gradeLevel, args.ageBand, args.note?.trim() || null]);

    await c.query(
      `INSERT INTO enrollment (class_id, roster_entry_id) VALUES ($1,$2)`,
      [args.classId, r.id]);

    // Proposed, not confirmed: nothing here reaches the generator until the
    // teacher says so.
    for (const chip of extraction.chips) {
      await c.query(
        `INSERT INTO learner_param (roster_entry_id, key, value, source, confirmed_by_teacher)
         VALUES ($1,$2,$3,'note_extraction',false)
         ON CONFLICT (roster_entry_id, key, value) DO NOTHING`,
        [r.id, chip.key, chip.value]);
    }
    return r.id as string;
  });

  return { rosterEntryId, chips: extraction.chips, suppressed: extraction.suppressed };
}

export type LearnerParamRow = {
  id: string; key: string; value: string; source: string; confirmed_by_teacher: boolean;
};

export async function listLearnerParams(rosterEntryId: string): Promise<LearnerParamRow[]> {
  return query<LearnerParamRow>(
    `SELECT id, key, value, source, confirmed_by_teacher
       FROM learner_param WHERE roster_entry_id = $1 ORDER BY key, value`, [rosterEntryId]);
}

export async function setChipConfirmed(paramId: string, confirmed: boolean): Promise<void> {
  await query(`UPDATE learner_param SET confirmed_by_teacher = $2 WHERE id = $1`,
    [paramId, confirmed]);
}

export async function setRosterPin(rosterEntryId: string, pinHash: string | null): Promise<void> {
  await query(`UPDATE roster_entry SET access_pin_hash = $2 WHERE id = $1`, [rosterEntryId, pinHash]);
}
