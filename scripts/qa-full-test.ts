import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const PROFILE_DIR = path.join(process.cwd(), '.quora-profile');
const TEST_URL = 'https://www.quora.com/How-does-guest-posting-work';

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  try { fs.unlinkSync(path.join(PROFILE_DIR, 'SingletonLock')); } catch {}

  const browser = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
  });
  const page = browser.pages()[0] || await browser.newPage();

  console.log('Navigating to question...');
  await page.goto(TEST_URL, { waitUntil: 'domcontentloaded' });
  await sleep(4000);
  console.log('URL:', page.url());

  // Scroll to trigger Answer button
  await page.mouse.wheel(0, 400);
  await sleep(2000);

  // List all buttons
  const allBtns = await page.$$('button');
  console.log(`Total buttons: ${allBtns.length}`);

  // Try to click the Answer button (fixed logic: startsWith)
  let clickedAnswer = false;
  for (const btn of allBtns) {
    const text = await btn.textContent().catch(() => '');
    const visible = await btn.isVisible().catch(() => false);
    if (text && text.trim().toLowerCase().startsWith('answer') && visible) {
      console.log(`Clicking Answer button: "${text.trim()}"`);
      await btn.click({ force: true });
      clickedAnswer = true;
      await sleep(3000);
      break;
    }
  }

  if (!clickedAnswer) {
    // Print all visible buttons for debugging
    console.error('Could not find Answer button. Visible buttons:');
    for (const btn of allBtns) {
      const text = await btn.textContent().catch(() => '');
      const visible = await btn.isVisible().catch(() => false);
      if (visible && text?.trim()) console.log(`  "${text.trim().slice(0, 60)}"`);
    }
    await page.screenshot({ path: '/tmp/qa-test-no-btn.png' });
  } else {
    await page.screenshot({ path: '/tmp/qa-test-2-after-click.png' });
    console.log('Clicked. Checking for editor...');
    await sleep(2000);
    const editors = await page.$$('div[contenteditable="true"]');
    let editorFound = false;
    for (const ed of editors) {
      const visible = await ed.isVisible().catch(() => false);
      if (visible) { editorFound = true; break; }
    }
    console.log(editorFound ? 'SUCCESS: Editor is visible!' : 'FAIL: No visible editor');
    await page.screenshot({ path: '/tmp/qa-test-3-editor.png' });
  }

  await browser.close();
})();
