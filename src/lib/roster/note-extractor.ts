/**
 * Turning a teacher's free-text note into generation parameters.
 *
 * The note itself NEVER leaves this database. It is not scrubbed and forwarded;
 * it is read here, against a closed vocabulary, and what comes out is a list of
 * chips whose values are slugs and enum members. The teacher confirms those
 * chips, and only confirmed chips reach the generator.
 *
 * Two reasons, and they point the same way:
 *
 *   A scrubber is a recall problem. "he keeps mixing up Jose and José" defeats
 *   a name list; "her twin is in 4th period" defeats an NER model. A closed
 *   output vocabulary has no recall problem — a name cannot be a member of it.
 *
 *   Free text in a prompt is entropy in the cache key. Thirty teachers writing
 *   thirty sentences about ser/estar is thirty cache misses. Thirty teachers
 *   confirming focus_skill=ser-vs-estar is one generation and twenty-nine hits.
 */
import { SKILL_SYNONYMS } from '../taxonomy/seed-spanish.ts';

export type ChipKey =
  | 'focus_skill' | 'avoid_skill' | 'difficulty_offset' | 'passage_length'
  | 'reading_level' | 'register' | 'item_type_pref' | 'max_items' | 'render_accommodation';

export type Chip = { key: ChipKey; value: string; matched: string };

export type ExtractionResult = {
  chips: Chip[];
  /** Phrases we deliberately refused to act on, so the UI can say so. */
  suppressed: string[];
};

/** The complete set of values any chip may hold. Nothing else can be emitted. */
export const CLOSED_VALUES: Record<ChipKey, readonly string[]> = {
  focus_skill: Object.keys(SKILL_SYNONYMS),
  avoid_skill: Object.keys(SKILL_SYNONYMS),
  difficulty_offset: ['-1', '+1'],
  passage_length: ['short', 'medium', 'long'],
  reading_level: ['below', 'at', 'above'],
  register: ['neutral', 'formal', 'informal'],
  item_type_pref: ['mcq', 'cloze', 'short_answer'],
  max_items: ['8', '12', '20'],
  render_accommodation: ['large_print', 'extra_space', 'fewer_per_page'],
};

/**
 * Terms we will not turn into a generation parameter under any circumstances.
 *
 * These are not things we are bad at parsing — they are things a worksheet
 * generator has no business acting on. A teacher may still write them; the note
 * is their record. We simply never let them influence what a child is shown,
 * and we tell the teacher we ignored them.
 */
const DENY: Array<[label: string, pattern: RegExp]> = [
  // disability and medical
  ['iep', /\biep\b/],
  ['504 plan', /\b504\b/],
  ['adhd', /\b(adhd|add)\b/],
  ['autism', /\b(autism|autistic|aspergers?)\b/],
  ['dyslexia', /\b(dyslexi\w*|dysgraphi\w*)\b/],
  ['anxiety', /\b(anxiet\w*|anxious)\b/],
  ['depression', /\b(depress\w*)\b/],
  ['medication', /\b(medicat\w*|meds)\b/],
  ['therapy', /\b(therap\w*|counsel\w*)\b/],
  ['special education', /\b(sped|special ed(ucation)?)\b/],
  ['disability', /\b(disabilit\w*|disabled)\b/],
  // immigration and origin
  ['immigration status', /\b(undocumented|immigra\w*|visa|asylum|refugee|newcomer|deported|green card)\b/],
  // family and home
  ['divorce', /\b(divorc\w*|separat(ed|ing) parents)\b/],
  ['custody', /\bcustody\b/],
  ['foster care', /\bfoster\b/],
  ['housing', /\b(homeless\w*|shelter)\b/],
  ['abuse', /\b(abuse\w*|neglect\w*)\b/],
  ['family circumstances', /\b(mom|dad|mother|father|parents?|guardian|home life)\b/],
  // behaviour and character judgements
  ['behaviour', /\b(lazy|disrupt\w*|defian\w*|troublemaker|suspended|detention|attitude problem)\b/],
];

const NEGATIVE = /(struggl\w*|weak\w*|trouble|difficult\w*|confus\w*|mix\w* up|needs? (?:work|help|practice|review)|can'?t|doesn'?t (?:get|understand)|bad at|lost (?:on|with)|shaky)/;
const POSITIVE = /(strong|solid|confident|master\w*|good (?:at|with)|has (?:this|these) down|no trouble|excels?|aced?)/;

function normalise(s: string): string {
  return s.toLowerCase().normalize('NFC').replace(/\s+/g, ' ');
}

/** Split into clauses so "struggles with X but strong on Y" resolves both ways. */
function clauses(note: string): string[] {
  return normalise(note)
    .split(/[.;,]|\bbut\b|\balthough\b|\bhowever\b|\bthough\b|\band\b/)
    .map((c) => c.trim())
    .filter(Boolean);
}

function skillsMentioned(clause: string): Array<{ slug: string; matched: string }> {
  const hits: Array<{ slug: string; matched: string; length: number }> = [];
  for (const [slug, phrases] of Object.entries(SKILL_SYNONYMS)) {
    for (const phrase of phrases) {
      if (clause.includes(phrase)) hits.push({ slug, matched: phrase, length: phrase.length });
    }
  }
  // Longest match wins so "irregular preterite" does not also register as "preterite".
  hits.sort((a, b) => b.length - a.length);
  const seen = new Set<string>();
  const out: Array<{ slug: string; matched: string }> = [];
  for (const h of hits) {
    if (seen.has(h.slug)) continue;
    if (out.some((o) => o.matched.includes(h.matched))) continue;
    seen.add(h.slug);
    out.push({ slug: h.slug, matched: h.matched });
  }
  return out;
}

type Rule = { key: ChipKey; value: string; test: RegExp };

const RULES: Rule[] = [
  { key: 'passage_length', value: 'short', test: /(short(er)? (passages?|readings?|texts?)|keep it short|shorter items)/ },
  { key: 'passage_length', value: 'long', test: /(long(er)? (passages?|readings?|texts?)|more reading)/ },
  { key: 'reading_level', value: 'above', test: /(reads? (very )?well|strong reader|reads? above|advanced reader)/ },
  { key: 'reading_level', value: 'below', test: /(reads? below|struggling reader|weak reader|low reading|reading is behind)/ },
  { key: 'difficulty_offset', value: '-1', test: /(needs? (it )?easier|too hard|start easier|lower the difficulty|simpler)/ },
  { key: 'difficulty_offset', value: '+1', test: /(needs? a challenge|too easy|bored|ready for harder|push (her|him|them)|more challenging)/ },
  { key: 'max_items', value: '8', test: /(fewer (questions|items)|shorter assignments?|keep assignments? short)/ },
  { key: 'max_items', value: '20', test: /(more (questions|items)|longer assignments?|extra practice)/ },
  { key: 'item_type_pref', value: 'mcq', test: /(multiple choice|prefers? mcq)/ },
  { key: 'item_type_pref', value: 'short_answer', test: /(open (ended|response)|short answer|writing it out)/ },
  { key: 'register', value: 'formal', test: /(formal (register|usted)|usted form)/ },
  { key: 'register', value: 'informal', test: /(informal|tú form|tu form)/ },
  { key: 'render_accommodation', value: 'large_print', test: /(large print|bigger (text|font)|larger font)/ },
  { key: 'render_accommodation', value: 'extra_space', test: /(extra space|more (room|space) to write|wider lines)/ },
  { key: 'render_accommodation', value: 'fewer_per_page', test: /(fewer per page|less crowded|spread out)/ },
];

export function extractChips(note: string): ExtractionResult {
  const chips: Chip[] = [];
  const suppressed: string[] = [];
  const text = normalise(note);

  for (const [label, pattern] of DENY) {
    if (pattern.test(text)) suppressed.push(label);
  }

  // Skill mentions carry a polarity from the clause they sit in.
  for (const clause of clauses(note)) {
    const negative = NEGATIVE.test(clause);
    const positive = POSITIVE.test(clause);
    if (!negative && !positive) continue;
    for (const { slug, matched } of skillsMentioned(clause)) {
      chips.push({
        key: negative ? 'focus_skill' : 'avoid_skill',
        value: slug,
        matched,
      });
    }
  }

  for (const rule of RULES) {
    const m = text.match(rule.test);
    if (m) chips.push({ key: rule.key, value: rule.value, matched: m[0] });
  }

  // Belt and braces: nothing leaves that is not a member of the closed set.
  const clean = chips.filter((c) => CLOSED_VALUES[c.key].includes(c.value));
  const deduped = clean.filter((c, i) =>
    clean.findIndex((o) => o.key === c.key && o.value === c.value) === i);

  return { chips: deduped, suppressed: [...new Set(suppressed)] };
}
