import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const PROFILE_DIR = path.join(process.cwd(), '.quora-profile');

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  try { fs.unlinkSync(path.join(PROFILE_DIR, 'SingletonLock')); } catch {}

  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
  });
  const page = ctx.pages()[0] || await ctx.newPage();

  // Step 1: Go to Quora homepage
  console.log('Going to Quora homepage...');
  await page.goto('https://www.quora.com', { waitUntil: 'domcontentloaded' });
  await sleep(3000);
  await page.screenshot({ path: '/tmp/qa-home.png', fullPage: false });
  console.log('[ss] /tmp/qa-home.png');

  const homeTitle = await page.title();
  const homeUrl = page.url();
  console.log('Home title:', homeTitle);
  console.log('Home URL:', homeUrl);

  // Step 2: Find search box
  const searchInputs = await page.$$('input');
  console.log('Total inputs on page:', searchInputs.length);
  for (const inp of searchInputs) {
    const type = await inp.getAttribute('type').catch(() => '');
    const placeholder = await inp.getAttribute('placeholder').catch(() => '');
    const visible = await inp.isVisible().catch(() => false);
    if (visible) console.log(`  input type="${type}" placeholder="${placeholder}"`);
  }

  // Step 3: Try clicking search and typing
  const keyword = 'backlinks';
  let searchWorked = false;
  try {
    const searchEl = await page.$('input[type="text"], input[placeholder*="Search"], input[placeholder*="search"]');
    if (searchEl && await searchEl.isVisible()) {
      console.log('Found search box, clicking...');
      await searchEl.click();
      await sleep(500);
      await searchEl.type(keyword, { delay: 80 });
      await sleep(500);
      await page.keyboard.press('Enter');
      await sleep(4000);
      searchWorked = true;
    } else {
      console.log('Search box not found or hidden');
    }
  } catch (e) {
    console.log('Search box error:', (e as Error).message);
  }

  await page.screenshot({ path: '/tmp/qa-after-search.png', fullPage: false });
  console.log('[ss] /tmp/qa-after-search.png');

  const searchUrl = page.url();
  const searchTitle = await page.title();
  console.log('After search URL:', searchUrl);
  console.log('After search title:', searchTitle);

  // Step 4: Count question links
  const allLinks = await page.$$('a[href]');
  console.log('Total links:', allLinks.length);

  // Print ALL hrefs to understand format
  console.log('\n=== All hrefs (first 30) ===');
  const hrefs: string[] = [];
  for (const link of allLinks) {
    const href = await link.getAttribute('href').catch(() => null);
    if (href) hrefs.push(href);
  }
  hrefs.slice(0, 30).forEach(h => console.log(' ', h));

  let qCount = 0;
  const samples: string[] = [];
  for (const link of allLinks) {
    const href = await link.getAttribute('href').catch(() => null);
    if (!href) continue;
    if (href.match(/^\/[A-Za-z][^/]{5,}/) && !href.includes('/profile/') && !href.includes('/topic/') && !href.includes('/search') && !href.includes('/about') && !href.includes('/__')) {
      qCount++;
      if (samples.length < 5) {
        const text = (await link.textContent().catch(() => '')).trim();
        if (text && text.length > 10) samples.push(`  ${href.slice(0,50)} → "${text.slice(0,60)}"`);
      }
    }
  }
  console.log('\nQuestion-like links:', qCount);
  samples.forEach(s => console.log(s));

  // Check for keyword matches
  const lowerKeyword = keyword.toLowerCase();
  let matched = 0;
  for (const link of allLinks) {
    const text = (await link.textContent().catch(() => '')).toLowerCase();
    if (text.includes(lowerKeyword)) matched++;
  }
  console.log('Links mentioning keyword:', matched);

  await ctx.close();
}

main().catch(console.error);
