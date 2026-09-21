/**
 * Constraint 6: the worksheet is free and ungated; the answer key needs a free
 * teacher account. It is the only conversion event in surface 1, so it is
 * recorded as one — answer_key_unlock is the number that tells you whether the
 * library is doing its job.
 */
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getWorksheet } from '@/lib/library/queries';
import { currentAccountId } from '@/lib/auth/session';
import { query } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ subject: string; course: string; skill: string; slug: string }> };

export default async function AnswerKeyPage({ params }: Props) {
  const p = await params;
  const w = await getWorksheet(p.subject, p.course, p.skill, p.slug);
  if (!w) notFound();

  const path = `/worksheets/${p.subject}/${p.course}/${p.skill}/${p.slug}`;
  const accountId = await currentAccountId();

  if (accountId) {
    await query(
      `INSERT INTO answer_key_unlock (worksheet_id, account_id) VALUES ($1,$2)
       ON CONFLICT DO NOTHING`, [w.id, accountId]);
    redirect(`${path}/answer-key/download`);
  }

  return (
    <main className="mx-auto max-w-md px-6 py-20">
      <h1 className="text-xl font-semibold tracking-tight">Answer key</h1>
      <p className="mt-3 text-neutral-600">
        The worksheet is free and needs no account. The answer key is free too — it just needs
        a teacher login, so we know a key is going to a teacher.
      </p>

      <div className="mt-6 flex flex-col gap-3">
        <Link href={`/login?next=${encodeURIComponent(`${path}/answer-key`)}`}
              className="rounded bg-neutral-900 px-4 py-2.5 text-center text-white">
          Create a free account
        </Link>
        <Link href={path} className="text-center text-sm underline underline-offset-4">
          Back to {w.title}
        </Link>
      </div>

      <p className="mt-10 border-t border-neutral-200 pt-4 text-xs text-neutral-500">
        No credit card, no trial. The account is also what you use to assign work to a class.
      </p>
    </main>
  );
}
