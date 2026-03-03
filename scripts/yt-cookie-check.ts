import { chromium } from 'playwright';
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';

const PROFILE_DIR = join(process.cwd(), '.youtube-profile');
const COOKIES_FILE = join(PROFILE_DIR, 'cookies.json');
const VERIFIED_FILE = join(PROFILE_DIR, '.verified');

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function toPlaywrightCookies(raw: any[]) {
  return raw.filter(c => c.name && c.value && c.domain).map(c => ({
    name: c.name, value: c.value,
    domain: c.domain.startsWith('.') ? c.domain : `.${c.domain}`,
    path: c.path || '/',
    expires: c.expirationDate ? Math.floor(c.expirationDate) : -1,
    httpOnly: !!c.httpOnly, secure: !!c.secure,
    sameSite: (c.sameSite === 'no_restriction' || c.sameSite === 'None') ? 'None' as const
      : c.sameSite === 'strict' ? 'Strict' as const : 'Lax' as const,
  }));
}

async function main() {
  try { unlinkSync(join(PROFILE_DIR, 'SingletonLock')); } catch {}

  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 }, locale: 'en-US',
  });

  const raw = JSON.parse(readFileSync(COOKIES_FILE, 'utf8'));
  const cookies = toPlaywrightCookies(raw);
  await ctx.addCookies(cookies);
  console.log(`Loaded ${cookies.length} cookies`);

  const page = ctx.pages()[0] || await ctx.newPage();
  await page.goto('https://www.youtube.com', { waitUntil: 'domcontentloaded' });
  await sleep(5000);
  await page.screenshot({ path: '/tmp/yt-cookie-login.png' });

  const url = page.url();
  const hasAvatar = await page.$('#avatar-btn, button[aria-label*="Account"]').then(e => !!e).catch(() => false);
  const bodyTxt = await page.evaluate(() => document.body.innerText.slice(0, 500)).catch(() => '');
  const hasSignIn = bodyTxt.includes('Sign in');

  console.log('URL:', url);
  console.log('Has avatar:', hasAvatar);
  console.log('Has "Sign in":', hasSignIn);

  const accountName = await page.evaluate(() => {
    const el = document.querySelector('#account-name, yt-formatted-string#account-name');
    return el?.textContent?.trim() || '';
  }).catch(() => '');
  console.log('Account name:', accountName);

  if (hasAvatar || (!hasSignIn && bodyTxt.length > 200)) {
    console.log('\nSUCCESS — YouTube logged in!');
    writeFileSync(VERIFIED_FILE, JSON.stringify({
      loggedIn: true,
      accountId: accountName ? `yt_${accountName}` : 'yt_user',
      displayName: accountName,
      ts: new Date().toISOString(),
      message: 'Logged in via cookie import',
    }, null, 2));
  } else {
    console.log('\nFAILED — not logged in');
    writeFileSync(VERIFIED_FILE, JSON.stringify({
      loggedIn: false, ts: new Date().toISOString(),
      message: 'Cookie login failed',
    }, null, 2));
  }

  await ctx.close();
}

main().catch(console.error);
