/**
 * HTML to PDF through headless Chromium.
 *
 * This runs in its own process, not in the web server: each render costs
 * 150-300 MB of RSS, and a batch job or a crawler that discovers the PDF routes
 * must not be able to take the classroom down with it.
 *
 * executablePath is explicit on purpose — relying on a version-matched
 * playwright download is the thing that breaks on a machine that already has a
 * browser installed.
 */
import { chromium, type Browser } from 'playwright-core';

let browser: Browser | undefined;

function executablePath(): string | undefined {
  return process.env.CHROMIUM_PATH || undefined;
}

export async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await chromium.launch({
      executablePath: executablePath(),
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
    });
  }
  return browser;
}

export async function htmlToPdf(html: string): Promise<Buffer> {
  const b = await getBrowser();
  const page = await b.newPage();
  try {
    await page.setContent(html, { waitUntil: 'load' });
    // Fonts are local, but waiting is cheap and a half-loaded font silently
    // changes every line break on the page.
    await page.evaluate(() => document.fonts.ready);
    await page.emulateMedia({ media: 'print' });
    return await page.pdf({
      format: 'Letter',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate:
        '<div style="width:100%;font-size:8pt;font-family:Georgia,serif;color:#000;'
        + 'padding:0 0.65in;display:flex;justify-content:space-between;">'
        + '<span>pluma</span><span class="pageNumber"></span></div>',
      margin: { top: '0.6in', bottom: '0.8in', left: '0.65in', right: '0.65in' },
    });
  } finally {
    await page.close();
  }
}

export async function closeBrowser(): Promise<void> {
  if (browser) { await browser.close(); browser = undefined; }
}
