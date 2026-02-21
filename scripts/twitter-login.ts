/**
 * Interactive Twitter/X Login Script (screenshot-based)
 *
 * Injects Twitter cookies from .env.local into the Playwright persistent context,
 * then lets you verify the login state via screenshots and interactive commands.
 *
 * Cookies are saved to .twitter-profile/ and persist for the cron bot.
 *
 * Usage:
 *   npx tsx scripts/twitter-login.ts
 *
 * Commands during interactive mode:
 *   screenshot / ss          - Take a new screenshot
 *   click <x> <y>           - Click at coordinates
 *   type <text>             - Type text into the focused field
 *   press <key>             - Press a key (Enter, Tab, etc.)
 *   goto <url>              - Navigate to a URL
 *   cookies                 - Show currently loaded cookies for x.com
 *   done                    - Save cookies and exit
 *
 * How to get your Twitter cookies:
 *   1. Log in to x.com in your browser
 *   2. Open DevTools (F12) → Application → Cookies → https://x.com
 *   3. Copy the values of auth_token, ct0, and optionally twid
 *   4. Add them to .env.local:
 *      TWITTER_AUTH_TOKEN=<value>
 *      TWITTER_CT0=<value>
 *      TWITTER_TWID=<value>
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { chromium, type Page, type BrowserContext } from 'playwright';
import { join } from 'path';
import { createInterface } from 'readline';

const PROFILE_DIR = join(process.cwd(), '.twitter-profile');
const SCREENSHOT_PATH = join(process.cwd(), 'twitter-login-screenshot.png');

function buildCookies(): Array<{ name: string; value: string; domain: string; path: string }> {
  const defs = [
    { name: 'auth_token', envKey: 'TWITTER_AUTH_TOKEN' },
    { name: 'ct0', envKey: 'TWITTER_CT0' },
    { name: 'twid', envKey: 'TWITTER_TWID' },
    { name: 'guest_id', envKey: 'TWITTER_GUEST_ID' },
    { name: 'kdt', envKey: 'TWITTER_KDT' },
    { name: 'personalization_id', envKey: 'TWITTER_PERSONALIZATION_ID' },
    { name: 'external_referer', envKey: 'TWITTER_EXTERNAL_REFERER' },
  ];

  return defs
    .filter(({ envKey }) => !!process.env[envKey])
    .map(({ name, envKey }) => ({
      name,
      value: process.env[envKey]!,
      domain: '.x.com',
      path: '/',
    }));
}

async function takeScreenshot(page: Page) {
  await page.screenshot({ path: SCREENSHOT_PATH, fullPage: false });
  console.log(`\nScreenshot saved to: ${SCREENSHOT_PATH}`);
  console.log('View it to see the current page state.\n');
}

async function main() {
  console.log('Launching Chromium for Twitter/X login verification...');
  console.log(`Profile directory: ${PROFILE_DIR}\n`);

  const cookies = buildCookies();
  if (cookies.length === 0) {
    console.error('No Twitter credentials found in .env.local');
    console.error('Set TWITTER_AUTH_TOKEN and TWITTER_CT0 in .env.local and try again.');
    console.error('\nExample:');
    console.error('  TWITTER_AUTH_TOKEN=your_auth_token_here');
    console.error('  TWITTER_CT0=your_ct0_here');
    process.exit(1);
  }

  console.log(`Found ${cookies.length} cookie(s) to inject: ${cookies.map((c) => c.name).join(', ')}`);

  const context: BrowserContext = await chromium.launchPersistentContext(PROFILE_DIR, {
    executablePath: '/usr/bin/chromium-browser',
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
  });

  // Inject cookies before navigation
  await context.addCookies(cookies);
  console.log('Cookies injected into browser context.\n');

  const page = context.pages()[0] || (await context.newPage());

  console.log('Navigating to https://x.com ...');
  await page.goto('https://x.com', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  await takeScreenshot(page);

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const prompt = () =>
    new Promise<string>((resolve) => {
      rl.question('twitter> ', (answer) => resolve(answer.trim()));
    });

  console.log('=== Interactive Twitter Login Verification ===');
  console.log('Commands: screenshot, click <x> <y>, type <text>, press <key>,');
  console.log('          goto <url>, cookies, done\n');
  console.log('If the screenshot shows your Twitter home feed, you are logged in!');
  console.log('If it shows a login page, your cookies may be expired.\n');

  let running = true;
  while (running) {
    const input = await prompt();
    if (!input) continue;

    const [cmd, ...args] = input.split(' ');

    try {
      switch (cmd.toLowerCase()) {
        case 'screenshot':
        case 'ss':
          await takeScreenshot(page);
          break;

        case 'click':
          if (args.length < 2) {
            console.log('Usage: click <x> <y>');
            break;
          }
          await page.mouse.click(parseInt(args[0]), parseInt(args[1]));
          await page.waitForTimeout(1000);
          await takeScreenshot(page);
          break;

        case 'type':
          await page.keyboard.type(args.join(' '), { delay: 50 });
          await page.waitForTimeout(500);
          console.log('Typed: ' + args.join(' '));
          break;

        case 'press':
          await page.keyboard.press(args[0] || 'Enter');
          await page.waitForTimeout(1000);
          await takeScreenshot(page);
          break;

        case 'goto':
          await page.goto(args[0] || 'https://x.com', { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(3000);
          await takeScreenshot(page);
          break;

        case 'cookies': {
          const current = await context.cookies('https://x.com');
          const relevant = current.filter((c) => ['auth_token', 'ct0', 'twid', 'guest_id'].includes(c.name));
          if (relevant.length > 0) {
            console.log('Current x.com cookies:');
            for (const c of relevant) {
              console.log(`  ${c.name}: ${c.value.slice(0, 20)}...`);
            }
          } else {
            console.log('No Twitter cookies found in browser context.');
          }
          break;
        }

        case 'url':
          console.log('Current URL:', page.url());
          break;

        case 'done':
          running = false;
          break;

        default:
          console.log('Unknown command. Try: screenshot, click, type, press, goto, cookies, done');
      }
    } catch (err) {
      console.error('Command error:', (err as Error).message);
    }
  }

  rl.close();
  await context.close();
  console.log('\nBrowser closed. Cookies saved to .twitter-profile/');
  console.log('You can now run: npx tsx scripts/twitter-verify.ts');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
