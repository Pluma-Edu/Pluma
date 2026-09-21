/**
 * Serves the answer key from private storage.
 *
 * The file is not under public/, so there is no URL to guess. This is the only
 * way to get one, and it checks the session first.
 */
import { NextResponse } from 'next/server';
import { getWorksheet } from '@/lib/library/queries';
import { currentAccountId } from '@/lib/auth/session';
import { query } from '@/lib/db/client';
import { get, exists } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ subject: string; course: string; skill: string; slug: string }> },
) {
  const p = await params;
  const gate = new URL(
    `/worksheets/${p.subject}/${p.course}/${p.skill}/${p.slug}/answer-key`, req.url);

  const accountId = await currentAccountId();
  if (!accountId) return NextResponse.redirect(gate);

  const w = await getWorksheet(p.subject, p.course, p.skill, p.slug);
  if (!w) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const rows = await query<{ answer_key_pdf_key: string | null }>(
    `SELECT answer_key_pdf_key FROM worksheet WHERE id = $1`, [w.id]);
  const pdfKey = rows[0]?.answer_key_pdf_key;
  if (!pdfKey || !(await exists('private', pdfKey))) {
    return NextResponse.json({ error: 'answer key not built yet' }, { status: 404 });
  }

  const body = await get('private', pdfKey);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${p.skill}-${p.slug}-answer-key.pdf"`,
      'cache-control': 'private, no-store',
    },
  });
}
