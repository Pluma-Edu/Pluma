\set QUIET on
\pset footer off
INSERT INTO subject (id, slug, name) VALUES ('11111111-1111-1111-1111-111111111111','spanish','Spanish');
INSERT INTO course (id, subject_id, slug, name, sequence_index)
  VALUES ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','spanish-2','Spanish 2',2);
INSERT INTO skill (id, subject_id, slug, path, depth, name)
  VALUES ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','ser-vs-estar','grammar.verbs.ser_vs_estar',2,'Ser vs. estar');
INSERT INTO account (id, email, role) VALUES ('44444444-4444-4444-4444-444444444444','t@example.com','teacher');

-- one roster entry per scenario
INSERT INTO roster_entry (id, teacher_account_id, first_name, last_initial, age_band) VALUES
 ('a0000000-0000-0000-0000-000000000001','44444444-4444-4444-4444-444444444444','A','a','under_13'),
 ('a0000000-0000-0000-0000-000000000002','44444444-4444-4444-4444-444444444444','B','b','under_13'),
 ('a0000000-0000-0000-0000-000000000003','44444444-4444-4444-4444-444444444444','C','c','under_13'),
 ('a0000000-0000-0000-0000-000000000004','44444444-4444-4444-4444-444444444444','D','d','under_13'),
 ('a0000000-0000-0000-0000-000000000005','44444444-4444-4444-4444-444444444444','E','e','under_13');

INSERT INTO item (id, skill_id, course_id, item_type, difficulty, stem, body, answer, rationale,
                  auto_gradable, generation_hash, generator_kind, content_fingerprint, validation_state)
SELECT ('55555555-5555-5555-5555-55555555000' || d)::uuid,
       '33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222',
       'mcq', d::smallint, 'stem d'||d,
       '{"choices":[{"key":"a","text":"es"},{"key":"b","text":"está"}]}'::jsonb,
       '"a"'::jsonb, 'because', true, 'hash', 'model', 'fp'||d, 'auto_validated'
FROM generate_series(1,5) d;

CREATE FUNCTION t_attempt(p_roster uuid, p_diff int, p_correct boolean, p_days_ago numeric)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO attempt (roster_entry_id, item_id, skill_id, difficulty_at_attempt, surface, correct, created_at)
  VALUES (p_roster, ('55555555-5555-5555-5555-55555555000'||p_diff)::uuid,
          '33333333-3333-3333-3333-333333333333', p_diff::smallint, 'practice', p_correct,
          now() - (p_days_ago || ' days')::interval);
$$;

-- A: 7 of 10 correct, all at difficulty 3, all today
SELECT t_attempt('a0000000-0000-0000-0000-000000000001',3, i<=7, 0) FROM generate_series(1,10) i;
-- B: 7 of 10 correct but the misses are on the EASY items
SELECT t_attempt('a0000000-0000-0000-0000-000000000002',5, true, 0) FROM generate_series(1,7) i;
SELECT t_attempt('a0000000-0000-0000-0000-000000000002',1, false,0) FROM generate_series(1,3) i;
-- C: 7 of 10 correct but the hits are on the easy items
SELECT t_attempt('a0000000-0000-0000-0000-000000000003',1, true, 0) FROM generate_series(1,7) i;
SELECT t_attempt('a0000000-0000-0000-0000-000000000003',5, false,0) FROM generate_series(1,3) i;
-- D: three for three. Small sample.
SELECT t_attempt('a0000000-0000-0000-0000-000000000004',3, true, 0) FROM generate_series(1,3) i;
-- E: was strong 120 days ago, hasn't practised since
SELECT t_attempt('a0000000-0000-0000-0000-000000000005',3, true, 120) FROM generate_series(1,9) i;
SELECT t_attempt('a0000000-0000-0000-0000-000000000005',3, false,120) FROM generate_series(1,1) i;
\set QUIET off
\echo '=== trigger-maintained skill_state ==='
SELECT r.first_name AS who, s.attempts, s.correct,
       round(s.correct::numeric/s.attempts,2) AS raw_pct,
       s.mastery_estimate, s.mastery_peak, s.confidence
FROM skill_state s JOIN roster_entry r ON r.id = s.roster_entry_id ORDER BY r.first_name;

\echo '=== recompute from attempts reproduces it (cache is derivable) ==='
SELECT pluma_recompute_skill_state(id, '33333333-3333-3333-3333-333333333333') FROM roster_entry;
SELECT r.first_name AS who, s.attempts, s.mastery_estimate, s.mastery_peak, s.confidence
FROM skill_state s JOIN roster_entry r ON r.id = s.roster_entry_id ORDER BY r.first_name;
