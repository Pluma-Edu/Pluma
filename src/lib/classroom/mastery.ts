/**
 * The teacher grid.
 *
 * Every read goes through skill_state_current, which decays the stored evidence
 * to now(). Reading skill_state directly would show a student as "developing"
 * four months after their last attempt, which is the grid claiming something it
 * does not know.
 */
import { query } from '../db/client.ts';

export type Band = 'insufficient' | 'stale' | 'needs_help' | 'shaky' | 'developing' | 'secure';

export type GridCell = {
  roster_entry_id: string; skill_id: string; band: Band;
  mastery_estimate: string | null; attempts: number; last_seen: string | null;
};

export type GridSkill = { id: string; slug: string; name: string; sequence_index: number };
export type GridStudent = { id: string; display_name: string };

export type MasteryGrid = {
  skills: GridSkill[];
  students: GridStudent[];
  cells: Map<string, GridCell>;      // keyed `${rosterEntryId}:${skillId}`
  weakest: Array<{ skill: GridSkill; needingHelp: number; of: number }>;
};

export async function classMasteryGrid(classId: string): Promise<MasteryGrid> {
  // Only skills this class has actually been assigned. A grid full of columns
  // nobody has taught yet is noise, and it is derivable rather than a setting.
  const skills = await query<GridSkill>(
    `SELECT DISTINCT sk.id, sk.slug, sk.name, cs.sequence_index
       FROM assignment a
       JOIN item_set_item si ON si.item_set_id = a.default_item_set_id
       JOIN item i ON i.id = si.item_id
       JOIN skill sk ON sk.id = i.skill_id
       JOIN class c ON c.id = a.class_id
       JOIN course_skill cs ON cs.skill_id = sk.id AND cs.course_id = c.course_id
      WHERE a.class_id = $1
      ORDER BY cs.sequence_index`, [classId]);

  const students = await query<GridStudent>(
    `SELECT r.id, r.first_name || COALESCE(' ' || r.last_initial || '.', '') AS display_name
       FROM roster_entry r JOIN enrollment e ON e.roster_entry_id = r.id
      WHERE e.class_id = $1 AND e.removed_at IS NULL AND r.deleted_at IS NULL
      ORDER BY r.first_name, r.last_initial`, [classId]);

  const rows = await query<GridCell>(
    `SELECT s.roster_entry_id, s.skill_id, s.band, s.mastery_estimate::text,
            s.attempts, s.last_seen
       FROM skill_state_current s
       JOIN enrollment e ON e.roster_entry_id = s.roster_entry_id
      WHERE e.class_id = $1 AND e.removed_at IS NULL`, [classId]);

  const cells = new Map<string, GridCell>();
  for (const r of rows) cells.set(`${r.roster_entry_id}:${r.skill_id}`, r);

  // "Half my class is failing subjunctive" in two seconds.
  const weakest = skills.map((skill) => {
    let needingHelp = 0;
    let of = 0;
    for (const student of students) {
      const cell = cells.get(`${student.id}:${skill.id}`);
      if (!cell || cell.band === 'insufficient') continue;
      of++;
      if (cell.band === 'needs_help' || cell.band === 'shaky') needingHelp++;
    }
    return { skill, needingHelp, of };
  }).filter((w) => w.of > 0)
    .sort((a, b) => (b.needingHelp / b.of) - (a.needingHelp / a.of));

  return { skills, students, cells, weakest };
}

export type TrendPoint = { week: string; attempts: number; correct: number };

export async function studentTrend(rosterEntryId: string): Promise<TrendPoint[]> {
  return query<TrendPoint>(
    `SELECT to_char(date_trunc('week', created_at), 'YYYY-MM-DD') AS week,
            count(*)::int AS attempts,
            count(*) FILTER (WHERE correct)::int AS correct
       FROM attempt
      WHERE roster_entry_id = $1 AND correct IS NOT NULL
      GROUP BY 1 ORDER BY 1`, [rosterEntryId]);
}

export const BAND_LABEL: Record<Band, string> = {
  insufficient: 'Not enough yet',
  stale: 'Needs a fresh check',
  needs_help: 'Needs help',
  shaky: 'Shaky',
  developing: 'Developing',
  secure: 'Secure',
};

/** Print-safe: distinguishable in greyscale as well as colour. */
export const BAND_CLASS: Record<Band, string> = {
  insufficient: 'bg-neutral-100 text-neutral-400',
  stale: 'bg-neutral-200 text-neutral-700 italic',
  needs_help: 'bg-red-200 text-red-900',
  shaky: 'bg-orange-200 text-orange-900',
  developing: 'bg-yellow-100 text-yellow-900',
  secure: 'bg-green-200 text-green-900',
};
