/**
 * Spanish conjugator for the Spanish 1-3 span.
 *
 * This is deliberately conservative: it throws `UnsupportedForm` rather than
 * guessing. A verb the engine is not certain about is a verb we do not generate
 * items for. Guessing here would put a wrong answer key in front of a class,
 * which is the one failure this whole design exists to prevent.
 */

export type Person = '1s' | '2s' | '3s' | '1p' | '2p' | '3p';
export type Tense =
  | 'present'
  | 'preterite'
  | 'imperfect'
  | 'future'
  | 'conditional'
  | 'present_subjunctive';

export const PERSONS: Person[] = ['1s', '2s', '3s', '1p', '2p', '3p'];

export const PERSON_PRONOUN: Record<Person, string> = {
  '1s': 'yo',
  '2s': 'tú',
  '3s': 'él / ella / usted',
  '1p': 'nosotros',
  '2p': 'vosotros',
  '3p': 'ellos / ellas / ustedes',
};

export class UnsupportedForm extends Error {
  constructor(lemma: string, tense: Tense, person: Person, why: string) {
    super(`cannot conjugate ${lemma} (${tense}, ${person}): ${why}`);
    this.name = 'UnsupportedForm';
  }
}

const IDX: Record<Person, number> = { '1s': 0, '2s': 1, '3s': 2, '1p': 3, '2p': 4, '3p': 5 };

type Six = [string, string, string, string, string, string];

// ---------------------------------------------------------------- endings

const PRESENT_ENDINGS: Record<'ar' | 'er' | 'ir', Six> = {
  ar: ['o', 'as', 'a', 'amos', 'áis', 'an'],
  er: ['o', 'es', 'e', 'emos', 'éis', 'en'],
  ir: ['o', 'es', 'e', 'imos', 'ís', 'en'],
};

const PRETERITE_ENDINGS: Record<'ar' | 'er' | 'ir', Six> = {
  ar: ['é', 'aste', 'ó', 'amos', 'asteis', 'aron'],
  er: ['í', 'iste', 'ió', 'imos', 'isteis', 'ieron'],
  ir: ['í', 'iste', 'ió', 'imos', 'isteis', 'ieron'],
};

const IMPERFECT_ENDINGS: Record<'ar' | 'er' | 'ir', Six> = {
  ar: ['aba', 'abas', 'aba', 'ábamos', 'abais', 'aban'],
  er: ['ía', 'ías', 'ía', 'íamos', 'íais', 'ían'],
  ir: ['ía', 'ías', 'ía', 'íamos', 'íais', 'ían'],
};

const FUTURE_ENDINGS: Six = ['é', 'ás', 'á', 'emos', 'éis', 'án'];
const CONDITIONAL_ENDINGS: Six = ['ía', 'ías', 'ía', 'íamos', 'íais', 'ían'];

const SUBJUNCTIVE_ENDINGS: Record<'ar' | 'er' | 'ir', Six> = {
  ar: ['e', 'es', 'e', 'emos', 'éis', 'en'],
  er: ['a', 'as', 'a', 'amos', 'áis', 'an'],
  ir: ['a', 'as', 'a', 'amos', 'áis', 'an'],
};

// "Strong" preterites take their own endings, unstressed on the stem.
const STRONG_PRETERITE_ENDINGS: Six = ['e', 'iste', 'o', 'imos', 'isteis', 'ieron'];

// ---------------------------------------------------------------- irregulars

const IRREGULAR_PRESENT: Record<string, Six> = {
  ser: ['soy', 'eres', 'es', 'somos', 'sois', 'son'],
  estar: ['estoy', 'estás', 'está', 'estamos', 'estáis', 'están'],
  ir: ['voy', 'vas', 'va', 'vamos', 'vais', 'van'],
  haber: ['he', 'has', 'ha', 'hemos', 'habéis', 'han'],
  tener: ['tengo', 'tienes', 'tiene', 'tenemos', 'tenéis', 'tienen'],
  venir: ['vengo', 'vienes', 'viene', 'venimos', 'venís', 'vienen'],
  decir: ['digo', 'dices', 'dice', 'decimos', 'decís', 'dicen'],
  hacer: ['hago', 'haces', 'hace', 'hacemos', 'hacéis', 'hacen'],
  poner: ['pongo', 'pones', 'pone', 'ponemos', 'ponéis', 'ponen'],
  saber: ['sé', 'sabes', 'sabe', 'sabemos', 'sabéis', 'saben'],
  ver: ['veo', 'ves', 've', 'vemos', 'veis', 'ven'],
  dar: ['doy', 'das', 'da', 'damos', 'dais', 'dan'],
  salir: ['salgo', 'sales', 'sale', 'salimos', 'salís', 'salen'],
  traer: ['traigo', 'traes', 'trae', 'traemos', 'traéis', 'traen'],
  oír: ['oigo', 'oyes', 'oye', 'oímos', 'oís', 'oyen'],
  conocer: ['conozco', 'conoces', 'conoce', 'conocemos', 'conocéis', 'conocen'],
  seguir: ['sigo', 'sigues', 'sigue', 'seguimos', 'seguís', 'siguen'],
};

/** Boot-pattern stem changes: everywhere except nosotros / vosotros. */
const STEM_CHANGE: Record<string, Extract<VowelChange, 'e>ie' | 'o>ue' | 'e>i' | 'u>ue'>> = {
  pensar: 'e>ie', empezar: 'e>ie', cerrar: 'e>ie', comenzar: 'e>ie',
  entender: 'e>ie', perder: 'e>ie', querer: 'e>ie', preferir: 'e>ie',
  sentir: 'e>ie', despertar: 'e>ie', nevar: 'e>ie',
  poder: 'o>ue', volver: 'o>ue', dormir: 'o>ue', almorzar: 'o>ue',
  encontrar: 'o>ue', recordar: 'o>ue', costar: 'o>ue', morir: 'o>ue',
  contar: 'o>ue', mostrar: 'o>ue', llover: 'o>ue',
  pedir: 'e>i', servir: 'e>i', repetir: 'e>i', vestir: 'e>i', medir: 'e>i',
  jugar: 'u>ue',
};

/** Strong preterite stems; these also ignore stem changes and accents. */
const STRONG_PRETERITE: Record<string, string> = {
  tener: 'tuv', estar: 'estuv', andar: 'anduv', poder: 'pud', poner: 'pus',
  saber: 'sup', caber: 'cup', haber: 'hub', hacer: 'hic', querer: 'quis',
  venir: 'vin', decir: 'dij', traer: 'traj', conducir: 'conduj',
  producir: 'produj', traducir: 'traduj',
};

const IRREGULAR_PRETERITE: Record<string, Six> = {
  ser: ['fui', 'fuiste', 'fue', 'fuimos', 'fuisteis', 'fueron'],
  ir: ['fui', 'fuiste', 'fue', 'fuimos', 'fuisteis', 'fueron'],
  dar: ['di', 'diste', 'dio', 'dimos', 'disteis', 'dieron'],
  ver: ['vi', 'viste', 'vio', 'vimos', 'visteis', 'vieron'],
  oír: ['oí', 'oíste', 'oyó', 'oímos', 'oísteis', 'oyeron'],
};

/** Subjunctives that are not derivable from the yo form. */
const IRREGULAR_SUBJUNCTIVE: Record<string, Six> = {
  ser: ['sea', 'seas', 'sea', 'seamos', 'seáis', 'sean'],
  estar: ['esté', 'estés', 'esté', 'estemos', 'estéis', 'estén'],
  ir: ['vaya', 'vayas', 'vaya', 'vayamos', 'vayáis', 'vayan'],
  dar: ['dé', 'des', 'dé', 'demos', 'deis', 'den'],
  saber: ['sepa', 'sepas', 'sepa', 'sepamos', 'sepáis', 'sepan'],
};

const IRREGULAR_IMPERFECT: Record<string, Six> = {
  ser: ['era', 'eras', 'era', 'éramos', 'erais', 'eran'],
  ir: ['iba', 'ibas', 'iba', 'íbamos', 'ibais', 'iban'],
  ver: ['veía', 'veías', 'veía', 'veíamos', 'veíais', 'veían'],
};

const FUTURE_STEM: Record<string, string> = {
  tener: 'tendr', poner: 'pondr', venir: 'vendr', salir: 'saldr',
  poder: 'podr', saber: 'sabr', haber: 'habr', hacer: 'har', decir: 'dir',
  querer: 'querr', caber: 'cabr', valer: 'valdr', oír: 'oir',
};

/** -ir verbs whose stem also shifts in the 3rd person of the preterite. */
const PRETERITE_IR_SHIFT: Record<string, Extract<VowelChange, 'e>i' | 'o>u'>> = {
  pedir: 'e>i', servir: 'e>i', repetir: 'e>i', seguir: 'e>i', vestir: 'e>i',
  medir: 'e>i', preferir: 'e>i', sentir: 'e>i', mentir: 'e>i',
  dormir: 'o>u', morir: 'o>u',
};

/** i -> y between vowels in the 3rd person of the preterite. */
const PRETERITE_Y_SHIFT = new Set(['leer', 'creer', 'caer', 'construir', 'destruir', 'incluir']);

/** Verbs we deliberately refuse: defective, pronominal, or too irregular to trust. */
const REFUSED = new Set(['haber', 'llover', 'nevar', 'costar']);

// ---------------------------------------------------------------- helpers

function split(lemma: string): { stem: string; ending: 'ar' | 'er' | 'ir' } {
  // family is read from the accent-stripped ending so that oír counts as -ir,
  // while the stem keeps its accents
  const ending = stripAccents(lemma.slice(-2));
  if (ending !== 'ar' && ending !== 'er' && ending !== 'ir') {
    throw new Error(`not an infinitive: ${lemma}`);
  }
  return { stem: lemma.slice(0, -2), ending };
}

/**
 * Vowel shifts. The boot-pattern set is what the present tense uses; the
 * reduced set (e>i, o>u) is what -ir verbs use in the preterite third person
 * and in the nosotros/vosotros subjunctive.
 */
type VowelChange = 'e>ie' | 'o>ue' | 'e>i' | 'u>ue' | 'o>u';

/** Apply a vowel change to the last occurrence of the source vowel. */
function applyStemChange(stem: string, change: VowelChange): string {
  const [from, to] = change.split('>');
  const i = stem.lastIndexOf(from);
  if (i < 0) throw new Error(`stem ${stem} has no ${from} to change`);
  return stem.slice(0, i) + to + stem.slice(i + from.length);
}

/** Orthographic changes that keep the sound when the ending starts with e/é. */
function hardenBeforeE(stem: string): string {
  if (stem.endsWith('c')) return stem.slice(0, -1) + 'qu';   // buscar  -> busqué
  if (stem.endsWith('g')) return stem + 'u';                  // llegar  -> llegué
  if (stem.endsWith('z')) return stem.slice(0, -1) + 'c';     // empezar -> empecé
  return stem;
}

// ---------------------------------------------------------------- the engine

export function conjugate(lemma: string, tense: Tense, person: Person): string {
  const p = IDX[person];
  if (REFUSED.has(lemma)) {
    throw new UnsupportedForm(lemma, tense, person, 'verb is on the refuse list');
  }

  let stem: string;
  let ending: 'ar' | 'er' | 'ir';
  try {
    ({ stem, ending } = split(lemma));
  } catch (e) {
    throw new UnsupportedForm(lemma, tense, person, (e as Error).message);
  }

  switch (tense) {
    case 'present': {
      const irr = IRREGULAR_PRESENT[lemma];
      if (irr) return irr[p];
      const change = STEM_CHANGE[lemma];
      const boot = change && person !== '1p' && person !== '2p';
      const s = boot ? applyStemChange(stem, change) : stem;
      return s + PRESENT_ENDINGS[ending][p];
    }

    case 'preterite': {
      const irr = IRREGULAR_PRETERITE[lemma];
      if (irr) return irr[p];

      const strong = STRONG_PRETERITE[lemma];
      if (strong) {
        // hacer: c -> z before o, to keep the sound (hizo, not hico)
        if (lemma === 'hacer' && person === '3s') return 'hizo';
        // j-stems drop the i of -ieron
        const end = strong.endsWith('j') && person === '3p' ? 'eron' : STRONG_PRETERITE_ENDINGS[p];
        return strong + end;
      }

      if (person === '1s' && ending === 'ar') {
        return hardenBeforeE(stem) + PRETERITE_ENDINGS.ar[0];
      }

      if (PRETERITE_Y_SHIFT.has(lemma)) {
        if (person === '3s') return stem + 'yó';
        if (person === '3p') return stem + 'yeron';
        // Hiatus accent after a/e/o: leíste, caímos. Not after u, where the
        // diphthong holds: construiste, construimos.
        if (/[aeo]$/.test(stem)) {
          const hiatus: Record<string, string> = { '2s': 'íste', '1p': 'ímos', '2p': 'ísteis' };
          if (hiatus[person]) return stem + hiatus[person];
        }
      }

      if (person === '3s' || person === '3p') {
        const shift = ending === 'ir' ? PRETERITE_IR_SHIFT[lemma] : undefined;
        if (shift) {
          return applyStemChange(stem, shift) + PRETERITE_ENDINGS.ir[p];
        }
      }

      return stem + PRETERITE_ENDINGS[ending][p];
    }

    case 'imperfect': {
      const irr = IRREGULAR_IMPERFECT[lemma];
      if (irr) return irr[p];
      return stem + IMPERFECT_ENDINGS[ending][p];
    }

    case 'future':
      return (FUTURE_STEM[lemma] ?? lemma) + FUTURE_ENDINGS[p];

    case 'conditional':
      return (FUTURE_STEM[lemma] ?? lemma) + CONDITIONAL_ENDINGS[p];

    case 'present_subjunctive': {
      const irr = IRREGULAR_SUBJUNCTIVE[lemma];
      if (irr) return irr[p];

      // The yo form of the present indicative is what carries the consonant
      // irregularity: tengo -> tenga, conozco -> conozca, oigo -> oiga.
      const yo = conjugate(lemma, 'present', '1s');
      if (!yo.endsWith('o')) {
        throw new UnsupportedForm(lemma, tense, person, `yo form "${yo}" does not end in -o`);
      }

      let subjStem = yo.slice(0, -1);
      const change = STEM_CHANGE[lemma];
      const isNosVos = person === '1p' || person === '2p';

      if (change && isNosVos) {
        if (ending === 'ir') {
          // -ir verbs keep a reduced shift where -ar/-er verbs keep none:
          // dormir -> durmamos, preferir -> prefiramos, but pedir -> pidamos
          const reduced: VowelChange | null =
            change === 'e>ie' ? 'e>i' : change === 'o>ue' ? 'o>u' : null;
          subjStem = reduced ? applyStemChange(stem, reduced) : subjStem;
        } else {
          // empezar -> empecemos, not empiecemos
          subjStem = stem;
        }
      }

      if (ending === 'ar') subjStem = hardenBeforeE(subjStem);
      return subjStem + SUBJUNCTIVE_ENDINGS[ending][p];
    }
  }
}

/** Every form we are willing to vouch for. Used to gate item generation. */
export function isSupported(lemma: string, tense: Tense, person: Person): boolean {
  try {
    conjugate(lemma, tense, person);
    return true;
  } catch {
    return false;
  }
}

/** Strip diacritics — for reporting a right-but-for-accents answer, never for grading. */
export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC');
}

/** True if the verb changes its stem in the present. Says nothing about other tenses. */
export function hasPresentStemChange(lemma: string): boolean {
  return lemma in STEM_CHANGE;
}

// ---------------------------------------------------------------- regularity

/** The ending the regular rules call for, or null for a tense with no table. */
export function regularEnding(lemma: string, tense: Tense, person: Person): string | null {
  const p = IDX[person];
  let ending: 'ar' | 'er' | 'ir';
  try { ({ ending } = split(lemma)); } catch { return null; }
  switch (tense) {
    case 'present':   return PRESENT_ENDINGS[ending][p];
    case 'preterite': return PRETERITE_ENDINGS[ending][p];
    case 'imperfect': return IMPERFECT_ENDINGS[ending][p];
    case 'future':    return FUTURE_ENDINGS[p];
    case 'conditional': return CONDITIONAL_ENDINGS[p];
    case 'present_subjunctive': return SUBJUNCTIVE_ENDINGS[ending][p];
  }
}

/**
 * What the plain regular rules would produce, ignoring every irregularity.
 *
 * Comparing this against the real form is how an explanation can state what is
 * actually true of THIS tense, instead of repeating a tag that describes the
 * present. empezar is stem-changing in the present and completely regular in
 * the preterite; conocer is irregular in the present yo and regular throughout
 * the preterite. Saying otherwise on an answer key teaches the wrong rule.
 */
export function regularForm(lemma: string, tense: Tense, person: Person): string | null {
  let stem: string;
  try { ({ stem } = split(lemma)); } catch { return null; }
  const end = regularEnding(lemma, tense, person);
  if (end === null) return null;
  if (tense === 'future' || tense === 'conditional') return lemma + end;
  return stem + end;
}
