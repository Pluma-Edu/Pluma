/**
 * The performance scale, from the Pluma Foundations design file.
 *
 * Each band carries its meaning three times over — lightness, glyph, number —
 * so the grid reads for someone with any dichromacy, on a projector at the back
 * of a room, and after a black-and-white photocopy. Never render a band by
 * colour alone; always emit the glyph too.
 */
import type { Band } from '../classroom/mastery.ts';

export type BandStyle = {
  /** Tailwind classes for the cell. */
  className: string;
  /** Carries the meaning when colour cannot. */
  glyph: string;
  label: string;
  /** Shown to a teacher on hover. */
  hint: string;
};

export const BAND_STYLE: Record<Band, BandStyle> = {
  secure: {
    className: 'bg-perf-4-bg text-perf-4-fg',
    glyph: '●', label: 'Secure',
    hint: 'Consistently right, recently enough to believe it.',
  },
  developing: {
    className: 'bg-perf-3-bg text-perf-3-fg',
    glyph: '◕', label: 'Developing',
    hint: 'Mostly right, not yet solid.',
  },
  shaky: {
    className: 'bg-perf-2-bg text-perf-2-fg',
    glyph: '◑', label: 'Shaky',
    hint: 'Getting there on the easy cases only.',
  },
  needs_help: {
    className: 'bg-perf-1-bg text-perf-1-fg border-l-[6px] border-tangerine-bright',
    glyph: '○', label: 'Needs help',
    hint: 'Worth re-teaching before the next assessment.',
  },
  stale: {
    className: 'perf-stale',
    glyph: '?', label: 'Needs a fresh check',
    hint: 'They knew this once. The evidence is old enough that it is worth asking again.',
  },
  insufficient: {
    className: 'perf-none',
    glyph: '–', label: 'Not enough yet',
    hint: 'Fewer than four attempts. Not a score, and not a zero.',
  },
};

/** The reading order for a legend: best to worst, then the two non-scores. */
export const BAND_ORDER: Band[] = [
  'secure', 'developing', 'shaky', 'needs_help', 'stale', 'insufficient',
];
