/** Screenshot a running URL. Dev convenience, same role as screenshot.ts. */
import { chromium } from 'playwright-core';

async function main() {
  const [url, outPath] = process.argv.slice(2);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 1200 }, deviceScaleFactor: 2 });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.screenshot({ path: outPath, fullPage: true });
  await browser.close();
  console.log(`wrote ${outPath}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
