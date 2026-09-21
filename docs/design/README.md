# StudyBien design docs

Read in order. Nothing here is application code; nothing is scaffolded yet.

| file | what it is |
|---|---|
| `00-open-questions.md` | ~35 questions, each with the default I've already assumed. ★ marks the ones where being wrong is a migration rather than an edit. |
| `01-data-model.md` | The proposal in prose: deviations from the brief, and the tradeoffs on the skill tree, the cache key, the roster/account split, the attempt→skill_state relationship, and the mastery estimate. |
| `01-data-model.sql` | The full DDL. Applies clean to Postgres 16. |
| `02-generation-pipeline.md` | Inputs, structured output schema, validation per item_type, failure handling, and where the cache sits. |
| `checks/` | Scripts that demonstrate the mastery behaviour and prove the hard constraints are enforced by the database. |

Status: awaiting approval on all three before any application code is written.
