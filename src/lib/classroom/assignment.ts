/**
 * Assignment creation, including differentiation.
 *
 * Differentiation here is a different DRAW from the shared bank — difficulty,
 * count, item type — never different generated text. Nothing we generate is
 * student-specific, which is why a class of thirty costs the same as a class of
 * one and why no student attribute ever reaches a prompt.
 */
import { query, one, tx } from '../db/client.ts';
import { ensurePool, topUpPool, drawFromPool } from '../generation/pool.ts';
import { generationHash, type GenerationParams, type Difficulty, type ItemType } from '../generation/params.ts';
import { templateSupports } from '../generation/template/index.ts';

const CEILING: Record<string, 1 | 2 | 3> = { 'spanish-1': 1, 'spanish-2': 2, 'spanish-3': 3 };

function buildParams(
  courseSlug: string, skill: string, itemType: ItemType, difficulty: Difficulty,
): GenerationParams {
  return {
    subject: 'spanish', course: courseSlug as GenerationParams['course'], skill,
    item_type: itemType, difficulty, content_locale: 'es', ui_locale: 'en',
    constraints: {
      lexicon_version: 1, lexicon_ceiling: CEILING[courseSlug] ?? 2,
      register: 'neutral', stem_max_chars: 160,
    },
    template: { name: 'conjugation-drill', version: 1 },
    model_id: null,
  };
}

const clampDifficulty = (d: number): Difficulty =>
  Math.min(5, Math.max(1, Math.round(d))) as Difficulty;

/** What a student's confirmed chips do to the draw. Nothing else reads them. */
type Personalisation = { difficulty: Difficulty; count: number; itemType: ItemType };

function applyChips(
  base: Personalisation, chips: Array<{ key: string; value: string }>,
): Personalisation {
  let { difficulty, count, itemType } = base;
  for (const c of chips) {
    if (c.key === 'difficulty_offset') difficulty = clampDifficulty(difficulty + Number(c.value));
    if (c.key === 'max_items') count = Math.min(count, Number(c.value));
    if (c.key === 'item_type_pref') itemType = c.value as ItemType;
  }
  return { difficulty, count, itemType };
}

async function buildItemSet(
  courseId: string, courseSlug: string, skill: string, p: Personalisation,
  teacherId: string, title: string,
): Promise<{ itemSetId: string; size: number } | null> {
  const params = buildParams(courseSlug, skill, p.itemType, p.difficulty);
  const hash = generationHash(params);

  if (templateSupports(skill)) {
    await ensurePool(params);
    await topUpPool(params, Math.max(24, p.count));
  }
  const items = await drawFromPool(hash, p.count);
  if (items.length === 0) return null;

  const itemSetId = await tx(async (c) => {
    const { rows: [set] } = await c.query(
      `INSERT INTO item_set (kind, course_id, title, selection_params, created_by_account_id)
       VALUES ('assignment', $1, $2, $3::jsonb, $4) RETURNING id`,
      [courseId, title, JSON.stringify({ ...params, drawn: items.length }), teacherId]);
    let position = 1;
    for (const item of items) {
      // The insert trigger rejects anything not servable, so an unvalidated
      // item cannot reach a student even if this code were wrong.
      await c.query(
        `INSERT INTO item_set_item (item_set_id, position, item_id) VALUES ($1,$2,$3)`,
        [set.id, position++, item.id]);
    }
    return set.id as string;
  });

  return { itemSetId, size: items.length };
}

export type CreateAssignmentResult = {
  assignmentId: string;
  targets: Array<{ rosterEntryId: string; name: string; difficulty: number; count: number; itemType: string; personalised: boolean }>;
};

export async function createAssignment(args: {
  teacherId: string; classId: string; title: string; skill: string;
  itemType: ItemType; difficulty: Difficulty; count: number; dueAt: string | null;
}): Promise<CreateAssignmentResult> {
  const klass = await one<{ course_id: string; course_slug: string }>(
    `SELECT c.course_id, co.slug AS course_slug
       FROM class c JOIN course co ON co.id = c.course_id
      WHERE c.id = $1 AND c.teacher_account_id = $2`, [args.classId, args.teacherId]);

  const base: Personalisation = {
    difficulty: args.difficulty, count: args.count, itemType: args.itemType,
  };

  const classSet = await buildItemSet(
    klass.course_id, klass.course_slug, args.skill, base, args.teacherId, args.title);
  if (!classSet) {
    throw new Error(`no servable items for ${args.skill} at difficulty ${args.difficulty}`);
  }

  const students = await query<{ id: string; first_name: string; last_initial: string | null }>(
    `SELECT r.id, r.first_name, r.last_initial
       FROM roster_entry r JOIN enrollment e ON e.roster_entry_id = r.id
      WHERE e.class_id = $1 AND e.removed_at IS NULL AND r.deleted_at IS NULL
      ORDER BY r.first_name`, [args.classId]);

  const assignmentId = await one<{ id: string }>(
    `INSERT INTO assignment (class_id, created_by_account_id, title, default_item_set_id, assigned_at, due_at)
     VALUES ($1,$2,$3,$4, now(), $5) RETURNING id`,
    [args.classId, args.teacherId, args.title, classSet.itemSetId, args.dueAt]);

  const targets: CreateAssignmentResult['targets'] = [];
  for (const s of students) {
    const chips = await query<{ key: string; value: string }>(
      `SELECT key, value FROM generation_safe_param WHERE roster_entry_id = $1`, [s.id]);
    const personal = applyChips(base, chips);
    const differs = personal.difficulty !== base.difficulty
      || personal.count !== base.count || personal.itemType !== base.itemType;

    let itemSetId = classSet.itemSetId;
    if (differs) {
      const own = await buildItemSet(
        klass.course_id, klass.course_slug, args.skill, personal, args.teacherId,
        `${args.title} (${s.first_name})`);
      // If the personalised draw cannot be filled, fall back to the class set
      // rather than giving this student nothing.
      if (own) itemSetId = own.itemSetId;
    }

    await query(
      `INSERT INTO assignment_target (assignment_id, roster_entry_id, item_set_id)
       VALUES ($1,$2,$3) ON CONFLICT (assignment_id, roster_entry_id) DO NOTHING`,
      [assignmentId.id, s.id, itemSetId]);

    targets.push({
      rosterEntryId: s.id,
      name: `${s.first_name}${s.last_initial ? ` ${s.last_initial}.` : ''}`,
      difficulty: personal.difficulty, count: personal.count,
      itemType: personal.itemType, personalised: differs && itemSetId !== classSet.itemSetId,
    });
  }

  return { assignmentId: assignmentId.id, targets };
}

export type AssignmentSummary = {
  id: string; title: string; due_at: string | null; assigned_at: string | null;
  targets: string; submitted: string; avg_score: string | null;
};

export async function listAssignments(classId: string): Promise<AssignmentSummary[]> {
  return query<AssignmentSummary>(
    `SELECT a.id, a.title, a.due_at, a.assigned_at,
            count(t.*)::text AS targets,
            count(t.submitted_at)::text AS submitted,
            to_char(avg(CASE WHEN t.max_score > 0 THEN 100 * t.score / t.max_score END), 'FM990.0') AS avg_score
       FROM assignment a LEFT JOIN assignment_target t ON t.assignment_id = a.id
      WHERE a.class_id = $1
      GROUP BY a.id
      ORDER BY a.assigned_at DESC NULLS LAST`, [classId]);
}
