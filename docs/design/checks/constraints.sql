\set ON_ERROR_STOP off
\pset footer off
CREATE OR REPLACE FUNCTION must_fail(label text, stmt text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE stmt;
  RETURN 'LEAKED  <-- ' || label;
EXCEPTION WHEN others THEN
  RETURN 'blocked     ' || label;
END; $$;

-- a parent (non-leaf) skill and an unvalidated item to aim at
UPDATE skill SET is_leaf = false WHERE slug = 'ser-vs-estar';
INSERT INTO skill (id, subject_id, parent_skill_id, slug, path, depth, name)
 VALUES ('66666666-6666-6666-6666-666666666666','11111111-1111-1111-1111-111111111111',
         '33333333-3333-3333-3333-333333333333','ser-descriptions','grammar.verbs.ser_vs_estar.descriptions',3,'Ser for descriptions');
INSERT INTO item (id, skill_id, course_id, item_type, difficulty, stem, body, answer, rationale,
                  auto_gradable, generation_hash, generator_kind, content_fingerprint, validation_state)
VALUES ('77777777-7777-7777-7777-777777777777','66666666-6666-6666-6666-666666666666',
        '22222222-2222-2222-2222-222222222222','mcq',3,'unvalidated stem',
        '{"choices":[{"key":"a","text":"es"},{"key":"b","text":"esta"}]}','"a"','because',
        true,'h','model','fp-unvalidated','unvalidated');
INSERT INTO item_set (id, kind, course_id) VALUES
 ('88888888-8888-8888-8888-888888888888','worksheet','22222222-2222-2222-2222-222222222222');

SELECT must_fail('constraint 1: under-13 roster entry holding an account',
  $$INSERT INTO roster_entry (teacher_account_id, first_name, age_band, account_id)
    VALUES ('44444444-4444-4444-4444-444444444444','F','under_13','44444444-4444-4444-4444-444444444444')$$)
UNION ALL SELECT must_fail('constraint 4: unvalidated item rendered into a set',
  $$INSERT INTO item_set_item (item_set_id, position, item_id)
    VALUES ('88888888-8888-8888-8888-888888888888',1,'77777777-7777-7777-7777-777777777777')$$)
UNION ALL SELECT must_fail('constraint 4: flagged item rendered into a set',
  $$WITH f AS (UPDATE item SET validation_state='flagged' WHERE content_fingerprint='fp3' RETURNING id)
    INSERT INTO item_set_item (item_set_id, position, item_id)
    SELECT '88888888-8888-8888-8888-888888888888',2,id FROM f$$)
UNION ALL SELECT must_fail('item attached to a non-leaf skill',
  $$INSERT INTO item (skill_id, course_id, item_type, difficulty, stem, body, answer, rationale,
       auto_gradable, generation_hash, generator_kind, content_fingerprint)
    VALUES ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','mcq',3,'s',
       '{"choices":[{"key":"a","text":"x"},{"key":"b","text":"y"}]}','"a"','r',true,'h','model','fp-nonleaf')$$)
UNION ALL SELECT must_fail('mcq with a single choice',
  $$INSERT INTO item (skill_id, course_id, item_type, difficulty, stem, body, answer, rationale,
       auto_gradable, generation_hash, generator_kind, content_fingerprint)
    VALUES ('66666666-6666-6666-6666-666666666666','22222222-2222-2222-2222-222222222222','mcq',3,'s',
       '{"choices":[{"key":"a","text":"x"}]}','"a"','r',true,'h','model','fp-onechoice')$$)
UNION ALL SELECT must_fail('free_response marked auto-gradable',
  $$INSERT INTO item (skill_id, course_id, item_type, difficulty, stem, body, answer, rationale,
       auto_gradable, generation_hash, generator_kind, content_fingerprint)
    VALUES ('66666666-6666-6666-6666-666666666666','22222222-2222-2222-2222-222222222222','free_response',3,'s',
       '{}','""','r',true,'h','model','fp-fr')$$)
UNION ALL SELECT must_fail('item with an empty rationale',
  $$INSERT INTO item (skill_id, course_id, item_type, difficulty, stem, body, answer, rationale,
       auto_gradable, generation_hash, generator_kind, content_fingerprint)
    VALUES ('66666666-6666-6666-6666-666666666666','22222222-2222-2222-2222-222222222222','short_answer',3,'s',
       '{}','"x"','   ',true,'h','model','fp-norationale')$$);

\echo ''
\echo '=== a validated item still goes in fine (the gate is not just "no") ==='
INSERT INTO item_set_item (item_set_id, position, item_id)
SELECT '88888888-8888-8888-8888-888888888888', 9, id FROM item WHERE content_fingerprint = 'fp2';
SELECT count(*) AS rows_in_set FROM item_set_item WHERE item_set_id='88888888-8888-8888-8888-888888888888';
