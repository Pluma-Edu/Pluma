import { z } from 'zod';

/**
 * What the model must return. Nothing optional that validation depends on:
 * `rationale` is required because it is rendered in all three surfaces, and
 * `grammar_claim` is required on morphology skills because it is what makes L1
 * validation a string comparison instead of a second model call.
 */
export const ModelChoice = z.object({
  key: z.enum(['a', 'b', 'c', 'd', 'e', 'f']),
  text: z.string().min(1).max(120),
});

export const ModelGrammarClaim = z.object({
  lemma: z.string().min(2).max(24),
  pos: z.string().min(1).max(16),
  mood: z.string().min(1).max(24),
  tense: z.string().min(1).max(32),
  person: z.enum(['1s', '2s', '3s', '1p', '2p', '3p']),
});

export const ModelItem = z.object({
  local_id: z.string().min(1).max(16),
  item_type: z.enum(['mcq', 'cloze', 'short_answer']),
  difficulty: z.number().int().min(1).max(5),
  stem: z.string().min(1).max(600),
  choices: z.array(ModelChoice).max(6),
  answer: z.string().min(1).max(120),
  accepted_answers: z.array(z.string().min(1).max(120)).min(1).max(8),
  rationale: z.string().min(10).max(400),
  lexemes_used: z.array(z.string().min(2).max(24)).max(24),
  grammar_claim: ModelGrammarClaim.nullable(),
});

export const ModelBatch = z.object({
  items: z.array(ModelItem).min(1).max(24),
});

export type ModelItemOut = z.infer<typeof ModelItem>;
export type ModelBatchOut = z.infer<typeof ModelBatch>;
