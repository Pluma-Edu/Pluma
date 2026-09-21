/**
 * Render a worksheet HTML file to PNG at Letter width, in print media.
 *
 * Not a test — a way to actually look at the page. Print bugs (a blank that
 * wraps, a choice grid that collides, a fill too light to photocopy) are
 * invisible in the HTML and obvious in the image.
 *
 *   npx tsx scripts/screenshot.ts out/sheet.html out/sheet.png
 */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

async function main() {
  const [htmlPath, outPath] = process.argv.slice(2);
  if (!htmlPath || !outPath) throw new Error('usage: screenshot.ts <in.html> <out.png>');

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'],
  });
  const page = await browser.newPage({
    viewport: { width: 816, height: 1056 },   // Letter at 96dpi
    deviceScaleFactor: 2,
  });
  await page.setContent(readFileSync(htmlPath, 'utf8'), { waitUntil: 'load' });
  await page.emulateMedia({ media: 'print' });
  await page.screenshot({ path: outPath, fullPage: true });
  await browser.close();
  console.log(`wrote ${outPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
