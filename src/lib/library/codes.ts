/**
 * Human-quotable skill codes: SP2-U03-02.
 *
 * Derived from where the skill sits in its course, so it is stable as long as
 * the seed file is — which is the same guarantee the skill slug carries.
 * Teachers paste these into lesson plans and ask each other for them.
 */
export function skillCode(
  courseSlug: string, unitLabel: string | null, sequenceIndex: number,
): string {
  const course = courseSlug
    .replace(/[^a-z0-9]/gi, '')
    .replace(/^([a-z]{2})[a-z]*?(\d+)$/i, '$1$2')
    .toUpperCase();
  const unit = unitLabel?.match(/(\d+)/)?.[1];
  const parts = [course];
  if (unit) parts.push(`U${unit.padStart(2, '0')}`);
  parts.push(String(sequenceIndex).padStart(2, '0'));
  return parts.join('-');
}

/**
 * Pages in a Chromium-rendered PDF. Counted from the page objects rather than
 * guessed from item count.
 */
export function pdfPageCount(pdf: Buffer): number {
  const text = pdf.toString('latin1');
  const matches = text.match(/\/Type\s*\/Page[^s]/g);
  return matches ? matches.length : 1;
}

/**
 * Rough but honest, and deliberately not optimistic: a teacher plans a lesson
 * around this number, and a worksheet that runs long is worse than one that
 * runs short. About 45 seconds an item, with a ten-minute floor — a two-page
 * sheet is never a five-minute task no matter how few items are on it.
 */
export function estimatedMinutes(itemCount: number, itemType: string): number {
  const perItem = itemType === 'mcq' ? 0.6 : 0.75;
  return Math.max(10, Math.round((itemCount * perItem) / 5) * 5);
}
