'use server';

import { redirect } from 'next/navigation';
import { query, one } from '@/lib/db/client';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { setSessionCookie, clearSessionCookie } from '@/lib/auth/session';

/** Only same-site paths. A `next` from a query string is attacker-controlled. */
function safeNext(form: FormData): string {
  const next = String(form.get('next') ?? '');
  return next.startsWith('/') && !next.startsWith('//') ? next : '/teacher';
}

export async function signUp(_prev: string | null, form: FormData): Promise<string | null> {
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  const password = String(form.get('password') ?? '');
  const name = String(form.get('name') ?? '').trim();

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return 'That does not look like an email address.';
  if (password.length < 10) return 'Use at least 10 characters.';

  const existing = await query(`SELECT 1 FROM account WHERE email = $1`, [email]);
  if (existing.length > 0) return 'An account with that email already exists.';

  const account = await one<{ id: string }>(
    `INSERT INTO account (email, password_hash, display_name, role)
     VALUES ($1,$2,$3,'teacher') RETURNING id`,
    [email, await hashPassword(password), name || email.split('@')[0]]);

  await setSessionCookie(account.id);
  redirect(safeNext(form));
}

export async function signIn(_prev: string | null, form: FormData): Promise<string | null> {
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  const password = String(form.get('password') ?? '');

  const rows = await query<{ id: string; password_hash: string | null }>(
    `SELECT id, password_hash FROM account
      WHERE email = $1 AND role = 'teacher' AND deleted_at IS NULL`, [email]);

  // Same message and similar work either way, so this cannot enumerate accounts.
  const stored = rows[0]?.password_hash ?? 'scrypt$AAAA$AAAA';
  const ok = await verifyPassword(password, stored);
  if (!rows[0] || !ok) return 'Email or password is not right.';

  await query(`UPDATE account SET last_seen_at = now() WHERE id = $1`, [rows[0].id]);
  await setSessionCookie(rows[0].id);
  redirect(safeNext(form));
}

export async function signOut(): Promise<void> {
  await clearSessionCookie();
  redirect('/login');
}
