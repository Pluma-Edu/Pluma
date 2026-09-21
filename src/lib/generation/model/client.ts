/**
 * The model path.
 *
 * CONSTRAINT 2 LIVES HERE. This module is the only place in the codebase that
 * talks to a third-party model, and its entry point accepts `GenerationParams`
 * and a lemma allow-list — nothing else. There is no parameter of this function
 * that could carry a roster entry, a student name, a class id, or a teacher's
 * note, and `paramsAreClosed` re-checks at runtime that no free text reached it.
 *
 * If you ever find yourself widening this signature, that is the change that
 * needs a conversation, not a review comment.
 */
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { ModelBatch } from './schema.ts';
import { buildGenerationPrompt, PROMPT_TEMPLATE_NAME, PROMPT_TEMPLATE_VERSION } from './prompt.ts';
import { paramsAreClosed, type GenerationParams } from '../params.ts';
import type { GeneratedItem } from '../template/index.ts';

export const DEFAULT_MODEL = 'claude-opus-5';

export class MissingModelCredentials extends Error {
  constructor() {
    super(
      'No model credentials configured. The template generator needs none and is '
      + 'unaffected; set ANTHROPIC_API_KEY to enable the model path.',
    );
    this.name = 'MissingModelCredentials';
  }
}

export class UnsafeGenerationParams extends Error {
  constructor(reason: string) {
    super(`refusing to call the model: ${reason}`);
    this.name = 'UnsafeGenerationParams';
  }
}

export function modelPathAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export type ModelGenerationResult = {
  items: GeneratedItem[];
  usage: { input_tokens: number; output_tokens: number };
  model: string;
};

export async function generateWithModel(
  params: GenerationParams,
  allowedLemmas: string[],
  count: number,
): Promise<ModelGenerationResult> {
  const closed = paramsAreClosed(params);
  if (!closed.ok) throw new UnsafeGenerationParams(closed.reason);
  if (!modelPathAvailable()) throw new MissingModelCredentials();

  const model = params.model_id ?? DEFAULT_MODEL;
  const { system, user } = buildGenerationPrompt(params, allowedLemmas, count);
  const client = new Anthropic();

  const response = await client.messages.parse({
    model,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: (process.env.PLUMA_GENERATION_EFFORT as 'low' | 'medium' | 'high') ?? 'high',
      format: zodOutputFormat(ModelBatch),
    },
    system,
    messages: [{ role: 'user', content: user }],
  });

  // A refusal here would be extraordinary for Spanish worksheet content, so no
  // server-side fallback is configured. If refusals ever show up in
  // generation_run.error, that is the moment to add one.
  if (response.stop_reason === 'refusal') {
    throw new Error(`model declined: ${response.stop_details?.explanation ?? 'no explanation'}`);
  }
  if (!response.parsed_output) {
    throw new Error('model returned no parseable output against the item schema');
  }

  const items: GeneratedItem[] = response.parsed_output.items.map((m) => ({
    skill: params.skill,
    item_type: m.item_type,
    difficulty: params.difficulty,
    stem: m.stem,
    body: m.item_type === 'mcq'
      ? { choices: m.choices }
      : m.item_type === 'cloze'
        ? { blanks: [{ key: '1', hint: m.grammar_claim?.lemma ?? null }] }
        : {},
    answer: m.item_type === 'cloze' ? [m.answer] : m.answer,
    accepted_answers: m.accepted_answers,
    answer_match_mode: 'exact' as const,
    rationale: m.rationale,
    render_meta: { answer_slot: m.item_type === 'mcq' ? 'inline' : 'line' },
    grammar_claim: m.grammar_claim,
    lexemes_used: m.lexemes_used,
    auto_gradable: true,
    // 'model', never 'template': only a computed key earns the skip past L2
    generator_kind: 'model' as const,
  }));

  return {
    items,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
    model,
  };
}

export const MODEL_TEMPLATE = { name: PROMPT_TEMPLATE_NAME, version: PROMPT_TEMPLATE_VERSION };
