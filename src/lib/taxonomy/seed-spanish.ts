/**
 * The Spanish skill spine and lexicon. Versioned, checked in, diffable.
 *
 * Slugs are stable identifiers and are load-bearing: item.skill_id and the
 * primary key of skill_state both point here. Renaming a `name` is free.
 * Changing a `slug`, or splitting or merging a leaf, is a migration that has to
 * decide what happens to every mastery estimate pointing at the old node.
 */

export const SEED_VERSION = 1;
export const LEXICON_VERSION = 1;

export type SeedSkill = {
  slug: string;
  name: string;
  description?: string;
  children?: SeedSkill[];
};

export const SKILL_TREE: SeedSkill[] = [
  {
    slug: 'grammar',
    name: 'Grammar',
    children: [
      {
        slug: 'verbs',
        name: 'Verbs',
        children: [
          { slug: 'present-regular-ar', name: 'Present tense: regular -ar verbs' },
          { slug: 'present-regular-er', name: 'Present tense: regular -er verbs' },
          { slug: 'present-regular-ir', name: 'Present tense: regular -ir verbs' },
          { slug: 'present-stem-changing', name: 'Present tense: stem-changing verbs' },
          { slug: 'ser-vs-estar', name: 'Ser vs. estar' },
          { slug: 'preterite-regular', name: 'Preterite: regular verbs' },
          { slug: 'preterite-irregular', name: 'Preterite: irregular verbs' },
          { slug: 'imperfect-regular', name: 'Imperfect tense' },
          { slug: 'preterite-vs-imperfect', name: 'Preterite vs. imperfect' },
          { slug: 'future-simple', name: 'Simple future' },
          { slug: 'present-subjunctive', name: 'Present subjunctive' },
        ],
      },
      {
        slug: 'nouns-and-adjectives',
        name: 'Nouns and adjectives',
        children: [
          { slug: 'gender-and-number', name: 'Noun gender and number' },
          { slug: 'definite-indefinite-articles', name: 'Definite and indefinite articles' },
          { slug: 'adjective-agreement', name: 'Adjective agreement' },
        ],
      },
    ],
  },
];

/** Which courses teach which leaf, in what order, with what emphasis. */
export type CourseSkill = {
  course: 'spanish-1' | 'spanish-2' | 'spanish-3';
  skill: string;
  emphasis: 'core' | 'review' | 'preview';
  unit?: string;
};

export const COURSE_SKILLS: CourseSkill[] = [
  { course: 'spanish-1', skill: 'gender-and-number', emphasis: 'core', unit: 'Unidad 1' },
  { course: 'spanish-1', skill: 'definite-indefinite-articles', emphasis: 'core', unit: 'Unidad 1' },
  { course: 'spanish-1', skill: 'adjective-agreement', emphasis: 'core', unit: 'Unidad 2' },
  { course: 'spanish-1', skill: 'present-regular-ar', emphasis: 'core', unit: 'Unidad 3' },
  { course: 'spanish-1', skill: 'present-regular-er', emphasis: 'core', unit: 'Unidad 3' },
  { course: 'spanish-1', skill: 'present-regular-ir', emphasis: 'core', unit: 'Unidad 3' },
  { course: 'spanish-1', skill: 'ser-vs-estar', emphasis: 'core', unit: 'Unidad 4' },
  { course: 'spanish-1', skill: 'present-stem-changing', emphasis: 'core', unit: 'Unidad 5' },

  // the same skills, reviewed — one skill row, one mastery history
  { course: 'spanish-2', skill: 'present-stem-changing', emphasis: 'review', unit: 'Repaso' },
  { course: 'spanish-2', skill: 'ser-vs-estar', emphasis: 'review', unit: 'Repaso' },
  { course: 'spanish-2', skill: 'preterite-regular', emphasis: 'core', unit: 'Unidad 1' },
  { course: 'spanish-2', skill: 'preterite-irregular', emphasis: 'core', unit: 'Unidad 2' },
  { course: 'spanish-2', skill: 'imperfect-regular', emphasis: 'core', unit: 'Unidad 3' },
  { course: 'spanish-2', skill: 'preterite-vs-imperfect', emphasis: 'core', unit: 'Unidad 4' },
  { course: 'spanish-2', skill: 'future-simple', emphasis: 'preview', unit: 'Unidad 5' },

  { course: 'spanish-3', skill: 'preterite-vs-imperfect', emphasis: 'review', unit: 'Repaso' },
  { course: 'spanish-3', skill: 'future-simple', emphasis: 'core', unit: 'Unidad 1' },
  { course: 'spanish-3', skill: 'present-subjunctive', emphasis: 'core', unit: 'Unidad 2' },
];

export type SeedLexeme = {
  lemma: string;
  pos: 'verb' | 'noun' | 'adj';
  gloss: string;
  course: 1 | 2 | 3;
  gender?: 'm' | 'f';
  tags?: string[];
};

/**
 * `course` is the course sequence at which the lemma is first taught. The
 * generator's lexicon_ceiling filters on it, which is what stops a Spanish 1
 * worksheet from quietly containing a Spanish 3 verb.
 */
export const LEXEMES: SeedLexeme[] = [
  // --- Spanish 1 verbs -----------------------------------------------------
  { lemma: 'hablar', pos: 'verb', gloss: 'to speak', course: 1, tags: ['regular', 'ar'] },
  { lemma: 'estudiar', pos: 'verb', gloss: 'to study', course: 1, tags: ['regular', 'ar'] },
  { lemma: 'trabajar', pos: 'verb', gloss: 'to work', course: 1, tags: ['regular', 'ar'] },
  { lemma: 'caminar', pos: 'verb', gloss: 'to walk', course: 1, tags: ['regular', 'ar'] },
  { lemma: 'cantar', pos: 'verb', gloss: 'to sing', course: 1, tags: ['regular', 'ar'] },
  { lemma: 'bailar', pos: 'verb', gloss: 'to dance', course: 1, tags: ['regular', 'ar'] },
  { lemma: 'escuchar', pos: 'verb', gloss: 'to listen to', course: 1, tags: ['regular', 'ar'] },
  { lemma: 'comprar', pos: 'verb', gloss: 'to buy', course: 1, tags: ['regular', 'ar'] },
  { lemma: 'llevar', pos: 'verb', gloss: 'to carry, to wear', course: 1, tags: ['regular', 'ar'] },
  { lemma: 'mirar', pos: 'verb', gloss: 'to watch', course: 1, tags: ['regular', 'ar'] },
  { lemma: 'comer', pos: 'verb', gloss: 'to eat', course: 1, tags: ['regular', 'er'] },
  { lemma: 'beber', pos: 'verb', gloss: 'to drink', course: 1, tags: ['regular', 'er'] },
  { lemma: 'aprender', pos: 'verb', gloss: 'to learn', course: 1, tags: ['regular', 'er'] },
  { lemma: 'correr', pos: 'verb', gloss: 'to run', course: 1, tags: ['regular', 'er'] },
  { lemma: 'leer', pos: 'verb', gloss: 'to read', course: 1, tags: ['er', 'y-shift'] },
  { lemma: 'vender', pos: 'verb', gloss: 'to sell', course: 1, tags: ['regular', 'er'] },
  { lemma: 'vivir', pos: 'verb', gloss: 'to live', course: 1, tags: ['regular', 'ir'] },
  { lemma: 'escribir', pos: 'verb', gloss: 'to write', course: 1, tags: ['regular', 'ir'] },
  { lemma: 'abrir', pos: 'verb', gloss: 'to open', course: 1, tags: ['regular', 'ir'] },
  { lemma: 'recibir', pos: 'verb', gloss: 'to receive', course: 1, tags: ['regular', 'ir'] },
  { lemma: 'compartir', pos: 'verb', gloss: 'to share', course: 1, tags: ['regular', 'ir'] },
  { lemma: 'ser', pos: 'verb', gloss: 'to be (essential)', course: 1, tags: ['irregular'] },
  { lemma: 'estar', pos: 'verb', gloss: 'to be (state)', course: 1, tags: ['irregular'] },
  { lemma: 'ir', pos: 'verb', gloss: 'to go', course: 1, tags: ['irregular'] },
  { lemma: 'tener', pos: 'verb', gloss: 'to have', course: 1, tags: ['irregular'] },
  { lemma: 'hacer', pos: 'verb', gloss: 'to do, to make', course: 1, tags: ['irregular'] },
  { lemma: 'querer', pos: 'verb', gloss: 'to want', course: 1, tags: ['stem', 'e>ie'] },
  { lemma: 'poder', pos: 'verb', gloss: 'to be able to', course: 1, tags: ['stem', 'o>ue'] },
  { lemma: 'jugar', pos: 'verb', gloss: 'to play', course: 1, tags: ['stem', 'u>ue'] },
  { lemma: 'pensar', pos: 'verb', gloss: 'to think', course: 1, tags: ['stem', 'e>ie'] },
  { lemma: 'dormir', pos: 'verb', gloss: 'to sleep', course: 1, tags: ['stem', 'o>ue'] },
  { lemma: 'pedir', pos: 'verb', gloss: 'to ask for', course: 1, tags: ['stem', 'e>i'] },
  { lemma: 'empezar', pos: 'verb', gloss: 'to begin', course: 1, tags: ['stem', 'e>ie'] },
  { lemma: 'volver', pos: 'verb', gloss: 'to return', course: 1, tags: ['stem', 'o>ue'] },

  // --- Spanish 2 verbs -----------------------------------------------------
  { lemma: 'decir', pos: 'verb', gloss: 'to say', course: 2, tags: ['irregular'] },
  { lemma: 'venir', pos: 'verb', gloss: 'to come', course: 2, tags: ['irregular'] },
  { lemma: 'poner', pos: 'verb', gloss: 'to put', course: 2, tags: ['irregular'] },
  { lemma: 'salir', pos: 'verb', gloss: 'to leave', course: 2, tags: ['irregular'] },
  { lemma: 'traer', pos: 'verb', gloss: 'to bring', course: 2, tags: ['irregular'] },
  { lemma: 'saber', pos: 'verb', gloss: 'to know (facts)', course: 2, tags: ['irregular'] },
  { lemma: 'conocer', pos: 'verb', gloss: 'to know (people)', course: 2, tags: ['irregular'] },
  { lemma: 'ver', pos: 'verb', gloss: 'to see', course: 2, tags: ['irregular'] },
  { lemma: 'dar', pos: 'verb', gloss: 'to give', course: 2, tags: ['irregular'] },
  { lemma: 'buscar', pos: 'verb', gloss: 'to look for', course: 2, tags: ['ar', 'car'] },
  { lemma: 'llegar', pos: 'verb', gloss: 'to arrive', course: 2, tags: ['ar', 'gar'] },
  { lemma: 'seguir', pos: 'verb', gloss: 'to follow, to continue', course: 2, tags: ['stem', 'e>i'] },
  { lemma: 'servir', pos: 'verb', gloss: 'to serve', course: 2, tags: ['stem', 'e>i'] },
  { lemma: 'repetir', pos: 'verb', gloss: 'to repeat', course: 2, tags: ['stem', 'e>i'] },
  { lemma: 'preferir', pos: 'verb', gloss: 'to prefer', course: 2, tags: ['stem', 'e>ie'] },
  { lemma: 'encontrar', pos: 'verb', gloss: 'to find', course: 2, tags: ['stem', 'o>ue'] },
  { lemma: 'recordar', pos: 'verb', gloss: 'to remember', course: 2, tags: ['stem', 'o>ue'] },
  { lemma: 'entender', pos: 'verb', gloss: 'to understand', course: 2, tags: ['stem', 'e>ie'] },
  { lemma: 'perder', pos: 'verb', gloss: 'to lose', course: 2, tags: ['stem', 'e>ie'] },
  { lemma: 'oír', pos: 'verb', gloss: 'to hear', course: 2, tags: ['irregular'] },
  { lemma: 'creer', pos: 'verb', gloss: 'to believe', course: 2, tags: ['er', 'y-shift'] },

  // --- Spanish 3 verbs -----------------------------------------------------
  { lemma: 'conducir', pos: 'verb', gloss: 'to drive', course: 3, tags: ['irregular'] },
  { lemma: 'traducir', pos: 'verb', gloss: 'to translate', course: 3, tags: ['irregular'] },
  { lemma: 'sentir', pos: 'verb', gloss: 'to feel', course: 3, tags: ['stem', 'e>ie'] },
  { lemma: 'morir', pos: 'verb', gloss: 'to die', course: 3, tags: ['stem', 'o>ue'] },
  { lemma: 'construir', pos: 'verb', gloss: 'to build', course: 3, tags: ['ir', 'y-shift'] },

  // --- nouns and adjectives ------------------------------------------------
  { lemma: 'libro', pos: 'noun', gloss: 'book', course: 1, gender: 'm' },
  { lemma: 'casa', pos: 'noun', gloss: 'house', course: 1, gender: 'f' },
  { lemma: 'escuela', pos: 'noun', gloss: 'school', course: 1, gender: 'f' },
  { lemma: 'profesor', pos: 'noun', gloss: 'teacher', course: 1, gender: 'm' },
  { lemma: 'estudiante', pos: 'noun', gloss: 'student', course: 1, gender: 'm' },
  { lemma: 'ciudad', pos: 'noun', gloss: 'city', course: 1, gender: 'f' },
  { lemma: 'perro', pos: 'noun', gloss: 'dog', course: 1, gender: 'm' },
  { lemma: 'clase', pos: 'noun', gloss: 'class', course: 1, gender: 'f' },
  { lemma: 'alto', pos: 'adj', gloss: 'tall', course: 1 },
  { lemma: 'pequeño', pos: 'adj', gloss: 'small', course: 1 },
  { lemma: 'cansado', pos: 'adj', gloss: 'tired', course: 1 },
  { lemma: 'contento', pos: 'adj', gloss: 'happy', course: 1 },
  { lemma: 'inteligente', pos: 'adj', gloss: 'intelligent', course: 1 },
];
