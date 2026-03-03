/**
 * YouTube / Google Login - yt-login.ts
 * Signs in to existing Google account: hello@serpbays.com
 */

import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const YT_PROFILE_DIR = path.join(process.cwd(), '.youtube-profile');
const VERIFIED_FILE = path.join(YT_PROFILE_DIR, '.verified');

const EMAIL = 'hello@serpbays.com';
const PASSWORD = 'S3rP!B@ys$2025';

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function screenshot(page: any, name: string) {
  const p = `/tmp/yt-login-${name}.png`;
  await page.screenshot({ path: p, fullPage: true }).catch(() => {});
  console.log(`  [ss] ${p}`);
}

async function main() {
  console.log('Launching browser for YouTube login...');
  const context = await chromium.launchPersistentContext(YT_PROFILE_DIR, {
    headless: true,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'en-US',
  });

  const page = context.pages()[0] || await context.newPage();

  try {
    // Go to YouTube sign-in
    console.log('\n=== Step 1: Go to YouTube sign-in ===');
    await page.goto('https://accounts.google.com/signin/v2/identifier?service=youtube&hl=en', {
      waitUntil: 'domcontentloaded', timeout: 30000,
    });
    await sleep(2000);
    await screenshot(page, '01-start');

    // Fill email
    console.log('\n=== Step 2: Enter email ===');
    await page.waitForSelector('input[type="email"]', { timeout: 15000 });
    await page.fill('input[type="email"]', EMAIL);
    await sleep(500);
    await screenshot(page, '02-email');

    // Click the visible Next button — use #identifierNext or last visible LgbsSe button
    await page.evaluate(() => {
      const btn = document.querySelector('#identifierNext button') as HTMLElement ||
                  document.querySelector('#identifierNext') as HTMLElement;
      if (btn) { btn.click(); return; }
      // Fallback: click last visible LgbsSe button
      const all = Array.from(document.querySelectorAll('button[jsname="LgbsSe"]')) as HTMLElement[];
      const visible = all.filter(b => b.offsetParent !== null);
      if (visible.length) visible[visible.length - 1].click();
    });
    await sleep(3000);
    await screenshot(page, '03-after-email');
    console.log('  URL:', page.url());

    const textAfterEmail = await page.evaluate(() => document.body.innerText.slice(0, 400));
    console.log('  Text:', textAfterEmail.replace(/\n+/g, ' ').slice(0, 200));

    // Fill password
    console.log('\n=== Step 3: Enter password ===');
    try {
      await page.waitForSelector('input[name="Passwd"], input[type="password"]', { timeout: 12000 });
      await page.fill('input[name="Passwd"], input[type="password"]', PASSWORD);
      await sleep(500);
      await screenshot(page, '04-password');

      await page.evaluate(() => {
        const btn = document.querySelector('#passwordNext button') as HTMLElement ||
                    document.querySelector('#passwordNext') as HTMLElement;
        if (btn) { btn.click(); return; }
        const all = Array.from(document.querySelectorAll('button[jsname="LgbsSe"]')) as HTMLElement[];
        const visible = all.filter(b => b.offsetParent !== null);
        if (visible.length) visible[visible.length - 1].click();
      });
      await sleep(4000);
      await screenshot(page, '05-after-password');
      console.log('  URL:', page.url());
    } catch (e) {
      console.log('  Password field error:', (e as Error).message);
      const txt = await page.evaluate(() => document.body.innerText.slice(0, 400));
      console.log('  Page:', txt.replace(/\n+/g, ' ').slice(0, 200));
      await screenshot(page, '04-password-fail');
    }

    // Handle post-login steps
    console.log('\n=== Step 4: Post-login ===');
    for (let i = 0; i < 5; i++) {
      await sleep(2000);
      const url = page.url();
      const txt = await page.evaluate(() => document.body.innerText.slice(0, 600));
      const flat = txt.replace(/\n+/g, ' ');
      console.log(`  [${i}] URL:`, url);
      console.log(`  [${i}] Text:`, flat.slice(0, 200));
      await screenshot(page, `06-step${i}`);

      // Logged in?
      if (url.includes('myaccount') || url.includes('youtube.com/') || url.includes('google.com/b/')) {
        console.log('  Logged in!');
        break;
      }

      // Phone verification skip
      if (flat.toLowerCase().includes('phone') || flat.toLowerCase().includes('verify')) {
        const skipBtn = await page.$('button:has-text("Skip"), span:has-text("Not now"), button:has-text("Not now")');
        if (skipBtn) { await skipBtn.click(); console.log('  Skipped verification'); continue; }
      }

      // 2-step / security check
      if (flat.toLowerCase().includes('2-step') || flat.toLowerCase().includes('two-step')) {
        console.log('  2-Step verification required — check screenshots');
        break;
      }

      // "Stay signed in?" — click Yes
      if (flat.toLowerCase().includes('stay signed in')) {
        const yesBtn = await page.$('button:has-text("Yes")');
        if (yesBtn) { await yesBtn.click(); continue; }
      }

      // Terms — agree
      if (flat.toLowerCase().includes('terms') || flat.toLowerCase().includes('i agree')) {
        const agreeBtn = await page.$('button:has-text("I agree"), button:has-text("Accept")');
        if (agreeBtn) { await agreeBtn.click(); continue; }
      }

      // Generic Next
      const nextBtn = await page.$('button[jsname="LgbsSe"]');
      if (nextBtn) {
        const btnTxt = await nextBtn.textContent();
        if (btnTxt && !btnTxt.toLowerCase().includes('back')) {
          await nextBtn.click();
          console.log('  Clicked:', btnTxt.trim());
          continue;
        }
      }

      break;
    }

    // Navigate to YouTube to confirm login
    console.log('\n=== Step 5: Verify on YouTube ===');
    await page.goto('https://www.youtube.com', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(3000);
    await screenshot(page, '07-youtube');

    const ytUrl = page.url();
    const ytTxt = await page.evaluate(() => document.body.innerText.slice(0, 600));
    const isLoggedIn = ytTxt.includes('Sign in') === false ||
                       ytTxt.includes('Serpbays') ||
                       ytUrl.includes('youtube.com');

    console.log('  YouTube URL:', ytUrl);
    console.log('  Has "Sign in":', ytTxt.includes('Sign in'));

    // Check for avatar / account indicator
    const hasAvatar = await page.$('button[aria-label*="Account"], #avatar-btn').then(el => !!el).catch(() => false);
    console.log('  Has avatar button:', hasAvatar);

    const finalUrl = page.url();
    if (hasAvatar || !ytTxt.includes('Sign in')) {
      console.log('\n  SUCCESS: Logged in to YouTube!');
      fs.writeFileSync(VERIFIED_FILE, JSON.stringify({
        loggedIn: true,
        email: EMAIL,
        ts: new Date().toISOString(),
        message: 'Logged in via yt-login.ts',
      }, null, 2));
    } else {
      console.log('\n  Login may not be complete. Check screenshots.');
      fs.writeFileSync(VERIFIED_FILE, JSON.stringify({
        loggedIn: false,
        ts: new Date().toISOString(),
        message: `Login incomplete. URL: ${finalUrl.slice(0, 120)}`,
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
