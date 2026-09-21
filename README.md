# Pluma

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

## Status: Phase 0

Item schema, generator, validator and print renderer, with one page that proves
a worksheet and answer key come out correct. No accounts, no classes, no student
data — none of those tables have a writer yet.

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
src/lib/render/        print CSS, worksheet HTML, Chromium PDF
scripts/               migrate, seed, proof, screenshot
```

## Two things worth knowing before you change anything

**The conjugator refuses rather than guesses.** A verb it isn't certain about
raises `UnsupportedForm` and no item is generated. A wrong answer key in front
of 30 students is the failure this project is built to avoid, so a gap in
coverage is always preferable to a confident wrong form.

**Constraint 2 is a type signature, not a rule.** `src/lib/generation/model/client.ts`
accepts `GenerationParams` and a lemma allow-list. `GenerationParams` contains
no free-text field — every string in it is a slug, a lemma, or a union member,
checked at runtime by `paramsAreClosed` and in CI by `params.test.ts`. There is
no parameter a student's name could travel in. Widening that signature is a
conversation, not a review comment.
