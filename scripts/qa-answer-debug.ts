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

  const questionUrl = 'https://www.quora.com/How-does-guest-posting-work';
  console.log('Navigating to:', questionUrl);
  await page.goto(questionUrl, { waitUntil: 'domcontentloaded' });
  await sleep(3000);
  await page.screenshot({ path: '/tmp/qa-question.png', fullPage: false });
  console.log('[ss] /tmp/qa-question.png');

  console.log('URL:', page.url());
  console.log('Title:', await page.title());

  // Find all buttons
  const buttons = await page.$$('button');
  console.log('\nAll visible buttons:');
  for (const btn of buttons) {
    const text = (await btn.textContent().catch(() => '')).trim();
    const visible = await btn.isVisible().catch(() => false);
    if (visible && text) console.log(`  "${text}"`);
  }

  // Scroll down
  await page.mouse.wheel(0, 500);
  await sleep(2000);
  await page.screenshot({ path: '/tmp/qa-question2.png', fullPage: false });
  console.log('\n[ss] /tmp/qa-question2.png');

  // Try clicking Answer button
  const answerBtns = await page.$$('button');
  let clicked = false;
  for (const btn of answerBtns) {
    const text = (await btn.textContent().catch(() => '')).trim();
    if (/^answer$/i.test(text) && await btn.isVisible().catch(() => false)) {
      console.log('\nClicking Answer button...');
      await btn.click({ force: true });
      clicked = true;
      break;
    }
  }
  if (!clicked) console.log('\nNo "Answer" button found');

  await sleep(3000);
  await page.screenshot({ path: '/tmp/qa-after-answer-click.png', fullPage: false });
  console.log('[ss] /tmp/qa-after-answer-click.png');

  // Check for contenteditable
  const editables = await page.$$('[contenteditable="true"]');
  console.log('\nContenteditable elements:', editables.length);
  for (const el of editables) {
    const visible = await el.isVisible().catch(() => false);
    const tag = await el.evaluate((e: Element) => e.tagName);
    const className = await el.evaluate((e: Element) => e.className.slice(0, 60));
    const placeholder = await el.getAttribute('data-placeholder').catch(() => '');
    console.log(`  ${tag} visible=${visible} class="${className}" placeholder="${placeholder}"`);
  }

  await ctx.close();
}
main().catch(console.error);
