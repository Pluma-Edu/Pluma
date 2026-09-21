import { query } from '../db/client.ts';

export type LibraryCourse = {
  subject_slug: string; subject_name: string;
  course_slug: string; course_name: string;
  grade_low: number | null; grade_high: number | null;
  worksheet_count: string;
};

export async function listCourses(): Promise<LibraryCourse[]> {
  return query<LibraryCourse>(
    `SELECT su.slug AS subject_slug, su.name AS subject_name,
            co.slug AS course_slug, co.name AS course_name,
            co.typical_grade_low AS grade_low, co.typical_grade_high AS grade_high,
            count(w.*)::text AS worksheet_count
       FROM course co
       JOIN subject su ON su.id = co.subject_id
       LEFT JOIN worksheet w ON w.course_id = co.id AND w.published_at IS NOT NULL
      GROUP BY su.slug, su.name, co.slug, co.name, co.sequence_index, co.typical_grade_low, co.typical_grade_high
     HAVING count(w.*) > 0
      ORDER BY co.sequence_index`);
}

export type LibrarySkill = {
  skill_slug: string; skill_name: string; unit_label: string | null;
  worksheet_count: string;
};

export async function listSkills(subject: string, course: string): Promise<LibrarySkill[]> {
  return query<LibrarySkill>(
    `SELECT sk.slug AS skill_slug, sk.name AS skill_name, cs.unit_label,
            count(w.*)::text AS worksheet_count
       FROM worksheet w
       JOIN skill sk ON sk.id = w.primary_skill_id
       JOIN course co ON co.id = w.course_id
       JOIN subject su ON su.id = co.subject_id
       LEFT JOIN course_skill cs ON cs.skill_id = sk.id AND cs.course_id = co.id
      WHERE su.slug = $1 AND co.slug = $2 AND w.published_at IS NOT NULL
      GROUP BY sk.slug, sk.name, cs.unit_label, cs.sequence_index
      ORDER BY cs.sequence_index NULLS LAST`, [subject, course]);
}

export type LibraryWorksheet = {
  id: string; slug: string; title: string; meta_description: string | null;
  pdf_key: string | null; grade_band_low: number | null; grade_band_high: number | null;
  skill_slug: string; skill_name: string; course_slug: string; course_name: string;
  subject_slug: string; subject_name: string; item_set_id: string; item_count: string;
  unit_label: string | null; skill_code: string | null; page_count: number | null;
  item_type: string | null; same_skill?: boolean;
};

const WORKSHEET_COLUMNS = `
  w.id, w.slug, w.title, w.meta_description, w.pdf_key,
  w.grade_band_low, w.grade_band_high, w.item_set_id,
  sk.slug AS skill_slug, sk.name AS skill_name,
  co.slug AS course_slug, co.name AS course_name,
  su.slug AS subject_slug, su.name AS subject_name,
  w.page_count, w.skill_code,
  (SELECT cs.unit_label FROM course_skill cs
    WHERE cs.skill_id = w.primary_skill_id AND cs.course_id = w.course_id) AS unit_label,
  (SELECT i.item_type FROM item_set_item si JOIN item i ON i.id = si.item_id
    WHERE si.item_set_id = w.item_set_id ORDER BY si.position LIMIT 1) AS item_type,
  (SELECT count(*) FROM item_set_item si WHERE si.item_set_id = w.item_set_id)::text AS item_count`;

export async function listWorksheets(
  subject: string, course: string, skill: string,
): Promise<LibraryWorksheet[]> {
  return query<LibraryWorksheet>(
    `SELECT ${WORKSHEET_COLUMNS}
       FROM worksheet w
       JOIN skill sk ON sk.id = w.primary_skill_id
       JOIN course co ON co.id = w.course_id
       JOIN subject su ON su.id = co.subject_id
      WHERE su.slug = $1 AND co.slug = $2 AND sk.slug = $3 AND w.published_at IS NOT NULL
      ORDER BY w.slug`, [subject, course, skill]);
}

export async function getWorksheet(
  subject: string, course: string, skill: string, slug: string,
): Promise<LibraryWorksheet | null> {
  const rows = await query<LibraryWorksheet>(
    `SELECT ${WORKSHEET_COLUMNS}
       FROM worksheet w
       JOIN skill sk ON sk.id = w.primary_skill_id
       JOIN course co ON co.id = w.course_id
       JOIN subject su ON su.id = co.subject_id
      WHERE su.slug = $1 AND co.slug = $2 AND sk.slug = $3 AND w.slug = $4
        AND w.published_at IS NOT NULL`, [subject, course, skill, slug]);
  return rows[0] ?? null;
}

/** The preview. Real text on the page, not just a link to a PDF. */
export type PreviewItem = {
  position: number; item_type: string; stem: string;
  choices: Array<{ key: string; text: string }>;
  instructions: string | null;
};

export async function previewItems(itemSetId: string, limit = 14): Promise<PreviewItem[]> {
  const rows = await query<{
    position: number; item_type: string; stem: string;
    body: Record<string, unknown>; render_meta: Record<string, unknown>;
  }>(
    `SELECT si.position, i.item_type, i.stem, i.body, i.render_meta
       FROM item_set_item si JOIN item i ON i.id = si.item_id
      WHERE si.item_set_id = $1 ORDER BY si.position LIMIT $2`, [itemSetId, limit]);
  // No answers. A preview is a preview even when nobody is logged in.
  return rows.map((r) => ({
    position: r.position, item_type: r.item_type, stem: r.stem,
    instructions: (r.render_meta?.tense_label as string | undefined) ?? null,
    choices: ((r.body.choices ?? []) as Array<{ key: string; text: string }>)
      .map((c) => ({ key: c.key, text: c.text })),
  }));
}

/**
 * Two from the same skill, two from elsewhere in the course.
 *
 * Ordering same-skill first and taking the top N gives four cards that all say
 * "same skill", which tells a teacher nothing about where they are. The split
 * is what makes the section answer its own heading.
 */
export async function relatedWorksheets(worksheetId: string, limit = 4): Promise<LibraryWorksheet[]> {
  const half = Math.max(1, Math.floor(limit / 2));
  return query<LibraryWorksheet>(
    `WITH self AS (SELECT course_id, primary_skill_id FROM worksheet WHERE id = $1),
     candidates AS (
       SELECT ${WORKSHEET_COLUMNS},
              (w.primary_skill_id = self.primary_skill_id) AS same_skill,
              row_number() OVER (
                PARTITION BY (w.primary_skill_id = self.primary_skill_id)
                ORDER BY w.slug) AS rn
         FROM worksheet w
         JOIN skill sk ON sk.id = w.primary_skill_id
         JOIN course co ON co.id = w.course_id
         JOIN subject su ON su.id = co.subject_id
         CROSS JOIN self
        WHERE w.published_at IS NOT NULL AND w.id <> $1
          AND w.course_id = self.course_id
     )
     SELECT * FROM candidates WHERE rn <= $2
     ORDER BY same_skill DESC, rn
     LIMIT $3`, [worksheetId, half, limit]);
}

export async function allWorksheetPaths(): Promise<Array<{
  subject: string; course: string; skill: string; slug: string; updated: string;
}>> {
  return query(
    `SELECT su.slug AS subject, co.slug AS course, sk.slug AS skill, w.slug,
            to_char(w.published_at, 'YYYY-MM-DD') AS updated
       FROM worksheet w
       JOIN skill sk ON sk.id = w.primary_skill_id
       JOIN course co ON co.id = w.course_id
       JOIN subject su ON su.id = co.subject_id
      WHERE w.published_at IS NOT NULL
      ORDER BY su.slug, co.slug, sk.slug, w.slug`);
}

export async function worksheetIds(worksheetId: string): Promise<{ course_id: string; skill_id: string } | null> {
  const rows = await query<{ course_id: string; skill_id: string }>(
    `SELECT course_id, primary_skill_id AS skill_id FROM worksheet WHERE id = $1`, [worksheetId]);
  return rows[0] ?? null;
}
