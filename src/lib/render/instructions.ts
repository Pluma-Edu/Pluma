/**
 * The directions line, in one place.
 *
 * Both the printed sheet and the on-screen preview call this. If they each had
 * their own copy, the preview would eventually promise something the PDF does
 * not say, and the preview is the only thing a teacher reads before they
 * download and photocopy thirty of them.
 */
export type InstructionInput = {
  item_type: string;
  render_meta?: Record<string, unknown> | null;
  /** Already-extracted tense label, when the caller has it flat. */
  tenseLabel?: string | null;
};

export function instructionsFor(items: InstructionInput[]): string {
  const label = items
    .map((i) => i.tenseLabel ?? (i.render_meta?.tense_label as string | undefined))
    .find(Boolean);
  const type = items[0]?.item_type;

  if (type === 'mcq') {
    return label
      ? `Circle the correct ${label} form of the verb in parentheses.`
      : 'Circle the correct answer.';
  }
  if (type === 'short_answer') return 'Write your answer on the line.';
  return label
    ? `Complete each sentence with the correct ${label} form of the verb in parentheses.`
    : 'Complete each sentence.';
}
