import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conjugate, isSupported, PERSONS, type Person, type Tense } from './conjugator.ts';

/** Each row: lemma, tense, the six forms in PERSONS order. */
const TABLE: Array<[string, Tense, string[]]> = [
  // regular, all three families
  ['hablar', 'present', ['hablo', 'hablas', 'habla', 'hablamos', 'habláis', 'hablan']],
  ['comer', 'present', ['como', 'comes', 'come', 'comemos', 'coméis', 'comen']],
  ['vivir', 'present', ['vivo', 'vives', 'vive', 'vivimos', 'vivís', 'viven']],
  ['hablar', 'preterite', ['hablé', 'hablaste', 'habló', 'hablamos', 'hablasteis', 'hablaron']],
  ['comer', 'preterite', ['comí', 'comiste', 'comió', 'comimos', 'comisteis', 'comieron']],
  ['vivir', 'preterite', ['viví', 'viviste', 'vivió', 'vivimos', 'vivisteis', 'vivieron']],
  ['hablar', 'imperfect', ['hablaba', 'hablabas', 'hablaba', 'hablábamos', 'hablabais', 'hablaban']],
  ['comer', 'imperfect', ['comía', 'comías', 'comía', 'comíamos', 'comíais', 'comían']],

  // the irregulars a Spanish 1 class actually meets
  ['ser', 'present', ['soy', 'eres', 'es', 'somos', 'sois', 'son']],
  ['estar', 'present', ['estoy', 'estás', 'está', 'estamos', 'estáis', 'están']],
  ['ir', 'present', ['voy', 'vas', 'va', 'vamos', 'vais', 'van']],
  ['tener', 'present', ['tengo', 'tienes', 'tiene', 'tenemos', 'tenéis', 'tienen']],
  ['ser', 'preterite', ['fui', 'fuiste', 'fue', 'fuimos', 'fuisteis', 'fueron']],
  ['ir', 'preterite', ['fui', 'fuiste', 'fue', 'fuimos', 'fuisteis', 'fueron']],
  ['ser', 'imperfect', ['era', 'eras', 'era', 'éramos', 'erais', 'eran']],
  ['ir', 'imperfect', ['iba', 'ibas', 'iba', 'íbamos', 'ibais', 'iban']],
  ['ver', 'imperfect', ['veía', 'veías', 'veía', 'veíamos', 'veíais', 'veían']],

  // boot-pattern stem changes: the boot must not reach nosotros/vosotros
  ['poder', 'present', ['puedo', 'puedes', 'puede', 'podemos', 'podéis', 'pueden']],
  ['pensar', 'present', ['pienso', 'piensas', 'piensa', 'pensamos', 'pensáis', 'piensan']],
  ['pedir', 'present', ['pido', 'pides', 'pide', 'pedimos', 'pedís', 'piden']],
  ['jugar', 'present', ['juego', 'juegas', 'juega', 'jugamos', 'jugáis', 'juegan']],
  ['volver', 'present', ['vuelvo', 'vuelves', 'vuelve', 'volvemos', 'volvéis', 'vuelven']],
  ['preferir', 'present', ['prefiero', 'prefieres', 'prefiere', 'preferimos', 'preferís', 'prefieren']],

  // strong preterites
  ['tener', 'preterite', ['tuve', 'tuviste', 'tuvo', 'tuvimos', 'tuvisteis', 'tuvieron']],
  ['estar', 'preterite', ['estuve', 'estuviste', 'estuvo', 'estuvimos', 'estuvisteis', 'estuvieron']],
  ['hacer', 'preterite', ['hice', 'hiciste', 'hizo', 'hicimos', 'hicisteis', 'hicieron']],
  ['decir', 'preterite', ['dije', 'dijiste', 'dijo', 'dijimos', 'dijisteis', 'dijeron']],
  ['traer', 'preterite', ['traje', 'trajiste', 'trajo', 'trajimos', 'trajisteis', 'trajeron']],
  ['poder', 'preterite', ['pude', 'pudiste', 'pudo', 'pudimos', 'pudisteis', 'pudieron']],
  ['venir', 'preterite', ['vine', 'viniste', 'vino', 'vinimos', 'vinisteis', 'vinieron']],

  // third-person shifts and spelling changes
  ['pedir', 'preterite', ['pedí', 'pediste', 'pidió', 'pedimos', 'pedisteis', 'pidieron']],
  ['dormir', 'preterite', ['dormí', 'dormiste', 'durmió', 'dormimos', 'dormisteis', 'durmieron']],
  ['seguir', 'preterite', ['seguí', 'seguiste', 'siguió', 'seguimos', 'seguisteis', 'siguieron']],
  ['leer', 'preterite', ['leí', 'leíste', 'leyó', 'leímos', 'leísteis', 'leyeron']],
  ['oír', 'preterite', ['oí', 'oíste', 'oyó', 'oímos', 'oísteis', 'oyeron']],

  // future and conditional
  ['hablar', 'future', ['hablaré', 'hablarás', 'hablará', 'hablaremos', 'hablaréis', 'hablarán']],
  ['tener', 'future', ['tendré', 'tendrás', 'tendrá', 'tendremos', 'tendréis', 'tendrán']],
  ['hacer', 'future', ['haré', 'harás', 'hará', 'haremos', 'haréis', 'harán']],
  ['comer', 'conditional', ['comería', 'comerías', 'comería', 'comeríamos', 'comeríais', 'comerían']],
  ['decir', 'conditional', ['diría', 'dirías', 'diría', 'diríamos', 'diríais', 'dirían']],

  // subjunctive: the nosotros form is where the naive derivations break
  ['hablar', 'present_subjunctive', ['hable', 'hables', 'hable', 'hablemos', 'habléis', 'hablen']],
  ['comer', 'present_subjunctive', ['coma', 'comas', 'coma', 'comamos', 'comáis', 'coman']],
  ['tener', 'present_subjunctive', ['tenga', 'tengas', 'tenga', 'tengamos', 'tengáis', 'tengan']],
  ['conocer', 'present_subjunctive', ['conozca', 'conozcas', 'conozca', 'conozcamos', 'conozcáis', 'conozcan']],
  ['empezar', 'present_subjunctive', ['empiece', 'empieces', 'empiece', 'empecemos', 'empecéis', 'empiecen']],
  ['dormir', 'present_subjunctive', ['duerma', 'duermas', 'duerma', 'durmamos', 'durmáis', 'duerman']],
  ['preferir', 'present_subjunctive', ['prefiera', 'prefieras', 'prefiera', 'prefiramos', 'prefiráis', 'prefieran']],
  ['pedir', 'present_subjunctive', ['pida', 'pidas', 'pida', 'pidamos', 'pidáis', 'pidan']],
  ['seguir', 'present_subjunctive', ['siga', 'sigas', 'siga', 'sigamos', 'sigáis', 'sigan']],
  ['ser', 'present_subjunctive', ['sea', 'seas', 'sea', 'seamos', 'seáis', 'sean']],
  ['ir', 'present_subjunctive', ['vaya', 'vayas', 'vaya', 'vayamos', 'vayáis', 'vayan']],
  ['estar', 'present_subjunctive', ['esté', 'estés', 'esté', 'estemos', 'estéis', 'estén']],
];

for (const [lemma, tense, expected] of TABLE) {
  test(`${lemma} / ${tense}`, () => {
    const got = PERSONS.map((p) => conjugate(lemma, tense, p));
    assert.deepEqual(got, expected);
  });
}

test('spelling changes before -é in the preterite yo form', () => {
  assert.equal(conjugate('buscar', 'preterite', '1s'), 'busqué');
  assert.equal(conjugate('llegar', 'preterite', '1s'), 'llegué');
  assert.equal(conjugate('empezar', 'preterite', '1s'), 'empecé');
  assert.equal(conjugate('jugar', 'preterite', '1s'), 'jugué');
});

test('refuses rather than guesses', () => {
  // defective / weather verbs we will not put in front of a class
  assert.throws(() => conjugate('llover', 'present', '1s'), /UnsupportedForm|refuse/);
  assert.throws(() => conjugate('haber', 'present', '1s'), /UnsupportedForm|refuse/);
  // not an infinitive at all
  assert.throws(() => conjugate('gato', 'present', '1s'), /UnsupportedForm|infinitive/);
  assert.equal(isSupported('llover', 'present', '1s'), false);
  assert.equal(isSupported('hablar', 'present', '1s'), true);
});

test('accents are treated as significant', () => {
  // the whole reason answer matching cannot be accent-insensitive on verb forms
  assert.notEqual(conjugate('hablar', 'present', '1s'), conjugate('hablar', 'preterite', '3s'));
  assert.equal(conjugate('hablar', 'present', '1s'), 'hablo');
  assert.equal(conjugate('hablar', 'preterite', '3s'), 'habló');
});
