/** Click Send SMS and inspect what appears next */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const PROFILE_DIR = path.join(process.cwd(), '.youtube-profile');
const mobileUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const PASSWORD = 'S3rP!B@ys$2025';

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
async function ss(page: any, name: string) {
  const p = `/tmp/ytph-${name}.png`; await page.screenshot({ path: p, fullPage: true }).catch(() => {}); console.log(`[ss] ${p}`);
}
async function clickNext(page: any) {
  await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('button')) as HTMLElement[];
    const n = all.find(b => b.textContent?.trim().toLowerCase() === 'next' && (b as any).offsetParent);
    if (n) { n.click(); return; }
    const lg = Array.from(document.querySelectorAll('button[jsname="LgbsSe"]')) as HTMLElement[];
    const vis = lg.filter(b => (b as any).offsetParent);
    if (vis.length) vis[vis.length - 1].click();
  });
}
async function selectCombobox(page: any, label: string, option: string) {
  const cbs = await page.$$('div[role="combobox"]');
  for (const cb of cbs) { const t = await cb.textContent().catch(() => ''); if (t.trim().toLowerCase().startsWith(label.toLowerCase())) { await cb.click(); await sleep(600); break; } }
  const opts = await page.$$('ul[role="listbox"] li[role="option"]');
  for (const o of opts) { const t = await o.textContent().catch(() => ''); if (t.trim().toLowerCase() === option.toLowerCase()) { await o.click(); await sleep(400); return; } }
}

(async () => {
  try { fs.unlinkSync(path.join(PROFILE_DIR, 'SingletonLock')); } catch {}

  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
    userAgent: mobileUA, viewport: { width: 390, height: 844 },
    locale: 'en-US', isMobile: true, hasTouch: true,
  });
  const page = ctx.pages()[0] || await ctx.newPage();

  await page.goto('https://accounts.google.com/signup/v2/createaccount?flowName=GlifWebSignIn&flowEntry=SignUp', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(2000);
  const fn = await page.$('input[name="firstName"]'); if (fn) await fn.type('Serpbays3', { delay: 30 });
  const ln = await page.$('input[name="lastName"]'); if (ln) await ln.type('Hello3', { delay: 30 });
  await clickNext(page); await sleep(2500);
  await selectCombobox(page, 'Month', 'June');
  const day = await page.$('input[type="tel"]#day'); if (day) { await day.tap(); await day.type('20', { delay: 30 }); }
  const yr = await page.$('input[type="tel"]#year'); if (yr) { await yr.tap(); await yr.type('2000', { delay: 30 }); }
  await selectCombobox(page, 'Gender', 'Male');
  await clickNext(page); await sleep(2500);
  const radios = await page.$$('input[type="radio"]'); if (radios.length) await radios[0].click();
  await clickNext(page); await sleep(2500);
  const pws = await page.$$('input[type="password"]');
  for (const pw of pws) { if (await pw.isVisible().catch(() => false)) { await pw.tap(); await pw.type(PASSWORD, { delay: 30 }); } }
  await clickNext(page); await sleep(4000);

  console.log('Phone page URL:', page.url());
  const txt1 = await page.evaluate(() => document.body.innerText).catch(() => '');
  console.log('Text:', txt1.replace(/\n/g, ' ').slice(0, 300));
  await ss(page, '01-phone-consent');

  // Click "Send SMS"
  const sendSms = await page.$('button:has-text("Send SMS"), button[jsname="LgbsSe"]');
  if (sendSms) {
    console.log('\nClicking Send SMS...');
    await sendSms.click();
    await sleep(3000);
    await ss(page, '02-after-send-sms');
    console.log('URL:', page.url());
    const txt2 = await page.evaluate(() => document.body.innerText).catch(() => '');
    console.log('Text:', txt2.replace(/\n/g, ' ').slice(0, 400));

    // Show all inputs and buttons
    const elems = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('input, button, a, select')).map((el: any) => ({
        tag: el.tagName, type: el.type || '', id: el.id, name: el.name,
        text: el.textContent?.trim().slice(0, 60) || '',
        placeholder: el.placeholder || '',
        visible: el.offsetParent !== null,
      }));
    });
    console.log('\nElements after Send SMS:');
    for (const e of elems) {
      if (e.tag === 'INPUT' || (e.tag === 'BUTTON' && e.visible)) {
        console.log(`  ${e.tag}[type="${e.type}"] id="${e.id}" name="${e.name}" placeholder="${e.placeholder}" text="${e.text}" visible=${e.visible}`);
      }
    }
  } else {
    console.log('No Send SMS button found');
  }

  await ctx.close();
})();
