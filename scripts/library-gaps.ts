/** Which skill/variant pairs the library could not fill, and why. */
import { query, close } from '../src/lib/db/client.ts';
import { templateSupports, generateTemplateItems, type Lexeme } from '../src/lib/generation/template/index.ts';
import { VARIANTS } from '../src/lib/library/variants.ts';
import { loadLexicon } from '../src/lib/generation/pool.ts';
import type { GenerationParams } from '../src/lib/generation/params.ts';

const CEILING: Record<string, 1 | 2 | 3> = { 'spanish-1': 1, 'spanish-2': 2, 'spanish-3': 3 };

async function main() {
  const lexicon: Lexeme[] = await loadLexicon(1);
  const targets = await query<{ course_slug: string; skill_slug: string; skill_name: string }>(
    `SELECT co.slug AS course_slug, sk.slug AS skill_slug, sk.name AS skill_name
       FROM course_skill cs JOIN course co ON co.id = cs.course_id
       JOIN skill sk ON sk.id = cs.skill_id
      WHERE sk.is_leaf AND cs.emphasis = 'core'
      ORDER BY co.sequence_index, cs.sequence_index`);

  for (const t of targets) {
    if (!templateSupports(t.skill_slug)) continue;
    for (const v of VARIANTS) {
      const params: GenerationParams = {
        subject: 'spanish', course: t.course_slug as GenerationParams['course'],
        skill: t.skill_slug, item_type: v.itemType, difficulty: v.difficulty,
        content_locale: 'es', ui_locale: 'en',
        constraints: {
          lexicon_version: 1, lexicon_ceiling: CEILING[t.course_slug] ?? 2,
          register: 'neutral', stem_max_chars: 160,
        },
        template: { name: 'conjugation-drill', version: 1 }, model_id: null,
      };
      const produced = generateTemplateItems(params, lexicon, v.count);
      if (produced.length < Math.min(8, v.count)) {
        const inCeiling = lexicon.filter((l) => l.pos === 'verb'
          && l.introduced_at_course <= (CEILING[t.course_slug] ?? 2)).length;
        console.log(`${t.course_slug} / ${t.skill_slug} / ${v.slugSuffix}: `
          + `${produced.length} items (wanted ${v.count}); ${inCeiling} verbs within ceiling`);
      }
    }
  }
  await close();
}
main().catch((e) => { console.error(e); process.exit(1); });
