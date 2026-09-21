# CanLingo

Free worksheets, assignments and practice for teachers, over one item bank.

Three surfaces render the same atom. There is one generation pipeline, one
validator, one bank. If a second content pipeline starts to appear, that's the
signal to stop.

Design docs — read these before the code:

| doc | what it covers |
|---|---|
| [`docs/design/00-open-questions.md`](docs/design/00-open-questions.md) | open questions, each with the default the code currently assumes |
| [`docs/design/01-data-model.md`](docs/design/01-data-model.md) | the tradeoffs: skill tree, cache key, roster/account split, mastery |
| [`docs/design/01-data-model.sql`](docs/design/01-data-model.sql) | the schema, mirrored into `migrations/0001_init.sql` |
| [`docs/design/02-generation-pipeline.md`](docs/design/02-generation-pipeline.md) | inputs, output schema, validation layers, failure handling |

## Status: Phase 2

Surfaces 1 and 2 are live for Spanish 1-3.

**Surface 2, the classroom.** A teacher signs up, makes a class, adds students
with notes, assigns differentiated work; students join with a class code and no
account; work is auto-graded and the per-skill mastery grid fills in.

**Surface 1, the library.** 45 statically generated, SEO-indexed worksheet
pages at `/worksheets/{subject}/{course}/{skill}/{slug}`, each with a preview,
a free ungated PDF, related sheets, and an answer key behind a free teacher
account. Its content is a byproduct of the same generator surface 2 uses —
there is no second content pipeline.

Not built yet: practice (surface 3), and everything in the brief's
out-of-scope list.

## Setup

```sh
npm install
cp .env.example .env          # point DATABASE_URL at a Postgres 15+
npm run db:migrate
npm run db:seed               # skills, course mappings, lexicon
npm test                      # 78 tests, no database needed
npm run dev                   # then open /proof
```

`CHROMIUM_PATH` must point at a Chromium binary for PDF rendering.

## Proving it works

```sh
npm run proof            # Phase 0: worksheet + answer key, keys re-derived
npm run e2e:classroom    # Phase 1: the whole classroom loop, with assertions
npm run library:build    # Phase 2: batch-build the library, idempotent
npm run library:gaps     # which skill/variant pairs cannot be filled, and why
```

With the app running, `scripts/library-gate-check.ts <email> <password>` checks
constraint 6 in both directions: the worksheet is free, the answer key is not
reachable anonymously by any URL and is not in public storage at all, a
signed-in teacher gets it, and the unlock is recorded exactly once.

`e2e:classroom` signs a teacher up, builds a class, adds five students with real
notes, confirms chips, assigns work, answers it as each student, and reads the
grid — asserting along the way that differentiation produced a different draw,
that a note never became a parameter it shouldn't, that a student's payload
carries no answers, and that the database itself refuses an account for an
under-13 roster entry.

## Producing a worksheet from the command line

```sh
npm run proof -- --skill preterite-irregular --type mcq --difficulty 4 --count 10
```

Runs the real pipeline, writes `out/<skill>.pdf` and `out/<skill>-key.pdf`, and
then **recomputes every answer key that landed on the page** from the conjugator
as an independent check. It exits non-zero if any key is wrong.

## Layout

```
migrations/            SQL-first, applied in filename order, once each
src/lib/db/            pool + tx helpers
src/lib/taxonomy/      the versioned skill tree and lexicon seed
src/lib/generation/
  params.ts            GenerationParams + the canonical pool hash
  pool.ts              cache lookup, top-up, draw
  template/            conjugator + deterministic item generation
  model/               the ONLY module that talks to a model
src/lib/validation/    L0 structural + L1 linguistic
src/lib/roster/        the context-note extractor (closed output vocabulary)
src/lib/grading/       accent-aware auto-grading with near-miss diagnosis
src/lib/classroom/     classes, roster, assignments, student flow, mastery
src/lib/library/       public worksheet variants and queries
src/lib/storage/       public (free PDFs) and private (answer keys) stores
src/lib/auth/          teacher sessions; students never get one
src/lib/render/        print CSS, worksheet HTML, Chromium PDF
scripts/               migrate, seed, proof, screenshot
```

## Two things worth knowing before you change anything

**The conjugator refuses rather than guesses.** A verb it isn't certain about
raises `UnsupportedForm` and no item is generated. A wrong answer key in front
of 30 students is the failure this project is built to avoid, so a gap in
coverage is always preferable to a confident wrong form.

**The context note never leaves the database.** It is not scrubbed and
forwarded — it is read against a closed vocabulary and turned into chips the
teacher confirms. A scrubber is a recall problem; a closed output vocabulary is
not, because a student's name cannot be a member of it. Clinical, immigration
and family terms are never turned into chips at all, and the teacher is told
they were ignored.

**Nothing renders on demand for anonymous traffic.** Library PDFs are
rendered once at batch time, content-addressed, and served by the static
handler. An SEO-indexed PDF endpoint that renders per request is an unmetered
bill with a crawler attached. Answer keys live outside `public/` entirely, so
the gate is not something you could walk around by guessing a URL.

**Constraint 2 is a type signature, not a rule.** `src/lib/generation/model/client.ts`
accepts `GenerationParams` and a lemma allow-list. `GenerationParams` contains
no free-text field — every string in it is a slug, a lemma, or a union member,
checked at runtime by `paramsAreClosed` and in CI by `params.test.ts`. There is
no parameter a student's name could travel in. Widening that signature is a
conversation, not a review comment.
