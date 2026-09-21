import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.SESSION_SECRET = 'a'.repeat(40);
const { encodeSession, decodeSession } = await import('./session.ts');
const { hashPassword, verifyPassword } = await import('./password.ts');
const { createHmac } = await import('node:crypto');

test('a session round-trips', () => {
  const token = encodeSession('11111111-1111-1111-1111-111111111111');
  assert.equal(decodeSession(token)?.accountId, '11111111-1111-1111-1111-111111111111');
});

test('a tampered payload is rejected', () => {
  const token = encodeSession('11111111-1111-1111-1111-111111111111');
  const [payload, mac] = token.split('.');
  const forged = Buffer.from(JSON.stringify({
    accountId: '22222222-2222-2222-2222-222222222222',
    exp: Math.floor(Date.now() / 1000) + 600,
  })).toString('base64url');
  assert.equal(decodeSession(`${forged}.${mac}`), null);
  assert.equal(decodeSession(`${payload}.${'x'.repeat(mac.length)}`), null);
  assert.equal(decodeSession('garbage'), null);
  assert.equal(decodeSession(undefined), null);
});

test('an expired session is rejected', () => {
  const payload = Buffer.from(JSON.stringify({
    accountId: '11111111-1111-1111-1111-111111111111',
    exp: Math.floor(Date.now() / 1000) - 1,
  })).toString('base64url');
  const mac = createHmac('sha256', process.env.SESSION_SECRET!).update(payload).digest('base64url');
  assert.equal(decodeSession(`${payload}.${mac}`), null);
});

test('passwords hash and verify, and a wrong one fails', async () => {
  const stored = await hashPassword('correct horse battery staple');
  assert.ok(stored.startsWith('scrypt$'));
  assert.equal(await verifyPassword('correct horse battery staple', stored), true);
  assert.equal(await verifyPassword('wrong', stored), false);
  assert.equal(await verifyPassword('correct horse battery staple', 'garbage'), false);
});

test('the same password hashes differently each time', async () => {
  const a = await hashPassword('same');
  const b = await hashPassword('same');
  assert.notEqual(a, b, 'salts must differ');
});
