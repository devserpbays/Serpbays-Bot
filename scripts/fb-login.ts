/**
 * Interactive Facebook Login Script (screenshot-based)
 *
 * Runs Chromium inside xvfb on a headless server. Takes screenshots
 * so you can see the page and provides CLI prompts to interact.
 *
 * Cookies are saved to .fb-profile/ and persist for the cron bot.
 *
 * Usage:
 *   npx tsx scripts/fb-login.ts
 *
 * Commands during interactive mode:
 *   screenshot / ss          - Take a new screenshot
 *   click <x> <y>           - Click at coordinates
 *   type <text>             - Type text into the focused field
 *   press <key>             - Press a key (Enter, Tab, etc.)
 *   goto <url>              - Navigate to a URL
 *   fill <selector> <text>  - Fill a specific input field
 *   done                    - Save cookies and exit
 */

import { chromium, type Page } from 'playwright';
import { join } from 'path';
import { createInterface } from 'readline';

const PROFILE_DIR = join(process.cwd(), '.fb-profile');
const SCREENSHOT_PATH = join(process.cwd(), 'fb-login-screenshot.png');

async function takeScreenshot(page: Page) {
  await page.screenshot({ path: SCREENSHOT_PATH, fullPage: false });
  console.log(`\nScreenshot saved to: ${SCREENSHOT_PATH}`);
  console.log('View it to see the current page state.\n');
}

async function main() {
  console.log('Launching Chromium via xvfb for Facebook login...');
  console.log(`Profile directory: ${PROFILE_DIR}\n`);

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
  });

  const page = context.pages()[0] || (await context.newPage());

  console.log('Navigating to Facebook...');
  await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await takeScreenshot(page);

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const prompt = () =>
    new Promise<string>((resolve) => {
      rl.question('fb> ', (answer) => resolve(answer.trim()));
    });

  console.log('=== Interactive Facebook Login ===');
  console.log('Commands: screenshot, click <x> <y>, type <text>, press <key>,');
  console.log('          goto <url>, fill <selector> <text>, done\n');

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
          await page.goto(args[0] || 'https://www.facebook.com', {
            waitUntil: 'domcontentloaded',
          });
          await page.waitForTimeout(3000);
          await takeScreenshot(page);
          break;

        case 'fill': {
          const selector = args[0];
          const text = args.slice(1).join(' ');
          if (!selector || !text) {
            console.log('Usage: fill <selector> <text>');
            break;
          }
          await page.fill(selector, text);
          console.log(`Filled ${selector} with: ${text}`);
          break;
        }

        case 'login': {
          // Shortcut: fill email and password and submit
          console.log('Quick login shortcut.');
          console.log('Enter email:');
          const email = await prompt();
          console.log('Enter password:');
          const password = await prompt();

          await page.fill('input#email, input[name="email"]', email);
          await page.fill('input#pass, input[name="pass"]', password);
          await page.click('button[name="login"], button[data-testid="royal_login_button"]');
          await page.waitForTimeout(5000);
          await takeScreenshot(page);
          console.log('Login attempted. Check screenshot for result.');
          break;
        }

        case 'url':
          console.log('Current URL:', page.url());
          break;

        case 'title':
          console.log('Page title:', await page.title());
          break;

        case 'done':
          running = false;
          break;

        default:
          console.log('Unknown command. Try: screenshot, click, type, press, goto, fill, login, done');
      }
    } catch (err) {
      console.error('Command error:', (err as Error).message);
    }
  }

  rl.close();
  await context.close();
  console.log('\nBrowser closed. Cookies saved to .fb-profile/');
  console.log('You can now run: npx tsx scripts/fb-comment-cron.ts');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
