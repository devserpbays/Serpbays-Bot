import { chromium } from 'playwright';
import path from 'path';

async function main() {
  const ctx = await chromium.launchPersistentContext(
    path.join(process.cwd(), '.quora-profile'),
    { headless: true, args: ['--no-sandbox'], viewport: { width: 1280, height: 800 } }
  );
  const page = ctx.pages()[0] || await ctx.newPage();

  const url = 'https://www.quora.com/search?q=backlinks&type=question&time=week';
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  await page.mouse.wheel(0, 800); await page.waitForTimeout(1500);

  const allLinks = await page.$$('a[href]');
  console.log('Total links on page:', allLinks.length);

  let oldRegex = 0, newRegex = 0;
  const samples: string[] = [];

  for (const link of allLinks) {
    const href = await link.getAttribute('href').catch(() => null);
    if (!href) continue;

    // Old strict regex
    if (href.match(/^\/[A-Z][^/]*\??/) && !href.includes('/profile/') && !href.includes('/topic/') && !href.includes('/search')) {
      oldRegex++;
      if (samples.length < 5) {
        const text = (await link.textContent().catch(() => '')).trim().slice(0, 60);
        if (text) samples.push(`  [old] ${href.slice(0,50)} → "${text}"`);
      }
    }
    // Wider regex — lowercase start too, longer paths
    if (href.match(/^\/[A-Za-z][^/]{5,}/) && !href.includes('/profile/') && !href.includes('/topic/') && !href.includes('/search') && !href.includes('/about') && !href.includes('/sitemap') && !href.includes('/__')) {
      newRegex++;
    }
  }

  console.log('Old regex matches:', oldRegex);
  console.log('New wider regex matches:', newRegex);
  if (samples.length) console.log('Samples:\n' + samples.join('\n'));
  else console.log('No samples — checking page text...');

  const txt = await page.evaluate(() => document.body.innerText.slice(0, 500));
  console.log('Page text:', txt.replace(/\n+/g, ' ').slice(0, 200));

  await page.screenshot({ path: '/tmp/qa-search.png', fullPage: false });
  console.log('[ss] /tmp/qa-search.png');
  await ctx.close();
}
main().catch(console.error);
