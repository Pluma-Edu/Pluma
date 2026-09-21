/** Drive the real app as a teacher and screenshot a page. Dev tool. */
import { chromium } from 'playwright-core';

async function main() {
  const [email, password, path, outPath] = process.argv.slice(2);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 2 });

  await page.goto('http://127.0.0.1:3000/login', { waitUntil: 'networkidle' });
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', password);
  await page.click('button[type=submit], form button');
  await page.waitForURL('**/teacher', { timeout: 15000 });

  await page.goto(`http://127.0.0.1:3000${path}`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: outPath, fullPage: true });
  await browser.close();
  console.log(`wrote ${outPath}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
