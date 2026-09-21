import { randomInt } from 'node:crypto';

/**
 * Class codes are read off a whiteboard and typed by eleven-year-olds, so the
 * alphabet drops every character pair that gets confused in handwriting:
 * no I/1/L, no O/0, no U/V.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTWXYZ23456789';

export function generateClassCode(length = 6): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/** Accepts what a student actually types: lowercase, spaces, dashes. */
export function normaliseClassCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}
