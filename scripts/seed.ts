/** Idempotent seed of the taxonomy. Safe to re-run; slugs are the identity. */
import { query, tx, close } from '../src/lib/db/client.ts';
import {
  SKILL_TREE, COURSE_SKILLS, LEXEMES, SEED_VERSION, LEXICON_VERSION,
  type SeedSkill,
} from '../src/lib/taxonomy/seed-spanish.ts';

/** ltree labels allow only alphanumerics and underscores, so slugs are mapped. */
const label = (slug: string) => slug.replace(/-/g, '_');

const COURSES = [
  { slug: 'spanish-1', name: 'Spanish 1', seq: 1, gradeLow: 7, gradeHigh: 12 },
  { slug: 'spanish-2', name: 'Spanish 2', seq: 2, gradeLow: 8, gradeHigh: 14 },
  { slug: 'spanish-3', name: 'Spanish 3', seq: 3, gradeLow: 9, gradeHigh: 16 },
];

async function main() {
  await tx(async (c) => {
    const { rows: [subject] } = await c.query(
      `INSERT INTO subject (slug, name, content_locale, ui_locale)
       VALUES ('spanish','Spanish','es','en')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`);

    for (const co of COURSES) {
      await c.query(
        `INSERT INTO course (subject_id, slug, name, sequence_index, typical_grade_low, typical_grade_high)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (subject_id, slug) DO UPDATE SET name = EXCLUDED.name`,
        [subject.id, co.slug, co.name, co.seq, co.gradeLow, co.gradeHigh]);
    }

    // skills, depth-first, so a parent always exists before its children
    const walk = async (nodes: SeedSkill[], parentId: string | null, prefix: string, depth: number) => {
      for (const n of nodes) {
        const path = prefix ? `${prefix}.${label(n.slug)}` : label(n.slug);
        const isLeaf = !n.children || n.children.length === 0;
        const { rows: [row] } = await c.query(
          `INSERT INTO skill (subject_id, parent_skill_id, slug, path, depth, name, description, is_leaf, seed_version)
           VALUES ($1,$2,$3,$4::ltree,$5,$6,$7,$8,$9)
           ON CONFLICT (subject_id, slug) DO UPDATE SET
             parent_skill_id = EXCLUDED.parent_skill_id, path = EXCLUDED.path,
             depth = EXCLUDED.depth, name = EXCLUDED.name, is_leaf = EXCLUDED.is_leaf,
             seed_version = EXCLUDED.seed_version
           RETURNING id`,
          [subject.id, parentId, n.slug, path, depth, n.name, n.description ?? null, isLeaf, SEED_VERSION]);
        if (n.children) await walk(n.children, row.id, path, depth + 1);
      }
    };
    await walk(SKILL_TREE, null, '', 0);

    // course_skill, numbered in the order they appear per course
    const seqByCourse = new Map<string, number>();
    for (const cs of COURSE_SKILLS) {
      const seq = (seqByCourse.get(cs.course) ?? 0) + 1;
      seqByCourse.set(cs.course, seq);
      await c.query(
        `INSERT INTO course_skill (course_id, skill_id, emphasis, sequence_index, unit_label)
         SELECT co.id, sk.id, $3, $4, $5
           FROM course co, skill sk
          WHERE co.slug = $1 AND sk.slug = $2
         ON CONFLICT (course_id, skill_id) DO UPDATE SET
           emphasis = EXCLUDED.emphasis, sequence_index = EXCLUDED.sequence_index,
           unit_label = EXCLUDED.unit_label`,
        [cs.course, cs.skill, cs.emphasis, seq, cs.unit ?? null]);
    }

    const { rows: [lex] } = await c.query(
      `INSERT INTO lexicon (subject_id, version, notes)
       VALUES ($1,$2,'seeded from seed-spanish.ts')
       ON CONFLICT (subject_id, version) DO UPDATE SET notes = EXCLUDED.notes
       RETURNING id`, [subject.id, LEXICON_VERSION]);

    for (const l of LEXEMES) {
      await c.query(
        `INSERT INTO lexeme (lexicon_id, lemma, pos, gloss_en, gender, introduced_at_course, tags)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (lexicon_id, lemma, pos) DO UPDATE SET
           gloss_en = EXCLUDED.gloss_en, gender = EXCLUDED.gender,
           introduced_at_course = EXCLUDED.introduced_at_course, tags = EXCLUDED.tags`,
        [lex.id, l.lemma, l.pos, l.gloss, l.gender ?? null, l.course, l.tags ?? []]);
    }
  });

  const [counts] = await query<{ [k: string]: string }>(`
    SELECT (SELECT count(*) FROM course)                      AS courses,
           (SELECT count(*) FROM skill)                       AS skills,
           (SELECT count(*) FROM skill WHERE is_leaf)         AS leaves,
           (SELECT count(*) FROM course_skill)                AS course_skills,
           (SELECT count(*) FROM lexeme)                      AS lexemes`);
  console.log('seeded:', counts);
  await close();
}

main().catch((e) => { console.error(e); process.exit(1); });
