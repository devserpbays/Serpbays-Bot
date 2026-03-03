import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { join } from 'path';

const PROFILE_DIR = join(process.cwd(), '.youtube-profile');
const COOKIES_FILE = join(PROFILE_DIR, 'cookies.json');
const VERIFIED_FILE = join(PROFILE_DIR, '.verified');

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  try { (await import('fs')).unlinkSync(PROFILE_DIR + '/SingletonLock'); } catch {}
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 }, locale: 'en-US',
  });
  const page = ctx.pages()[0] || await ctx.newPage();

  // Step 1: Name
  console.log('Step 1: Name');
  await page.goto('https://accounts.google.com/signup/v2/createaccount?service=youtube&flowName=GlifWebSignIn&flowEntry=SignUp', { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  await page.fill('input[name="firstName"]', 'Serpbays');
  await page.fill('input[name="lastName"]', 'Hello');
  await page.locator('button:has-text("Next")').click();
  await sleep(3000);

  // Step 2: Birthday & Gender
  console.log('Step 2: Birthday/Gender');
  await page.fill('#day', '15');
  await page.fill('#year', '1992');

  // Month dropdown
  await page.locator('div.VfPpkd-TkwUic').first().click();
  await sleep(700);
  // Pick May using visible locator
  await page.locator('li[role="option"]').filter({ hasText: /^May$/ }).click();
  await sleep(500);
  console.log('Month: May ✓');

  // Gender dropdown — scope to #gender container, exclude #genderpronoun
  await page.locator('div.VfPpkd-TkwUic').nth(1).click();
  await sleep(700);
  // Click Male from the gender list (not genderpronoun)
  await page.locator('#gender li[role="option"][data-value="1"]').click({ force: true });
  await sleep(500);
  console.log('Gender: Male ✓');

  await page.screenshot({ path: '/tmp/yt-c2.png' });
  await page.locator('button:has-text("Next")').click();
  await sleep(3500);
  console.log('After birthday:', page.url());
  await page.screenshot({ path: '/tmp/yt-c3.png' });

  // Step 3: Username
  console.log('Step 3: Username');
  const bodyText3 = await page.$eval('body', b => b.innerText?.slice(0, 200)).catch(() => '');
  console.log('Page3:', bodyText3.slice(0, 100));

  const useExistingVisible = await page.locator('text=Use your existing email').isVisible().catch(() => false);
  if (useExistingVisible) {
    await page.locator('text=Use your existing email').click(); await sleep(1200);
    await page.fill('input[type="email"]', 'hello@serpbays.com');
    console.log('Using existing email: hello@serpbays.com');
  } else {
    const usernameEl = await page.$('input[name="Username"]').catch(() => null);
    if (usernameEl) {
      await usernameEl.click({ clickCount: 3 });
      await usernameEl.type('serpbayshello25');
      console.log('Gmail username: serpbayshello25');
    } else {
      console.log('No username input found on page');
    }
  }
  await page.screenshot({ path: '/tmp/yt-c4.png' });
  await page.locator('button:has-text("Next")').click();
  await sleep(3500);
  console.log('After username:', page.url());
  await page.screenshot({ path: '/tmp/yt-c5.png' });

  // Step 4: Password
  console.log('Step 4: Password');
  const pwInputs = await page.$$('input[type="password"]');
  if (pwInputs[0]) { await pwInputs[0].click({ clickCount: 3 }); await pwInputs[0].type('S3rP!B@ys$2025'); }
  if (pwInputs[1]) { await pwInputs[1].click({ clickCount: 3 }); await pwInputs[1].type('S3rP!B@ys$2025'); }
  console.log('Passwords:', pwInputs.length, 'inputs filled');
  await page.screenshot({ path: '/tmp/yt-c6.png' });
  if (pwInputs.length > 0) {
    await page.locator('button:has-text("Next")').click();
    await sleep(4500);
  }
  console.log('After password:', page.url());
  await page.screenshot({ path: '/tmp/yt-c7.png' });

  const finalText = await page.$eval('body', b => b.innerText?.slice(0, 500)).catch(() => '');
  console.log('\nFinal page text:\n', finalText);

  // Check YouTube
  await page.goto('https://www.youtube.com', { waitUntil: 'domcontentloaded' });
  await sleep(5000);
  await page.screenshot({ path: '/tmp/yt-c8-final.png' });
  const avatar = await page.$('#avatar-btn');
  const loggedIn = avatar ? await avatar.isVisible().catch(() => false) : false;
  console.log('\n✅ Logged into YouTube:', loggedIn);

  if (loggedIn) {
    const cookies = await ctx.cookies();
    writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
    const displayName = await page.$eval('#avatar-btn', el => el.getAttribute('aria-label') || '').catch(() => '');
    writeFileSync(VERIFIED_FILE, JSON.stringify({ loggedIn: true, ts: new Date().toISOString(), displayName, accountId: 'serpbayshello25' }));
    console.log('Session saved! Account:', displayName);
  }
  await ctx.close();
})().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
