# Data model — proposal and tradeoffs

The DDL is `01-data-model.sql`. It applies cleanly to Postgres 16; the checks in
`checks/` demonstrate the mastery behaviour and prove the hard constraints are
enforced by the database. Run them before you read the arguments.

---

## 0. Where I deviated from your brief

Reject any of these and the rest still stands. They're listed first so they're
easy to say no to.

| # | Your brief | What I propose | Cost if you're right and I'm wrong |
|---|---|---|---|
| 1 | skills form a tree *within a course* | skills belong to the **subject**; `course_skill` joins them to courses with sequence + emphasis | one join table to drop, `item.skill_id` unaffected — cheap to revert |
| 2 | `choices[]` on the item | `body jsonb` holding the type-specific payload | a column rename + backfill |
| 3 | 4 validation states | added `human_approved` and `retired` | trivial |
| 4 | roster entry owned by a teacher | roster entry owned by a teacher, **`enrollment` joins it to classes** | one table; reverting means merging duplicate students |
| 5 | three set types | one `item_set` + three thin wrappers | moderate |
| 6 | `mastery_estimate` | three numbers: `mastery_estimate`, `mastery_peak`, `confidence` | none, they're additive |
| 7 | `generation_hash` identifies a generated set | `generation_hash` identifies a **pool** you draw from | none |

New tables not in your brief: `lexicon`/`lexeme`, `learner_param`, `item_stat`,
`retention_policy`, `generation_pool`, `validation_result`. Each is argued below.

---

## 1. The atom

`item.body` is jsonb instead of `choices text[]` because `choices` is NULL for
four of six item types, and can't express a matching item's pairs or an ordering
item's elements at all. A `text[]` would force either six nullable columns or a
second table per type — and a second table per type is how you end up with three
content pipelines.

The cost of jsonb is that shape isn't in the column type, so I put it in a CHECK:
`item_body_shape` rejects an MCQ with one choice, a matching item with two pairs,
a cloze with no blanks. That constraint is tested; it fires.

Two fields your brief didn't have, both of which pay for themselves in the
pipeline:

- **`grammar_claim jsonb`** — the generator's own structured statement about what
  it just wrote: `{"lemma":"hablar","tense":"preterite","person":"1s"}`. This is
  checkable. We run the claim through a conjugator and compare to `answer`. For
  the single largest category of Spanish 1-3 items, validation becomes a string
  comparison instead of a second model call. See `02-generation-pipeline.md` §4.
- **`lexemes_used text[]`** — lets us reject a Spanish 1 item that smuggled in a
  Spanish 3 verb, deterministically, against the lexicon.

`render_meta` is the one concession to the three surfaces, and it deliberately
holds only what a renderer cannot infer: how many ruled lines a short answer
wants, whether choices may be shuffled. Everything else — two columns for print
matching, tap-to-pair for practice — is the renderer's business. **One item, three
renderers, no variants.**

## 2. The skill tree (the big deviation)

Your brief nests skills under courses. I'd nest them under the subject and join.

Present-tense `-ar` verbs is taught in Spanish 1 and reviewed in Spanish 2. Under
course-scoped skills that's two skill rows, so: two item banks to generate and
validate, two mastery estimates for the same human ability, and a student moving
Spanish 1 → 2 starts from zero on material they already know. The worksheet you'd
happily use in either course has to exist twice.

So: `skill(subject_id, parent_skill_id, path ltree)` is the canonical tree, and
`course_skill(course_id, skill_id, emphasis, sequence_index)` says which courses
teach it, in what order, as core / review / preview.

This costs one join on nearly every query, and it means "what's in Spanish 2" is a
question you have to ask rather than read off a foreign key. I think that's worth
it. The alternative failure is not recoverable without a data migration that has
to decide what happens to every mastery estimate.

`ltree` + a GiST index gives subtree queries (`path <@ 'grammar.verbs'`) for the
teacher grid's rollups without recursive CTEs. `parent_skill_id` is kept for
integrity; `path` is the query surface. They must be maintained together — a
trigger belongs here in the migration, not in this proposal.

`item.course_id` survives as **provenance** — which course's parameters produced
this item — not as eligibility. Eligibility runs through `course_skill`. This
matters for your own example: the 10th-grade Spanish 2 item and the college
Spanish 2 item are the same row, differing only in the filters applied when
selecting it.

## 3. The generation cache key

`generation_hash = sha256(canonical_json(params))` where params are exactly:

```
subject, course_slug, skill_slug, item_type, difficulty, locale,
constraint set (allowed tenses/persons/lexicon ceiling/register/length),
template name + version, model id, lexicon version
```

and **explicitly exclude `count` and `seed`.**

That exclusion is the whole design. If count is in the key, a teacher asking for
10 items when 8 are cached is a cache miss and you pay to generate 10 more. With
count out of the key, the hash names a **pool**, `generation_pool` tracks its
size, and a request for 10 against a pool of 8 tops up by 2 — or, more usually,
just draws 10 from a pool of 24 because the batch job got there first.

Everything that changes the *meaning* of an item is in the key. `template_version`
and `model_id` are in it because a prompt edit or a model swap produces different
content and must not silently serve the old pool as if it were the new one — it
means a prompt change invalidates nothing already generated (those items are still
good) but starts a fresh pool alongside it.

`content_fingerprint` is a second, independent hash of the normalised item content
with a partial unique index. Two different pools will eventually generate the same
"conjugate *hablar*, preterite, *yo*" item; the fingerprint dedupes the bank so
the same question can't appear twice on one worksheet through two different pools.

The cache is Postgres. The item bank **is** the cache — there is no second store to
keep in sync, and no eviction, because constraint 3 says we never pay twice.

## 4. roster_entry and the optional account

`roster_entry` holds the identity. `account` is optional and hangs off it via
`roster_entry.account_id`, nullable, `ON DELETE SET NULL`. Every progress row —
`attempt`, `skill_state`, `practice_session`, `assignment_target` — references
`roster_entry_id` and **nothing references `account_id`**. Deleting a student's
account deletes a login, not a history. That's the "never the reverse" you asked
for, and it's a FK direction, not a policy document.

Constraint 1's age split is a CHECK:

```sql
CONSTRAINT under_13_has_no_account
  CHECK (age_band <> 'under_13' OR account_id IS NULL)
```

It is tested and it fires. An under-13 roster entry cannot hold an account no
matter what any application code believes.

We never store a date of birth. `age_band` is a two-valued enum the teacher sets,
defaulted from grade level. Collecting a DOB to decide whether we're allowed to
collect data is a trap.

The roster belongs to the **teacher**, and `enrollment` joins roster entries to
classes. One extra table, and it means a student in your Spanish 2 and your
Spanish 3 club is one person with one history. Class-scoped rosters would make
them two, and merging duplicate minors later is a migration nobody wants to write.

## 5. attempt → skill_state, and the mastery estimate

`attempt` is the ledger: append-only, one row per item per part (`part_key` gives
multi-blank cloze per-blank evidence). It snapshots `skill_id` and
`difficulty_at_attempt` at write time so that recalibrating an item's difficulty
later doesn't retroactively rewrite history.

`skill_state` is a **cache**. Not a source of truth. The proof is
`pluma_recompute_skill_state(roster, skill)`, which replays the ledger and
reproduces the row exactly — verified in `checks/mastery_scenarios.sql`. This
property is the reason I'm comfortable proposing a specific formula: if the
formula is wrong, changing it is a backfill, not a data loss.

### Why not a raw percentage

It's wrong in three different ways at once, and a teacher will catch all three
within a week:

1. **3 for 3 reads as 100%.** The most confident cell in the grid is the one with
   the least evidence behind it.
2. **It can't tell apart two students at 7/10** — one who missed three hard items
   and one who missed three easy ones.
3. **March looks like today.** A student who was strong in the spring and hasn't
   touched the skill since still reads "strong".

### Why not IRT

A 2PL model needs a few hundred responses *per item* to estimate discrimination
with any stability. We will have a bank that grows faster than the response data,
because that's what constraint 3 buys us. So most items would carry priors
pretending to be estimates. It's also unexplainable: a teacher asking "why does it
say 0.61?" deserves an answer shorter than a paragraph.

### What I propose

A Beta-Bernoulli posterior over difficulty-weighted evidence, with time decay.

- Prior Beta(1.5, 1.5) — centred at 0.5, worth about three observations. Strong
  enough that one right answer doesn't read as mastery, weak enough to get out of
  the way by attempt ten.
- A correct answer at difficulty *d* adds `credit(d) = clamp(1 + 0.25(d−3), 0.5, 1.5)`
  to α. A miss adds `2 − credit(d)` to β. Hard items count more when you get them
  right; easy items cost more when you get them wrong. Monotone, clamped,
  explainable in one sentence to a teacher.
- `mastery_estimate = α/(α+β)` over a copy of the evidence that **decays with a
  45-day half-life**, so the number answers "what would happen if I asked them
  today", not "what happened in March".
- `confidence = 1 − 4·sd(posterior)`, which is 0.0 at the bare prior by
  construction and rises as evidence accumulates.
- The undecayed α/β are stored alongside, so the formula is revisable.

Measured behaviour, from `checks/`:

| student | record | raw % | mastery | peak | conf | band |
|---|---|---|---|---|---|---|
| A | 7/10, all difficulty 3 | 70% | 0.654 | 0.850 | 0.49 | developing |
| B | 7/10, hits on hard, misses on easy | 70% | 0.667 | 0.889 | 0.57 | developing |
| C | 7/10, hits on easy, misses on hard | 70% | 0.625 | 0.769 | 0.36 | **shaky** |
| D | 3/3 | 100% | 0.750 | — | 0.35 | **insufficient** |
| E | 9/10, but 120 days ago | 90% | **0.638** | 0.875 | 0.19 | **stale** |

Three students at exactly 70% land in two different bands. D, the perfect record,
shows no band at all. E decays out of "developing" on their own and lands in
`stale` — "they knew this in the spring, I have no idea about today" — which is a
true and useful thing to say, and is not the same claim as "no data".

### Two numbers, deliberately

`mastery_estimate` decays. `mastery_peak` never does — it's the max the estimate
ever reached (once there were at least four attempts) and it is the **only**
number a student sees. This is how surface 3's constraint gets honoured
structurally: a student who misses a week of school comes back to a number that
is exactly where they left it, while the teacher's grid still tells the truth
about what needs re-teaching. Decay changes *what gets practised next*, never
*what a student has earned*.

### Honesty rules baked into the band

- fewer than 4 attempts → `insufficient`, never a percentage
- confidence below 0.25 → `stale`, never a percentage
- everything else → secure / developing / shaky / needs-help

A grid that says "I don't know" in the right cells is the thing that makes a
teacher trust the cells where it does make a claim.

### Reading it

All reads go through `skill_state_current`, a view that applies decay to `now()`.
The stored columns are decayed as of `last_seen`; the view is decayed as of today.
Reading the table directly is a bug — it's how I initially had E reading 0.808
four months after their last attempt.

### Upgrade path

When `item_stat.observed_difficulty` has n ≥ 30 on a meaningful slice of the bank,
swap `pluma_difficulty_credit` to use observed difficulty instead of authored
difficulty and run the recompute. That's one function body and a backfill, and
it's most of what IRT would have bought us, earned rather than assumed.

### What practice selection reads

```
priority = 0.55·(1 − mastery_estimate)      -- deficit
         + 0.30·(1 − confidence)            -- expected information gain
         + 0.15·min(1, days_since/60)       -- staleness
```
over skills the class has actually been taught (derivable: the max
`course_skill.sequence_index` across skills that appear in any assignment for that
class — no extra column needed). Then: 8-12 items, at most 3 per skill, at least
two items from a `secure` skill so a session isn't uniformly punishing, and no
item the student has seen in 14 days (7 if they got it wrong).

No streaks, no hearts, no timer. Nothing in this schema can decay a
student-visible number, because the only student-visible number is `mastery_peak`
and it's a running maximum.

## 6. Retention

The policy is a table (`retention_policy`), not a code path, because the 2025
amendments require a *written* policy and a table is a written policy you can
diff. Defaults are in `00-open-questions.md` §F.

Two design points worth arguing:

**Fold before you delete.** The purge job rolls attempts into `item_stat`
(served, correct, time) *before* deleting them. Empirical difficulty is how the
bank calibrates and how the mastery formula eventually improves; it is also not
student data once aggregated across students. Losing it would mean the product
gets dumber every year on schedule.

**Free text has a shorter clock than the rows that hold it.** `context_note` at
120 days and `attempt.response` at 180 days, while the attempt row itself lives
400. A teacher keeps a year-over-year view of *performance* without us keeping a
year of *writing about children*.

## 7. Enforcement

Constraints 1 and 4 are enforced in the database, not in application code:

- under-13 + account → CHECK constraint
- unvalidated, flagged or rejected item entering any rendered set → BEFORE INSERT
  trigger on `item_set_item`, the single chokepoint all three surfaces go through
- items on non-leaf skills → trigger
- malformed MCQ / cloze / matching / ordering payloads → CHECK
- free_response marked auto-gradable → CHECK

I considered enforcing the servable gate with a composite FK to a
`UNIQUE (id, is_servable)` index, which is prettier and needs no trigger. I
rejected it: with that design, flagging an item that's already in an assignment
*fails* rather than withdrawing the item. Getting bad content out fast matters
more than avoiding a trigger.

`checks/constraints.sql` attempts all seven violations and expects seven
`blocked`. It currently gets seven.

Constraint 2 has no database expression — you can't CHECK "this string never
reached an API". The nearest equivalents are architectural, and belong in code
review rather than here: the model client takes a typed params struct and cannot
accept a `roster_entry`, and `generation_safe_param` is the only view the
generation path is allowed to read from the roster side.

## 8. Stack

Agreed: Next.js App Router, TypeScript, Tailwind, Postgres on Railway, PDF via
headless Chromium. Print fidelity over bundle size is the right call for a
document that gets photocopied twice and read from the back row.

Six things I'd change or add:

1. **Chromium does not live in the web service.** A separate Railway service with
   a queue in front of it. Each render is 150-300 MB of RSS; a batch job for the
   library, or a crawler discovering your PDF routes, takes the classroom down
   with it. This is the difference between a bad afternoon and an outage during
   third period.
2. **Nothing renders on demand for anonymous traffic.** Surface 1's PDFs are
   pre-rendered to object storage at publish time, keyed by `render_hash`
   (content-addressed, therefore immutable, therefore `Cache-Control: immutable`
   forever) and served from a CDN. An SEO-indexed free PDF endpoint that renders
   on request is an unmetered bill with a crawler attached.
3. **You need a durable job runner.** Next.js doesn't have one. I'd use pg-boss:
   it's Postgres-backed, so no new infrastructure and jobs commit in the same
   transaction as the data they're about. Queues: `generate`, `validate`,
   `render`, `purge`, `batch`.
4. **SQL-first migrations, not Prisma.** This schema leans on generated columns,
   partial unique indexes, triggers, plpgsql and a view. Prisma's migration
   engine handles those poorly or drops them. Plain `.sql` migrations plus Kysely
   or Drizzle for typed queries keeps the guarantees where I put them.
5. **Hand-written print CSS, self-hosted embedded font.** `@page { size: Letter }`,
   pt units, no webfont fetch (headless Chromium rendering before font load is the
   classic flake and it silently changes line breaks), full Spanish diacritic
   coverage, black text only, no fill below 15% grey, rules ≥ 0.5pt. Acceptance
   test: print it, photocopy the copy, and read it from six feet away.
6. **Backups on day one.** The item bank is the only asset here that costs real
   money to recreate. Railway Postgres backups plus a weekly `pg_dump` of `item`,
   `generation_pool` and `validation_result` to object storage.

## 9. What Phase 0 actually contains

Seed (skills + lexicon) → generator (template + model) → validator → print
renderer → one internal page at `/proof` that takes a skill, difficulty and item
count and emits a worksheet PDF and an answer key PDF. Nothing else. No auth, no
classes, no database of students. The exit criterion is that you can print twenty
of those, take them to a Spanish teacher, and have them find no wrong answer keys.
