import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (p: string, s: Buffer, k: number) => Promise<Buffer>;
const KEYLEN = 64;

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(plain.normalize('NFKC'), salt, KEYLEN);
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const [scheme, salt, key] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !key) return false;
  const expected = Buffer.from(key, 'base64url');
  const actual = await scrypt(plain.normalize('NFKC'), Buffer.from(salt, 'base64url'), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Roster PINs are short by design, so they are rate-limited rather than strong. */
export async function hashPin(pin: string): Promise<string> {
  return hashPassword(pin);
}
export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  return verifyPassword(pin, stored);
}
