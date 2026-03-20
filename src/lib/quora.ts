/**
 * Quora Browser Automation via Playwright + Chromium
 *
 * Uses a persistent browser context so cookies survive between runs.
 * Profile data stored at: /var/www/ai-bot/bot-serp/.quora-profile/
 */

import { chromium, type BrowserContext, type Page } from 'playwright';
import { join } from 'path';
import { unlinkSync, existsSync, readFileSync } from 'fs';

const PROFILE_DIR = process.env.QUORA_PROFILE_DIR
  ? join(process.cwd(), process.env.QUORA_PROFILE_DIR)
  : join(process.cwd(), '.quora-profile');
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
      '--disable-features=IsolateOrigins,site-per-process',
      '--flag-switches-begin',
      '--disable-site-isolation-trials',
      '--flag-switches-end',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-default-browser-check',
    ],
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
    },
  });

  // Inject cookies from cookies.json if available
  const cookiesJsonPath = join(PROFILE_DIR, 'cookies.json');
  if (existsSync(cookiesJsonPath)) {
    try {
      const savedCookies = JSON.parse(readFileSync(cookiesJsonPath, 'utf8'));
      if (Array.isArray(savedCookies) && savedCookies.length > 0) {
        await _context.addCookies(savedCookies);
      }
    } catch (e) {
      console.error('Failed to load cookies.json:', e);
    }
  }

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

    // Wait out any Cloudflare challenge
    for (let i = 0; i < 6; i++) {
      const title = await page.title().catch(() => '');
      const bodyText = await page.textContent('body').catch(() => '');
      const isCloudflare = title.includes('Just a moment') || (bodyText || '').includes('Performing security verification');
      if (!isCloudflare) break;
      await sleep(5000);
    }

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
      const searchUrl = `https://www.quora.com/search?q=${encodeURIComponent(keyword)}&type=question&time=week`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
      await sleep(SLOW_WAIT);

      // Scroll to load more results
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.scrollBy({ top: 800, behavior: 'smooth' }));
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

  // Patterns that indicate the text is a code dump or error output, not a real comment.
  // These are intentionally specific to avoid false positives on conversational text
  // that naturally mentions words like "error" or "failed".
  const errorPatterns = [
    /Error:\s*\w+/,                        // "Error: something" (structured error output)
    /ERR_/,                                 // Node.js error codes
    /stack\s*trace/i,                       // stack trace dumps
    /\bundefined\b.*\bundefined\b/i,        // multiple "undefined" = likely a dump
    /\bnull\b.*\bnull\b/i,                  // multiple "null" = likely a dump
    /\bNaN\b.*\bNaN\b/,                     // multiple NaN
    /\b(500|404|403|401|400)\b.*\b(status|code|error)\b/i,
    /at\s+\w+\s*\(.*:\d+:\d+\)/,           // stack frame: "at func (file:line:col)"
    /^\s*\{[\s\S]*\}\s*$/,                  // entire text is a JSON object
    /^\s*\[[\s\S]*\]\s*$/,                  // entire text is a JSON array
    /TypeError|ReferenceError|SyntaxError/, // JS error type names
    /ECONNREFUSED|ETIMEDOUT|ENOTFOUND/,     // Node.js network error codes
    /Could not parse/i,
    /```[\s\S]*```/,                        // markdown code blocks
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
): Promise<{ success: boolean; error?: string }> {
  if (!isValidComment(answer)) {
    console.error('Invalid answer text (error/code detected), refusing to post:', answer.slice(0, 100));
    return { success: false, error: 'Invalid answer text detected (contains code/error patterns)' };
  }

  try {
    const page = await getPage();
    await page.goto(questionUrl, { waitUntil: 'domcontentloaded' });
    await sleep(SLOW_WAIT);

    // Check for Cloudflare challenge page and wait it out
    for (let i = 0; i < 6; i++) {
      const title = await page.title().catch(() => '');
      const bodyText = await page.textContent('body').catch(() => '');
      const isCloudflare = title.includes('Just a moment') || (bodyText || '').includes('Performing security verification') || (bodyText || '').includes('Checking if the site connection is secure');
      if (!isCloudflare) break;
      console.log(`Quora: Cloudflare challenge detected, waiting... (attempt ${i + 1}/6)`);
      await sleep(5000);
    }

    // Wait extra for Quora's React app to fully hydrate
    await sleep(3000);

    // Scroll down to find the answer area
    await page.evaluate(() => window.scrollBy({ top: 400, behavior: 'smooth' }));
    await sleep(2000);

    // --- Strategy 1: Click "Answer" button/link to open the editor ---
    const answerBtnSelectors = [
      'button:has-text("Answer")',
      '[aria-label="Answer"]',
      '[aria-label="Answer question"]',
      'a:has-text("Answer")',
      '.q-box button:has-text("Answer")',
      'div[role="tab"]:has-text("Answer")',
      'div[role="button"]:has-text("Answer")',
    ];

    let clickedAnswer = false;
    for (const sel of answerBtnSelectors) {
      try {
        const btns = await page.$$(sel);
        for (const btn of btns) {
          const text = await btn.textContent().catch(() => '');
          const trimmed = (text || '').trim();
          // Match "Answer", "Answer · N", or "Write Answer"
          if (trimmed && /^(write\s+)?answer(\s+·\s*\d+)?$/i.test(trimmed) && await btn.isVisible().catch(() => false)) {
            await btn.click({ force: true });
            clickedAnswer = true;
            console.log(`Clicked answer button: "${trimmed}" via ${sel}`);
            await sleep(3000);
            break;
          }
        }
      } catch { /* selector may not match */ }
      if (clickedAnswer) break;
    }

    // --- Strategy 2: Click the "Write your answer" placeholder prompt ---
    if (!clickedAnswer) {
      const promptSelectors = [
        'text="Write your answer"',
        'text="Answer"',
        '[data-placeholder="Write your answer"]',
        '[placeholder="Write your answer"]',
        'span:has-text("Write your answer")',
      ];
      for (const sel of promptSelectors) {
        try {
          const el = page.locator(sel).first();
          if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
            await el.click({ force: true });
            clickedAnswer = true;
            console.log(`Clicked answer prompt via ${sel}`);
            await sleep(3000);
            break;
          }
        } catch { /* selector may not match */ }
      }
    }

    // --- Strategy 3: Use page.evaluate to find and click answer-related elements ---
    if (!clickedAnswer) {
      const clicked = await page.evaluate(() => {
        const allEls = document.querySelectorAll('button, a, [role="button"], [role="tab"], span, div');
        for (const el of allEls) {
          const text = (el.textContent || '').trim();
          if (/^(write\s+)?answer(\s+·\s*\d+)?$/i.test(text) && (el as HTMLElement).offsetParent !== null) {
            (el as HTMLElement).click();
            return 'answer-btn';
          }
        }
        for (const el of allEls) {
          const text = (el.textContent || '').trim();
          if (/write your answer/i.test(text) && (el as HTMLElement).offsetParent !== null) {
            (el as HTMLElement).click();
            return 'write-prompt';
          }
        }
        return '';
      }).catch(() => '');

      if (clicked) {
        clickedAnswer = true;
        console.log(`Clicked answer element via evaluate: ${clicked}`);
        await sleep(3000);
      }
    }

    if (!clickedAnswer) {
      console.warn('Could not find Answer button — will still search for editor');
    }

    // Find the answer editor (rich text contenteditable)
    const editorSelectors = [
      'div[contenteditable="true"][data-placeholder]',
      'div[contenteditable="true"].q-box',
      '.doc[contenteditable="true"]',
      'div[role="textbox"][contenteditable="true"]',
      'div[contenteditable="true"][class*="editor"]',
      'div[contenteditable="true"][class*="Editor"]',
      'div[contenteditable="true"][data-lexical-editor]',
      'div[contenteditable="true"]',
      'p[contenteditable="true"]',
      '[contenteditable="plaintext-only"]',
    ];

    let editor = null;

    // Try multiple times with increasing waits — Quora editor can be slow to mount
    for (let attempt = 0; attempt < 3; attempt++) {
      for (const sel of editorSelectors) {
        try {
          const elements = await page.$$(sel);
          for (const el of elements) {
            if (await el.isVisible().catch(() => false)) {
              // Skip search box inputs
              const ariaLabel = await el.evaluate((e) => e.getAttribute('aria-label') || '').catch(() => '');
              if (ariaLabel.toLowerCase().includes('search')) continue;
              // Skip tiny elements that are not an editor
              const box = await el.boundingBox().catch(() => null);
              if (box && box.height < 30) continue;
              editor = el;
              console.log(`Found editor: ${sel} (attempt ${attempt + 1})`);
              break;
            }
          }
        } catch { /* selector may not match */ }
        if (editor) break;
      }
      if (editor) break;

      // Not found yet — scroll down, re-click, and wait
      if (attempt < 2) {
        console.log(`Editor not found (attempt ${attempt + 1}), scrolling and retrying...`);
        await page.evaluate(() => window.scrollBy({ top: 300, behavior: 'smooth' }));
        await sleep(2000);
        // Try clicking an answer element again
        await page.evaluate(() => {
          const els = document.querySelectorAll('button, a, [role="button"], [role="tab"]');
          for (const el of els) {
            const text = (el.textContent || '').trim();
            if (/^(write\s+)?answer/i.test(text) && (el as HTMLElement).offsetParent !== null) {
              (el as HTMLElement).click();
              return;
            }
          }
        }).catch(() => {});
        await sleep(3000);
      }
    }

    if (!editor) {
      // Dump diagnostics for debugging
      const diag = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, [role="button"]'))
          .map(b => (b.textContent || '').trim().slice(0, 50)).filter(t => t.length > 0).slice(0, 20);
        const editables = Array.from(document.querySelectorAll('[contenteditable]')).map(e => ({
          tag: e.tagName, ce: e.getAttribute('contenteditable'),
          visible: (e as HTMLElement).offsetParent !== null,
          ariaLabel: e.getAttribute('aria-label') || '',
        }));
        return { url: window.location.href, title: document.title, btns, editables };
      }).catch(() => ({ url: '', title: '', btns: [] as string[], editables: [] as unknown[] }));
      console.error('Editor not found. Page diagnostics:', JSON.stringify(diag, null, 2));

      await page.screenshot({ path: '/tmp/quora-answer-failed.png', fullPage: false }).catch(() => {});
      return { success: false, error: 'Answer editor not found — question may be closed, or login session expired' };
    }

    // Click to focus
    await editor.click({ force: true });
    await sleep(1000);

    // Clear any existing placeholder content
    await page.keyboard.press('Control+a');
    await sleep(200);

    // Human-like typing: variable delay, occasional natural pauses
    await sleep(800 + Math.random() * 700);
    for (let i = 0; i < answer.length; i++) {
      await page.keyboard.type(answer[i]);
      const isPause = answer[i] === ',' || answer[i] === '.' || answer[i] === '!' || answer[i] === '?' || (Math.random() < 0.03);
      await sleep(isPause ? 350 + Math.random() * 300 : 55 + Math.random() * 100);
    }
    await sleep(2000 + Math.random() * 2000);

    // Find and click the Submit/Post button
    const submitSelectors = [
      'button:has-text("Post")',
      'button:has-text("Submit")',
      'button[type="submit"]:has-text("Post")',
      'button.q-click-wrapper:has-text("Post")',
      'button:has-text("Add Answer")',
      'div[role="button"]:has-text("Post")',
      'div[role="button"]:has-text("Submit")',
    ];

    let submitted = false;
    for (const sel of submitSelectors) {
      try {
        const btns = await page.$$(sel);
        for (const btn of btns) {
          const text = await btn.textContent().catch(() => '');
          const trimmed = (text || '').trim();
          if (await btn.isVisible().catch(() => false) && /^(post|submit|add answer)$/i.test(trimmed)) {
            await btn.click({ force: true });
            submitted = true;
            console.log(`Clicked submit button: "${trimmed}"`);
            break;
          }
        }
      } catch { /* selector may not match */ }
      if (submitted) break;
    }

    // Broader submit button search via evaluate
    if (!submitted) {
      submitted = await page.evaluate(() => {
        const allBtns = document.querySelectorAll('button, [role="button"]');
        for (const btn of allBtns) {
          const text = (btn.textContent || '').trim();
          if (/^(post|submit|add answer)$/i.test(text) && (btn as HTMLElement).offsetParent !== null) {
            (btn as HTMLElement).click();
            return true;
          }
        }
        return false;
      }).catch(() => false);
    }

    if (!submitted) {
      console.log('No submit button found, trying Ctrl+Enter');
      await page.keyboard.press('Control+Enter');
    }

    await sleep(5000);

    // Verify: check if answer text appears in page
    const pageText = await page.textContent('body').catch(() => '');
    const posted = pageText?.includes(answer.slice(0, 30)) ?? false;

    if (posted) {
      console.log(`Answer posted successfully on: ${questionUrl}`);
      return { success: true };
    } else {
      console.warn(`Answer may NOT have posted on: ${questionUrl}`);
      await page.screenshot({ path: '/tmp/quora-post-failed.png', fullPage: false }).catch(() => {});
      return { success: false, error: 'Answer not confirmed on page — Quora may have blocked it or session expired' };
    }
  } catch (err) {
    const msg = (err as Error).message;
    console.error(`Failed to post answer on ${questionUrl}:`, msg);
    return { success: false, error: msg };
  }
}

/**
 * Post a comment on an existing answer on a Quora question page.
 * Finds the first visible answer and clicks its "Add comment" button.
 */
export async function postQuoraComment(
  questionUrl: string,
  comment: string
): Promise<{ success: boolean; error?: string }> {
  if (!isValidComment(comment)) {
    return { success: false, error: 'Invalid comment text detected' };
  }

  try {
    const page = await getPage();
    // Navigate to the question page (may already be there from a previous answer)
    const currentUrl = page.url();
    if (!currentUrl.includes(questionUrl.replace(/^https?:\/\/[^/]+/, ''))) {
      await page.goto(questionUrl, { waitUntil: 'domcontentloaded' });
      await sleep(SLOW_WAIT);
    }

    // Scroll down to load answers
    await page.evaluate(() => window.scrollBy({ top: 600, behavior: 'smooth' }));
    await sleep(2500);

    // --- Find "Add comment" or "Comment" link on any visible answer ---
    const commentBtnSelectors = [
      'button:has-text("Add comment")',
      'a:has-text("Add comment")',
      'span:has-text("Add comment")',
      'div[role="button"]:has-text("Add comment")',
      'button:has-text("Comment")',
      '[aria-label="Add comment"]',
      '[aria-label="Comment"]',
    ];

    let clickedComment = false;
    for (const sel of commentBtnSelectors) {
      try {
        const els = await page.$$(sel);
        for (const el of els) {
          if (await el.isVisible().catch(() => false)) {
            await el.click({ force: true });
            clickedComment = true;
            console.log(`Clicked comment button via: ${sel}`);
            await sleep(2000);
            break;
          }
        }
      } catch { /* skip */ }
      if (clickedComment) break;
    }

    // Fallback: find via evaluate
    if (!clickedComment) {
      clickedComment = await page.evaluate(() => {
        const allEls = document.querySelectorAll('button, a, span, [role="button"]');
        for (const el of allEls) {
          const text = (el.textContent || '').trim();
          if (/^add comment$/i.test(text) && (el as HTMLElement).offsetParent !== null) {
            (el as HTMLElement).click();
            return true;
          }
        }
        return false;
      }).catch(() => false);
      if (clickedComment) await sleep(2000);
    }

    if (!clickedComment) {
      return { success: false, error: 'Could not find Add comment button on page' };
    }

    // Find the comment text input (smaller than the answer editor)
    const commentInputSelectors = [
      'div[contenteditable="true"][data-placeholder*="comment"]',
      'div[contenteditable="true"][data-placeholder*="Comment"]',
      'div[contenteditable="true"][aria-label*="comment"]',
      'div[contenteditable="true"][aria-label*="Comment"]',
      'textarea[placeholder*="comment"]',
      'textarea[placeholder*="Comment"]',
      'div[contenteditable="true"]',
    ];

    let commentEditor = null;
    for (const sel of commentInputSelectors) {
      try {
        const els = await page.$$(sel);
        for (const el of els) {
          if (await el.isVisible().catch(() => false)) {
            const box = await el.boundingBox().catch(() => null);
            // Comment boxes are usually shorter than the answer editor
            if (box && box.height > 15) {
              commentEditor = el;
              console.log(`Found comment editor: ${sel}`);
              break;
            }
          }
        }
      } catch { /* skip */ }
      if (commentEditor) break;
    }

    if (!commentEditor) {
      return { success: false, error: 'Comment input not found after clicking Add comment' };
    }

    await commentEditor.click({ force: true });
    await sleep(600);

    // Human-like typing
    for (let i = 0; i < comment.length; i++) {
      await page.keyboard.type(comment[i]);
      const isPause = '.!?,'.includes(comment[i]) || Math.random() < 0.03;
      await sleep(isPause ? 250 + Math.random() * 250 : 45 + Math.random() * 80);
    }
    await sleep(1500 + Math.random() * 1000);

    // Submit the comment
    const submitSelectors = [
      'button:has-text("Add Comment")',
      'button:has-text("Submit")',
      'button:has-text("Post")',
      'div[role="button"]:has-text("Add Comment")',
    ];

    let submitted = false;
    for (const sel of submitSelectors) {
      try {
        const btns = await page.$$(sel);
        for (const btn of btns) {
          if (await btn.isVisible().catch(() => false)) {
            await btn.click({ force: true });
            submitted = true;
            console.log(`Submitted comment via: ${sel}`);
            break;
          }
        }
      } catch { /* skip */ }
      if (submitted) break;
    }

    if (!submitted) {
      await page.keyboard.press('Control+Enter');
      submitted = true;
    }

    await sleep(3000);

    const pageText = await page.textContent('body').catch(() => '');
    const confirmed = pageText?.includes(comment.slice(0, 25)) ?? false;
    if (confirmed) {
      console.log(`Comment posted on: ${questionUrl}`);
      return { success: true };
    } else {
      console.warn(`Comment may not have posted on: ${questionUrl}`);
      return { success: false, error: 'Comment not confirmed on page' };
    }
  } catch (err) {
    const msg = (err as Error).message;
    console.error(`Failed to post comment on ${questionUrl}:`, msg);
    return { success: false, error: msg };
  }
}
