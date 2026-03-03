/**
 * Google Account Signup - yt-signup6.ts
 * Birthday: June 20, 2000 | Gender: Male
 * Selects suggested Gmail address (serpbayshello@gmail.com)
 */

import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const YT_PROFILE_DIR = path.join(process.cwd(), '.youtube-profile');
const VERIFIED_FILE  = path.join(YT_PROFILE_DIR, '.verified');

const PASSWORD   = 'S3rP!B@ys$2025';
const FIRST_NAME = 'Serpbays';
const LAST_NAME  = 'Hello';

const BIRTH_MONTH = 'June';
const BIRTH_DAY   = '20';
const BIRTH_YEAR  = '2000';

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function ss(page: any, name: string) {
  const p = `/tmp/yt6-${name}.png`;
  await page.screenshot({ path: p, fullPage: true }).catch(() => {});
  console.log(`  [ss] ${p}`);
}

// Click the last visible button with jsname="LgbsSe" (always the real Next/Continue)
async function clickNext(page: any) {
  await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('button[jsname="LgbsSe"]')) as HTMLElement[];
    const visible = all.filter(b => (b as any).offsetParent !== null);
    if (visible.length) visible[visible.length - 1].click();
  });
}

async function main() {
  console.log('Launching...');
  const context = await chromium.launchPersistentContext(YT_PROFILE_DIR, {
    headless: true,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'en-US',
  });
  const page = context.pages()[0] || await context.newPage();
  let chosenEmail = '';

  try {
    // ── Step 1: Name ───────────────────────────────────────────────────────────
    console.log('\n=== 1. Name ===');
    await page.goto('https://accounts.google.com/signup/v2/createaccount?flowName=GlifWebSignIn&flowEntry=SignUp', {
      waitUntil: 'domcontentloaded', timeout: 30000,
    });
    await sleep(2000);
    await page.waitForSelector('input[name="firstName"]', { timeout: 15000 });
    await page.fill('input[name="firstName"]', FIRST_NAME);
    await page.fill('input[name="lastName"]',  LAST_NAME);
    await ss(page, '01-name');
    await clickNext(page);
    await sleep(3000);
    console.log('  URL:', page.url());

    // ── Step 2: Birthday & Gender ──────────────────────────────────────────────
    console.log('\n=== 2. Birthday & Gender ===');
    await page.waitForSelector('input[name="day"]', { timeout: 15000 });

    await page.fill('input[name="day"]',  BIRTH_DAY);
    await sleep(150);
    await page.fill('input[name="year"]', BIRTH_YEAR);
    await sleep(150);

    // Month — JS dispatch on the option
    const monthEl = await page.$('#month');
    if (monthEl) {
      const tag = await monthEl.evaluate((el: Element) => el.tagName.toLowerCase());
      if (tag === 'select') {
        await page.selectOption('#month', { label: BIRTH_MONTH });
      } else {
        await monthEl.click();
        await sleep(700);
        await page.evaluate((m: string) => {
          document.querySelectorAll('li[role="option"]').forEach(o => {
            if (o.textContent?.trim() === m)
              (o as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
          });
        }, BIRTH_MONTH);
      }
    }
    await sleep(200);

    // Gender — open via JS then keyboard to Male (2nd item)
    await page.evaluate(() => {
      const t = document.querySelector('#gender .VfPpkd-TkwUic') as HTMLElement;
      if (t) t.click();
    });
    await sleep(900);
    await ss(page, '02-gender-open');

    // Press ArrowDown twice (skips Female → lands on Male), then Enter
    await page.keyboard.press('ArrowDown');
    await sleep(150);
    await page.keyboard.press('ArrowDown');
    await sleep(150);
    await page.keyboard.press('Enter');
    await sleep(400);

    await ss(page, '03-bday-done');
    console.log('  day=%s year=%s',
      await page.$eval('input[name="day"]',  (e: HTMLInputElement) => e.value).catch(() => '?'),
      await page.$eval('input[name="year"]', (e: HTMLInputElement) => e.value).catch(() => '?'));

    await clickNext(page);
    await sleep(3000);
    console.log('  URL:', page.url());

    // ── Step 3: Email selection ────────────────────────────────────────────────
    console.log('\n=== 3. Email selection ===');
    await ss(page, '04-email-page');
    const emailPageTxt = await page.evaluate(() => document.body.innerText);
    console.log('  Page snippet:', emailPageTxt.slice(0, 200).replace(/\n+/g, ' '));

    // Find radio buttons — Google suggests serpbayshello@gmail.com, helloserpbays@gmail.com
    const radios = await page.$$('input[type="radio"]');
    console.log('  Radio count:', radios.length);

    if (radios.length > 0) {
      // Get labels for all radios
      const labels: string[] = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('input[type="radio"]')).map(r => {
          const id = r.id;
          const lbl = document.querySelector(`label[for="${id}"]`)?.textContent?.trim() || '';
          return lbl || (r as HTMLInputElement).value || '';
        });
      });
      console.log('  Options:', labels);

      // Pick first suggestion (index 0 = serpbayshello@gmail.com)
      // Exclude "custom" / "Create your own" option (last radio)
      const idx = labels.findIndex((l: string) => l !== 'custom' && !l.toLowerCase().includes('create'));
      const pickIdx = idx >= 0 ? idx : 0;
      chosenEmail = labels[pickIdx].includes('@') ? labels[pickIdx] : labels[pickIdx] + '@gmail.com';
      await page.evaluate((i: number) => {
        const r = document.querySelectorAll('input[type="radio"]')[i] as HTMLElement;
        r?.click();
      }, pickIdx);
      console.log('  Selected radio[' + pickIdx + ']:', chosenEmail);
      await sleep(500);
    } else {
      // No radios — may be showing direct text input already
      const inp = await page.$('input[name="Username"]');
      if (inp && await inp.isVisible()) {
        await inp.fill('serpbayshello25');
        chosenEmail = 'serpbayshello25@gmail.com';
      }
    }

    await ss(page, '05-email-selected');
    // Must click "Next" specifically — not "Use your existing email" (also LgbsSe)
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button[jsname="LgbsSe"]')) as HTMLElement[];
      const nextBtn = btns.find(b => b.textContent?.trim() === 'Next' && (b as any).offsetParent !== null);
      if (nextBtn) nextBtn.click();
      else {
        // Fallback: first visible LgbsSe
        const visible = btns.filter(b => (b as any).offsetParent !== null);
        if (visible.length) visible[0].click();
      }
    });
    await sleep(4000);
    console.log('  URL:', page.url());
    const afterEmailTxt = await page.evaluate(() => document.body.innerText.slice(0, 300));
    console.log('  After email:', afterEmailTxt.replace(/\n+/g, ' '));

    // ── Step 4: Password ───────────────────────────────────────────────────────
    console.log('\n=== 4. Password ===');
    try {
      // Wait for any password input to appear
      await page.waitForSelector('input[type="password"]', { timeout: 15000 });

      // Fill all visible password inputs (first = Password, second = Confirm)
      const pwInputs = await page.$$('input[type="password"]');
      console.log('  Found', pwInputs.length, 'password input(s)');
      for (const inp of pwInputs) {
        if (await inp.isVisible()) {
          await inp.click({ clickCount: 3 });
          await inp.fill('');
          await inp.type(PASSWORD, { delay: 40 });
          await sleep(200);
        }
      }
      await ss(page, '06-password');
      await clickNext(page);
      await sleep(3000);
      console.log('  URL:', page.url());
    } catch (e) {
      console.log('  Password step error:', (e as Error).message);
      await ss(page, '06-password-fail');
      const u = page.url();
      const t = await page.evaluate(() => document.body.innerText.slice(0, 400));
      console.log('  URL:', u, '\n  Text:', t.replace(/\n+/g, ' '));
    }

    // ── Step 5: Post-password (phone, terms, etc.) ─────────────────────────────
    console.log('\n=== 5. Post-password ===');
    for (let i = 0; i < 6; i++) {
      await sleep(2500);
      const url = page.url();
      const txt = await page.evaluate(() => document.body.innerText);
      const flat = txt.replace(/\n+/g, ' ');
      console.log(`  [${i}] ${url.slice(0, 80)}`);
      console.log(`  [${i}] ${flat.slice(0, 180)}`);
      await ss(page, `07-post${i}`);

      if (url.includes('myaccount') || url.includes('google.com/b/') || url.includes('youtube.com/')) break;

      if (flat.toLowerCase().includes('phone')) {
        const skip = await page.$('button:has-text("Skip"), button:has-text("Not now")');
        if (skip) { await skip.click(); console.log('  Skipped phone'); continue; }
      }
      if (flat.toLowerCase().includes('i agree') || flat.toLowerCase().includes('privacy and terms')) {
        const agree = await page.$('button:has-text("I agree"), button:has-text("Accept")');
        if (agree) { await agree.click(); console.log('  Agreed'); continue; }
      }
      // Generic next
      await clickNext(page);
    }

    // ── Final check on YouTube ─────────────────────────────────────────────────
    console.log('\n=== 6. YouTube check ===');
    await page.goto('https://www.youtube.com', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(3000);
    await ss(page, '08-youtube');

    const hasAvatar = await page.$('#avatar-btn, button[aria-label*="Account"]').then(e => !!e).catch(() => false);
    const ytTxt = await page.evaluate(() => document.body.innerText);
    const loggedIn = hasAvatar || !ytTxt.includes('Sign in');
    console.log('  hasAvatar:', hasAvatar, '| has "Sign in":', ytTxt.includes('Sign in'));

    if (loggedIn) {
      console.log('\n  ✓ SUCCESS — logged in to YouTube!');
      fs.writeFileSync(VERIFIED_FILE, JSON.stringify({
        loggedIn: true,
        email: chosenEmail,
        ts: new Date().toISOString(),
        message: 'Account created via yt-signup6',
      }, null, 2));
    } else {
      const finalUrl = page.url();
      console.log('\n  ✗ Not complete. Final URL:', finalUrl);
      fs.writeFileSync(VERIFIED_FILE, JSON.stringify({
        loggedIn: false,
        ts: new Date().toISOString(),
        message: `Signup incomplete. URL: ${finalUrl.slice(0, 120)}`,
      }, null, 2));
    }

  } catch (err) {
    console.error('Fatal:', (err as Error).message);
    await ss(page, 'fatal').catch(() => {});
  } finally {
    await context.close();
  }
}

main().catch(console.error);
