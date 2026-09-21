/**
 * Constraint 6, checked end to end against a running server.
 *
 *   the worksheet PDF is free and ungated
 *   the answer key is not reachable without an account, by any URL
 *   an account gets it, and the unlock is recorded as the conversion event
 *
 * Needs the app running and a teacher account to sign in with:
 *   npx tsx scripts/library-gate-check.ts <email> <password> [baseUrl]
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { query, close } from '../src/lib/db/client.ts';

async function main() {
  const [email, password, base = 'http://127.0.0.1:3000'] = process.argv.slice(2);
  if (!email || !password) throw new Error('usage: library-gate-check.ts <email> <password> [baseUrl]');

  const w = (await query<{ path: string; pdf_key: string; id: string }>(
    `SELECT su.slug||'/'||co.slug||'/'||sk.slug||'/'||w.slug AS path, w.pdf_key, w.id
       FROM worksheet w
       JOIN skill sk ON sk.id = w.primary_skill_id
       JOIN course co ON co.id = w.course_id
       JOIN subject su ON su.id = co.subject_id
      WHERE w.published_at IS NOT NULL LIMIT 1`))[0];

  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] });
  const anon = await browser.newContext();

  // 1. the worksheet is free
  const free = await anon.request.get(`${base}/library/${w.pdf_key}`);
  assert.equal(free.status(), 200);
  assert.match(free.headers()['content-type'] ?? '', /pdf/);
  console.log('✓ the worksheet PDF is free and ungated');

  // 2. the answer key is not reachable anonymously, by any route
  const gate = await anon.request.get(`${base}/worksheets/${w.path}/answer-key/download`,
    { maxRedirects: 0 });
  assert.ok([302, 307].includes(gate.status()), `expected a redirect, got ${gate.status()}`);
  assert.ok(!(gate.headers()['content-type'] ?? '').includes('pdf'));
  console.log('✓ the answer key redirects anonymous visitors to the gate');

  // 3. and the file itself is not sitting in public storage under a guessable name
  const guessed = await anon.request.get(`${base}/library/${w.pdf_key.replace('.pdf', '-key.pdf')}`);
  assert.equal(guessed.status(), 404, 'the answer key must not be served by the static handler');
  console.log('✓ the answer key is not in public storage at all');
  await anon.close();

  // 4. an account gets it
  const teacher = await browser.newContext();
  const page = await teacher.newPage();
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', password);
  await page.click('form button');
  await page.waitForURL('**/teacher', { timeout: 15000 });

  // The API request context does not inherit the browser's cookie jar here, so
  // attach the session explicitly rather than silently testing an anonymous
  // request and calling it a pass.
  const cookie = (await teacher.cookies())
    .map((c) => `${c.name}=${c.value}`).join('; ');
  assert.match(cookie, /pluma_session=/, 'signing in should have produced a session');


  // Two hops, each requested directly: following the redirect would drop the
  // explicit cookie header and quietly test an anonymous request instead.
  const gateSignedIn = await teacher.request.get(
    `${base}/worksheets/${w.path}/answer-key`, { headers: { cookie }, maxRedirects: 0 });
  assert.ok([302, 307].includes(gateSignedIn.status()),
    `a signed-in teacher should be sent straight to the file, got ${gateSignedIn.status()}`);

  const key = await teacher.request.get(
    `${base}/worksheets/${w.path}/answer-key/download`, { headers: { cookie } });
  assert.equal(key.status(), 200);
  assert.match(key.headers()['content-type'] ?? '', /pdf/, 'a signed-in teacher should get the PDF');
  console.log('✓ a signed-in teacher gets the answer key');

  // The unlock is keyed (worksheet, account), so a second visit by the same
  // teacher is correctly a no-op. Assert the row exists for THIS account
  // rather than that a counter moved.
  const unlock = await query<{ created_at: string }>(
    `SELECT u.created_at FROM answer_key_unlock u
       JOIN account a ON a.id = u.account_id
      WHERE u.worksheet_id = $1 AND a.email = $2`, [w.id, email]);
  assert.equal(unlock.length, 1,
    'the unlock is the only conversion event in surface 1; it has to be recorded exactly once');
  console.log('✓ the unlock was recorded, once');

  await browser.close();
  await close();
  console.log('\nconstraint 6 holds');
}

main().catch(async (e) => { console.error('FAILED:', e.message); await close(); process.exit(1); });
