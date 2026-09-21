-- ============================================================================
-- Pluma — proposed data model (v0, Spanish 1-3)
-- Postgres 15+. SQL-first migrations; this file is the proposal, not a migration.
--
-- Reading order:
--   1. taxonomy        subject / course / skill / course_skill / lexicon
--   2. the atom        item (+ item_stat)
--   3. generation      prompt_template / generation_pool / generation_run / validation
--   4. identity        account / class / roster_entry / enrollment / learner_param
--   5. sets & surfaces item_set / worksheet / assignment / practice_session
--   6. progress        attempt / skill_state
--   7. retention       policy / purge / deletion_request
--   8. enforcement     triggers that make the hard constraints structural
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;    -- emails, class codes
CREATE EXTENSION IF NOT EXISTS ltree;     -- skill tree paths + subtree queries

CREATE TYPE item_type         AS ENUM ('mcq','cloze','short_answer','matching','ordering','free_response');
CREATE TYPE validation_state  AS ENUM ('unvalidated','auto_validated','human_approved','flagged','rejected','retired');
CREATE TYPE surface           AS ENUM ('print','assignment','practice');
CREATE TYPE age_band          AS ENUM ('under_13','13_plus');
CREATE TYPE generator_kind    AS ENUM ('template','model','hybrid','imported');
CREATE TYPE skill_emphasis    AS ENUM ('core','review','preview');
CREATE TYPE item_set_kind     AS ENUM ('worksheet','assignment','practice');
CREATE TYPE answer_match_mode AS ENUM ('exact','case_insensitive','accent_insensitive','numeric','set_equal','regex');

-- ============================================================================
-- 1. TAXONOMY — subject -> course -> skill. Grade is a filter, never a key.
-- ============================================================================

CREATE TABLE subject (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text NOT NULL UNIQUE,              -- 'spanish'
  name            text NOT NULL,
  content_locale  text NOT NULL DEFAULT 'es',        -- language OF the items
  ui_locale       text NOT NULL DEFAULT 'en',        -- language of instructions
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE course (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id         uuid NOT NULL REFERENCES subject(id),
  slug               text NOT NULL,                  -- 'spanish-2'
  name               text NOT NULL,
  sequence_index     smallint NOT NULL,              -- 1,2,3 within the subject
  typical_grade_low  smallint,                       -- FILTER ONLY
  typical_grade_high smallint,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject_id, slug),
  UNIQUE (subject_id, sequence_index)
);

-- Skills hang off the SUBJECT, not the course. See 01-data-model.md §2.
CREATE TABLE skill (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id      uuid NOT NULL REFERENCES subject(id),
  parent_skill_id uuid REFERENCES skill(id),
  slug            text NOT NULL,                     -- stable; owned by the seed file
  path            ltree NOT NULL,                    -- grammar.verbs.preterite.regular_ar
  depth            smallint NOT NULL,
  name            text NOT NULL,
  description     text,
  is_leaf         boolean NOT NULL DEFAULT true,     -- only leaves carry items
  seed_version    int NOT NULL DEFAULT 1,
  retired_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject_id, slug),
  CHECK (parent_skill_id IS NULL OR parent_skill_id <> id),
  CHECK (depth BETWEEN 0 AND 4)
);
CREATE INDEX skill_path_gist  ON skill USING gist (path);
CREATE INDEX skill_parent_idx ON skill (parent_skill_id);

-- A course INCLUDES skills. Spanish 1 and Spanish 2 can both include
-- present-tense-ar; the student keeps one mastery history across both.
CREATE TABLE course_skill (
  course_id      uuid NOT NULL REFERENCES course(id) ON DELETE CASCADE,
  skill_id       uuid NOT NULL REFERENCES skill(id)  ON DELETE CASCADE,
  emphasis       skill_emphasis NOT NULL DEFAULT 'core',
  sequence_index int NOT NULL,                       -- teaching order within course
  unit_label     text,                               -- 'Unidad 3'
  PRIMARY KEY (course_id, skill_id),
  UNIQUE (course_id, sequence_index) DEFERRABLE INITIALLY DEFERRED
);

-- Controlled vocabulary. Generation constraint AND validation check:
-- a Spanish 1 item may not contain a lemma first introduced in Spanish 3.
CREATE TABLE lexicon (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES subject(id),
  version    int  NOT NULL,
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject_id, version)
);

CREATE TABLE lexeme (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lexicon_id            uuid NOT NULL REFERENCES lexicon(id) ON DELETE CASCADE,
  lemma                 text NOT NULL,
  pos                   text NOT NULL,               -- verb|noun|adj|adv|prep|...
  gloss_en              text,
  gender                text CHECK (gender IN ('m','f','mf')),
  introduced_at_course  smallint NOT NULL,           -- course.sequence_index
  irregularity          text,                        -- stem-change pattern, etc.
  tags                  text[] NOT NULL DEFAULT '{}',
  UNIQUE (lexicon_id, lemma, pos)
);
CREATE INDEX lexeme_course_idx ON lexeme (lexicon_id, introduced_at_course);

-- ============================================================================
-- 2. THE ATOM
-- ============================================================================

CREATE TABLE item (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id              uuid NOT NULL REFERENCES skill(id),
  -- course_id is PROVENANCE: the course whose parameters produced this item.
  -- Eligibility for a course is computed through course_skill, not from here.
  course_id             uuid NOT NULL REFERENCES course(id),
  item_type             item_type NOT NULL,
  difficulty            smallint NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
  locale                text NOT NULL DEFAULT 'es',

  stem                  text NOT NULL CHECK (length(btrim(stem)) > 0),
  -- type-specific payload; shape enforced by item_body_shape below
  --   mcq       {"choices":[{"key":"a","text":"..."}, ...]}
  --   cloze     {"segments":[...], "blanks":[{"key":"1","hint":"hablar"}]}
  --   matching  {"left":[...], "right":[...], "pairs":[["l1","r3"], ...]}
  --   ordering  {"elements":[{"key":"a","text":"..."}]}
  --   short_answer / free_response  {}
  body                  jsonb NOT NULL DEFAULT '{}'::jsonb,
  answer                jsonb NOT NULL,              -- canonical answer
  accepted_answers      jsonb NOT NULL DEFAULT '[]'::jsonb,
  answer_match_mode     answer_match_mode NOT NULL DEFAULT 'exact',
  rationale             text NOT NULL CHECK (length(btrim(rationale)) > 0),

  -- things the renderer cannot infer; NOT presentation
  render_meta           jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- the generator's own checkable claims: {"lemma":"hablar","tense":"preterite",
  -- "person":"1s","mood":"indicative"} — verified against the conjugator
  grammar_claim         jsonb,
  lexemes_used          text[] NOT NULL DEFAULT '{}',

  auto_gradable         boolean NOT NULL,
  generation_hash       text NOT NULL,               -- pool key; see §3
  generator_kind        generator_kind NOT NULL,
  content_fingerprint   text NOT NULL,               -- sha256(normalised content)
  validation_state      validation_state NOT NULL DEFAULT 'unvalidated',
  validated_at          timestamptz,
  superseded_by_item_id uuid REFERENCES item(id),    -- items are immutable; repairs fork
  created_at            timestamptz NOT NULL DEFAULT now(),

  is_servable boolean GENERATED ALWAYS AS
    (validation_state IN ('auto_validated','human_approved')) STORED,

  CONSTRAINT free_response_is_not_auto_gradable
    CHECK (item_type <> 'free_response' OR auto_gradable = false),

  CONSTRAINT item_body_shape CHECK (
    CASE item_type
      WHEN 'mcq'      THEN jsonb_typeof(body->'choices')  = 'array'
                       AND jsonb_array_length(body->'choices')  BETWEEN 2 AND 6
      WHEN 'matching' THEN jsonb_typeof(body->'pairs')    = 'array'
                       AND jsonb_array_length(body->'pairs')    BETWEEN 3 AND 8
      WHEN 'ordering' THEN jsonb_typeof(body->'elements') = 'array'
                       AND jsonb_array_length(body->'elements') BETWEEN 3 AND 8
      WHEN 'cloze'    THEN jsonb_typeof(body->'blanks')   = 'array'
                       AND jsonb_array_length(body->'blanks')  >= 1
      ELSE true
    END)
);

-- one row per distinct piece of content, across every pool that produced it
CREATE UNIQUE INDEX item_fingerprint_uq ON item (content_fingerprint)
  WHERE validation_state <> 'rejected';
CREATE INDEX item_pool_idx   ON item (generation_hash)                 WHERE is_servable;
CREATE INDEX item_select_idx ON item (skill_id, difficulty, item_type) WHERE is_servable;
CREATE INDEX item_review_idx ON item (validation_state, created_at);

-- Aggregate, non-student-linked. Survives every purge. Calibrates difficulty.
CREATE TABLE item_stat (
  item_id             uuid PRIMARY KEY REFERENCES item(id) ON DELETE CASCADE,
  served_count        bigint NOT NULL DEFAULT 0,
  correct_count       bigint NOT NULL DEFAULT 0,
  sum_time_ms         bigint NOT NULL DEFAULT 0,
  flag_count          int    NOT NULL DEFAULT 0,
  observed_difficulty numeric(4,3),   -- empirical p-value, NULL until n >= 30
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- 3. GENERATION & VALIDATION
-- ============================================================================

CREATE TABLE prompt_template (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  version       int  NOT NULL,
  item_types    item_type[] NOT NULL,
  body          text NOT NULL,
  output_schema jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, version)
);

-- A pool is "everything ever generated for this exact parameter set".
-- generation_hash = sha256(canonical_json(params)) where params EXCLUDES
-- count and seed — so asking for 10 when 8 are cached tops up by 2 rather
-- than paying again for 10. This is the cache.
CREATE TABLE generation_pool (
  generation_hash     text PRIMARY KEY,
  params              jsonb NOT NULL,       -- exactly the bytes that were hashed
  skill_id            uuid NOT NULL REFERENCES skill(id),
  course_id           uuid NOT NULL REFERENCES course(id),
  item_type           item_type NOT NULL,
  difficulty          smallint NOT NULL,
  generator_kind      generator_kind NOT NULL,
  template_name       text,
  template_version    int,
  model_id            text,
  lexicon_version     int NOT NULL,
  target_size         int NOT NULL DEFAULT 24,
  servable_count      int NOT NULL DEFAULT 0,
  rejected_count      int NOT NULL DEFAULT 0,
  generation_disabled boolean NOT NULL DEFAULT false,  -- circuit breaker
  -- Trust is earned per pool: a new pool's items need a human before they go
  -- servable. Once a sample has passed, later items from the SAME parameters
  -- may auto-validate. See 02-generation-pipeline.md §6.
  human_gate_state    text NOT NULL DEFAULT 'gated'
                        CHECK (human_gate_state IN ('gated','sampling','trusted','revoked')),
  human_reviewed_count int NOT NULL DEFAULT 0,
  human_agreement      numeric(4,3),
  last_generated_at   timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX generation_pool_refill_idx ON generation_pool (skill_id, item_type, difficulty)
  WHERE generation_disabled = false;

CREATE TABLE generation_run (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_hash    text NOT NULL REFERENCES generation_pool(generation_hash),
  requested_by       uuid,                 -- account.id; NULL for batch jobs
  requested_count    int NOT NULL,
  status             text NOT NULL CHECK (status IN ('queued','running','succeeded','failed','partial')),
  model_id           text,
  input_tokens       int,
  output_tokens      int,
  cost_usd           numeric(10,6),
  items_returned     int NOT NULL DEFAULT 0,
  items_persisted    int NOT NULL DEFAULT 0,
  items_rejected     int NOT NULL DEFAULT 0,
  items_duplicate    int NOT NULL DEFAULT 0,
  error              text,
  started_at         timestamptz NOT NULL DEFAULT now(),
  finished_at        timestamptz
);
CREATE INDEX generation_run_pool_idx ON generation_run (generation_hash, started_at DESC);

CREATE TABLE validation_result (
  id         bigserial PRIMARY KEY,
  item_id    uuid NOT NULL REFERENCES item(id) ON DELETE CASCADE,
  layer      text NOT NULL CHECK (layer IN ('structural','linguistic','semantic','human')),
  check_name text NOT NULL,
  passed     boolean NOT NULL,
  detail     jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX validation_result_item_idx ON validation_result (item_id);
CREATE INDEX validation_result_fail_idx ON validation_result (check_name, created_at)
  WHERE passed = false;

CREATE TABLE item_flag (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id             uuid NOT NULL REFERENCES item(id) ON DELETE CASCADE,
  reported_by_account uuid,                -- teacher; NULL if system
  reason              text NOT NULL CHECK (reason IN ('wrong_answer','ambiguous','off_level','typo','inappropriate','other')),
  note                text,                -- teacher free text: never sent to a model
  created_at          timestamptz NOT NULL DEFAULT now(),
  resolved_at         timestamptz,
  resolution          text
);
CREATE INDEX item_flag_open_idx ON item_flag (item_id) WHERE resolved_at IS NULL;

-- ============================================================================
-- 4. IDENTITY — roster_entry is the unit progress attaches to.
--    An account merely authenticates access to one. Never the reverse.
-- ============================================================================

CREATE TABLE account (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email             citext UNIQUE,          -- NULL for provisioned student accounts
  password_hash     text,
  display_name      text,
  role              text NOT NULL CHECK (role IN ('teacher','student','admin')),
  email_verified_at timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  last_seen_at      timestamptz,
  deleted_at        timestamptz,
  CONSTRAINT teachers_have_email CHECK (role <> 'teacher' OR email IS NOT NULL)
);

CREATE TABLE class (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_account_id uuid NOT NULL REFERENCES account(id),
  course_id          uuid NOT NULL REFERENCES course(id),
  name               text NOT NULL,                 -- 'Period 3 Spanish 2'
  class_code         citext NOT NULL UNIQUE,        -- bearer credential; rotatable
  code_rotated_at    timestamptz NOT NULL DEFAULT now(),
  require_pin        boolean NOT NULL DEFAULT false,
  term_starts_on     date,
  term_ends_on       date,
  archived_at        timestamptz,
  purge_after        date,                          -- maintained by the retention job
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX class_teacher_idx ON class (teacher_account_id) WHERE archived_at IS NULL;

-- The roster belongs to the TEACHER, not the class, so one kid in two of your
-- classes is one person with one mastery history.
CREATE TABLE roster_entry (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_account_id uuid NOT NULL REFERENCES account(id),
  first_name         text NOT NULL,
  last_initial       text CHECK (last_initial IS NULL OR length(last_initial) = 1),
  grade_level        smallint,                      -- filter + defaulting only
  age_band           age_band NOT NULL,
  account_id         uuid UNIQUE REFERENCES account(id) ON DELETE SET NULL,
  access_pin_hash    text,
  context_note       text,                          -- NEVER leaves this database
  note_updated_at    timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz,
  purge_after        date,
  -- Constraint 1, made structural: under-13s cannot hold an account, at all.
  CONSTRAINT under_13_has_no_account
    CHECK (age_band <> 'under_13' OR account_id IS NULL)
);
CREATE INDEX roster_teacher_idx ON roster_entry (teacher_account_id) WHERE deleted_at IS NULL;

CREATE TABLE enrollment (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id        uuid NOT NULL REFERENCES class(id) ON DELETE CASCADE,
  roster_entry_id uuid NOT NULL REFERENCES roster_entry(id) ON DELETE CASCADE,
  joined_at       timestamptz NOT NULL DEFAULT now(),
  removed_at      timestamptz,
  UNIQUE (class_id, roster_entry_id)
);

-- The structured distillation of the teacher's note. ONLY rows that are
-- confirmed AND whose key is generation-safe may reach the generator.
CREATE TABLE learner_param (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roster_entry_id      uuid NOT NULL REFERENCES roster_entry(id) ON DELETE CASCADE,
  key                  text NOT NULL CHECK (key IN (
                         'focus_skill','avoid_skill','difficulty_offset','passage_length',
                         'reading_level','register','item_type_pref','max_items',
                         'render_accommodation')),
  value                text NOT NULL,               -- skill slug or controlled term
  source               text NOT NULL CHECK (source IN ('teacher_chip','note_extraction')),
  confirmed_by_teacher boolean NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (roster_entry_id, key, value)
);
-- render_accommodation NEVER reaches a prompt; it is consumed by the renderer.
CREATE VIEW generation_safe_param AS
  SELECT roster_entry_id, key, value FROM learner_param
   WHERE confirmed_by_teacher AND key <> 'render_accommodation';

-- ============================================================================
-- 5. SETS AND SURFACES — one membership shape, three thin wrappers
-- ============================================================================

CREATE TABLE item_set (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind                 item_set_kind NOT NULL,
  course_id            uuid NOT NULL REFERENCES course(id),
  title                text,
  selection_params     jsonb NOT NULL DEFAULT '{}'::jsonb,  -- reproducible draw
  created_by_account_id uuid REFERENCES account(id),
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE item_set_item (
  item_set_id uuid NOT NULL REFERENCES item_set(id) ON DELETE CASCADE,
  position    int  NOT NULL,
  item_id     uuid NOT NULL REFERENCES item(id),
  points      numeric(5,2) NOT NULL DEFAULT 1,
  PRIMARY KEY (item_set_id, position),
  UNIQUE (item_set_id, item_id)
);
-- constraint 4 enforced at the database boundary, see §8

CREATE TABLE worksheet (                     -- SURFACE 1
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_set_id        uuid NOT NULL UNIQUE REFERENCES item_set(id),
  subject_id         uuid NOT NULL REFERENCES subject(id),
  course_id          uuid NOT NULL REFERENCES course(id),
  primary_skill_id   uuid NOT NULL REFERENCES skill(id),
  slug               text NOT NULL,
  title              text NOT NULL,
  meta_description   text,
  grade_band_low     smallint,
  grade_band_high    smallint,
  render_hash        text,                   -- content-addressed PDF identity
  pdf_key            text,                   -- object storage key, immutable
  answer_key_pdf_key text,
  published_at       timestamptz,
  UNIQUE (course_id, primary_skill_id, slug)
);

-- the only conversion event in surface 1
CREATE TABLE answer_key_unlock (
  worksheet_id uuid NOT NULL REFERENCES worksheet(id) ON DELETE CASCADE,
  account_id   uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (worksheet_id, account_id)
);

CREATE TABLE assignment (                    -- SURFACE 2
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id             uuid NOT NULL REFERENCES class(id) ON DELETE CASCADE,
  created_by_account_id uuid NOT NULL REFERENCES account(id),
  title                text NOT NULL,
  default_item_set_id  uuid NOT NULL REFERENCES item_set(id),
  assigned_at          timestamptz,
  due_at               timestamptz,
  reveal_rationale     text NOT NULL DEFAULT 'after_submit'
                         CHECK (reveal_rationale IN ('never','after_submit','after_due')),
  allow_retake         boolean NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- differentiation lives here: a target may point at its own item_set
CREATE TABLE assignment_target (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id   uuid NOT NULL REFERENCES assignment(id) ON DELETE CASCADE,
  roster_entry_id uuid NOT NULL REFERENCES roster_entry(id) ON DELETE CASCADE,
  item_set_id     uuid NOT NULL REFERENCES item_set(id),
  started_at      timestamptz,
  submitted_at    timestamptz,
  score           numeric(6,2),
  max_score       numeric(6,2),
  UNIQUE (assignment_id, roster_entry_id)
);

CREATE TABLE practice_session (              -- SURFACE 3
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roster_entry_id uuid NOT NULL REFERENCES roster_entry(id) ON DELETE CASCADE,
  course_id       uuid NOT NULL REFERENCES course(id),
  item_set_id     uuid NOT NULL REFERENCES item_set(id),
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  items_total     int,
  items_correct   int
);
CREATE INDEX practice_roster_idx ON practice_session (roster_entry_id, started_at DESC);

-- ============================================================================
-- 6. PROGRESS
-- ============================================================================

-- append-only; see the GRANTs in §8
CREATE TABLE attempt (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roster_entry_id       uuid NOT NULL REFERENCES roster_entry(id) ON DELETE CASCADE,
  item_id               uuid NOT NULL REFERENCES item(id),
  part_key              text NOT NULL DEFAULT '',   -- per-blank for cloze/matching
  skill_id              uuid NOT NULL REFERENCES skill(id),  -- snapshot
  difficulty_at_attempt smallint NOT NULL,                   -- snapshot
  surface               surface NOT NULL,
  assignment_target_id  uuid REFERENCES assignment_target(id) ON DELETE SET NULL,
  practice_session_id   uuid REFERENCES practice_session(id) ON DELETE SET NULL,
  response              jsonb,                       -- student-authored; never to a model
  response_purged_at    timestamptz,                 -- text goes before the row does
  correct               boolean,                     -- NULL = awaiting a human
  graded_by             text NOT NULL DEFAULT 'auto'
                          CHECK (graded_by IN ('auto','teacher','ungraded')),
  time_ms               int CHECK (time_ms IS NULL OR time_ms >= 0),
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attempt_roster_skill_idx ON attempt (roster_entry_id, skill_id, created_at DESC);
CREATE INDEX attempt_item_idx         ON attempt (item_id);
CREATE INDEX attempt_target_idx       ON attempt (assignment_target_id);
CREATE INDEX attempt_purge_idx        ON attempt (created_at);
CREATE INDEX attempt_recent_item_idx  ON attempt (roster_entry_id, item_id, created_at DESC);

-- derived cache; fully reconstructible from attempt (pluma_recompute_skill_state)
CREATE TABLE skill_state (
  roster_entry_id  uuid NOT NULL REFERENCES roster_entry(id) ON DELETE CASCADE,
  skill_id         uuid NOT NULL REFERENCES skill(id) ON DELETE CASCADE,
  attempts         int NOT NULL DEFAULT 0,
  correct          int NOT NULL DEFAULT 0,
  evidence_alpha   numeric(9,3) NOT NULL DEFAULT 1.5,   -- undecayed
  evidence_beta    numeric(9,3) NOT NULL DEFAULT 1.5,
  decayed_alpha    numeric(9,3) NOT NULL DEFAULT 1.5,   -- 45-day half-life
  decayed_beta     numeric(9,3) NOT NULL DEFAULT 1.5,
  mastery_estimate numeric(4,3),      -- posterior mean of the decayed evidence
  mastery_peak     numeric(4,3) NOT NULL DEFAULT 0,     -- monotone; student-facing
  confidence       numeric(4,3) NOT NULL DEFAULT 0,
  last_seen        timestamptz,
  last_attempt_id  uuid,
  recomputed_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (roster_entry_id, skill_id)
);
CREATE INDEX skill_state_skill_idx ON skill_state (skill_id);
CREATE INDEX skill_state_stale_idx ON skill_state (last_seen);

-- The stored columns are decayed AS OF last_seen. Time keeps passing after
-- that, so every read goes through this view, which decays to now(). Without
-- it a student who was strong in March still reads 'developing' in September,
-- which is the grid telling a teacher something it does not know.
-- mastery_peak is deliberately NOT decayed: that is the student-facing number,
-- and absence must never take it away.
CREATE VIEW skill_state_current AS
SELECT s.roster_entry_id, s.skill_id, s.attempts, s.correct,
       s.mastery_peak, s.last_seen,
       d.m       AS mastery_estimate,
       d.conf    AS confidence,
       CASE WHEN s.attempts < 4 THEN 'insufficient'
            WHEN d.conf < 0.25  THEN 'stale'
            WHEN d.m >= 0.85    THEN 'secure'
            WHEN d.m >= 0.65    THEN 'developing'
            WHEN d.m >= 0.40    THEN 'shaky'
            ELSE 'needs_help' END AS band
FROM skill_state s
CROSS JOIN LATERAL (
  SELECT 1.5 + (s.decayed_alpha - 1.5) * k AS a,
         1.5 + (s.decayed_beta  - 1.5) * k AS b
  FROM (SELECT power(0.5, GREATEST(0, EXTRACT(epoch FROM (now() - s.last_seen)) / 86400.0) / 45.0) AS k) kk
) ab
CROSS JOIN LATERAL (
  SELECT round(ab.a / (ab.a + ab.b), 3) AS m,
         round(GREATEST(0, 1 - LEAST(1, 4 * sqrt((ab.a * ab.b)
               / (power(ab.a + ab.b, 2) * (ab.a + ab.b + 1))))), 3) AS conf
) d;

-- ============================================================================
-- 7. RETENTION
-- ============================================================================

CREATE TABLE retention_policy (
  table_name           text PRIMARY KEY,
  holds_student_data   boolean NOT NULL,
  anchor               text NOT NULL,      -- column or rule the clock starts from
  ttl_days             int,
  action               text NOT NULL CHECK (action IN ('delete','anonymise','redact_field')),
  field                text,
  notes                text
);

CREATE TABLE purge_run (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dry_run      boolean NOT NULL,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  rows_touched jsonb NOT NULL DEFAULT '{}'::jsonb,
  error        text
);

CREATE TABLE deletion_request (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope           text NOT NULL CHECK (scope IN ('roster_entry','class','account')),
  roster_entry_id uuid REFERENCES roster_entry(id) ON DELETE SET NULL,
  class_id        uuid REFERENCES class(id) ON DELETE SET NULL,
  account_id      uuid REFERENCES account(id) ON DELETE SET NULL,
  requested_by    uuid REFERENCES account(id),
  reason          text,
  requested_at    timestamptz NOT NULL DEFAULT now(),
  execute_after   timestamptz NOT NULL,     -- soft now, hard at +7d
  completed_at    timestamptz
);

-- ============================================================================
-- 8. ENFORCEMENT — the hard constraints made structural, not conventional
-- ============================================================================

-- A correct answer on a hard item is worth more; a miss on an easy item costs
-- more. Clamped, monotone, explainable to a teacher, and it degrades to a
-- plain smoothed percentage if the difficulty labels turn out to be noise.
CREATE FUNCTION pluma_difficulty_credit(d smallint) RETURNS numeric
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT GREATEST(0.5, LEAST(1.5, 1 + 0.25 * (d - 3)))::numeric;
$fn$;

-- CONSTRAINT 4: an unvalidated item can never enter a rendered set.
-- (Rejected alternative: a composite FK to a UNIQUE(id, is_servable) index.
--  It enforces this at insert time with no trigger — but then flagging an
--  in-use item fails instead of withdrawing it, which is exactly backwards.)
CREATE FUNCTION pluma_enforce_servable_item() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM item WHERE id = NEW.item_id AND is_servable) THEN
    RAISE EXCEPTION 'item % is not servable', NEW.item_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER item_set_item_servable
  BEFORE INSERT OR UPDATE OF item_id ON item_set_item
  FOR EACH ROW EXECUTE FUNCTION pluma_enforce_servable_item();

-- Items attach to leaves only; parents are rollups.
CREATE FUNCTION pluma_enforce_leaf_skill() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM skill WHERE id = NEW.skill_id AND is_leaf) THEN
    RAISE EXCEPTION 'skill % is not a leaf', NEW.skill_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER item_leaf_skill
  BEFORE INSERT OR UPDATE OF skill_id ON item
  FOR EACH ROW EXECUTE FUNCTION pluma_enforce_leaf_skill();

-- Mastery. Beta-Bernoulli posterior over difficulty-weighted evidence, with a
-- 45-day half-life on the copy that drives the grid and the practice selector,
-- and an undecayed copy kept so the formula can be changed and backfilled.
CREATE FUNCTION pluma_apply_attempt() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
  prior     constant numeric := 1.5;   -- prior centred at 0.5, strength 3
  half_life constant numeric := 45.0;  -- days
  credit numeric; gap_days numeric; decay numeric;
  a_e numeric; b_e numeric; a_d numeric; b_d numeric;
  m numeric; sd numeric; conf numeric;
  cur skill_state%ROWTYPE;
BEGIN
  IF NEW.correct IS NULL THEN RETURN NEW; END IF;   -- ungraded contributes nothing

  credit := pluma_difficulty_credit(NEW.difficulty_at_attempt);

  INSERT INTO skill_state (roster_entry_id, skill_id)
  VALUES (NEW.roster_entry_id, NEW.skill_id)
  ON CONFLICT (roster_entry_id, skill_id) DO NOTHING;

  SELECT * INTO cur FROM skill_state
   WHERE roster_entry_id = NEW.roster_entry_id AND skill_id = NEW.skill_id
   FOR UPDATE;

  gap_days := GREATEST(0, EXTRACT(epoch FROM
                (NEW.created_at - COALESCE(cur.last_seen, NEW.created_at))) / 86400.0);
  decay    := power(0.5, gap_days / half_life);

  a_e := cur.evidence_alpha + CASE WHEN NEW.correct THEN credit    ELSE 0 END;
  b_e := cur.evidence_beta  + CASE WHEN NEW.correct THEN 0 ELSE 2 - credit END;
  a_d := prior + (cur.decayed_alpha - prior) * decay
               + CASE WHEN NEW.correct THEN credit    ELSE 0 END;
  b_d := prior + (cur.decayed_beta  - prior) * decay
               + CASE WHEN NEW.correct THEN 0 ELSE 2 - credit END;

  m    := a_d / (a_d + b_d);
  sd   := sqrt((a_d * b_d) / (power(a_d + b_d, 2) * (a_d + b_d + 1)));
  conf := GREATEST(0, 1 - LEAST(1, 4 * sd));

  UPDATE skill_state SET
    attempts         = cur.attempts + 1,
    correct          = cur.correct + CASE WHEN NEW.correct THEN 1 ELSE 0 END,
    evidence_alpha   = a_e,  evidence_beta = b_e,
    decayed_alpha    = a_d,  decayed_beta  = b_d,
    mastery_estimate = round(m, 3),
    -- never decreases, never shown before there is evidence: this is the
    -- number a student sees, and it is why absence cannot punish them
    mastery_peak     = GREATEST(cur.mastery_peak,
                        CASE WHEN cur.attempts + 1 >= 4 THEN round(m, 3) ELSE 0 END),
    confidence       = round(conf, 3),
    last_seen        = NEW.created_at,
    last_attempt_id  = NEW.id,
    recomputed_at    = now()
  WHERE roster_entry_id = NEW.roster_entry_id AND skill_id = NEW.skill_id;

  RETURN NEW;
END;
$fn$;

CREATE TRIGGER attempt_applies_to_skill_state
  AFTER INSERT ON attempt
  FOR EACH ROW EXECUTE FUNCTION pluma_apply_attempt();

CREATE TRIGGER attempt_grading_applies_to_skill_state
  AFTER UPDATE OF correct ON attempt
  FOR EACH ROW WHEN (OLD.correct IS NULL AND NEW.correct IS NOT NULL)
  EXECUTE FUNCTION pluma_apply_attempt();

-- skill_state is a cache. This is the proof: replay and you get the same row.
-- Run it after any change to the mastery formula, or to repair drift.
CREATE FUNCTION pluma_recompute_skill_state(p_roster uuid, p_skill uuid)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE
  prior     constant numeric := 1.5;
  half_life constant numeric := 45.0;
  r record; credit numeric; gap numeric; decay numeric;
  a_e numeric := prior; b_e numeric := prior;
  a_d numeric := prior; b_d numeric := prior;
  n int := 0; c int := 0; peak numeric := 0; m numeric; sd numeric;
  last_t timestamptz;
BEGIN
  FOR r IN SELECT * FROM attempt
            WHERE roster_entry_id = p_roster AND skill_id = p_skill
              AND correct IS NOT NULL
            ORDER BY created_at, id
  LOOP
    credit := pluma_difficulty_credit(r.difficulty_at_attempt);
    gap    := GREATEST(0, EXTRACT(epoch FROM (r.created_at - COALESCE(last_t, r.created_at))) / 86400.0);
    decay  := power(0.5, gap / half_life);
    a_e := a_e + CASE WHEN r.correct THEN credit ELSE 0 END;
    b_e := b_e + CASE WHEN r.correct THEN 0 ELSE 2 - credit END;
    a_d := prior + (a_d - prior) * decay + CASE WHEN r.correct THEN credit ELSE 0 END;
    b_d := prior + (b_d - prior) * decay + CASE WHEN r.correct THEN 0 ELSE 2 - credit END;
    n := n + 1;
    c := c + CASE WHEN r.correct THEN 1 ELSE 0 END;
    m := a_d / (a_d + b_d);
    IF n >= 4 THEN peak := GREATEST(peak, round(m, 3)); END IF;
    last_t := r.created_at;
  END LOOP;

  IF n = 0 THEN
    DELETE FROM skill_state WHERE roster_entry_id = p_roster AND skill_id = p_skill;
    RETURN;
  END IF;

  sd := sqrt((a_d * b_d) / (power(a_d + b_d, 2) * (a_d + b_d + 1)));

  INSERT INTO skill_state (roster_entry_id, skill_id, attempts, correct,
      evidence_alpha, evidence_beta, decayed_alpha, decayed_beta,
      mastery_estimate, mastery_peak, confidence, last_seen, recomputed_at)
  VALUES (p_roster, p_skill, n, c, a_e, b_e, a_d, b_d,
      round(m, 3), peak, round(GREATEST(0, 1 - LEAST(1, 4 * sd)), 3), last_t, now())
  ON CONFLICT (roster_entry_id, skill_id) DO UPDATE SET
      attempts = EXCLUDED.attempts, correct = EXCLUDED.correct,
      evidence_alpha = EXCLUDED.evidence_alpha, evidence_beta = EXCLUDED.evidence_beta,
      decayed_alpha  = EXCLUDED.decayed_alpha,  decayed_beta  = EXCLUDED.decayed_beta,
      mastery_estimate = EXCLUDED.mastery_estimate,
      mastery_peak     = GREATEST(skill_state.mastery_peak, EXCLUDED.mastery_peak),
      confidence = EXCLUDED.confidence, last_seen = EXCLUDED.last_seen,
      recomputed_at = now();
END;
$fn$;

-- Aggregates that must outlive the student rows that produced them.
CREATE FUNCTION pluma_bump_item_stat() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  INSERT INTO item_stat (item_id, served_count, correct_count, sum_time_ms)
  VALUES (NEW.item_id, 1,
          CASE WHEN NEW.correct THEN 1 ELSE 0 END,
          COALESCE(NEW.time_ms, 0))
  ON CONFLICT (item_id) DO UPDATE SET
    served_count  = item_stat.served_count  + 1,
    correct_count = item_stat.correct_count + CASE WHEN NEW.correct THEN 1 ELSE 0 END,
    sum_time_ms   = item_stat.sum_time_ms   + COALESCE(NEW.time_ms, 0),
    observed_difficulty = CASE
      WHEN item_stat.served_count + 1 >= 30
      THEN round((item_stat.correct_count + CASE WHEN NEW.correct THEN 1 ELSE 0 END)::numeric
                 / (item_stat.served_count + 1), 3)
      ELSE item_stat.observed_difficulty END,
    updated_at = now();
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER attempt_bumps_item_stat
  AFTER INSERT ON attempt FOR EACH ROW
  WHEN (NEW.correct IS NOT NULL)
  EXECUTE FUNCTION pluma_bump_item_stat();

-- Append-only in practice: the app role cannot rewrite history, the purge role
-- can. CONSTRAINT 2 lives here too — no application role should ever hold a
-- connection that can read context_note and also reach the model client.
-- REVOKE UPDATE, DELETE ON attempt FROM pluma_app;
-- GRANT  INSERT, SELECT ON attempt TO pluma_app;
-- GRANT  UPDATE (correct, graded_by, score) ON attempt TO pluma_app;
-- GRANT  UPDATE, DELETE ON attempt TO pluma_purge;

-- ============================================================================
-- 9. SEED of the retention policy table (the policy is data, not a code path)
-- ============================================================================
INSERT INTO retention_policy (table_name, holds_student_data, anchor, ttl_days, action, field, notes) VALUES
 ('attempt',              true,  'created_at',                     400, 'delete',       NULL,           'folded into item_stat first'),
 ('attempt.response',     true,  'created_at',                     180, 'redact_field', 'response',     'free text goes early; the row survives for the mastery history'),
 ('skill_state',          true,  'roster_entry.purge_after',      NULL, 'delete',       NULL,           'derived; purged with its roster entry'),
 ('roster_entry',         true,  'last enrollment term_ends_on',   400, 'delete',       NULL,           'one year-over-year comparison, then gone'),
 ('roster_entry.context_note', true, 'note_updated_at',            120, 'redact_field', 'context_note', 'most sensitive free text in the system'),
 ('learner_param',        true,  'roster_entry.purge_after',      NULL, 'delete',       NULL,           NULL),
 ('practice_session',     true,  'started_at',                     400, 'delete',       NULL,           NULL),
 ('assignment_target',    true,  'assignment.due_at',              400, 'delete',       NULL,           NULL),
 ('class',                false, 'term_ends_on',                   400, 'delete',       NULL,           'cascades to enrollment'),
 ('account',              false, 'last_seen_at',                  1095, 'delete',       NULL,           'teacher accounts, warned by email first'),
 ('item_stat',            false, 'n/a',                           NULL, 'delete',       NULL,           'aggregate, never purged'),
 ('item',                 false, 'n/a',                           NULL, 'delete',       NULL,           'no student linkage, ever');
