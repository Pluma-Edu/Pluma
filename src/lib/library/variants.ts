/**
 * What a skill's worksheets are.
 *
 * Five per skill, each differing in a way a teacher would notice: the item
 * format or the difficulty band. Not fifty near-identical sheets — thin,
 * templated, near-duplicate pages at scale is a doorway-page pattern, and the
 * entire acquisition strategy depends on ranking. The library is a curated
 * byproduct of the generator, not a dump of it.
 */
import type { Difficulty, ItemType } from '../generation/params.ts';

export type Variant = {
  /** URL suffix. Chosen to read like something a teacher would search for. */
  slugSuffix: string;
  titleSuffix: string;
  itemType: ItemType;
  difficulty: Difficulty;
  count: number;
  blurb: string;
};

export const VARIANTS: Variant[] = [
  {
    slugSuffix: 'worksheet', titleSuffix: 'Worksheet',
    itemType: 'cloze', difficulty: 3, count: 20,
    blurb: 'Twenty fill-in-the-blank items at core level.',
  },
  {
    slugSuffix: 'multiple-choice', titleSuffix: 'Multiple Choice Worksheet',
    itemType: 'mcq', difficulty: 3, count: 16,
    blurb: 'Sixteen multiple-choice items, four options each.',
  },
  {
    slugSuffix: 'practice-easier', titleSuffix: 'Practice (Easier)',
    itemType: 'cloze', difficulty: 2, count: 16,
    blurb: 'Regular forms and the most common verbs only.',
  },
  {
    slugSuffix: 'practice-harder', titleSuffix: 'Practice (Harder)',
    itemType: 'cloze', difficulty: 4, count: 20,
    blurb: 'Irregulars and the less common persons.',
  },
  {
    slugSuffix: 'quiz', titleSuffix: 'Quiz',
    itemType: 'mcq', difficulty: 4, count: 12,
    blurb: 'A short twelve-item check, harder end.',
  },
];

/**
 * Titles are written for what a teacher types into a search box: the topic
 * first, then the format, then the course. `publicName` comes from
 * SKILL_SEO_NAME, not from the gradebook-shaped skill name.
 */
export function worksheetTitle(publicName: string, courseName: string, v: Variant): string {
  return `${publicName} — ${v.titleSuffix} (${courseName})`;
}

export function metaDescription(publicName: string, courseName: string, v: Variant): string {
  return `Free printable ${courseName} worksheet: ${publicName.toLowerCase()}. `
    + `${v.blurb} Download the PDF with no account. Answer key free for teachers.`;
}
