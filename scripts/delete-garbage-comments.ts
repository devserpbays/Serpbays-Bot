/**
 * delete-garbage-comments.ts
 *
 * Finds all posted comments in the DB whose text contains ANSI codes /
 * "[agent/embedded]" / "payloads" garbage, deletes them from the social
 * media platform, then removes the DB record.
 *
 * Platforms handled: Twitter, Reddit, Facebook, Pinterest
 *
 * Usage:
 *   npx tsx scripts/delete-garbage-comments.ts           # live run
 *   npx tsx scripts/delete-garbage-comments.ts --dry-run # show plan only
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { chromium, type BrowserContext, type Page } from 'playwright';
import { join } from 'path';
import { unlinkSync } from 'fs';
import { connectDB } from '../src/lib/mongodb';
import Post from '../src/models/Post';

const DRY_RUN = process.argv.includes('--dry-run');
const SLEEP = (ms: number) => new Promise(r => setTimeout(r, ms));

// ── ANSI stripping (same as openclaw.ts) ─────────────────────────────────────
// eslint-disable-next-line no-control-regex
function stripAnsi(s: string) { return s.replace(/\x1b\[[0-9;]*m/g, ''); }

// The visible text that was actually typed into browser text boxes
// (ESC character is dropped; remaining chars are the visible garbage)
function visibleText(raw: string): string {
  return stripAnsi(raw).trim();
}

// ── Detect garbage reply ──────────────────────────────────────────────────────
function isGarbage(reply: string): boolean {
  return reply.includes('"payloads"')
    || reply.includes('[agent/embedded]')
    || /^\s*[\[{]/.test(reply);
}

// ── Twitter: delete tweet via GraphQL ────────────────────────────────────────
const TWITTER_PROFILE = join(process.cwd(), '.twitter-profile');
const TWITTER_BEARER = 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';
const TWITTER_GRAPHQL = 'https://x.com/i/api/graphql';

let twCtx: BrowserContext | null = null;
let twPage: Page | null = null;

async function getTwitterPage(): Promise<Page> {
  if (twPage && !twPage.isClosed()) return twPage;
  try { unlinkSync(join(TWITTER_PROFILE, 'SingletonLock')); } catch {}
  twCtx = await chromium.launchPersistentContext(TWITTER_PROFILE, {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
  });
  twPage = twCtx.pages()[0] || await twCtx.newPage();
  return twPage;
}

async function deleteTweet(tweetId: string): Promise<boolean> {
  const ct0 = process.env.TWITTER_CT0 || '';
  const page = await getTwitterPage();

  try {
    await page.goto('https://x.com', { waitUntil: 'domcontentloaded' });
    await SLEEP(2000);

    const result = await page.evaluate(
      async ({ url, bearer, csrfToken, body }: { url: string; bearer: string; csrfToken: string; body: string }) => {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: bearer,
            'Content-Type': 'application/json',
            'X-Csrf-Token': csrfToken,
            'X-Twitter-Auth-Type': 'OAuth2Session',
            'X-Twitter-Active-User': 'yes',
          },
          body,
        });
        return { ok: res.ok, status: res.status, body: await res.text() };
      },
      {
        url: `${TWITTER_GRAPHQL}/VaenaVgh5q5ih7kvyVjgtg/DeleteTweet`,
        bearer: TWITTER_BEARER,
        csrfToken: ct0,
        body: JSON.stringify({
          variables: { tweet_id: tweetId, dark_request: false },
          queryId: 'VaenaVgh5q5ih7kvyVjgtg',
        }),
      }
    );

    if (!result.ok) {
      console.error(`    Twitter delete failed: HTTP ${result.status} — ${result.body.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`    Twitter delete error: ${(err as Error).message}`);
    return false;
  }
}

// ── Reddit: navigate to post, find garbage comment, delete it ────────────────
const REDDIT_PROFILE = join(process.cwd(), '.reddit-profile');
let rdCtx: BrowserContext | null = null;
let rdPage: Page | null = null;

async function getRedditPage(): Promise<Page> {
  if (rdPage && !rdPage.isClosed()) return rdPage;
  try { unlinkSync(join(REDDIT_PROFILE, 'SingletonLock')); } catch {}
  rdCtx = await chromium.launchPersistentContext(REDDIT_PROFILE, {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
  });
  rdPage = rdCtx.pages()[0] || await rdCtx.newPage();
  rdPage.setDefaultTimeout(30000);
  return rdPage;
}

async function deleteRedditComment(postUrl: string, garbageText: string): Promise<boolean> {
  const page = await getRedditPage();
  const oldUrl = postUrl.replace('www.reddit.com', 'old.reddit.com');

  await page.goto(oldUrl, { waitUntil: 'domcontentloaded' });
  await SLEEP(4000);

  // Search for a distinctive snippet from the garbage text
  const snippet = '[agent/embedded]';
  const snippet2 = 'payloads';

  // Find comments where OUR user posted and the body contains the garbage snippet
  const deleted = await page.evaluate(({ snip, snip2 }: { snip: string; snip2: string }) => {
    const comments = document.querySelectorAll('.comment.thing');
    for (const comment of Array.from(comments)) {
      const body = comment.querySelector('.md, .usertext-body');
      const text = body?.textContent || '';
      if (!text.includes(snip) && !text.includes(snip2)) continue;

      // Check it's our own comment (has delete button)
      const deleteBtn = comment.querySelector('.delete-comment, [data-event-action="delete"], button.delete');
      if (!deleteBtn) {
        // Try the "..." button pattern used by new Reddit
        const dots = comment.querySelector('a[title="delete"], a:contains("delete")');
        if (dots) { (dots as HTMLElement).click(); return 'clicked-delete'; }
        return 'no-delete-button';
      }

      (deleteBtn as HTMLElement).click();
      return 'clicked-delete';
    }
    return 'not-found';
  }, { snip: snippet, snip2: snippet2 });

  if (deleted === 'not-found') {
    // Try new Reddit (www.reddit.com) — shreddit components
    const newUrl = postUrl.replace('old.reddit.com', 'www.reddit.com');
    await page.goto(newUrl, { waitUntil: 'domcontentloaded' });
    await SLEEP(5000);
    await page.mouse.wheel(0, 500);
    await SLEEP(2000);

    // Scroll to find the comment with garbage text
    const foundSnippet = await page.evaluate(({ snip, snip2 }: { snip: string; snip2: string }) => {
      const allText = document.body.innerText;
      return allText.includes(snip) || allText.includes(snip2);
    }, { snip: snippet, snip2: snippet2 });

    if (!foundSnippet) {
      console.log('    Comment not found on page (may already be deleted)');
      return true; // treat as success
    }

    // Find "..." overflow menu on the comment
    const menuBtn = await page.$('[data-testid="comment_overflow_button"], button[aria-label="more options"], shreddit-comment-action-row button:last-child');
    if (menuBtn) {
      await menuBtn.click();
      await SLEEP(1000);
      const deleteOpt = await page.$('button:has-text("Delete"), [data-action-type="delete"]');
      if (deleteOpt) {
        await deleteOpt.click();
        await SLEEP(1000);
        // Confirm if a dialog appears
        const confirmBtn = await page.$('button:has-text("Delete"), button:has-text("Yes")');
        if (confirmBtn) await confirmBtn.click();
        await SLEEP(2000);
        return true;
      }
    }
    return false;
  }

  if (deleted === 'no-delete-button') {
    console.warn('    Found comment but no delete button (not our comment?)');
    return false;
  }

  await SLEEP(2000);
  // Confirm dialog if it appears
  const confirmBtn = await page.$('.confirm-dialog button.yes, button:has-text("yes"), button:has-text("Yes")');
  if (confirmBtn) await confirmBtn.click();
  await SLEEP(1000);
  return true;
}

// ── Facebook: navigate to post, find garbage comment, delete it ──────────────
const FB_PROFILE = join(process.cwd(), '.fb-profile');
let fbCtx: BrowserContext | null = null;
let fbPage: Page | null = null;

async function getFbPage(): Promise<Page> {
  if (fbPage && !fbPage.isClosed()) return fbPage;
  try { unlinkSync(join(FB_PROFILE, 'SingletonLock')); } catch {}
  fbCtx = await chromium.launchPersistentContext(FB_PROFILE, {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
  });
  fbPage = fbCtx.pages()[0] || await fbCtx.newPage();
  fbPage.setDefaultTimeout(30000);
  return fbPage;
}

async function deleteFbComment(postUrl: string): Promise<boolean> {
  const page = await getFbPage();
  await page.goto(postUrl, { waitUntil: 'domcontentloaded' });
  await SLEEP(5000);

  // Scroll down to load comments
  await page.mouse.wheel(0, 600);
  await SLEEP(2000);

  // Find any comment whose text contains the garbage snippets
  const snippets = ['[agent/embedded]', 'payloads'];

  for (const snippet of snippets) {
    // Facebook renders comments as spans/divs with dir="auto"
    const commentDivs = await page.$$('[dir="auto"]');
    for (const div of commentDivs) {
      const text = await div.textContent().catch(() => '');
      if (!text?.includes(snippet)) continue;

      console.log('    Found garbage comment on Facebook, attempting delete…');

      // The "..." (more) button is usually nearby — go up to the comment container
      const container = await div.evaluateHandle(el => {
        let node: Element | null = el;
        while (node && !node.querySelector('[aria-label="More options"]')) {
          node = node.parentElement;
          if (!node || node.tagName === 'BODY') return null;
        }
        return node;
      });

      const moreBtn = await (container as import('playwright').ElementHandle<Element>)?.$('[aria-label="More options"]');
      if (!moreBtn) {
        console.warn('    Could not find More Options button for comment');
        continue;
      }

      await moreBtn.click();
      await SLEEP(1000);

      // Click "Delete" in the dropdown
      const deleteItem = await page.$('[role="menuitem"]:has-text("Delete")');
      if (!deleteItem) {
        console.warn('    Delete menu item not found');
        await page.keyboard.press('Escape');
        continue;
      }

      await deleteItem.click();
      await SLEEP(1000);

      // Confirm deletion dialog
      const confirmBtn = await page.$('button:has-text("Delete"):not([aria-label="More options"]), [data-testid="delete_post_confirm_button"]');
      if (confirmBtn) await confirmBtn.click();
      await SLEEP(2000);
      return true;
    }
  }

  console.log('    Garbage comment not found on Facebook page (may already be deleted)');
  return true; // treat as success if not found
}

// ── Pinterest: navigate to pin, find garbage comment, delete it ──────────────
const PINTEREST_PROFILE = join(process.cwd(), '.pinterest-profile');
let ptCtx: BrowserContext | null = null;
let ptPage: Page | null = null;

async function getPinterestPage(): Promise<Page> {
  if (ptPage && !ptPage.isClosed()) return ptPage;
  try { unlinkSync(join(PINTEREST_PROFILE, 'SingletonLock')); } catch {}
  ptCtx = await chromium.launchPersistentContext(PINTEREST_PROFILE, {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
  });
  ptPage = ptCtx.pages()[0] || await ptCtx.newPage();
  ptPage.setDefaultTimeout(30000);
  return ptPage;
}

async function deletePinterestComment(pinUrl: string): Promise<boolean> {
  const page = await getPinterestPage();
  await page.goto(pinUrl, { waitUntil: 'domcontentloaded' });
  await SLEEP(5000);

  await page.mouse.wheel(0, 400);
  await SLEEP(2000);

  const snippets = ['[agent/embedded]', 'payloads'];

  for (const snippet of snippets) {
    const commentSpans = await page.$$('[data-test-id="comment-list"] span, .commentContainer span');
    for (const span of commentSpans) {
      const text = await span.textContent().catch(() => '');
      if (!text?.includes(snippet)) continue;

      console.log('    Found garbage comment on Pinterest, attempting delete…');

      // Hover to reveal "..." button
      await span.hover();
      await SLEEP(500);

      const moreBtn = await page.$('[data-test-id="comment-ellipsis"], button[aria-label="More options"], svg[aria-label="Ellipsis"]');
      if (!moreBtn) {
        console.warn('    Could not find ellipsis button on Pinterest comment');
        continue;
      }

      await moreBtn.click();
      await SLEEP(1000);

      const deleteOpt = await page.$('[data-test-id="comment-delete"], [role="menuitem"]:has-text("Delete")');
      if (!deleteOpt) {
        console.warn('    Delete option not in Pinterest menu');
        await page.keyboard.press('Escape');
        continue;
      }

      await deleteOpt.click();
      await SLEEP(2000);
      return true;
    }
  }

  console.log('    Garbage comment not found on Pinterest (may already be deleted)');
  return true;
}

// ── Close all browsers ────────────────────────────────────────────────────────
async function closeAll() {
  for (const ctx of [twCtx, rdCtx, fbCtx, ptCtx]) {
    await ctx?.close().catch(() => {});
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  await connectDB();

  // Find all garbage posted records
  const allPosted = await Post.find({ status: 'posted' });
  const garbage = allPosted.filter(p => isGarbage(String(p.editedReply || p.aiReply || '')));

  console.log(`\nFound ${garbage.length} garbage posted comments (out of ${allPosted.length} total posted)\n`);
  if (garbage.length === 0) { console.log('Nothing to clean up.'); process.exit(0); }

  // Group by platform for display
  const byPlatform: Record<string, number> = {};
  garbage.forEach(p => { byPlatform[p.platform] = (byPlatform[p.platform] || 0) + 1; });
  console.log('By platform:', byPlatform);

  if (DRY_RUN) {
    console.log('\n[--dry-run] Would delete:\n');
    garbage.forEach(p => {
      const reply = String(p.editedReply || p.aiReply || '');
      console.log(`  [${p.platform}] ${p.url}`);
      console.log(`    snippet: ${visibleText(reply).slice(0, 100)}…\n`);
    });
    process.exit(0);
  }

  let deleted = 0;
  let failed = 0;

  for (const post of garbage) {
    const reply = String(post.editedReply || post.aiReply || '');
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`[${post.platform.toUpperCase()}] ${post.url}`);
    console.log(`Snippet: ${visibleText(reply).slice(0, 80)}…`);

    let platformSuccess = false;

    try {
      if (post.platform === 'twitter') {
        // Extract tweet ID from URL: https://x.com/i/status/1234567890
        const match = post.url.match(/\/status\/(\d+)/);
        const tweetId = match?.[1];
        if (!tweetId) {
          console.error('  Could not extract tweet ID from URL, skipping platform deletion');
          platformSuccess = false;
        } else {
          console.log(`  Deleting tweet ID: ${tweetId}`);
          platformSuccess = await deleteTweet(tweetId);
        }

      } else if (post.platform === 'reddit') {
        console.log('  Navigating to Reddit post to find and delete comment…');
        platformSuccess = await deleteRedditComment(post.url, reply);

      } else if (post.platform === 'facebook') {
        console.log('  Navigating to Facebook post to find and delete comment…');
        platformSuccess = await deleteFbComment(post.url);

      } else if (post.platform === 'pinterest') {
        console.log('  Navigating to Pinterest pin to find and delete comment…');
        platformSuccess = await deletePinterestComment(post.url);

      } else {
        console.warn(`  Unsupported platform "${post.platform}" — skipping platform deletion, will remove from DB`);
        platformSuccess = true;
      }
    } catch (err) {
      console.error(`  Platform deletion threw: ${(err as Error).message}`);
      platformSuccess = false;
    }

    if (platformSuccess) {
      console.log('  Platform: DELETED (or already gone)');
    } else {
      console.warn('  Platform: FAILED — skipping DB removal to allow manual retry');
      failed++;
      continue;
    }

    // Remove from DB
    await Post.findByIdAndDelete(post._id);
    console.log('  DB: record removed');
    deleted++;
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`Done. Deleted: ${deleted}  Failed: ${failed}`);
  if (failed > 0) {
    console.log(`Re-run the script to retry failed deletions (DB records kept for failed ones).`);
  }
}

main()
  .catch(err => { console.error('Fatal:', err); })
  .finally(() => closeAll().then(() => process.exit(0)));
