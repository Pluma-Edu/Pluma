# Generation pipeline

One pipeline. Two front halves (deterministic templates and the model) feeding a
single validator, a single bank, and three renderers. If a second content
pipeline ever starts to appear, that's the signal to stop.

```
request ─┬─▶ pool lookup (generation_hash) ──── hit ────────────────────┐
         │         │ miss / short                                       │
         │         ▼                                                    │
         │   generator_kind?                                            │
         │     template ──▶ deterministic expansion over lexicon ──┐    │
         │     model ─────▶ prompt(version) ──▶ structured output ──┤    │
         │     hybrid ────▶ model writes carrier, template owns key ┘    │
         │                          ▼                                   │
         │              L0 structural ─▶ L1 linguistic ─▶ dedupe         │
         │                          ▼                                   │
         │              L2 independent re-solve (semantic)               │
         │                          ▼                                   │
         │              persist + validation_state + pool counters       │
         │                          ▼                                   │
         └───────────────────▶  draw N from pool  ◀─────────────────────┘
                                    │
                        ┌───────────┼───────────┐
                        ▼           ▼           ▼
                     print     assignment    practice
```

---

## 1. Exact inputs

```ts
type GenerationParams = {
  subject:     'spanish'
  course:      'spanish-1' | 'spanish-2' | 'spanish-3'
  skill:       SkillSlug          // stable, from the seed file
  item_type:   'mcq' | 'cloze' | 'short_answer' | 'matching' | 'ordering' | 'free_response'
  difficulty:  1 | 2 | 3 | 4 | 5
  content_locale: 'es'
  ui_locale:      'en'
  constraints: {
    lexicon_version:  number
    lexicon_ceiling:  1 | 2 | 3   // no lemma first introduced above this course
    allowed_moods?:   Mood[]      // enum
    allowed_tenses?:  Tense[]     // enum
    allowed_persons?: Person[]    // enum
    forbidden_lemmas?: Lemma[]    // drawn from the lexicon, not free text
    register:         'neutral' | 'formal' | 'informal'
    theme?:           Theme       // enum: school|food|travel|family|sports|city|...
    stem_max_chars:   number
    passage_max_chars?: number
  }
  template:  { name: string; version: number }
  model_id:  string
}
```

**`GenerationParams` contains no free-text field.** Every string in it is drawn
from a closed set: a skill slug, a lemma from the lexicon, or an enum member.
That's not a style preference, it's the enforcement mechanism for constraint 2 —
and because it's a closed set, it's testable. There should be a test that
enumerates the type and fails on any unconstrained `string`.

### What is structurally incapable of reaching this struct

Student names, roster entry ids, class ids, class codes, account ids, teacher
emails, `roster_entry.context_note`, `item_flag.note`, and any student response
text. The model client takes `GenerationParams` and nothing else — it has no
parameter that could carry them.

The teacher's note influences generation only by **choosing which pool to draw
from**: a confirmed `focus_skill=ser-vs-estar` chip changes `skill`; a
`passage_length=short` chip changes `stem_max_chars`; a `difficulty_offset=-1`
chip changes `difficulty`. The chip's *value* is an enum or a slug. The note's
*text* never becomes part of a prompt in any form, scrubbed or otherwise, because
a scrubber is a recall problem and this doesn't have to be.

### Hashed vs not

`generation_hash = sha256(canonicalJSON(GenerationParams))` — sorted keys,
normalised numbers, no whitespace. `count`, `seed`, `requested_by` and timestamps
are **not** in the struct and therefore not in the hash. See
`01-data-model.md` §3 for why count's exclusion is the whole design.

## 2. Structured output

Requested via the model's structured-output mode against this schema, not parsed
out of prose.

```jsonc
{
  "type": "object",
  "required": ["items"],
  "additionalProperties": false,
  "properties": {
    "items": {
      "type": "array", "minItems": 1, "maxItems": 24,
      "items": {
        "type": "object",
        "required": ["local_id","item_type","difficulty","stem","body",
                     "answer","accepted_answers","rationale","lexemes_used"],
        "additionalProperties": false,
        "properties": {
          "local_id":   {"type":"string"},
          "item_type":  {"enum":["mcq","cloze","short_answer","matching","ordering","free_response"]},
          "difficulty": {"type":"integer","minimum":1,"maximum":5},
          "stem":       {"type":"string","minLength":1,"maxLength":600},
          "body":       {"type":"object"},          // shape checked per type at L0
          "answer":     {},                          // string | string[] | pairs
          "accepted_answers": {"type":"array","items":{"type":"string"}},
          "rationale":  {"type":"string","minLength":10,"maxLength":400},
          "lexemes_used": {"type":"array","items":{"type":"string"}},
          "grammar_claim": {
            "type":"object",
            "properties":{
              "lemma":{"type":"string"}, "pos":{"type":"string"},
              "mood":{"type":"string"},  "tense":{"type":"string"},
              "person":{"type":"string"},"number":{"type":"string"},
              "gender":{"type":"string"}
            }
          }
        }
      }
    }
  }
}
```

`grammar_claim` is the load-bearing field and it is required for every item on a
morphology or agreement skill. It makes the model state, in structured form, the
rule it believes it just applied. That claim is machine-checkable against a
conjugator, which turns semantic validation into string comparison for the
largest single category of Spanish 1-3 content. A model that writes a wrong
answer key *and* a grammar claim consistent with that wrong key is a much rarer
failure than a model that just writes a wrong answer key.

`rationale` is required at generation time, not bolted on later, because it's
rendered in all three surfaces and because a model that can't justify its answer
usually got it wrong.

## 3. Templates: the front half that isn't a model

"Conjugate *hablar*, preterite, *tú*" is a function call. A deterministic
generator over the lexicon produces every regular and irregular form in Spanish
1-3 at zero marginal cost, with an answer key that is correct by construction and
needs no semantic validation at all.

`generator_kind`:
- **`template`** — morphology and agreement drills. Code + lexicon. Provably correct.
- **`model`** — contextual, semantic, inferential, passage-based items.
- **`hybrid`** — the model writes a natural carrier sentence with a marked slot;
  the template owns what goes in the slot and therefore owns the answer key.

Hybrid is the interesting one: it gets you cloze items that read like Spanish
rather than like a drill, while the thing that can be *wrong* is still computed.

This is one pipeline with a pluggable generator, not two pipelines: templates and
the model emit the same item shape, go through the same validator, land in the
same bank, and are drawn by the same selector. The only asymmetry is that
template items skip L2.

## 4. Validation

Four layers, cheapest first, each short-circuiting.

### L0 — structural (deterministic, free, all types)

Required fields; length bounds; the `item_body_shape` CHECK from the DDL;
character-set check (Latin-1 + Spanish punctuation only — catches mojibake and
smart-quote contamination that would wreck the PDF); no markdown or HTML; stem
does not contain the answer string; rationale is not a restatement of the answer;
`accepted_answers` contains the canonical answer; no "Answer:" / "Respuesta:"
prefixes; MCQ choices pairwise distinct after normalisation.

### L1 — linguistic (deterministic, free, Spanish-specific)

This is the layer that makes Spanish the right v0 subject.

- **Conjugation check.** Compute `conjugate(grammar_claim)` and compare to the
  answer. Mismatch → reject, no model call needed.
- **Lexicon ceiling.** Tokenise the stem and lemmatise it — do **not** trust
  `lexemes_used`, verify it — and reject any lemma first introduced above
  `lexicon_ceiling`. This is what stops a Spanish 1 worksheet containing
  *hubiera*.
- **Agreement check.** Gender and number against the lexicon.
- **Diacritics.** The answer carries the accents the form requires. `hablo` and
  `habló` are different answers and the validator must know it.
- **MCQ distractor quality.** Each distractor must be (a) a real Spanish form,
  (b) wrong for this stem, and (c) not *also* correct under a different reading.
  A distractor that is accidentally a second right answer is the most common way
  a generated MCQ is broken, and it's the one a quick human skim misses.

### L2 — semantic (one model call, independent)

A **separate** call with a different prompt that sees only the item, never the
generation params, never the answer key, and is asked to answer it cold.

| type | procedure | pass condition |
|---|---|---|
| `mcq` | solve once | picks the key |
| `cloze` | solve 3×, majority | majority matches an accepted answer per blank |
| `short_answer` | solve 3× | all three in `accepted_answers` after normalisation; if 2/3 agree on something *not* in the list, that's an **incomplete key**, not a wrong item — route to key expansion, not rejection |
| `matching` | solve once + ask for an alternative valid pairing | solves correctly, produces no valid alternative |
| `ordering` | solve once + ask for an alternative valid order | solves correctly, produces no valid alternative that also passes L1 |
| `free_response` | not solved | prompt is answerable at level, rubric present, reading level in band |
| template-generated | skipped entirely | — |

The ordering and matching alternatives probe is there because "is this answer key
*uniquely* correct?" is a different question from "is this answer key correct?",
and for those two types it's the question that actually bites.

### L3 — human

New pools are `gated`: their items go to a review queue and cannot serve. After a
sample (I'd start at 30 items) passes with ≥95% human agreement, the pool moves to
`trusted` and later items from **the same parameters** may auto-validate. Any
confirmed teacher flag on a trusted pool moves it to `revoked` and re-gates it.

Trust is earned per parameter set, not granted globally. It also gives you a
number to watch: pools that never reach `trusted` are telling you which skills the
model can't do, which is exactly the list of templates worth writing.

Teachers can flag from any of the three surfaces. `flag_count` above threshold
pulls the item immediately (`flagged` → `is_servable` false → the trigger stops it
entering new sets; a separate job swaps it out of open assignments).

## 5. On failure

| classification | action | model calls spent |
|---|---|---|
| structural | one repair attempt, with the exact failing check named | 1 |
| linguistic | one repair attempt, with the expected form supplied | 1 |
| semantic | → `flagged`, human queue. The solver can be wrong too | 0 |
| duplicate fingerprint | drop silently, count it | 0 |
| policy / inappropriate | → `rejected`, no repair, flag the template for review | 0 |

**Items are immutable.** A repair creates a new row and sets
`superseded_by_item_id` on the original; the original stays as `rejected`. Nothing
is deleted — rejects are the only honest data you have about what your prompts do
wrong, and keeping them stops you paying to regenerate the same bad item next
week.

**Never loop.** One repair attempt, ever. Then the pool-level circuit breaker: if
yield drops below 50% over three runs, `generation_disabled = true` and alert.
A disabled pool is not an incident, it's a work item — it means that skill wants a
template generator.

## 6. Where the cache sits

Postgres. The item bank **is** the cache; `generation_pool` is its index.

- Request for N items → `SELECT ... WHERE generation_hash = $1 AND is_servable`.
- Enough → serve, zero cost, no model involved.
- Short → enqueue a top-up for the deficit, and generate to `target_size` (24),
  not to the deficit. The marginal cost of 24 items in one call is far below two
  calls of 12, and it front-loads every future request against that pool.
- Live generation is authenticated and rate-limited per teacher. Anonymous
  traffic can never trigger a model call — surface 1 reads pre-rendered PDFs from
  object storage and nothing else.

There is no Redis. There is no second store to invalidate. A prompt edit bumps
`template_version`, which changes the hash, which starts a *new* pool alongside
the old one — the old items stay good and stay served until the new pool fills.

### The size of the whole thing

Spanish 1-3 at ~70 leaf skills per course ≈ 200 skills. Times ~4 viable item
types, times 3 difficulty bands ≈ **2,400 pools**. At one call per pool to reach
24 items, the entire Spanish 1-3 bank is roughly **2,400 model calls, once** —
call it 50k items. Templates remove a large fraction of those calls outright.

That number is the point of constraint 3. It's a fixed, one-time, four-figure
token bill for a bank that then serves every teacher forever at zero marginal
cost. The thing that kills a free education product is paying per-teacher,
per-use — so we don't.

## 7. Batch mode (Surface 1)

A nightly job walks `course_skill × item_type × difficulty`, tops up pools below
target, then composes worksheets from them: 3-8 per skill, each differing in a way
a human would actually notice (difficulty band, item mix, theme), rendered to
object storage, published as static pages.

Not 500 near-identical sheets per skill. Thin, templated, near-duplicate pages at
scale is a doorway-page pattern, and the whole acquisition strategy depends on
ranking. The library is a **curated** byproduct of the generator, with a human
spot-check before publish.

## 8. Difficulty, honestly

The model self-labels difficulty and it will be mediocre at it. So authored
difficulty is a **prior**, and `item_stat.observed_difficulty` (empirical p-value
once n ≥ 30) is the correction. The mastery formula reads
`attempt.difficulty_at_attempt`, snapshotted at write time, so recalibrating an
item never rewrites a student's history.

## 9. Known risks I don't have a full answer for

1. **Ordering and matching uniqueness.** The alternatives probe is a heuristic. If
   it doesn't hold up on a manual audit of 100 items, cut both types from v0 —
   MCQ, cloze and short answer cover the pedagogy.
2. **Lemmatising Spanish well enough to enforce the lexicon ceiling.** Off-the-shelf
   Spanish lemmatisers are decent but not perfect on clitics and compound forms.
   Under-enforcement means occasional off-level vocabulary; over-enforcement means
   rejecting good items. I'd tune toward under-enforcement and let teacher flags
   catch the rest.
3. **The independent solver shares the generator's blind spots.** It's a different
   prompt, not a different mind. Using a different model for L2 than for
   generation would help and costs nothing architecturally — worth doing if the
   audit shows correlated failures.
4. **Free-response is a dead end without a consent path.** The schema supports it,
   teachers can grade it, and it never counts toward mastery automatically. I'd
   ship it in worksheets and assignments and keep it out of practice entirely
   until you decide whether AI grading is a path you want to open.
