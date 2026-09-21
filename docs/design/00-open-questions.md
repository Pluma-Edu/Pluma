# Open questions before the schema is frozen

Every question has a **Default** — the answer I've already assumed in
`01-data-model.sql` and `02-generation-pipeline.md`. You can reply with just the
numbers you want changed; silence on the rest means "default is fine".

**★** marks the ones where being wrong is a migration, not an edit. If you only
answer eight things, answer the eight ★.

---

## A. Teacher context note → generation parameters

The note is the most dangerous field in the product. It is free text, written by
an adult, about a minor, and it is the one thing that wants to flow into a model
prompt. Constraint 2 says names get scrubbed; I want to go further than that.

**A1 ★ Does the note itself ever reach the generator, even scrubbed?**
My position: no, never, not even scrubbed. A scrubber is a regex or an NER model,
and both fail on "he keeps mixing up Jose and José" or "twin brother is in 4th
period". Betting a COPPA posture on recall is a bad bet.
Instead: at save time we run a **deterministic extractor** over the note against a
closed vocabulary (the course's own skill slugs + ~30 controlled terms for length,
register, reading level, accommodations). It proposes chips. The teacher confirms
or edits them in the UI. **Only confirmed chips reach the generator.** The note
stays in Postgres, visible to its author, and never leaves.
Second reason this is right: free text in a prompt is entropy in the cache key.
Thirty teachers writing thirty sentences about ser/estar produce thirty cache
misses. Thirty teachers confirming the same chip `focus_skill=ser-vs-estar`
produce one generation and twenty-nine hits. Constraint 3 and constraint 2 want
the same design here.
*Default: note never leaves the DB; chips only.*

**A2 ★ Does the note drive item *selection* or item *generation*?**
Selection (pick different existing items from the bank) is free, instant, and
reversible. Generation (write new text for this kid) costs money per student and
produces 30 answer keys a teacher has to manage.
*Default: the note drives selection and difficulty targeting. Generation is
triggered only when the bank can't satisfy the selection, and it's triggered for
the **pool** (skill + type + difficulty + constraints), never for the student.
Nothing we generate is ever student-specific.*

**A3** What does "differentiated" mean to a teacher in practice — different
questions, or the same questions with a different number/difficulty mix? I believe
the printable-classroom reality is that they want one worksheet they can photocopy
plus 2-4 variants for the kids who need them, not 30 uniques.
*Default: per-student differentiation = a different draw from the same bank
(difficulty mix, item count, item types), same skills.*

**A4 ★** Notes will contain clinical, immigration and family information —
"IEP", "ADHD", "newcomer, 6 months in country", "parents divorcing". Do we store
that? Do we let it influence anything?
*Default: we store the note (it's the teacher's own record) with a shorter
retention clock than everything else. The extractor has an explicit **deny list**:
disability, medical, immigration, family status and behavioral terms are never
turned into a chip and never influence generation. Accommodation chips exist but
they affect **rendering only** (font size, line spacing, items per page) and are
never sent to a model.*

**A5** Can a teacher write a note once and apply it to several students, or is it
per-student only? (Affects whether chips live on the roster entry or on a reusable
profile.)
*Default: per roster entry, with a "copy from" affordance in the UI. No shared
profile table in v0.*

**A6** Should the teacher see exactly what the generator received? I want a
"what the AI was told" panel on every generated set — it is the single cheapest
trust-builder in an education product and it costs us one JSON view.
*Default: yes, visible on every assignment.*

**A7** If the extractor can't map a note to anything (e.g. "just a sweet kid"),
is that a silent no-op or does the UI say so?
*Default: UI says "I couldn't turn this into anything the generator uses" and the
note still saves.*

---

## B. How skills get seeded

**B1 ★ Who authors the Spanish 1-3 skill list, and is it frozen before we
generate at scale?**
`skill_id` is NOT NULL on every item and is the primary key of `skill_state`.
Renaming is free; **splitting or merging a skill after you have attempts is the
single most expensive migration in this system** — you have to decide what
happened to every mastery estimate that pointed at the old node.
*Default: one hand-authored, model-assisted, human-reviewed seed file checked into
the repo (`seeds/spanish.skills.yaml`), versioned, diffable, with stable slugs.
Frozen for Spanish 1-3 before Phase 1 ships. Additions after that are fine;
splits/merges go through a written migration with an explicit mastery-remap rule.*

**B2 ★ Granularity.** Is "preterite vs imperfect" one skill or three
(`preterite-regular-forms`, `preterite-irregular-forms`, `aspect-choice`)?
Too coarse and the grid says "verbs: 61%", which helps nobody. Too fine and every
skill has two attempts and no signal.
*Default target: **a skill is something a teacher would spend roughly one class
period on and would name as a gradebook column.** ~60-80 leaf skills per course.
Test: if you can't imagine a 10-item worksheet on it, it's too fine; if you can
imagine three different worksheets that share no answer key logic, it's too
coarse.*

**B3 ★ Do Spanish 1, 2 and 3 share skills?**
Present-tense -ar verbs is taught in Spanish 1 and reviewed in Spanish 2. If skills
are scoped per course, that's two skill rows, two mastery estimates, two item
banks, and a student who moves up loses their history.
*Default (this is a deviation from your brief — see `01-data-model.md` §2): skills
belong to the **subject**, and courses include them through a `course_skill` join
carrying sequence position and emphasis (core / review / preview). The tree is
still a tree; it just isn't nested under a course.*

**B4** Does the tree carry prerequisites, or only containment? Practice selection
would like to know that `ser-vs-estar` precedes `imperfect-vs-preterite-with-ser`.
*Default: containment + `sequence_index` only in v0. A real prerequisite DAG is a
second edge table we can add without touching items; I'd rather earn it with data.*

**B5** Tree depth — is it unit → topic → skill (3 levels), or deeper?
*Default: 3 levels, items attach to leaves only (enforced by trigger), parents are
pure rollups for the teacher grid.*

**B6** Do you want the seed file to carry a **lexicon** too — the controlled
vocabulary per course level? It's the mechanism that stops a Spanish 1 worksheet
from containing `hubiera`. It is also real work (~1,500 lemmas for Spanish 1-3).
*Default: yes, and I think it's the highest-value thing you can pay a Spanish
teacher to produce. The DDL has `lexicon` / `lexeme`; the pipeline uses it as both
a generation constraint and a validation check.*

---

## C. One item across three surfaces

**C1 ★ Do items carry render hints, or is presentation purely the renderer's job?**
Semantically, `matching` is the same object everywhere. Physically, print needs two
lettered columns and a blank; practice needs tap-to-pair. But some things genuinely
belong to the item: how many ruled lines a short answer needs, whether a cloze
blank is a word or a phrase.
*Default: item stores **semantics only**, plus a small `render_meta` jsonb for the
handful of things the renderer cannot infer (`answer_slot: inline|line|lines:3`,
`shuffle_choices: bool`). Three renderers, one item, no variants.*

**C2 ★ Does a printed worksheet ever produce attempts?**
If not, the mastery grid only ever reflects digital work, and a teacher who
photocopies — which is most of them — sees an empty grid and leaves.
*Default: the schema supports `attempt.surface = 'print'` with
`graded_by = 'teacher'`. Whether Phase 1 ships the "enter paper scores" grid is a
product call; it's about a day of UI and I think it's the difference between the
grid being real and being a demo.*

**C3** Can a student see the same item twice — in an assignment, then in practice
three weeks later?
*Default: yes after a cooldown. Never within 14 days; items answered incorrectly
become eligible again after 7. Practice never repeats an item inside one session.*

**C4 ★ Are conjugation drills generated by a model, or by code?**
"Conjugate *hablar*, preterite, *tú*" is a function call, not a creative act. A
deterministic template generator over the lexicon produces tens of thousands of
these at zero marginal cost with a **provably correct** answer key.
*Default: `item.generator_kind` ∈ `template | model | hybrid`. Templates cover
morphology drills; the model is reserved for contextual, semantic and passage
items; hybrid = model writes the sentence, template owns the answer slot. This is
one pipeline with a pluggable front half — not a second generator. If it starts
looking like a second generator I'll stop and tell you.*

**C5** `free_response` can't be auto-graded and constraint 2 forbids sending
student text to a model. So it's teacher-graded or ungraded.
*Default: allowed in worksheets and assignments, **excluded from practice**,
never counts toward mastery unless a teacher scores it.*

**C6** Should `ordering` and `matching` be in v0 at all? They're the two types
where "is the answer key uniquely correct?" is hardest to validate and where print
and practice diverge most.
*Default: yes but gated — they ship only once their validators pass a manual audit
of 100 items. If they don't, we cut them and lose nothing.*

---

## D. Identity, roster, access

**D1 ★ What is the unit a teacher's roster hangs off — the class or the teacher?**
If a kid takes both your Spanish 2 and your Spanish 3 club, is that one person or
two rows?
*Default: `roster_entry` belongs to the **teacher**; `enrollment` joins it to
classes. One person, one mastery history, multiple classes. Costs one table,
prevents the worst migration.*

**D2 ★ Is there anything between "knows the class code" and "is in the gradebook"?**
A class code on a whiteboard is a bearer token. Anyone who photographs it can list
the first names of a room full of minors and can submit work as any of them.
*Default: (a) the name picker requires the class code **and** shows first name +
last initial only; (b) optional 4-digit teacher-set PIN per student, off by
default, one click to require for the whole class; (c) codes are rotatable and
auto-expire at `term_ends_on`; (d) rate limiting + no enumeration of codes.
Tell me if PIN-off-by-default is too loose for you — I can flip it.*

**D3** Do we ever collect a date of birth? I don't want to.
*Default: no DOB, ever. The teacher sets an `age_band` (`under_13` / `13_plus`)
per roster entry, defaulted from grade level. A CHECK constraint makes it
**structurally impossible** for an `under_13` entry to hold an account.*

**D4** Co-teachers, substitutes, student teachers — in scope for v0?
*Default: no. One owning teacher per class. `class.teacher_account_id` is a plain
FK; making it a membership table later is cheap because nothing else references it.*

**D5** August. What happens at rollover — classes archive, rosters carry, or
everything purges?
*Default: class archives on `term_ends_on`; roster entries survive so a teacher can
re-enroll the same kid next year; student-linked **attempt** data is on the
retention clock in F1.*

---

## E. Grading, retakes, exposure

**E1** One attempt per item per assignment, or unlimited until submit?
*Default: answers are editable until submit; we record one `attempt` row per item
at submit, plus intermediate rows only if you want the keystroke-level data (I'd
skip it). Retakes are per-assignment opt-in and create new attempts.*

**E2 ★ When does a student see the rationale?**
*Default: practice = immediately, always (that's the whole point of surface 3).
Assignment = teacher setting, default `after_submit`, options `never` / `after_due`.*

**E3 ★ Accent handling in auto-grading.** `hablo` and `habló` are different
answers. Accent-insensitive matching would mark a wrong conjugation correct, which
is worse than useless in a Spanish product — but marking a kid wrong because their
Chromebook has no dead keys is also bad.
*Default: per-item `answer_match_mode`. Accents are **significant** wherever they
carry the grammar (any verb-form skill); elsewhere accent-insensitive.
Plus an on-screen accent palette so the keyboard excuse disappears. And when an
answer is right-but-for-accents we mark it incorrect and say exactly that in the
feedback rather than silently failing them.*

**E4** Partial credit on multi-blank cloze and matching?
*Default: yes, per-blank, and each blank is its own `attempt` row so mastery gets
blank-level evidence. (This is why `attempt` keys on item + a `part_key`.)*

---

## F. Retention and deletion

**F1 ★ The actual numbers.** The 2025 amendments say "no longer than reasonably
necessary" and require a written policy; they don't give you a number. So we pick
one and defend it.
*Default:*
| data | clock | TTL |
|---|---|---|
| `attempt` (student-linked) | `created_at` | 400 days |
| `skill_state` | derived | purged with the roster entry |
| `roster_entry` | `class.term_ends_on` of last active enrollment | 400 days |
| `context_note` + free-text chips | same | **120 days** |
| `attempt.response` free text | `created_at` | **180 days** (the row survives, the text doesn't) |
| teacher account | `last_seen_at` | 3 years, with warning emails |
*400 days is deliberate: it lets a teacher see "this class vs last year's class at
the same point" exactly once, and no more.*

**F2 ★ Item statistics must outlive student data.** Empirical difficulty is how we
calibrate the bank, and it isn't student data once aggregated.
*Default: the purge job **folds before it deletes** — attempts roll into
`item_stat` (served, correct, median time) and then the student-linked rows go.
Aggregates carry no roster reference and are never purged.*

**F3** Parent deletion requests come through the teacher or directly?
*Default: through the teacher (we have no parent relationship and shouldn't).
`deletion_request` row → soft delete immediately → hard purge at +7 days, so an
accidental delete is recoverable and a real one completes fast.*

---

## G. Scope and cost

**G1** What's the monthly ceiling on generation spend? It sets batch sizes for the
Surface 1 library and the per-teacher rate limit.
*Default assumption: low three figures/month during Phase 0-1. Tell me if it's
lower; it changes how aggressively templates replace model calls.*

**G2 ★ How many worksheets per skill in the library?** The instinct is "generate
thousands of pages, rank for everything". That's a thin-content penalty and
Google has gotten good at spotting doorway pages. K5 Learning ranks with a
handful of genuinely distinct sheets per topic.
*Default: 3-8 per skill, each differing in a way a human would notice (difficulty
band, item mix, theme), hand-spot-checked before publish. The library is a
**curated** byproduct of the generator, not a dump of it.*

**G3** Duolingo for Schools gives teachers a roster export. A CSV importer that
takes their export and produces a Pluma class is the cheapest acquisition lever
you will ever have, and it is not an "LMS integration" — no OAuth, no API, no
partnership. In or out?
*Default: out until you say otherwise, per your scope list. But I think it's worth
a day in Phase 1 and I'd like a yes/no.*

**G4** Am I right that nothing in v0 needs an email sent to a student, ever?
*Default: yes. Students never receive email. Teachers get transactional mail only
(verify, password reset, purge warnings).*
