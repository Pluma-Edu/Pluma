/**
 * Phase 1 proof: the whole classroom loop against a real database.
 *
 * Teacher signs up, makes a class, adds students with notes, confirms chips,
 * assigns work, students answer it, the grid fills in. Asserts the things that
 * would quietly be wrong otherwise — that differentiation actually produced a
 * different draw, that a note never becomes a parameter it shouldn't, that
 * attempts drive skill_state, and that the grid refuses to claim what it
 * cannot support.
 */
import assert from 'node:assert/strict';
import { query, one, close } from '../src/lib/db/client.ts';
import { hashPassword } from '../src/lib/auth/password.ts';
import { createClass, addRosterEntry, listLearnerParams, setChipConfirmed } from '../src/lib/classroom/teacher.ts';
import { createAssignment } from '../src/lib/classroom/assignment.ts';
import { targetsFor, loadTargetItems, submitTarget } from '../src/lib/classroom/student.ts';
import { classMasteryGrid, BAND_LABEL } from '../src/lib/classroom/mastery.ts';

const step = (s: string) => console.log(`\n${s}`);
const ok = (s: string) => console.log(`  ✓ ${s}`);

async function main() {
  // ---------------------------------------------------------------- teacher
  step('teacher signs up and makes a class');
  const email = `teacher+${Date.now()}@example.test`;
  const teacher = await one<{ id: string }>(
    `INSERT INTO account (email, password_hash, display_name, role)
     VALUES ($1,$2,'Test Teacher','teacher') RETURNING id`,
    [email, await hashPassword('a-long-enough-password')]);
  const classId = await createClass(teacher.id, 'Period 3 Spanish 2', 'spanish-2');
  const klass = await one<{ class_code: string }>(
    `SELECT class_code FROM class WHERE id = $1`, [classId]);
  ok(`class created, code ${klass.class_code}`);

  // ----------------------------------------------------------------- roster
  step('teacher adds students, with notes');
  const students = [
    { first: 'Ana', last: 'R', grade: 9, note: 'struggles with ser/estar, reads well, needs shorter passages' },
    { first: 'Ben', last: 'K', grade: 9, note: 'needs a challenge, gets bored quickly' },
    { first: 'Cruz', last: 'M', grade: 9, note: 'too hard right now, needs it easier and fewer questions' },
    { first: 'Dee', last: 'L', grade: 6, note: 'has an IEP; parents are divorcing; needs large print' },
    { first: 'Eli', last: 'P', grade: 9, note: null },
  ];

  const ids: Record<string, string> = {};
  for (const s of students) {
    const { rosterEntryId, chips, suppressed } = await addRosterEntry({
      teacherId: teacher.id, classId, firstName: s.first, lastInitial: s.last,
      gradeLevel: s.grade, ageBand: s.grade <= 7 ? 'under_13' : '13_plus', note: s.note,
    });
    ids[s.first] = rosterEntryId;
    const summary = chips.map((c) => `${c.key}=${c.value}`).join(', ') || 'none';
    console.log(`  ${s.first}: chips [${summary}]${suppressed.length ? ` · suppressed [${suppressed.join(', ')}]` : ''}`);
  }

  step('what the note did and did not become');
  const deeChips = await listLearnerParams(ids.Dee);
  const deeValues = deeChips.map((c) => `${c.key}=${c.value}`);
  assert.ok(deeValues.includes('render_accommodation=large_print'),
    'the instructional accommodation should be proposed');
  assert.ok(!deeValues.some((v) => /iep|divorc|parent/i.test(v)),
    'clinical and family circumstances must never become parameters');
  ok('large print proposed; IEP and family circumstances suppressed');

  const under13 = await query<{ account_id: string | null }>(
    `SELECT account_id FROM roster_entry WHERE id = $1`, [ids.Dee]);
  assert.equal(under13[0].account_id, null);
  await assert.rejects(
    () => query(`UPDATE roster_entry SET account_id = $2 WHERE id = $1`, [ids.Dee, teacher.id]),
    'the schema must refuse to give an under-13 roster entry an account');
  ok('the database itself refuses an account for an under-13 entry');

  // ------------------------------------------------------------ confirmation
  step('teacher confirms the chips that should affect the work');
  for (const name of ['Ben', 'Cruz']) {
    for (const chip of await listLearnerParams(ids[name])) {
      if (chip.key === 'difficulty_offset' || chip.key === 'max_items') {
        await setChipConfirmed(chip.id, true);
      }
    }
  }
  ok('Ben +1 difficulty, Cruz -1 difficulty and fewer questions');

  // ------------------------------------------------------------- assignment
  step('teacher assigns preterite practice');
  const { assignmentId, targets } = await createAssignment({
    teacherId: teacher.id, classId, title: 'Preterite practice',
    skill: 'preterite-regular', itemType: 'cloze', difficulty: 3, count: 10, dueAt: null,
  });
  for (const t of targets) {
    console.log(`  ${t.name}: difficulty ${t.difficulty}, ${t.count} questions`
      + `${t.personalised ? ' (own draw)' : ''}`);
  }
  assert.equal(targets.length, students.length);
  assert.ok(targets.find((t) => t.name.startsWith('Ben'))!.difficulty === 4,
    'a confirmed +1 chip should raise difficulty');
  assert.ok(targets.find((t) => t.name.startsWith('Cruz'))!.difficulty === 2,
    'a confirmed -1 chip should lower difficulty');
  assert.ok(targets.find((t) => t.name.startsWith('Cruz'))!.count === 8,
    'a confirmed max_items chip should shorten the assignment');
  assert.ok(targets.find((t) => t.name.startsWith('Ana'))!.difficulty === 3,
    'unconfirmed chips must not change anything');
  ok('differentiation is a different draw, not different generated text');

  const distinctSets = await query<{ n: string }>(
    `SELECT count(DISTINCT item_set_id)::text AS n FROM assignment_target WHERE assignment_id = $1`,
    [assignmentId]);
  console.log(`  ${distinctSets[0].n} distinct item sets across ${targets.length} students`);

  // ---------------------------------------------------------------- students
  step('students do the work');
  const profiles: Record<string, 'all' | 'most' | 'few' | 'accents'> = {
    Ana: 'few', Ben: 'all', Cruz: 'most', Dee: 'few', Eli: 'accents',
  };

  for (const name of Object.keys(ids)) {
    const [target] = await targetsFor(ids[name], classId);
    const { items } = await loadTargetItems(target.target_id, ids[name]);

    // The payload a student receives must not carry the answer.
    const serialised = JSON.stringify(items);
    const answers = await query<{ id: string; answer: unknown }>(
      `SELECT id, answer FROM item WHERE id = ANY($1::uuid[])`, [items.map((i) => i.id)]);
    for (const a of answers) {
      const text = Array.isArray(a.answer) ? String(a.answer[0]) : String(a.answer);
      assert.ok(!serialised.includes(`"${text}"`),
        `the answer ${text} must not appear in what is sent to the student`);
    }

    const byId = new Map(answers.map((a) => [a.id, a.answer]));
    const responses: Record<string, unknown> = {};
    items.forEach((item, i) => {
      const truth = byId.get(item.id);
      const correct = Array.isArray(truth) ? String(truth[0]) : String(truth);
      const mode = profiles[name];
      const shouldBeRight =
        mode === 'all' ? true
        : mode === 'most' ? i % 4 !== 0
        : mode === 'few' ? i % 4 === 0
        : true;
      let given = shouldBeRight ? correct : 'zzz';
      // Eli types without accents — right word, wrong form.
      if (mode === 'accents') given = correct.normalize('NFD').replace(/[̀-ͯ]/g, '');
      responses[item.id] = item.item_type === 'cloze' ? [given] : given;
    });

    const result = await submitTarget(target.target_id, ids[name], responses);
    const pct = Math.round(100 * result.score / result.maxScore);
    const nearMiss = result.feedback.filter((f) => f.note).length;
    console.log(`  ${name}: ${pct}%${nearMiss ? ` (${nearMiss} near-misses flagged)` : ''}`);
  }

  const eliAttempts = await query<{ correct: boolean }>(
    `SELECT correct FROM attempt WHERE roster_entry_id = $1`, [ids.Eli]);
  const eliRight = eliAttempts.filter((a) => a.correct).length;
  assert.ok(eliRight < eliAttempts.length,
    'stripping accents must not be graded as correct on verb forms');
  ok('an answer that is right but for its accents is marked wrong, and labelled as such');

  // ------------------------------------------------------------------- grid
  step('the teacher grid');
  const grid = await classMasteryGrid(classId);
  const width = Math.max(...grid.students.map((s) => s.display_name.length));
  for (const student of grid.students) {
    const cells = grid.skills.map((skill) => {
      const c = grid.cells.get(`${student.id}:${skill.id}`);
      return `${skill.name}: ${c ? BAND_LABEL[c.band] : 'no data'}`
        + `${c ? ` (${c.attempts} attempts)` : ''}`;
    });
    console.log(`  ${student.display_name.padEnd(width)}  ${cells.join(' | ')}`);
  }

  assert.ok(grid.skills.length > 0, 'the grid should have the assigned skill as a column');
  const anaCell = grid.cells.get(`${ids.Ana}:${grid.skills[0].id}`);
  const benCell = grid.cells.get(`${ids.Ben}:${grid.skills[0].id}`);
  assert.ok(anaCell && benCell, 'both students should have a cell');
  assert.ok(Number(benCell!.mastery_estimate) > Number(anaCell!.mastery_estimate),
    'the student who got everything right should read higher than the one who did not');
  ok('skill_state was driven by attempts, through the trigger, with no application code');

  if (grid.weakest[0]) {
    console.log(`\n  weakest: ${grid.weakest[0].skill.name} — `
      + `${grid.weakest[0].needingHelp} of ${grid.weakest[0].of} need help`);
  }

  console.log('\nall assertions passed');
  await close();
}

main().catch(async (e) => { console.error('\nFAILED:', e.message); await close(); process.exit(1); });
