/**
 * Quora Browser Automation via Playwright + Chromium
 *
 * Uses a persistent browser context so cookies survive between runs.
 * Profile data stored at: /var/www/ai-bot/bot-serp/.quora-profile/
 */

import { chromium, type BrowserContext, type Page } from 'playwright';
import { join } from 'path';
import { unlinkSync } from 'fs';

const PROFILE_DIR = join(process.cwd(), '.quora-profile');
const NAVIGATION_TIMEOUT = 30000;
const SLOW_WAIT = 4000;

interface QuoraQuestion {
  url: string;
  author: string;
  content: string;
  topic: string;
}

let _context: BrowserContext | null = null;
let _page: Page | null = null;

// --- Launch or reuse persistent browser context ---
async function getPage(): Promise<Page> {
  if (_page && !_page.isClosed()) return _page;

  // Remove stale browser lock from previous crash
  try { unlinkSync(join(PROFILE_DIR, 'SingletonLock')); } catch {}

  _context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
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

  _page = _context.pages()[0] || (await _context.newPage());
  _page.setDefaultTimeout(NAVIGATION_TIMEOUT);
  return _page;
}

// --- Cleanup ---
export async function closeBrowser(): Promise<void> {
  if (_context) {
    await _context.close().catch(() => {});
    _context = null;
    _page = null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// --- Check if logged in to Quora ---
export async function ensureQuoraLoggedIn(): Promise<boolean> {
  try {
    const page = await getPage();
    await page.goto('https://www.quora.com', { waitUntil: 'domcontentloaded' });
    await sleep(SLOW_WAIT);

    const url = page.url();

    // If redirected to login/signup page
    if (url.includes('/login') || url.includes('/register')) {
      console.error('Not logged in to Quora.');
      return false;
    }

    // Check for logged-in indicators (profile avatar, "Add Question" button)
    const loggedIn = await page
      .locator('[aria-label="Profile"], [aria-label="Your profile"], a[href*="/profile/"], button:has-text("Add question")')
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (loggedIn) return true;

    // Check for login/signup form
    const hasLoginForm = await page
      .locator('input[placeholder*="Email"], input[placeholder*="email"], form[action*="login"]')
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    if (hasLoginForm) {
      console.error('Not logged in to Quora — login form detected.');
      return false;
    }

    // Fallback: check body content length
    const bodyText = await page.textContent('body').catch(() => '');
    const looksLoggedIn = bodyText && bodyText.length > 500 && !bodyText.includes('Join Quora');
    if (looksLoggedIn) return true;

    console.warn('Quora login state uncertain');
    return false;
  } catch (err) {
    console.error('Failed to check Quora login:', (err as Error).message);
    return false;
  }
}

// --- Scrape profile identity of the logged-in user ---
export async function scrapeProfileIdentity(): Promise<{ displayName: string; username: string; accountId: string }> {
  try {
    const page = await getPage();

    const info = await page.evaluate(() => {
      let username = '';
      let displayName = '';

      // Look for profile link in navigation
      const profileLinks = document.querySelectorAll('a[href*="/profile/"]');
      for (const link of profileLinks) {
        const href = link.getAttribute('href') || '';
        const m = href.match(/\/profile\/([^/?]+)/);
        if (m && m[1]) {
          username = m[1];
          const text = (link.textContent || '').trim();
          if (text && text.length > 1 && text.length < 60) displayName = text;
          break;
        }
      }

      return { username, displayName };
    }).catch(() => ({ username: '', displayName: '' }));

    const username = info.username || '';
    const accountId = username ? `qa_${username}` : '';
    return { displayName: info.displayName || username, username, accountId };
  } catch {
    return { displayName: '', username: '', accountId: '' };
  }
}

// --- Scrape Quora questions matching keywords ---
export async function scrapeQuoraQuestions(
  keywords: string[]
): Promise<QuoraQuestion[]> {
  const questions: QuoraQuestion[] = [];

  for (const keyword of keywords) {
    try {
      const page = await getPage();
      const searchUrl = `https://www.quora.com/search?q=${encodeURIComponent(keyword)}&type=question&time=day`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
      await sleep(SLOW_WAIT);

      // Scroll to load more results
      for (let i = 0; i < 3; i++) {
        await page.mouse.wheel(0, 800);
        await sleep(1500);
      }

      // Extract question elements
      const questionElements = await page.$$('.q-box [class*="Question"], .q-box a[href*="/"], div[class*="question"]');

      // Also try broader selectors for Quora's dynamic DOM
      const allLinks = await page.$$('a[href]');

      for (const link of allLinks) {
        try {
          const href = await link.getAttribute('href');
          if (!href) continue;

          // Quora question URLs look like: /Question-Text-Here or /unanswered/...
          const isQuestion = href.match(/^\/[A-Z][^/]*\??/) && !href.includes('/profile/') && !href.includes('/topic/') && !href.includes('/search');
          if (!isQuestion) continue;

          const text = (await link.textContent()) || '';
          if (text.length < 15 || text.length > 500) continue;

          // Check keyword match
          const lowerText = text.toLowerCase();
          const matched = keywords.some((kw) => lowerText.includes(kw.toLowerCase()));
          if (!matched) continue;

          const questionUrl = href.startsWith('http') ? href : `https://www.quora.com${href.split('?')[0]}`;

          // Extract topic from URL
          const topicMatch = href.match(/\/([^/?]+)/);
          const topic = topicMatch ? topicMatch[1].replace(/-/g, ' ') : '';

          questions.push({
            url: questionUrl,
            author: 'Unknown',
            content: text.slice(0, 2000),
            topic,
          });
        } catch {
          // Individual extraction failed, continue
        }
      }

      await sleep(2000);
    } catch (err) {
      console.error(`Failed to search Quora for "${keyword}":`, (err as Error).message);
    }
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  return questions.filter((q) => {
    if (seen.has(q.url)) return false;
    seen.add(q.url);
    return true;
  });
}

// --- Validate answer text before posting ---
function isValidComment(text: string): boolean {
  if (!text || text.trim().length < 10) return false;
  if (text.trim().length > 2000) return false;

  const errorPatterns = [
    /error/i,
    /Error:/,
    /ERR_/,
    /failed/i,
    /exception/i,
    /stack\s*trace/i,
    /undefined/i,
    /null/i,
    /NaN/,
    /\b(500|404|403|401|400)\b.*\b(status|code|error)\b/i,
    /at\s+\w+\s*\(/,
    /^\s*\{[\s\S]*\}\s*$/,
    /^\s*\[[\s\S]*\]\s*$/,
    /TypeError|ReferenceError|SyntaxError/,
    /ECONNREFUSED|ETIMEDOUT|ENOTFOUND/,
    /Could not parse/i,
  ];

  for (const pattern of errorPatterns) {
    if (pattern.test(text)) return false;
  }

  return true;
}

// --- Post an answer to a Quora question ---
export async function postQuoraAnswer(
  questionUrl: string,
  answer: string
): Promise<boolean> {
  if (!isValidComment(answer)) {
    console.error('Invalid answer text (error/code detected), refusing to post:', answer.slice(0, 100));
    return false;
  }

  try {
    const page = await getPage();
    await page.goto(questionUrl, { waitUntil: 'domcontentloaded' });
    await sleep(SLOW_WAIT);

    // Scroll down to find the answer area
    await page.mouse.wheel(0, 400);
    await sleep(2000);

    // Click "Answer" button to open the answer editor
    const answerBtnSelectors = [
      'button:has-text("Answer")',
      '[aria-label="Answer"]',
      'a:has-text("Answer")',
      '.q-box button:has-text("Answer")',
    ];

    let clickedAnswer = false;
    for (const sel of answerBtnSelectors) {
      const btns = await page.$$(sel);
      for (const btn of btns) {
        const text = await btn.textContent().catch(() => '');
        if (text && /^answer$/i.test(text.trim()) && await btn.isVisible().catch(() => false)) {
          await btn.click({ force: true });
          clickedAnswer = true;
          await sleep(3000);
          break;
        }
      }
      if (clickedAnswer) break;
    }

    // Find the answer editor (rich text contenteditable)
    const editorSelectors = [
      'div[contenteditable="true"][data-placeholder]',
      'div[contenteditable="true"].q-box',
      'div[contenteditable="true"]',
      '.doc[contenteditable="true"]',
      'div[role="textbox"][contenteditable="true"]',
    ];

    let editor = null;
    for (const sel of editorSelectors) {
      const elements = await page.$$(sel);
      for (const el of elements) {
        if (await el.isVisible().catch(() => false)) {
          editor = el;
          break;
        }
      }
      if (editor) break;
    }

    if (!editor) {
      console.error('Could not find answer editor on question:', questionUrl);
      await page.screenshot({ path: '/tmp/quora-answer-failed.png', fullPage: false }).catch(() => {});
      return false;
    }

    // Click to focus
    await editor.click({ force: true });
    await sleep(1000);

    // Type the answer with human-like delay
    await page.keyboard.type(answer, { delay: 30 });
    await sleep(1000);

    // Find and click the Submit/Post button
    const submitSelectors = [
      'button:has-text("Post")',
      'button:has-text("Submit")',
      'button[type="submit"]:has-text("Post")',
      'button.q-click-wrapper:has-text("Post")',
    ];

    let submitted = false;
    for (const sel of submitSelectors) {
      const btns = await page.$$(sel);
      for (const btn of btns) {
        if (await btn.isVisible().catch(() => false)) {
          await btn.click({ force: true });
          submitted = true;
          break;
        }
      }
      if (submitted) break;
    }

    if (!submitted) {
      // Try Ctrl+Enter as fallback
      await page.keyboard.press('Control+Enter');
    }

    await sleep(5000);

    // Verify: check if answer text appears in page
    const pageText = await page.textContent('body').catch(() => '');
    const posted = pageText?.includes(answer.slice(0, 30)) ?? false;

    if (posted) {
      console.log(`Answer posted successfully on: ${questionUrl}`);
    } else {
      console.warn(`Answer may NOT have posted on: ${questionUrl}`);
      await page.screenshot({ path: '/tmp/quora-post-failed.png', fullPage: false }).catch(() => {});
    }

    return posted;
  } catch (err) {
    console.error(`Failed to post answer on ${questionUrl}:`, (err as Error).message);
    return false;
  }
}
