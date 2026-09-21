/**
 * The student side.
 *
 * No account, no email, no password for anyone under 13 — the schema forbids
 * it. Access is a class code plus, optionally, a teacher-set PIN, and every
 * read is scoped to one assignment_target.
 *
 * Item payloads sent to a student never include the answer, the accepted
 * answers, or the rationale. Grading happens on the server. This is enforced by
 * the shape of StudentItem, not by remembering to omit fields.
 */
import { query, one, tx } from '../db/client.ts';
import { normaliseClassCode } from './codes.ts';
import { gradeResponse, feedbackFor, type GradableItem } from '../grading/index.ts';

export type StudentClass = {
  id: string; name: string; require_pin: boolean; course_name: string;
};

export async function findClassByCode(code: string): Promise<StudentClass | null> {
  const rows = await query<StudentClass>(
    `SELECT c.id, c.name, c.require_pin, co.name AS course_name
       FROM class c JOIN course co ON co.id = c.course_id
      WHERE c.class_code = $1 AND c.archived_at IS NULL
        AND (c.term_ends_on IS NULL OR c.term_ends_on >= current_date)`,
    [normaliseClassCode(code)]);
  return rows[0] ?? null;
}

export type PickerEntry = { id: string; display_name: string; has_pin: boolean };

/** First name and last initial only. Never a full name, never a grade. */
export async function rosterForPicker(classId: string): Promise<PickerEntry[]> {
  return query<PickerEntry>(
    `SELECT r.id,
            r.first_name || COALESCE(' ' || r.last_initial || '.', '') AS display_name,
            (r.access_pin_hash IS NOT NULL) AS has_pin
       FROM roster_entry r JOIN enrollment e ON e.roster_entry_id = r.id
      WHERE e.class_id = $1 AND e.removed_at IS NULL AND r.deleted_at IS NULL
      ORDER BY r.first_name, r.last_initial`, [classId]);
}

export async function pinHashFor(rosterEntryId: string): Promise<string | null> {
  const rows = await query<{ access_pin_hash: string | null }>(
    `SELECT access_pin_hash FROM roster_entry WHERE id = $1`, [rosterEntryId]);
  return rows[0]?.access_pin_hash ?? null;
}

export type OpenTarget = {
  target_id: string; assignment_id: string; title: string;
  due_at: string | null; submitted_at: string | null; item_count: string;
};

export async function targetsFor(rosterEntryId: string, classId: string): Promise<OpenTarget[]> {
  return query<OpenTarget>(
    `SELECT t.id AS target_id, a.id AS assignment_id, a.title, a.due_at, t.submitted_at,
            (SELECT count(*) FROM item_set_item i WHERE i.item_set_id = t.item_set_id)::text AS item_count
       FROM assignment_target t
       JOIN assignment a ON a.id = t.assignment_id
      WHERE t.roster_entry_id = $1 AND a.class_id = $2
      ORDER BY a.due_at NULLS LAST, a.assigned_at DESC`, [rosterEntryId, classId]);
}

/** Exactly what a student's browser is allowed to see. No answer field exists. */
export type StudentItem = {
  id: string;
  position: number;
  item_type: string;
  stem: string;
  choices: Array<{ key: string; text: string }>;
  blanks: Array<{ key: string }>;
};

export async function loadTargetItems(
  targetId: string, rosterEntryId: string,
): Promise<{ title: string; submitted: boolean; items: StudentItem[] }> {
  const head = await one<{ title: string; submitted_at: string | null; item_set_id: string }>(
    `SELECT a.title, t.submitted_at, t.item_set_id
       FROM assignment_target t JOIN assignment a ON a.id = t.assignment_id
      WHERE t.id = $1 AND t.roster_entry_id = $2`, [targetId, rosterEntryId]);

  const rows = await query<{
    id: string; position: number; item_type: string; stem: string; body: Record<string, unknown>;
  }>(
    `SELECT i.id, si.position, i.item_type, i.stem, i.body
       FROM item_set_item si JOIN item i ON i.id = si.item_id
      WHERE si.item_set_id = $1
      ORDER BY si.position`, [head.item_set_id]);

  const items: StudentItem[] = rows.map((r) => ({
    id: r.id,
    position: r.position,
    item_type: r.item_type,
    stem: r.stem,
    choices: ((r.body.choices ?? []) as Array<{ key: string; text: string }>)
      .map((c) => ({ key: c.key, text: c.text })),
    blanks: ((r.body.blanks ?? [{ key: '1' }]) as Array<{ key?: string }>)
      .map((b, i) => ({ key: b.key ?? String(i + 1) })),
  }));

  return { title: head.title, submitted: head.submitted_at !== null, items };
}

export type SubmitFeedback = {
  itemId: string;
  correct: boolean;
  note: string | null;
  rationale: string | null;   // null unless the assignment reveals it
  correctAnswer: string | null;
};

export type SubmitResult = {
  score: number; maxScore: number; feedback: SubmitFeedback[];
};

/**
 * Grade and record. One attempt row per part, so a two-blank cloze contributes
 * two pieces of evidence to the skill rather than one verdict — the trigger on
 * attempt does the rest.
 */
export async function submitTarget(
  targetId: string, rosterEntryId: string, responses: Record<string, unknown>,
): Promise<SubmitResult> {
  return tx(async (c) => {
    const { rows: [head] } = await c.query(
      `SELECT t.item_set_id, t.submitted_at, a.reveal_rationale, a.allow_retake, a.due_at
         FROM assignment_target t JOIN assignment a ON a.id = t.assignment_id
        WHERE t.id = $1 AND t.roster_entry_id = $2 FOR UPDATE`, [targetId, rosterEntryId]);
    if (!head) throw new Error('assignment not found for this student');
    if (head.submitted_at && !head.allow_retake) throw new Error('already submitted');

    const { rows: items } = await c.query(
      `SELECT i.id, i.item_type, i.answer, i.accepted_answers, i.answer_match_mode,
              i.body, i.rationale, i.skill_id, i.difficulty, si.points
         FROM item_set_item si JOIN item i ON i.id = si.item_id
        WHERE si.item_set_id = $1 ORDER BY si.position`, [head.item_set_id]);

    let score = 0;
    let maxScore = 0;
    const feedback: SubmitFeedback[] = [];

    for (const item of items) {
      const graded = gradeResponse(item as GradableItem, responses[item.id]);
      const points = Number(item.points ?? 1);
      maxScore += points;
      score += points * graded.score;

      for (const part of graded.parts) {
        await c.query(
          `INSERT INTO attempt (roster_entry_id, item_id, part_key, skill_id,
              difficulty_at_attempt, surface, assignment_target_id, response, correct, graded_by)
           VALUES ($1,$2,$3,$4,$5,'assignment',$6,$7::jsonb,$8,$9)`,
          [rosterEntryId, item.id, part.key, item.skill_id, item.difficulty, targetId,
            JSON.stringify(part.given), item.item_type === 'free_response' ? null : part.correct,
            item.item_type === 'free_response' ? 'ungraded' : 'auto']);
      }

      const reveal = head.reveal_rationale === 'after_submit'
        || (head.reveal_rationale === 'after_due' && head.due_at && new Date(head.due_at) < new Date());

      feedback.push({
        itemId: item.id,
        correct: graded.correct,
        note: graded.parts.map(feedbackFor).find(Boolean) ?? null,
        rationale: reveal ? item.rationale : null,
        correctAnswer: reveal ? correctAnswerText(item) : null,
      });
    }

    await c.query(
      `UPDATE assignment_target SET submitted_at = now(), score = $2, max_score = $3
        WHERE id = $1`, [targetId, score, maxScore]);

    return { score, maxScore, feedback };
  });
}

function correctAnswerText(item: {
  item_type: string; answer: unknown; body: Record<string, unknown>;
}): string {
  if (item.item_type === 'mcq') {
    const choices = (item.body.choices ?? []) as Array<{ key: string; text: string }>;
    const hit = choices.find((c) => c.key === item.answer);
    return hit ? `${hit.key}. ${hit.text}` : String(item.answer);
  }
  return Array.isArray(item.answer) ? item.answer.join(', ') : String(item.answer);
}
