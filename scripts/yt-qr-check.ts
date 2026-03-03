/**
 * Run signup to QR step and capture all options + full page screenshot
 */
import { chromium } from 'playwright';
import path from 'path';

const YT_PROFILE_DIR = path.join(process.cwd(), '.youtube-profile');

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function clickNextBtn(page: any) {
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button[jsname="LgbsSe"]')) as HTMLElement[];
    const v = btns.filter(b => (b as any).offsetParent !== null);
    const nextBtn = v.find(b => b.textContent?.trim() === 'Next') || v[v.length - 1];
    if (nextBtn) nextBtn.click();
  });
}

async function main() {
  const ctx = await chromium.launchPersistentContext(YT_PROFILE_DIR, {
    headless: true, args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'en-US',
  });
  const page = ctx.pages()[0] || await ctx.newPage();

  await page.goto('https://accounts.google.com/signup/v2/createaccount?flowName=GlifWebSignIn&flowEntry=SignUp', {
    waitUntil: 'domcontentloaded', timeout: 30000,
  });
  await sleep(2000);

  // Name
  await page.waitForSelector('input[name="firstName"]');
  await page.fill('input[name="firstName"]', 'Serpbays');
  await page.fill('input[name="lastName"]', 'Hello');
  await clickNextBtn(page);
  await sleep(3000);

  // Birthday + gender
  await page.fill('input[name="day"]', '20');
  await page.fill('input[name="year"]', '2000');
  const monthEl = await page.$('#month');
  if (monthEl) {
    await monthEl.click(); await sleep(700);
    await page.evaluate(() => {
      document.querySelectorAll('li[role="option"]').forEach((o: any) => {
        if (o.textContent?.trim() === 'June') o.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    });
  }
  await sleep(200);
  await page.evaluate(() => {
    const t = document.querySelector('#gender .VfPpkd-TkwUic') as HTMLElement;
    if (t) t.click();
  });
  await sleep(900);
  await page.keyboard.press('ArrowDown'); await sleep(150);
  await page.keyboard.press('ArrowDown'); await sleep(150);
  await page.keyboard.press('Enter'); await sleep(400);
  await clickNextBtn(page);
  await sleep(3000);

  // Select first Gmail radio
  await page.evaluate(() => {
    const r = document.querySelectorAll('input[type="radio"]')[0] as HTMLElement;
    r?.click();
  });
  await sleep(500);
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button[jsname="LgbsSe"]')) as HTMLElement[];
    const nextBtn = btns.find(b => b.textContent?.trim() === 'Next' && (b as any).offsetParent !== null);
    if (nextBtn) nextBtn.click();
  });
  await sleep(4000);

  // Password
  const pwInputs = await page.$$('input[type="password"]');
  for (const inp of pwInputs) {
    if (await inp.isVisible()) {
      await inp.type('S3rP!B@ys$2025', { delay: 40 });
      await sleep(200);
    }
  }
  await clickNextBtn(page);
  await sleep(3000);

  // Now at QR / verification step
  console.log('URL:', page.url());
  const txt = await page.evaluate(() => document.body.innerText);
  console.log('\n=== Full page text ===');
  console.log(txt);

  // Screenshot full page
  await page.screenshot({ path: '/tmp/yt-qr-full.png', fullPage: true });
  console.log('\n[ss] /tmp/yt-qr-full.png');

  // Scroll down to see if there are more options
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(1000);
  await page.screenshot({ path: '/tmp/yt-qr-bottom.png', fullPage: true });
  console.log('[ss] /tmp/yt-qr-bottom.png');

  // Check for "Use phone number" or other links
  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a, button')).map(el => ({
      tag: el.tagName,
      text: el.textContent?.trim().slice(0, 80),
      href: (el as HTMLAnchorElement).href || '',
    })).filter(x => x.text && x.text.length > 2);
  });
  console.log('\n=== Clickable elements ===');
  links.forEach((l: any) => console.log(`  [${l.tag}] "${l.text}"`, l.href ? `→ ${l.href.slice(0, 60)}` : ''));

  await ctx.close();
}

main().catch(console.error);
