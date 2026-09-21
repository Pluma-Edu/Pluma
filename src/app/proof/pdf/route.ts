/**
 * PDF for the proof page.
 *
 * NOTE: this launches Chromium inside the web process, which is exactly what
 * docs/design/01-data-model.md §8 says not to do in production — each render is
 * 150-300 MB of RSS and a crawler on this route would take the app down. It is
 * acceptable for a Phase 0 page behind no traffic; before Phase 1 this moves to
 * a separate render service with a queue, and the library's PDFs are
 * pre-rendered to object storage rather than produced on request.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { one } from '@/lib/db/client';
import { ensurePool, topUpPool, drawFromPool } from '@/lib/generation/pool';
import { generationHash, type GenerationParams, type Difficulty, type ItemType } from '@/lib/generation/params';
import { templateSupports } from '@/lib/generation/template/index';
import { renderWorksheetHtml } from '@/lib/render/worksheet';
import { htmlToPdf } from '@/lib/render/pdf';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CEILING: Record<string, 1 | 2 | 3> = { 'spanish-1': 1, 'spanish-2': 2, 'spanish-3': 3 };

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const course = (q.get('course') ?? 'spanish-2') as GenerationParams['course'];
  const skill = q.get('skill') ?? 'preterite-regular';
  const item_type = (q.get('type') ?? 'cloze') as ItemType;
  const difficulty = Number(q.get('difficulty') ?? 2) as Difficulty;
  const count = Math.min(Number(q.get('count') ?? 12), 40);
  const answerKey = q.get('key') === '1';

  const params: GenerationParams = {
    subject: 'spanish', course, skill, item_type, difficulty,
    content_locale: 'es', ui_locale: 'en',
    constraints: {
      lexicon_version: 1, lexicon_ceiling: CEILING[course], register: 'neutral', stem_max_chars: 160,
    },
    template: { name: 'conjugation-drill', version: 1 },
    model_id: null,
  };

  const hash = generationHash(params);
  if (templateSupports(skill)) {
    await ensurePool(params);
    await topUpPool(params, Math.max(24, count));
  }
  const items = await drawFromPool(hash, count);
  if (items.length === 0) {
    return NextResponse.json({ error: 'no servable items for these parameters' }, { status: 404 });
  }

  const meta = await one<{ course_name: string; skill_name: string }>(
    `SELECT co.name AS course_name, sk.name AS skill_name
       FROM course co, skill sk WHERE co.slug = $1 AND sk.slug = $2`, [course, skill]);

  const html = renderWorksheetHtml(items, {
    title: meta.skill_name, courseName: meta.course_name, skillName: meta.skill_name,
  }, { answerKey });

  const pdf = await htmlToPdf(html);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${skill}${answerKey ? '-key' : ''}.pdf"`,
    },
  });
}
