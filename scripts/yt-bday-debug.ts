/** Debug the birthday/gender form — find ALL elements including hidden/custom */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const PROFILE_DIR = path.join(process.cwd(), '.youtube-profile');
const mobileUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
async function ss(page: any, name: string) {
  const p = `/tmp/bday-${name}.png`;
  await page.screenshot({ path: p, fullPage: true }).catch(() => {});
  console.log(`[ss] ${p}`);
}

(async () => {
  try { fs.unlinkSync(path.join(PROFILE_DIR, 'SingletonLock')); } catch {}

  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
    userAgent: mobileUA,
    viewport: { width: 390, height: 844 },
    locale: 'en-US', isMobile: true, hasTouch: true,
  });
  const page = ctx.pages()[0] || await ctx.newPage();

  await page.goto('https://accounts.google.com/signup/v2/createaccount?flowName=GlifWebSignIn&flowEntry=SignUp', {
    waitUntil: 'domcontentloaded', timeout: 30000,
  });
  await sleep(2000);

  // Fill name
  const fn = await page.$('input[name="firstName"]');
  const ln = await page.$('input[name="lastName"]');
  if (fn) await fn.type('Serpbays', { delay: 50 });
  if (ln) await ln.type('Hello', { delay: 50 });
  await sleep(500);

  // Next
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button')) as HTMLElement[];
    const n = btns.find(b => b.textContent?.trim().toLowerCase() === 'next' && (b as any).offsetParent);
    if (n) n.click();
  });
  await sleep(3000);
  await ss(page, '01-birthday');

  // Full DOM inspection
  const domInfo = await page.evaluate(() => {
    const interactable = Array.from(document.querySelectorAll(
      'input, select, [role="listbox"], [role="combobox"], [role="option"], .VfPpkd-TkwUic, [jsname]'
    ));
    return interactable.map((el: any) => ({
      tag: el.tagName,
      type: el.type || '',
      id: el.id || '',
      name: el.name || '',
      role: el.getAttribute('role') || '',
      jsname: el.getAttribute('jsname') || '',
      class: el.className?.toString().slice(0, 60) || '',
      text: el.textContent?.trim().slice(0, 60) || '',
      value: el.value || '',
      ariaLabel: el.getAttribute('aria-label') || '',
      options: el.tagName === 'SELECT' ? Array.from(el.options).map((o: any) => `${o.value}:${o.text}`) : [],
    }));
  });

  console.log('\n=== All interactable elements on birthday page ===');
  for (const el of domInfo) {
    if (el.tag === 'INPUT' || el.tag === 'SELECT' || el.role || el.jsname) {
      console.log(`  ${el.tag} type="${el.type}" id="${el.id}" name="${el.name}" role="${el.role}" jsname="${el.jsname}" aria-label="${el.ariaLabel}" text="${el.text}" value="${el.value}"`);
      if (el.options.length) console.log(`    options: ${el.options.slice(0, 8).join(', ')}`);
    }
  }

  await ctx.close();
})();
