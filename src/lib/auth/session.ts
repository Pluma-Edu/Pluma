/**
 * Teacher sessions: a signed cookie, no server-side session table.
 *
 * Students never have one of these. A student's access to work is the class
 * code plus (optionally) a roster PIN, and it is scoped to a single
 * assignment_target — see lib/classroom/student.ts.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

const COOKIE = 'pluma_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error('SESSION_SECRET must be set to at least 32 characters');
  }
  return s;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function encodeSession(accountId: string): string {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS;
  const payload = Buffer.from(JSON.stringify({ accountId, exp })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(token: string | undefined): { accountId: string } | null {
  if (!token) return null;
  const [payload, mac] = token.split('.');
  if (!payload || !mac) return null;

  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(mac);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  try {
    const { accountId, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (typeof accountId !== 'string' || typeof exp !== 'number') return null;
    if (exp < Math.floor(Date.now() / 1000)) return null;
    return { accountId };
  } catch {
    return null;
  }
}

export async function setSessionCookie(accountId: string): Promise<void> {
  (await cookies()).set(COOKIE, encodeSession(accountId), {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
    path: '/', maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

export async function currentAccountId(): Promise<string | null> {
  return decodeSession((await cookies()).get(COOKIE)?.value)?.accountId ?? null;
}

// ---------------------------------------------------------------------------
// Student access.
//
// Not an account. A short-lived, signed grant that names one roster entry in
// one class, issued after the class code and (if set) the PIN check. It carries
// no email, no name, and nothing that identifies a person outside this system.
// ---------------------------------------------------------------------------

const STUDENT_COOKIE = 'pluma_student';
const STUDENT_MAX_AGE = 60 * 60 * 6;   // a school day, not a fortnight

export async function setStudentCookie(rosterEntryId: string, classId: string): Promise<void> {
  const exp = Math.floor(Date.now() / 1000) + STUDENT_MAX_AGE;
  const payload = Buffer.from(JSON.stringify({ rosterEntryId, classId, exp })).toString('base64url');
  (await cookies()).set(STUDENT_COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
    path: '/', maxAge: STUDENT_MAX_AGE,
  });
}

export async function currentStudent(): Promise<{ rosterEntryId: string; classId: string } | null> {
  const token = (await cookies()).get(STUDENT_COOKIE)?.value;
  if (!token) return null;
  const [payload, mac] = token.split('.');
  if (!payload || !mac) return null;
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(mac);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const { rosterEntryId, classId, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (typeof rosterEntryId !== 'string' || typeof classId !== 'string') return null;
    if (exp < Math.floor(Date.now() / 1000)) return null;
    return { rosterEntryId, classId };
  } catch {
    return null;
  }
}

export async function clearStudentCookie(): Promise<void> {
  (await cookies()).delete(STUDENT_COOKIE);
}
