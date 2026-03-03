/**
 * yt-signup7.ts — Google account creation, mobile UA
 * Mobile Safari user agent sometimes avoids phone verification on VPS.
 * Birthday: June 20, 2000 / Gender: Male
 * Password: S3rP!B@ys$2025
 */

import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const PROFILE_DIR = path.join(process.cwd(), '.youtube-profile');
const VERIFIED_FILE = path.join(PROFILE_DIR, '.verified');

const FIRST_NAME = 'Serpbays';
const LAST_NAME = 'Hello';
const PASSWORD = 'S3rP!B@ys$2025';
const mobileUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
async function ss(page: any, name: string) {
  const p = `/tmp/yt-s7-${name}.png`;
  await page.screenshot({ path: p, fullPage: false }).catch(() => {});
  console.log(`[ss] ${p}`);
}

/** Click Next button by matching text exactly */
async function clickNext(page: any) {
  await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('button')) as HTMLElement[];
    const n = all.find(b => b.textContent?.trim().toLowerCase() === 'next' && (b as any).offsetParent);
    if (n) { n.click(); return; }
    // Google's LgbsSe fallback
    const lg = Array.from(document.querySelectorAll('button[jsname="LgbsSe"]')) as HTMLElement[];
    const vis = lg.filter(b => (b as any).offsetParent);
    if (vis.length) vis[vis.length - 1].click();
  });
}

/** Select an option from a Google custom combobox (div[role=combobox] → ul[role=listbox]) */
async function selectCombobox(page: any, ariaLabel: string, optionText: string) {
  // Click the combobox trigger
  const comboboxes = await page.$$('div[role="combobox"]');
  for (const cb of comboboxes) {
    const txt = await cb.textContent().catch(() => '');
    if (txt.trim().toLowerCase().startsWith(ariaLabel.toLowerCase())) {
      await cb.click();
      await sleep(600);
      break;
    }
  }

  // Click the option from the open listbox
  const options = await page.$$('ul[role="listbox"] li[role="option"], ul[role="listbox"] li');
  for (const opt of options) {
    const txt = await opt.textContent().catch(() => '');
    if (txt.trim().toLowerCase() === optionText.toLowerCase()) {
      await opt.click();
      await sleep(400);
      return true;
    }
  }
  console.warn(`  Option "${optionText}" not found in "${ariaLabel}" combobox`);
  return false;
}

async function main() {
  try { fs.unlinkSync(path.join(PROFILE_DIR, 'SingletonLock')); } catch {}
  fs.mkdirSync(PROFILE_DIR, { recursive: true });

  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
    userAgent: mobileUA,
    viewport: { width: 390, height: 844 },
    locale: 'en-US', isMobile: true, hasTouch: true,
  });
  const page = ctx.pages()[0] || await ctx.newPage();

  try {
    console.log('=== Step 1: Go to Google Signup ===');
    await page.goto('https://accounts.google.com/signup/v2/createaccount?flowName=GlifWebSignIn&flowEntry=SignUp', {
      waitUntil: 'domcontentloaded', timeout: 30000,
    });
    await sleep(3000);
    await ss(page, '01-start');

    // Fill name
    console.log('=== Step 2: Name ===');
    const fn = await page.$('input[name="firstName"]');
    const ln = await page.$('input[name="lastName"]');
    if (fn) { await fn.tap(); await fn.type(FIRST_NAME, { delay: 50 }); }
    if (ln) { await ln.tap(); await ln.type(LAST_NAME, { delay: 50 }); }
    await sleep(500);
    await ss(page, '02-name');
    await clickNext(page);
    await sleep(3000);
    await ss(page, '03-after-name');
    console.log('URL:', page.url());

    // Birthday / Gender
    const pt3 = await page.evaluate(() => document.body.innerText).catch(() => '');
    if (pt3.toLowerCase().includes('birthday') || pt3.toLowerCase().includes('birth')) {
      console.log('=== Step 3: Birthday/Gender ===');

      // Month — custom combobox with li[role="option"]
      const monthOk = await selectCombobox(page, 'Month', 'June');
      console.log('  Month June:', monthOk);
      await ss(page, '04a-month');

      // Day — input[type="tel"]#day
      const dayInput = await page.$('input[type="tel"]#day, input[name="day"]');
      if (dayInput) {
        await dayInput.tap();
        await dayInput.selectText().catch(() => dayInput.click({ clickCount: 3 }));
        await dayInput.type('20', { delay: 50 });
      }

      // Year — input[type="tel"]#year
      const yearInput = await page.$('input[type="tel"]#year, input[name="year"]');
      if (yearInput) {
        await yearInput.tap();
        await yearInput.selectText().catch(() => yearInput.click({ clickCount: 3 }));
        await yearInput.type('2000', { delay: 50 });
      }

      await ss(page, '04b-day-year');

      // Gender — second combobox
      const genderOk = await selectCombobox(page, 'Gender', 'Male');
      console.log('  Gender Male:', genderOk);
      await ss(page, '04c-gender');

      await clickNext(page);
      await sleep(3000);
      await ss(page, '05-after-birthday');
      console.log('URL:', page.url());
    }

    // Gmail / Username step
    const pt5 = await page.evaluate(() => document.body.innerText).catch(() => '');
    console.log('Page:', pt5.slice(0, 200).replace(/\n/g, ' '));

    if (pt5.toLowerCase().includes('gmail') || pt5.toLowerCase().includes('address') || pt5.toLowerCase().includes('username')) {
      console.log('=== Step 4: Email ===');

      const radios = await page.$$('input[type="radio"]');
      console.log(`Found ${radios.length} radio options`);
      if (radios.length > 0) {
        // Log and pick first option
        for (let i = 0; i < Math.min(radios.length, 4); i++) {
          const label = await page.evaluate((r: HTMLInputElement) => {
            const lbl = document.querySelector(`label[for="${r.id}"]`);
            return lbl?.textContent?.trim() || r.value || `radio-${i}`;
          }, radios[i]);
          console.log(`  Radio ${i}: "${label}"`);
        }
        await radios[0].click();
        await sleep(500);
      } else {
        // No radios — type in text field
        const emailInput = await page.$('input[type="text"][name*="Username"], input[type="email"], input[name*="email"]');
        if (emailInput) {
          await emailInput.tap();
          await emailInput.selectText().catch(() => emailInput.click({ clickCount: 3 }));
          await emailInput.type('serpbayshello', { delay: 50 });
          console.log('Typed serpbayshello');
        }
      }
      await ss(page, '06-email');
      await clickNext(page);
      await sleep(4000);
      await ss(page, '07-after-email');
      console.log('URL:', page.url());
    }

    // Password
    const pt7 = await page.evaluate(() => document.body.innerText).catch(() => '');
    console.log('Page:', pt7.slice(0, 150).replace(/\n/g, ' '));

    if (pt7.toLowerCase().includes('password') || pt7.toLowerCase().includes('strong')) {
      console.log('=== Step 5: Password ===');
      const pwInputs = await page.$$('input[type="password"]');
      console.log(`Found ${pwInputs.length} password inputs`);
      for (const inp of pwInputs) {
        if (await inp.isVisible().catch(() => false)) {
          await inp.tap();
          await inp.selectText().catch(() => inp.click({ clickCount: 3 }));
          await inp.type(PASSWORD, { delay: 40 });
          await sleep(200);
        }
      }
      await ss(page, '08-password');
      await clickNext(page);
      await sleep(4000);
      await ss(page, '09-after-password');
      console.log('URL:', page.url());
    }

    // Post-password loop
    console.log('=== Step 6: Post-password loop ===');
    let loggedIn = false;
    for (let i = 0; i < 10; i++) {
      await sleep(3000);
      const url = page.url();
      const txt = await page.evaluate(() => document.body.innerText).catch(() => '');
      const flat = txt.replace(/\n+/g, ' ').slice(0, 500);
      console.log(`[${i}] URL: ${url}`);
      console.log(`[${i}] Text: ${flat.slice(0, 250)}`);
      await ss(page, `10-step${i}`);

      if (url.includes('myaccount.google.com') || url.includes('youtube.com') ||
          url.includes('google.com/b/') || flat.includes('Welcome, Serpbays')) {
        console.log('Account created!');
        loggedIn = true;
        break;
      }

      // Phone / verification
      if (flat.toLowerCase().includes('phone') || flat.toLowerCase().includes('verify') ||
          flat.toLowerCase().includes('qr') || flat.toLowerCase().includes('scan')) {
        console.log('Verification detected, trying to skip...');
        const skipBtns = [
          'button:has-text("Skip")', 'button:has-text("Not now")',
          'button:has-text("Remind me later")', 'button:has-text("Try another way")',
          'a:has-text("Skip")', 'a:has-text("Not now")',
          'span:has-text("Skip")',
        ];
        let skipped = false;
        for (const sel of skipBtns) {
          const btn = await page.$(sel).catch(() => null);
          if (btn && await btn.isVisible().catch(() => false)) {
            const t = await btn.textContent().catch(() => '');
            console.log(`  Clicking: "${t?.trim()}"`);
            await btn.click();
            skipped = true;
            await sleep(2000);
            break;
          }
        }
        if (!skipped) console.log('  No skip button found');
        continue;
      }

      if (flat.toLowerCase().includes('could not create') || flat.toLowerCase().includes('try again later')) {
        console.error('Blocked by Google — VPS IP flagged');
        break;
      }

      if (flat.toLowerCase().includes('taken') || flat.toLowerCase().includes('already in use')) {
        console.error('Username taken');
        break;
      }

      // Terms
      if (flat.toLowerCase().includes('terms') || flat.toLowerCase().includes('i agree')) {
        const agree = await page.$('button:has-text("I agree"), button:has-text("Accept"), button:has-text("Agree")');
        if (agree && await agree.isVisible().catch(() => false)) { await agree.click(); continue; }
      }

      // "Stay signed in?"
      if (flat.toLowerCase().includes('stay signed in')) {
        const yes = await page.$('button:has-text("Yes"), button:has-text("Continue")');
        if (yes && await yes.isVisible().catch(() => false)) { await yes.click(); continue; }
      }

      // Generic next/continue/done
      const generic = await page.$('button:has-text("Next"), button:has-text("Continue"), button:has-text("Done")');
      if (generic && await generic.isVisible().catch(() => false)) {
        const t = await generic.textContent().catch(() => '');
        console.log(`  Clicking: "${t?.trim()}"`);
        await generic.click();
        continue;
      }

      break;
    }

    // Final YouTube check
    console.log('\n=== Final: YouTube check ===');
    await page.goto('https://www.youtube.com', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(4000);
    await ss(page, '11-youtube');
    console.log('URL:', page.url());

    // On mobile, check for avatar or account button
    const hasAvatar = await page.evaluate(() => {
      return !!(
        document.querySelector('#avatar-btn') ||
        document.querySelector('button[aria-label*="Account"]') ||
        document.querySelector('yt-img-shadow#avatar') ||
        document.querySelector('[data-sessionlink*="account"]')
      );
    }).catch(() => false);

    const bodyTxt = await page.evaluate(() => document.body.innerText.slice(0, 800)).catch(() => '');
    const hasSignIn = bodyTxt.includes('Sign in');

    console.log('Has avatar:', hasAvatar);
    console.log('Has "Sign in" text:', hasSignIn);

    if (hasAvatar || (!hasSignIn && bodyTxt.length > 300)) {
      console.log('\nSUCCESS: YouTube logged in!');
      fs.writeFileSync(VERIFIED_FILE, JSON.stringify({
        loggedIn: true, ts: new Date().toISOString(),
        message: 'Logged in via yt-signup7.ts (mobile UA)',
      }, null, 2));
    } else {
      console.log('\nNot logged in — check /tmp/yt-s7-*.png screenshots');
      fs.writeFileSync(VERIFIED_FILE, JSON.stringify({
        loggedIn: false, ts: new Date().toISOString(),
        message: 'yt-signup7 could not complete sign-in',
      }, null, 2));
    }

  } catch (err) {
    console.error('Fatal:', (err as Error).message);
    await ss(page, 'fatal');
  } finally {
    await ctx.close();
  }
}

main().catch(console.error);
