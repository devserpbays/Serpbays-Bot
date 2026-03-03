/**
 * Google Account Signup - yt-signup5.ts
 * Birthday: June 20, 2000 | Gender: Male
 * Uses existing email: hello@serpbays.com
 */

import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const YT_PROFILE_DIR = path.join(process.cwd(), '.youtube-profile');
const VERIFIED_FILE = path.join(YT_PROFILE_DIR, '.verified');

const EXISTING_EMAIL = 'hello@serpbays.com';
const PASSWORD = 'S3rP!B@ys$2025';
const FIRST_NAME = 'Serpbays';
const LAST_NAME = 'Hello';

// Birthday: June 20, 2000
const BIRTH_MONTH = 'June';
const BIRTH_DAY = '20';
const BIRTH_YEAR = '2000';

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function screenshot(page: any, name: string) {
  const p = `/tmp/yt-signup5-${name}.png`;
  await page.screenshot({ path: p, fullPage: true }).catch(() => {});
  console.log(`  [ss] ${p}`);
}

async function main() {
  console.log('Launching browser...');
  const context = await chromium.launchPersistentContext(YT_PROFILE_DIR, {
    headless: true,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'en-US',
  });

  const page = context.pages()[0] || await context.newPage();

  try {
    // Step 1: Signup page
    console.log('\n=== Step 1: Open signup ===');
    await page.goto('https://accounts.google.com/signup/v2/createaccount?flowName=GlifWebSignIn&flowEntry=SignUp', {
      waitUntil: 'domcontentloaded', timeout: 30000,
    });
    await sleep(2000);
    await screenshot(page, '01-start');

    // Step 2: Name
    console.log('\n=== Step 2: Name ===');
    await page.waitForSelector('input[name="firstName"]', { timeout: 15000 });
    await page.fill('input[name="firstName"]', FIRST_NAME);
    await sleep(200);
    await page.fill('input[name="lastName"]', LAST_NAME);
    await sleep(400);
    await screenshot(page, '02-name');
    await page.click('button[jsname="LgbsSe"]');
    await sleep(3000);
    console.log('  URL:', page.url());

    // Step 3: Birthday & Gender
    console.log('\n=== Step 3: Birthday & Gender ===');
    await page.waitForSelector('input[name="day"]', { timeout: 15000 });

    // Day
    await page.fill('input[name="day"]', BIRTH_DAY);
    await sleep(200);

    // Month - JS dispatch event
    const monthDropdown = await page.$('#month');
    if (monthDropdown) {
      const tag = await monthDropdown.evaluate((el: Element) => el.tagName.toLowerCase());
      if (tag === 'select') {
        await page.selectOption('#month', { label: BIRTH_MONTH });
        console.log('  Month: native select');
      } else {
        await monthDropdown.click();
        await sleep(800);
        const clicked = await page.evaluate((month: string) => {
          const opts = document.querySelectorAll('li[role="option"]');
          for (const opt of opts) {
            if (opt.textContent?.trim() === month) {
              (opt as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
              return true;
            }
          }
          return false;
        }, BIRTH_MONTH);
        console.log('  Month JS click:', clicked);
      }
    }
    await sleep(300);

    // Year
    await page.fill('input[name="year"]', BIRTH_YEAR);
    await sleep(300);

    // Gender - JS click to open, then keyboard to Male (2nd item)
    await page.evaluate(() => {
      const trigger = document.querySelector('#gender .VfPpkd-TkwUic') as HTMLElement ||
                      document.querySelector('[jsname="R4EJ3c"] .VfPpkd-TkwUic') as HTMLElement;
      if (trigger) trigger.click();
    });
    await sleep(1000);

    // Female is 1st, Male is 2nd → press Down twice then Enter
    await page.keyboard.press('ArrowDown');
    await sleep(200);
    await page.keyboard.press('ArrowDown');
    await sleep(200);
    await page.keyboard.press('Enter');
    await sleep(500);

    await screenshot(page, '03-bday-filled');
    const dayVal = await page.$eval('input[name="day"]', (el: HTMLInputElement) => el.value).catch(() => '');
    const yearVal = await page.$eval('input[name="year"]', (el: HTMLInputElement) => el.value).catch(() => '');
    console.log(`  Day=${dayVal}, Year=${yearVal}`);

    await page.click('button[jsname="LgbsSe"]');
    await sleep(3000);
    console.log('  URL after bday:', page.url());

    // Step 4: Email — click "Use your existing email"
    console.log('\n=== Step 4: Use existing email ===');
    await screenshot(page, '04-email-page');

    // Look for "Use your existing email" button/link
    const useExistingSelectors = [
      'button:has-text("Use your existing email")',
      'span:has-text("Use your existing email")',
      'a:has-text("Use your existing email")',
      '[jsname="tJHJj"]',
    ];

    let clickedExisting = false;
    for (const sel of useExistingSelectors) {
      try {
        const el = await page.$(sel);
        if (el && await el.isVisible()) {
          await el.click();
          clickedExisting = true;
          console.log('  Clicked "Use your existing email" via:', sel);
          break;
        }
      } catch {}
    }

    if (!clickedExisting) {
      // Try locator approach
      try {
        await page.locator('text=Use your existing email').click({ timeout: 5000 });
        clickedExisting = true;
        console.log('  Clicked via locator text match');
      } catch (e) {
        console.log('  Could not find "Use existing email" button:', (e as Error).message);
      }
    }

    await sleep(2000);
    await screenshot(page, '04b-existing-email-form');

    // Fill the existing email field
    const emailInputSelectors = [
      'input[type="email"]',
      'input[name="existingEmail"]',
      'input[jsname="YPqjbf"]',
      'input[autocomplete="email"]',
    ];

    let emailFilled = false;
    for (const sel of emailInputSelectors) {
      try {
        const el = await page.$(sel);
        if (el && await el.isVisible()) {
          await el.click({ clickCount: 3 });
          await el.fill('');
          await el.type(EXISTING_EMAIL, { delay: 60 });
          emailFilled = true;
          console.log('  Email filled via:', sel);
          break;
        }
      } catch {}
    }

    if (!emailFilled) {
      // Fallback: fill any visible input
      const inputs = await page.$$('input');
      for (const inp of inputs) {
        if (await inp.isVisible()) {
          await inp.click({ clickCount: 3 });
          await inp.fill(EXISTING_EMAIL);
          emailFilled = true;
          console.log('  Email filled via fallback input');
          break;
        }
      }
    }

    await sleep(500);
    await screenshot(page, '04c-email-typed');

    // Click Next
    await page.click('button[jsname="LgbsSe"]');
    await sleep(4000);
    await screenshot(page, '05-after-email');
    console.log('  URL:', page.url());

    const postEmailText = await page.evaluate(() => document.body.innerText.slice(0, 600));
    console.log('  Text:', postEmailText.replace(/\n+/g, ' ').slice(0, 300));

    // Step 5: Password
    console.log('\n=== Step 5: Password ===');
    try {
      await page.waitForSelector('input[name="Passwd"]', { timeout: 15000 });
      await page.fill('input[name="Passwd"]', PASSWORD);
      await sleep(300);
      const confirmField = await page.$('input[name="ConfirmPasswd"]');
      if (confirmField) {
        await confirmField.fill(PASSWORD);
        console.log('  Confirm password filled');
      }
      await sleep(300);
      console.log('  Password filled');
      await screenshot(page, '06-password');
      await page.click('button[jsname="LgbsSe"]');
      await sleep(3000);
      await screenshot(page, '07-after-password');
      console.log('  URL:', page.url());
    } catch (e) {
      console.log('  Password step error:', (e as Error).message);
      const url = page.url();
      const txt = await page.evaluate(() => document.body.innerText.slice(0, 600));
      console.log('  URL:', url);
      console.log('  Text:', txt.replace(/\n+/g, ' ').slice(0, 300));
      await screenshot(page, '06-password-fail');
    }

    // Step 6: Handle post-password steps (phone skip, terms, etc.)
    console.log('\n=== Step 6: Post-password steps ===');
    for (let i = 0; i < 5; i++) {
      await sleep(2500);
      const url = page.url();
      const txt = await page.evaluate(() => document.body.innerText.slice(0, 800));
      const txtFlat = txt.replace(/\n+/g, ' ');
      console.log(`  [${i}] URL:`, url);
      console.log(`  [${i}] Text:`, txtFlat.slice(0, 250));
      await screenshot(page, `08-step${i}`);

      // Reached final account page?
      if (url.includes('myaccount') || url.includes('google.com/b/') || url.includes('youtube.com')) {
        console.log('  Reached Google account page!');
        break;
      }

      // Phone verification - skip
      if (txtFlat.toLowerCase().includes('phone number') || txtFlat.toLowerCase().includes('verify your phone')) {
        const skipBtn = await page.$('button:has-text("Skip")');
        if (skipBtn) { await skipBtn.click(); console.log('  Skipped phone'); continue; }
      }

      // Email verification - may need to skip
      if (txtFlat.toLowerCase().includes('confirm') && txtFlat.toLowerCase().includes('email')) {
        const skipBtn = await page.$('button:has-text("Skip"), button:has-text("Not now")');
        if (skipBtn) { await skipBtn.click(); console.log('  Skipped email confirm'); continue; }
      }

      // Terms of service - agree
      if (txtFlat.toLowerCase().includes('privacy and terms') || txtFlat.toLowerCase().includes('i agree')) {
        const agreeBtn = await page.$('button:has-text("I agree")');
        if (agreeBtn) { await agreeBtn.click(); console.log('  Agreed to terms'); continue; }
      }

      // Generic "Next" / "Continue"
      const nextBtn = await page.$('button[jsname="LgbsSe"]');
      if (nextBtn) {
        const btnTxt = await nextBtn.textContent();
        if (btnTxt && !btnTxt.toLowerCase().includes('existing') && !btnTxt.toLowerCase().includes('back')) {
          await nextBtn.click();
          console.log('  Clicked button:', btnTxt?.trim());
          continue;
        }
      }

      // No action needed, break
      break;
    }

    // Final status
    console.log('\n=== Final ===');
    const finalUrl = page.url();
    const finalTxt = await page.evaluate(() => document.body.innerText.slice(0, 800));
    console.log('  URL:', finalUrl);
    console.log('  Text:', finalTxt.replace(/\n+/g, ' ').slice(0, 300));
    await screenshot(page, '09-final');

    const success = finalUrl.includes('myaccount') || finalUrl.includes('google.com/b/') ||
                    finalUrl.includes('youtube') || finalTxt.toLowerCase().includes('welcome') ||
                    finalTxt.toLowerCase().includes('serpbays');

    if (success) {
      console.log('\n  SUCCESS: Account created!');
      fs.writeFileSync(VERIFIED_FILE, JSON.stringify({
        loggedIn: true,
        email: EXISTING_EMAIL,
        ts: new Date().toISOString(),
        message: 'Google account created via yt-signup5 (existing email)',
      }, null, 2));
    } else {
      console.log('\n  Signup not complete — check screenshots.');
      fs.writeFileSync(VERIFIED_FILE, JSON.stringify({
        loggedIn: false,
        ts: new Date().toISOString(),
        message: `Signup incomplete. URL: ${finalUrl.slice(0, 120)}`,
      }, null, 2));
    }

  } catch (err) {
    console.error('Fatal error:', (err as Error).message);
    await screenshot(page, 'fatal-error').catch(() => {});
  } finally {
    await context.close();
  }
}

main().catch(console.error);
