/**
 * GetMention Extension — Background Service Worker
 *
 * Two main loops:
 * 1. SCRAPE: Opens platform search pages one at a time (rotates),
 *    scrapes posts via content scripts, sends to server for AI evaluation.
 * 2. POST: Polls server for evaluated tasks, opens post URLs,
 *    dispatches comment/like actions to content scripts.
 */

importScripts('utils/api.js');

// Version-boot log: fires whenever the service worker wakes up. Lets us verify
// from the server which version is actually running on a given account.
// We only fire it once per service-worker lifetime to avoid log spam.
(async () => {
  try {
    const manifest = chrome.runtime.getManifest();
    const { lastBootedVersion } = await chrome.storage.local.get('lastBootedVersion');
    if (lastBootedVersion !== manifest.version) {
      await chrome.storage.local.set({ lastBootedVersion: manifest.version });
      // Fire-and-forget — don't block startup if API is down
      try {
        await GetMentionAPI.sendLog('general', 'info', 'extension_boot',
          `[Extension] Service worker booted (v${manifest.version})`,
          { version: manifest.version });
      } catch {}
    }
  } catch (e) {
    console.error('[GetMention] Boot log failed:', e);
  }
})();

const PLATFORMS = {
  twitter:   { urls: ['https://x.com', 'https://twitter.com'],         searchUrl: (kw) => `https://x.com/search?q=${encodeURIComponent(kw)}&f=live` },
  youtube:   { urls: ['https://www.youtube.com'],                       searchUrl: (kw) => `https://www.youtube.com/results?search_query=${encodeURIComponent(kw)}` },
  facebook:  { urls: ['https://www.facebook.com'],                      searchUrl: (kw) => `https://www.facebook.com/search/posts?q=${encodeURIComponent(kw)}` },
  reddit:    { urls: ['https://www.reddit.com', 'https://old.reddit.com'], searchUrl: (kw) => `https://www.reddit.com/search/?q=${encodeURIComponent(kw)}&sort=new&t=week` },
  quora:     { urls: ['https://www.quora.com'],                         searchUrl: (kw) => {
    // Rotate between search strategies + Quora's Answer feed for fresh questions
    const strategies = [
      `https://www.quora.com/answer`,
      `https://www.quora.com/search?q=${encodeURIComponent(kw)}&time=week&type=question`,
      `https://www.quora.com/search?q=${encodeURIComponent(kw)}&type=question`,
      `https://www.quora.com/search?q=${encodeURIComponent(kw + ' 2025')}&type=question`,
      `https://www.quora.com/search?q=${encodeURIComponent(kw + ' how to')}&type=question`,
      `https://www.quora.com/search?q=${encodeURIComponent(kw + ' best')}&type=question`,
    ];
    return strategies[Math.floor(Math.random() * strategies.length)];
  }},
  pinterest: { urls: ['https://www.pinterest.com', 'https://in.pinterest.com'], searchUrl: (kw) => `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(kw)}` },
  skool:     { urls: ['https://www.skool.com'], searchUrl: (kw) => `https://www.skool.com/search?q=${encodeURIComponent(kw)}` },
};

let isProcessing = false;
let isProcessingSince = 0;      // timestamp when isProcessing was set to true
const PROCESSING_TIMEOUT = 210_000; // 3.5 min max — covers YouTube watching (120s) + commenting (60s) + buffer
let isScraping = false;

// Track processed task IDs to avoid duplicates (cleared daily)
const processedTasks = new Set();
let processedTasksDate = new Date().toISOString().slice(0, 10);

function isTaskProcessed(taskId) {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== processedTasksDate) {
    processedTasks.clear();
    processedTasksDate = today;
  }
  return processedTasks.has(taskId);
}

function markTaskProcessed(taskId) {
  processedTasks.add(taskId);
}

// ── Daily counters (reset at midnight) ──────────────────────────────────────

// Per-platform limits from server (synced each cycle)
let serverPlatformLimits = {};

async function getDailyCounters() {
  const { dailyCounters } = await chrome.storage.local.get('dailyCounters');
  const today = new Date().toISOString().slice(0, 10);
  if (!dailyCounters || dailyCounters.date !== today) {
    return { date: today, platforms: {}, lastCommentAt: 0 };
  }
  return dailyCounters;
}

function getPlatformCount(counters, platform, type) {
  return counters.platforms?.[platform]?.[type] || 0;
}

async function incrementPlatformCounter(platform, type) {
  const counters = await getDailyCounters();
  if (!counters.platforms) counters.platforms = {};
  if (!counters.platforms[platform]) counters.platforms[platform] = { comments: 0, likes: 0 };
  counters.platforms[platform][type] = (counters.platforms[platform][type] || 0) + 1;
  if (type === 'comments') counters.lastCommentAt = Date.now();
  await chrome.storage.local.set({ dailyCounters: counters });
  return counters;
}

function getTotalComments(counters) {
  let total = 0;
  for (const p of Object.values(counters.platforms || {})) {
    total += (p.comments || 0);
  }
  return total;
}

function getTotalLikes(counters) {
  let total = 0;
  for (const p of Object.values(counters.platforms || {})) {
    total += (p.likes || 0);
  }
  return total;
}

// ── Platform rotation index (scrape a different platform each cycle) ────────

async function getNextScrapePlatform(platforms) {
  const { scrapeIndex = 0 } = await chrome.storage.local.get('scrapeIndex');
  const idx = scrapeIndex % platforms.length;
  await chrome.storage.local.set({ scrapeIndex: scrapeIndex + 1 });
  return platforms[idx];
}

// ── Background scrape window ────────────────────────────────────────────────
//
// Chrome aggressively throttles JavaScript in background tabs when the parent
// Chrome window isn't focused — `setTimeout`/`setInterval` get clamped to 1Hz
// and many DOM operations pause. This breaks scraping and commenting whenever
// the user puts Chrome behind another window.
//
// The standard workaround: host scrape tabs inside a dedicated popup window
// that's MINIMIZED but always considered "focused" for its tabs. Chrome treats
// the foremost tab in any window as un-throttled, regardless of whether the
// window itself is visible to the user. So we keep one minimized popup window
// alive and create every scrape tab inside it.

let scrapeWindowId = null;
let scrapeWindowLock = Promise.resolve();

async function getOrCreateScrapeWindow() {
  // Serialize so concurrent callers don't race-create multiple windows
  const prev = scrapeWindowLock;
  let release;
  scrapeWindowLock = new Promise(r => { release = r; });
  await prev;

  try {
    // Verify cached window still exists
    if (scrapeWindowId !== null) {
      try {
        await chrome.windows.get(scrapeWindowId);
        return scrapeWindowId;
      } catch {
        scrapeWindowId = null;
      }
    }
    // IMPORTANT: DO NOT use offscreen positioning (left:-32000).
    // Chrome deprioritizes rendering for fully-offscreen windows, which causes
    // content scripts to timeout because DOM elements never mount.
    //
    // Instead: create at normal position with real dimensions, then MINIMIZE.
    // A minimized window still gets full DOM rendering from Chrome — the pages
    // load properly, React hydrates, and content scripts can find elements.
    // The user sees a small taskbar entry but ALL engagement actions work.
    let win;
    try {
      // Step 1: create with real geometry (no state param — that conflicts with width/height)
      win = await chrome.windows.create({
        url: 'about:blank',
        type: 'popup',
        focused: false,
        width: 1280,
        height: 900,
      });
      // Step 2: immediately minimize (state is allowed in update, just not create+geometry)
      try { await chrome.windows.update(win.id, { state: 'minimized', focused: false }); } catch {}
    } catch (e) {
      // Fallback: bare create then minimize
      try {
        win = await chrome.windows.create({ url: 'about:blank', type: 'popup', focused: false });
        try { await chrome.windows.update(win.id, { state: 'minimized' }); } catch {}
      } catch (e2) {
        // Last resort: create in user's window as background tab (no separate window)
        win = { id: chrome.windows.WINDOW_ID_CURRENT };
      }
    }
    scrapeWindowId = win.id;
    return scrapeWindowId;
  } finally {
    release();
  }
}

/**
 * Drop-in replacement for `chrome.tabs.create({ url, active: false })` that
 * places the new tab inside our persistent minimized scrape window. The tab
 * runs un-throttled regardless of whether the user's main Chrome window is in
 * focus, behind another app, or minimized.
 */
async function createBackgroundTab(url) {
  const winId = await getOrCreateScrapeWindow();
  const tab = await chrome.tabs.create({ url, windowId: winId, active: true });
  // Prevent Chrome from auto-discarding the tab under memory pressure.
  try { await chrome.tabs.update(tab.id, { autoDiscardable: false }); } catch {}

  // Close any lingering about:blank tabs in the window that aren't this new tab.
  // This prevents the initial about:blank from window creation (and any orphans
  // from previous cycles) from accumulating.
  try {
    const allTabs = await chrome.tabs.query({ windowId: winId });
    for (const t of (allTabs || [])) {
      if (t.id === tab.id) continue; // keep the one we just opened
      if (extensionTabs.has(t.id)) continue; // keep actively-used tabs
      const isBlank = !t.url || t.url === 'about:blank' || t.url === 'chrome://newtab/';
      if (isBlank) {
        try { await chrome.tabs.remove(t.id); } catch {}
      }
    }
  } catch {} // best-effort

  return tab;
}

// Clean up the scrape window when the extension reloads/updates
chrome.runtime.onSuspend.addListener(() => {
  if (scrapeWindowId !== null) {
    chrome.windows.remove(scrapeWindowId).catch(() => {});
  }
});

// ── Alarms ──────────────────────────────────────────────────────────────────

chrome.alarms.create('pollTasks', { periodInMinutes: 1 });
chrome.alarms.create('scrapeLoop', { delayInMinutes: 1, periodInMinutes: 5 });
chrome.alarms.create('cleanupTabs', { periodInMinutes: 1 }); // Cleanup stale tabs every 1 min

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'pollTasks') await processTasks();
  if (alarm.name === 'cleanupTabs') await cleanupStaleTabs();
  if (alarm.name === 'scrapeLoop') {
    try {
      await scrapeOnePlatform();
    } catch (err) {
      console.error('[GetMention] Scrape alarm error:', err);
    }
  }
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('[GetMention] Extension installed — auto-post ON by default');
  // Set auto-post ON by default for new installs
  chrome.storage.sync.get('autoPost', ({ autoPost }) => {
    if (autoPost === undefined) {
      chrome.storage.sync.set({ autoPost: true });
    }
  });
  processTasks();
  setTimeout(() => scrapeOnePlatform(), 30000);
});

chrome.runtime.onStartup.addListener(() => {
  recoverPendingTask();
  processTasks();
  setTimeout(() => scrapeOnePlatform(), 30000);
});

// Recover tasks that posted but service worker died before reporting
async function recoverPendingTask() {
  try {
    const { pendingTask, lastQuoraResult, lastRedditResult } = await chrome.storage.local.get(['pendingTask', 'lastQuoraResult', 'lastRedditResult']);
    if (!pendingTask) return;

    const stored = pendingTask.platform === 'quora' ? lastQuoraResult : pendingTask.platform === 'reddit' ? lastRedditResult : null;

    if (stored && stored.success && stored.timestamp > pendingTask.startedAt) {
      // Content script saved success but background died — report now
      console.log('[GetMention] Recovering unreported success for', pendingTask.platform);
      try {
        await GetMentionAPI.completeTask(pendingTask.id, { success: true, action: pendingTask.action });
        await GetMentionAPI.sendLog(pendingTask.platform, 'success', 'post',
          `Recovered: Comment posted on ${pendingTask.url} (reported after restart)`,
          { url: pendingTask.url, recovered: true });
      } catch {}
    }

    await chrome.storage.local.remove(['pendingTask', 'lastQuoraResult', 'lastRedditResult']);
  } catch {}
}

// ── Scraping (ONE platform per cycle, rotates) ─────────────────────────────

async function scrapeOnePlatform() {
  if (isScraping) {
    console.log('[GetMention] Scrape already running, skipping');
    return;
  }
  isScraping = true;
  console.log('[GetMention] Scrape cycle starting...');

  try {
    const apiKey = await GetMentionAPI.getApiKey();
    if (!apiKey) {
      console.log('[GetMention] No API key — skipping scrape');
      return;
    }

    const data = await GetMentionAPI.fetchPingData();
    if (!data.ok) {
      console.log('[GetMention] Ping failed — skipping scrape');
      return;
    }

    const extPlatforms = data.extensionPlatforms || [];
    if (extPlatforms.length === 0) {
      console.log('[GetMention] No extension platforms — skipping scrape');
      return;
    }

    const settingsData = await GetMentionAPI.fetchSettings();
    const keywords = getKeywordsForPlatforms(settingsData, extPlatforms);

    // Pick one platform (rotates each cycle)
    const platform = await getNextScrapePlatform(extPlatforms);
    const platformKeywords = keywords[platform] || [];

    const config = PLATFORMS[platform];
    if (!config) return;

    // Reddit: scrape within subreddits
    if (platform === 'reddit') {
      const subreddits = settingsData.subreddits || [];
      if (subreddits.length === 0 && platformKeywords.length === 0) {
        await GetMentionAPI.sendLog('reddit', 'warn', 'scrape_skip', 'No subreddits or keywords configured');
        return;
      }
      await scrapeRedditSubreddits(subreddits, platformKeywords);
      return;
    }

    // Facebook: scrape within joined groups
    if (platform === 'facebook') {
      const fbGroups = settingsData.facebookGroups || [];
      if (fbGroups.length === 0 && platformKeywords.length === 0) {
        await GetMentionAPI.sendLog('facebook', 'warn', 'scrape_skip', 'No Facebook groups or keywords configured');
        return;
      }
      await scrapeFacebookGroups(fbGroups, platformKeywords);
      return;
    }

    // Skool: scrape from communities (similar to Facebook groups)
    if (platform === 'skool') {
      const skoolCommunities = settingsData.skoolCommunities || [];
      if (skoolCommunities.length > 0) {
        // Pick 1 random community
        const community = skoolCommunities[Math.floor(Math.random() * skoolCommunities.length)];
        const scrapeUrl = community.endsWith('/') ? community : community + '/';
        // Extract community slug for friendly logging (e.g. "skool.com/dropshipping" → "dropshipping")
        const communityName = scrapeUrl.replace(/\/$/, '').split('/').pop() || 'community';
        // Pick a keyword to mention in the log (content script filters posts by ALL keywords)
        const focusKeyword = platformKeywords.length > 0
          ? platformKeywords[Math.floor(Math.random() * platformKeywords.length)]
          : null;
        const startMsg = focusKeyword
          ? `Scraping Skool community "${communityName}" for "${focusKeyword}"`
          : `Scraping Skool community "${communityName}"`;
        await GetMentionAPI.sendLog('skool', 'info', 'scrape_start', startMsg,
          { community: communityName, keyword: focusKeyword });

        let tab;
        try { tab = await createBackgroundTab(scrapeUrl); } catch { return; }
        extensionTabs.add(tab.id);
        const fc = setTimeout(() => { extensionTabs.delete(tab.id); chrome.tabs.remove(tab.id).catch(() => {}); }, 45000);
        try {
          await waitForTabLoad(tab.id);
          await sleep(4000);
          // Join community
          try { await chrome.tabs.sendMessage(tab.id, { type: 'JOIN_COMMUNITY' }); } catch {}
          await sleep(1500);
          await chrome.tabs.sendMessage(tab.id, { type: 'SCROLL_DOWN' }).catch(() => {});
          await sleep(2000);
          const result = await chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_POSTS', platform: 'skool', keywords: platformKeywords }).catch(() => ({ posts: [] }));
          const posts = result?.posts || [];
          if (posts.length > 0) {
            const sr = await GetMentionAPI.submitScrapedPosts(posts);
            const doneMsg = focusKeyword
              ? `Skool "${communityName}" — "${focusKeyword}": ${posts.length} found, ${sr.created} new, ${sr.evaluated} evaluated`
              : `Skool "${communityName}": ${posts.length} found, ${sr.created} new, ${sr.evaluated} evaluated`;
            await GetMentionAPI.sendLog('skool', 'success', 'scrape_done', doneMsg,
              { community: communityName, keyword: focusKeyword, found: posts.length, created: sr.created, duplicates: sr.duplicates, evaluated: sr.evaluated });
          } else {
            const s = result?.stats || {};
            const reason = (s.kept || 0) === 0
              ? `0 post cards in DOM (community "${communityName}" may be empty or page not loaded)`
              : `${s.kept} cards scanned but 0 matched keywords (community may be off-topic for your keywords)`;
            const emptyMsg = focusKeyword
              ? `No posts found for "${focusKeyword}" in Skool community "${communityName}" — ${reason}`
              : `No posts found in Skool community "${communityName}" — ${reason}`;
            await GetMentionAPI.sendLog('skool', 'warn', 'scrape_empty', emptyMsg,
              { community: communityName, keyword: focusKeyword, stats: s });
          }
        } catch (err) { await GetMentionAPI.sendLog('skool', 'error', 'scrape_error', `Skool "${communityName}" scrape failed: ${((err && err.message) || String(err) || 'unknown')}`, { community: communityName }); }
        finally { clearTimeout(fc); extensionTabs.delete(tab.id); chrome.tabs.remove(tab.id).catch(() => {}); }
        return;
      }
      // Fall through to keyword search if no communities configured
    }

    if (platformKeywords.length === 0) {
      await GetMentionAPI.sendLog(platform, 'warn', 'scrape_skip', `No keywords for ${platform} — skipping`);
      return;
    }

    // Pick 1 random keyword
    const keyword = platformKeywords[Math.floor(Math.random() * platformKeywords.length)];

    await GetMentionAPI.sendLog(platform, 'info', 'scrape_start',
      `Scraping ${platform} for "${keyword}"`, { keyword });

    try {
      const posts = await scrapeSearchPage(platform, config.searchUrl(keyword), keyword);

      if (posts.length > 0) {
        const result = await GetMentionAPI.submitScrapedPosts(posts);
        await GetMentionAPI.sendLog(platform, 'success', 'scrape_done',
          `Scraped "${keyword}": ${posts.length} found, ${result.created} new, ${result.evaluated} evaluated`,
          { keyword, found: posts.length, created: result.created, duplicates: result.duplicates, evaluated: result.evaluated }
        );
      } else {
        await GetMentionAPI.sendLog(platform, 'warn', 'scrape_empty',
          `No posts found for "${keyword}" on ${platform}`,
          { keyword });
      }
    } catch (err) {
      const msg = (err && err.message) || String(err) || 'unknown error';
      console.error(`[GetMention] Scrape error:`, msg);
      await GetMentionAPI.sendLog(platform, 'error', 'scrape_error',
        `Scrape failed for "${keyword}": ${msg}`, { keyword, error: msg });
    }
  } catch (err) {
    const msg = (err && err.message) || String(err) || 'unknown error';
    console.error('[GetMention] Scrape loop error:', msg);
    await GetMentionAPI.sendLog('general', 'error', 'scrape_error', `Scrape crashed: ${msg}`);
  } finally {
    isScraping = false;
  }
}

// ── Reddit: clean & normalize subreddit input ──────────────────────────────
//
// Users type all kinds of formats. This normalizes them:
//   "r/SEO"                    → { name: "SEO", type: "subreddit" }
//   "/r/SEO"                   → { name: "SEO", type: "subreddit" }
//   "  r/ content_marketing "  → { name: "content_marketing", type: "subreddit" }
//   "https://reddit.com/r/SEO" → { name: "SEO", type: "subreddit" }
//   "guest posting"            → { name: "guest posting", type: "search" }
//   "link building"            → { name: "linkbuilding", type: "subreddit" } (tries without space first)
//   "SEOandBacklinks"          → { name: "SEOandBacklinks", type: "subreddit" }

function cleanSubredditInput(raw) {
  let input = (raw || '').trim();
  if (!input) return null;

  // Full URL: https://www.reddit.com/r/SEO/... → go to subreddit directly
  const urlMatch = input.match(/reddit\.com\/r\/([A-Za-z0-9_]+)/);
  if (urlMatch) {
    return { name: urlMatch[1], type: 'subreddit' };
  }

  // Explicit r/ prefix: user clearly means a subreddit
  if (/^\/?(r\/)/i.test(input)) {
    const name = input.replace(/^\/?(r\/)\s*/i, '').replace(/\/+$/, '').trim();
    if (name && /^[A-Za-z0-9_]+$/.test(name)) {
      return { name, type: 'subreddit' };
    }
  }

  // Everything else → use Reddit SEARCH (most reliable)
  // "SEO backlinks", "guest posting", "linkbuilding", etc.
  // This finds posts from ALL relevant subreddits
  input = input.replace(/\/+$/, '').trim();
  return { name: input, type: 'search' };
}

// ── Reddit: scrape within subreddits (join first, then scrape) ──────────────

// ── Process 1: Join Reddit communities (runs before scraping) ───────────

// ── Reddit: Same approach as Facebook groups ────────────────────────────
// Process 1: Join 1 community from user's list
// Process 2: Scrape from Reddit home feed (shows posts from ALL joined communities)

async function scrapeRedditSubreddits(subreddits, keywords) {
  // Process 1: Join 1 community from settings
  if (subreddits.length > 0) {
    const raw = subreddits[Math.floor(Math.random() * subreddits.length)];
    const cleaned = cleanSubredditInput(raw);

    if (cleaned) {
      const name = cleaned.type === 'subreddit' ? cleaned.name : cleaned.name.replace(/\s+/g, '');
      const joinUrl = `https://www.reddit.com/r/${name}/`;
      console.log('[GetMention] Joining r/' + name);

      let joinTab;
      try {
        joinTab = await createBackgroundTab(joinUrl);
        extensionTabs.add(joinTab.id);
        const forceCloseJoin = setTimeout(() => { extensionTabs.delete(joinTab.id); chrome.tabs.remove(joinTab.id).catch(() => {}); }, 25000);

        await waitForTabLoad(joinTab.id);
        await sleep(4000);

        for (let ping = 0; ping < 3; ping++) {
          try {
            const result = await chrome.tabs.sendMessage(joinTab.id, { type: 'JOIN_SUBREDDIT' });
            if (result?.joined) {
              await GetMentionAPI.sendLog('reddit', 'info', 'join_subreddit', `Joined r/${name}`);
            }
            break;
          } catch { await sleep(2000); }
        }

        clearTimeout(forceCloseJoin);
        extensionTabs.delete(joinTab.id);
        chrome.tabs.remove(joinTab.id).catch(() => {});
      } catch {}
      await sleep(2000);
    }
  }

  // Process 2: Scrape from Reddit home feed (shows posts from ALL joined subreddits)
  // This is the same approach as Facebook's /groups/feed/
  const scrapeUrl = 'https://www.reddit.com/';
  const scrapeLabel = 'Home Feed (joined communities)';

  await GetMentionAPI.sendLog('reddit', 'info', 'scrape_start',
    `Scraping Reddit: ${scrapeLabel}`);

  let tab;
  try {
    tab = await createBackgroundTab(scrapeUrl);
  } catch { return; }
  extensionTabs.add(tab.id);
  const forceCloseScrape = setTimeout(() => { extensionTabs.delete(tab.id); chrome.tabs.remove(tab.id).catch(() => {}); }, 45000);

  try {
    await waitForTabLoad(tab.id);
    await sleep(5000);

    // Ping content script — retry, then force-inject if still unresponsive
    let ready = false;
    for (let i = 0; i < 5; i++) {
      try { await chrome.tabs.sendMessage(tab.id, { type: 'SCROLL_DOWN' }); ready = true; break; } catch {}
      await sleep(2000);
    }
    if (!ready) {
      // Force-inject the content scripts (declarative injection sometimes fails on slow/redirected loads)
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content/autopost.js', 'content/reddit.js'],
        });
        await sleep(2000);
        for (let i = 0; i < 3; i++) {
          try { await chrome.tabs.sendMessage(tab.id, { type: 'SCROLL_DOWN' }); ready = true; break; } catch {}
          await sleep(2000);
        }
      } catch (injErr) {
        await GetMentionAPI.sendLog('reddit', 'warn', 'scrape_empty', `Reddit inject failed: ${((injErr && injErr.message) || String(injErr) || 'unknown')}`);
      }
    }
    if (!ready) {
      let finalUrl = '';
      try { const t = await chrome.tabs.get(tab.id); finalUrl = t.url || ''; } catch {}
      await GetMentionAPI.sendLog('reddit', 'warn', 'scrape_empty',
        `Content script not loaded on Reddit home${finalUrl ? ` (final URL: ${finalUrl.slice(0,100)})` : ''}`);
      return;
    }

    // Scroll to load more posts
    await sleep(1500);
    await chrome.tabs.sendMessage(tab.id, { type: 'SCROLL_DOWN' }).catch(() => {});
    await sleep(2000);
    await chrome.tabs.sendMessage(tab.id, { type: 'SCROLL_DOWN' }).catch(() => {});
    await sleep(2000);

    // Scrape posts — no keyword filter (home feed already shows relevant joined community posts)
    const result = await chrome.tabs.sendMessage(tab.id, {
      type: 'SCRAPE_POSTS',
      platform: 'reddit',
      keywords: keywords.length > 0 ? keywords : [],
    }).catch(() => ({ posts: [] }));

    const posts = result?.posts || [];

    if (posts.length > 0) {
      const submitResult = await GetMentionAPI.submitScrapedPosts(posts);
      await GetMentionAPI.sendLog('reddit', 'success', 'scrape_done',
        `${scrapeLabel}: ${posts.length} found, ${submitResult.created} new, ${submitResult.evaluated} evaluated`,
        { found: posts.length, created: submitResult.created, duplicates: submitResult.duplicates });
    } else {
      await GetMentionAPI.sendLog('reddit', 'warn', 'scrape_empty',
        `${scrapeLabel}: no posts found`);
    }
  } catch (err) {
    await GetMentionAPI.sendLog('reddit', 'error', 'scrape_error',
      `Reddit scrape failed: ${((err && err.message) || String(err) || 'unknown')}`);
  } finally {
    clearTimeout(forceCloseScrape);
    extensionTabs.delete(tab.id);
    chrome.tabs.remove(tab.id).catch(() => {});
    setTimeout(() => chrome.tabs.remove(tab.id).catch(() => {}), 2000);
  }
}

// ── Facebook: search joined groups by keyword ────────────────────────────
//
// Strategy: instead of scraping the noisy /groups/feed/ page, we open
// /groups/{groupId}/search/?q={keyword} for each (group × keyword) pair.
// Facebook returns posts inside that group that match the search term, which
// is much more relevant than client-side filtering against a generic feed.
//
// To avoid hammering FB (and getting flagged), we sample a small subset per
// cycle: up to FB_GROUPS_PER_CYCLE groups × FB_KEYWORDS_PER_GROUP keywords.
// The cycle that wraps this function runs every ~15 min so over a few hours
// we naturally rotate through every (group, keyword) combination.

const FB_GROUPS_PER_CYCLE  = 3;  // how many joined groups to query per run
const FB_KEYWORDS_PER_GROUP = 2; // how many keywords to query per group

/**
 * Extract the group identifier (numeric ID or vanity slug) from a group URL.
 * Accepts both:
 *   https://www.facebook.com/groups/1041229279358120
 *   https://www.facebook.com/groups/guestpostingandseobacklinkservices/
 */
function extractFbGroupId(groupUrl) {
  if (!groupUrl) return '';
  const m = groupUrl.match(/\/groups\/([^/?#]+)/);
  return m ? m[1] : '';
}

function pickRandom(arr, n) {
  if (!Array.isArray(arr) || arr.length === 0) return [];
  if (n >= arr.length) return arr.slice();
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

/**
 * Open a single FB group-search URL, scrape post cards, submit to server.
 * Returns the number of posts created (0 on any failure).
 */
async function scrapeFbGroupSearch(groupId, groupLabel, keyword) {
  const searchUrl = `https://www.facebook.com/groups/${groupId}/search/?q=${encodeURIComponent(keyword)}`;
  const label = `${groupLabel} • "${keyword}"`;

  await GetMentionAPI.sendLog('facebook', 'info', 'scrape_start',
    `Scraping Facebook group search: ${label}`, { group: groupLabel, keyword, url: searchUrl });

  let tab;
  try {
    tab = await createBackgroundTab(searchUrl);
  } catch (err) {
    await GetMentionAPI.sendLog('facebook', 'error', 'scrape_error',
      `Failed to open tab (${label}): ${(err && err.message) || String(err)}`);
    return 0;
  }
  extensionTabs.add(tab.id);
  // Extended timeout from 60s to 90s — FB's lazy-loaded search results
  // sometimes take > 60s to finish mounting, and the previous timeout was
  // killing the tab mid-scrape causing "No tab with id" errors.
  let tabClosedByTimeout = false;
  const forceClose = setTimeout(() => {
    tabClosedByTimeout = true;
    extensionTabs.delete(tab.id);
    chrome.tabs.remove(tab.id).catch(() => {});
  }, 90000);

  // Helper: verify the tab still exists before trying to message/inject it.
  // This prevents the "No tab with id" error when forceClose already fired.
  async function tabAlive() {
    try { await chrome.tabs.get(tab.id); return true; } catch { return false; }
  }

  let createdCount = 0;
  try {
    await waitForTabLoad(tab.id);
    await sleep(5000);
    if (!(await tabAlive())) {
      await GetMentionAPI.sendLog('facebook', 'warn', 'scrape_empty',
        `FB tab closed mid-load (${label}) — likely timeout`);
      return 0;
    }

    // Force-inject content script if declarative injection didn't fire
    let ready = false;
    for (let i = 0; i < 3; i++) {
      if (!(await tabAlive())) break;
      try { await chrome.tabs.sendMessage(tab.id, { type: 'SCROLL_DOWN' }); ready = true; break; } catch {}
      await sleep(1500);
    }
    if (!ready && (await tabAlive())) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content/autopost.js', 'content/facebook.js'],
        });
        await sleep(2000);
      } catch (e) {
        // "No tab with id" specifically means the tab was closed mid-inject —
        // log it as a benign warning, not as an error the user should worry about.
        const msg = (e && e.message) || String(e);
        const isTabGone = msg.includes('No tab with id') || msg.includes('tab was closed');
        await GetMentionAPI.sendLog('facebook', 'warn', 'scrape_empty',
          isTabGone
            ? `FB tab closed before inject (${label}) — retry next cycle`
            : `FB inject failed (${label}): ${msg}`);
        return 0;
      }
    }
    if (!(await tabAlive())) return 0;

    // Trigger lazy-load of more search results
    for (let s = 0; s < 3; s++) {
      await chrome.tabs.sendMessage(tab.id, { type: 'SCROLL_DOWN' }).catch(() => {});
      await sleep(1500);
    }

    // Scrape — pass keyword as a SINGLE-element array so the content script
    // does keyword filtering (search results aren't always perfectly relevant).
    let result = { posts: [] };
    try {
      result = await chrome.tabs.sendMessage(tab.id, {
        type: 'SCRAPE_POSTS',
        platform: 'facebook',
        keywords: [keyword],
      });
    } catch {}

    const posts = result?.posts || [];
    if (posts.length > 0) {
      const submitResult = await GetMentionAPI.submitScrapedPosts(posts);
      createdCount = submitResult.created;
      await GetMentionAPI.sendLog('facebook', 'success', 'scrape_done',
        `${label}: ${posts.length} found, ${submitResult.created} new, ${submitResult.evaluated} evaluated`,
        { group: groupLabel, keyword, found: posts.length, created: submitResult.created });
    } else {
      const s = result?.stats || {};
      const reason = s.items === 0
        ? 'no result cards in DOM (search may have returned zero hits or page is gated)'
        : `scanned ${s.items} items: ${s.noLinks||0} no-links, ${s.noUrl||0} no-url, ${s.shortContent||0} short, ${s.kwMiss||0} kw-miss, ${s.dupe||0} dupe${s.sampleHref ? ` | sample: ${s.sampleHref}` : ''}`;
      await GetMentionAPI.sendLog('facebook', 'warn', 'scrape_empty',
        `${label}: no posts found — ${reason}`, { group: groupLabel, keyword, stats: s });
    }
  } catch (err) {
    await GetMentionAPI.sendLog('facebook', 'error', 'scrape_error',
      `Facebook scrape failed (${label}): ${((err && err.message) || String(err) || 'unknown')}`);
  } finally {
    clearTimeout(forceClose);
    extensionTabs.delete(tab.id);
    chrome.tabs.remove(tab.id).catch(() => {});
    setTimeout(() => chrome.tabs.remove(tab.id).catch(() => {}), 2000);
  }
  return createdCount;
}

async function scrapeFacebookGroups(groups, keywords) {
  if (!Array.isArray(groups) || groups.length === 0) {
    await GetMentionAPI.sendLog('facebook', 'warn', 'scrape_empty',
      'No Facebook groups configured — add joined groups in Settings');
    return;
  }
  if (!Array.isArray(keywords) || keywords.length === 0) {
    await GetMentionAPI.sendLog('facebook', 'warn', 'scrape_empty',
      'No Facebook keywords configured — add keywords in Settings');
    return;
  }

  // Pick a random sample of groups for this cycle
  const pickedGroups = pickRandom(groups, FB_GROUPS_PER_CYCLE);
  let totalCreated = 0;

  for (const groupUrl of pickedGroups) {
    const groupId = extractFbGroupId(groupUrl);
    if (!groupId) continue;
    const groupLabel = groupId.length > 30 ? groupId.slice(0, 30) + '…' : groupId;

    // Pick a random sample of keywords for this group
    const pickedKw = pickRandom(keywords, FB_KEYWORDS_PER_GROUP);
    for (const kw of pickedKw) {
      const created = await scrapeFbGroupSearch(groupId, groupLabel, kw);
      totalCreated += created;
      // Polite delay between searches in the same group
      await sleep(3000 + Math.random() * 2000);
    }
    // Slightly longer delay between groups
    await sleep(4000 + Math.random() * 3000);
  }

  if (totalCreated > 0) {
    await GetMentionAPI.sendLog('facebook', 'info', 'scrape_cycle_done',
      `FB cycle complete: ${pickedGroups.length} groups searched, ${totalCreated} new posts created`);
  }
}

function getKeywordsForPlatforms(settings, platforms) {
  const result = {};
  const globalKw = settings.keywords || [];
  for (const p of platforms) {
    const key = `${p}Keywords`;
    const pkw = settings[key] || [];
    result[p] = pkw.length > 0 ? pkw : globalKw;
  }
  return result;
}

async function scrapeSearchPage(platform, searchUrl, keyword) {
  const tab = await createBackgroundTab(searchUrl);
  extensionTabs.add(tab.id);

  try {
    await waitForTabLoad(tab.id);

    const extraWait = (platform === 'quora' || platform === 'facebook') ? 8000 : 5000;
    await sleep(extraWait + Math.random() * 3000);

    // Verify content script is ready — retry ping up to 3 times
    let scriptReady = false;
    for (let i = 0; i < 3; i++) {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'SCROLL_DOWN' });
        scriptReady = true;
        break;
      } catch {
        // Content script not ready — wait and retry
        await sleep(3000);
      }
    }

    if (!scriptReady) {
      console.log('[GetMention] Content script not loaded on', platform, '— page may have redirected');
      return [];
    }

    await sleep(2000);
    await chrome.tabs.sendMessage(tab.id, { type: 'SCROLL_DOWN' }).catch(() => {});
    await sleep(2000);

    const result = await chrome.tabs.sendMessage(tab.id, {
      type: 'SCRAPE_POSTS',
      platform,
      keywords: [keyword],
    });

    return result?.posts || [];
  } catch (err) {
    console.error(`[GetMention] scrapeSearchPage error:`, ((err && err.message) || String(err) || 'unknown'));
    return [];
  } finally {
    extensionTabs.delete(tab.id);
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}

// ── Task processing (posting) ───────────────────────────────────────────────

async function processTasks() {
  // Safety valve: if isProcessing has been true for > 2 min, force-reset it.
  // This prevents permanent lockup when a task tab hangs or the SW gets evicted
  // mid-execution and isProcessing is never cleared by the finally block.
  if (isProcessing) {
    if (isProcessingSince > 0 && (Date.now() - isProcessingSince) > PROCESSING_TIMEOUT) {
      console.warn('[GetMention] processTasks stuck for >' + (PROCESSING_TIMEOUT/1000) + 's — force-resetting');
      isProcessing = false;
    } else {
      return;
    }
  }
  isProcessing = true;
  isProcessingSince = Date.now();

  try {
    const apiKey = await GetMentionAPI.getApiKey();
    if (!apiKey) return;

    // Sync per-platform limits from server
    try {
      const serverSettings = await GetMentionAPI.fetchSettings();
      if (serverSettings.platformLimits) serverPlatformLimits = serverSettings.platformLimits;
      // Sync server counts into local
      if (serverSettings.platformPostedToday) {
        const counters = await getDailyCounters();
        if (!counters.platforms) counters.platforms = {};
        for (const [p, count] of Object.entries(serverSettings.platformPostedToday)) {
          if (!counters.platforms[p]) counters.platforms[p] = { comments: 0, likes: 0 };
          if (count > counters.platforms[p].comments) {
            counters.platforms[p].comments = count;
          }
        }
        await chrome.storage.local.set({ dailyCounters: counters });
      }
    } catch {}

    const { tasks, dailyStatus } = await GetMentionAPI.fetchTasks();
    if (!tasks || tasks.length === 0) return;

    const { autoPost } = await chrome.storage.sync.get('autoPost');
    const counters = await getDailyCounters();

    // Smart comment cooldown: spread posts evenly across active hours with randomness
    // Example: 8 active hours, 10 posts total = ~48 min avg gap
    //          With jitter: 35-65 min between posts (feels human)
    const totalDailyPosts = Object.values(serverPlatformLimits).reduce((a, b) => a + b, 0) || 10;
    const serverSettings2 = await GetMentionAPI.fetchSettings().catch(() => ({}));
    const startHour = serverSettings2.cronStartHour || 9;
    const endHour = serverSettings2.cronEndHour || 17;
    const activeMinutes = Math.max((endHour - startHour) * 60, 120); // minimum 2 hours
    const totalPosted = getTotalComments(counters);
    const remaining = Math.max(totalDailyPosts - totalPosted, 1);

    // Base gap = remaining time / remaining posts
    const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
    const endMinutes = endHour * 60;
    const minutesLeft = Math.max(endMinutes - nowMinutes, 30);
    const baseGapMin = Math.min(minutesLeft / remaining, activeMinutes / totalDailyPosts);

    // Add randomness: 70% to 130% of base gap (e.g., 48 min base → 34-62 min actual)
    const jitter = 0.7 + Math.random() * 0.6;
    const commentGapMin = Math.max(baseGapMin * jitter, 10); // minimum 10 min
    const commentGap = commentGapMin * 60 * 1000;

    // Comment cooldown: space out comments over the active hours.
    // IMPORTANT: this only blocks COMMENT actions — likes/upvotes always run.
    const commentCooldownActive = !!(counters.lastCommentAt && (Date.now() - counters.lastCommentAt) < commentGap);

    // Auto-post OFF: still do likes/upvotes, only queue COMMENTS for review
    if (!autoPost) {
      // Queue comment tasks for review (no duplicates)
      const commentTasks = tasks.filter(t => t.action === 'comment');
      if (commentTasks.length > 0) {
        const { reviewQueue = [] } = await chrome.storage.local.get('reviewQueue');
        const existingIds = new Set(reviewQueue.map(t => t.id));
        const newComments = commentTasks.filter(t => !existingIds.has(t.id));
        if (newComments.length > 0) {
          for (const task of newComments) await queueForReview(task);
          await GetMentionAPI.sendLog('general', 'info', 'queued_review',
            `${newComments.length} comment(s) queued for review`,
            { count: newComments.length, platforms: [...new Set(newComments.map(t => t.platform))] });
        }
      }

      // Execute like/upvote tasks immediately (low risk, no review needed)
      const likeTasks = tasks.filter(t => t.action === 'like' || t.action === 'upvote');
      const likedPlatforms = new Set();
      for (const task of likeTasks) {
        if (isTaskProcessed(task.id)) continue;
        if (likedPlatforms.has(task.platform)) continue;
        const platformLikes = getPlatformCount(counters, task.platform, 'likes');
        if (platformLikes >= 10) continue;

        try {
          const result = await executeTask(task);
          markTaskProcessed(task.id);
          await GetMentionAPI.completeTask(task.id, { ...result, action: task.action });
          if (result.success) {
            const updated = await incrementPlatformCounter(task.platform, 'likes');
            const newCount = getPlatformCount(updated, task.platform, 'likes');
            likedPlatforms.add(task.platform);
            await GetMentionAPI.sendLog(task.platform, 'success', 'like',
              `Liked (${newCount}/10 ${task.platform} today) on ${task.url}`,
              { url: task.url, platformCount: newCount });
          }
        } catch (err) {
          markTaskProcessed(task.id);
        }
        await sleep(5000 + Math.random() * 5000);
      }
      return;
    }

    // ── Process exactly ONE task per cycle (prevents Chrome overload) ──
    // Rotate: pick one task based on a counter (like → comment → like → comment...)
    const { actionCounter = 0 } = await chrome.storage.local.get('actionCounter');
    const doComment = actionCounter % 3 === 2; // Every 3rd cycle is a comment
    await chrome.storage.local.set({ actionCounter: actionCounter + 1 });

    const likeTasks = tasks.filter(t => t.action === 'like' || t.action === 'upvote');
    const commentTasks = tasks.filter(t => t.action === 'comment');

    // ── Platform rotation ──────────────────────────────────────────
    // Use actionCounter to offset which platform gets picked first.
    // This ensures ALL platforms get equal attention over time, instead
    // of always picking the first platform in the list (which starves
    // platforms further down like Quora, Skool, Pinterest).
    function rotateArray(arr, offset) {
      if (arr.length === 0) return arr;
      const n = offset % arr.length;
      return [...arr.slice(n), ...arr.slice(0, n)];
    }
    const rotatedComments = rotateArray(commentTasks, actionCounter);
    const rotatedLikes = rotateArray(likeTasks, actionCounter);

    let task = null;

    if (doComment && rotatedComments.length > 0 && !commentCooldownActive) {
      // Pick a comment task — rotated so each platform gets its turn
      for (const t of rotatedComments) {
        if (isTaskProcessed(t.id)) continue;
        const platformLimit = serverPlatformLimits[t.platform] || 10;
        const platformComments = getPlatformCount(counters, t.platform, 'comments');
        if (platformComments >= platformLimit) continue;
        if (dailyStatus?.[t.platform]?.limitHit) continue;
        task = t;
        break;
      }
    }

    // Likes/upvotes ALWAYS run — never blocked by comment cooldown
    if (!task && rotatedLikes.length > 0) {
      for (const t of rotatedLikes) {
        if (isTaskProcessed(t.id)) continue;
        const platformLikes = getPlatformCount(counters, t.platform, 'likes');
        if (platformLikes >= 10) continue;
        task = t;
        break;
      }
    }

    // Fallback: try any comment if no like found (only if cooldown isn't active)
    if (!task && !commentCooldownActive) {
      for (const t of rotatedComments) {
        if (isTaskProcessed(t.id)) continue;
        const platformLimit = serverPlatformLimits[t.platform] || 10;
        const platformComments = getPlatformCount(counters, t.platform, 'comments');
        if (platformComments >= platformLimit) continue;
        task = t;
        break;
      }
    }

    if (!task) return; // Nothing to do

    await GetMentionAPI.sendLog('general', 'info', 'poll',
      `Executing: ${task.platform} ${task.action} (cycle ${actionCounter})`,
    );

    // Execute the single task (executeTask also reports to server internally)
    try {
      const result = await executeTask(task);
      markTaskProcessed(task.id);

      if (result.success) {
        if (result.alreadyCommented || result.alreadyUpvoted || result.alreadyLiked) {
          await GetMentionAPI.sendLog(task.platform, 'info', 'already_done',
            `Already ${task.action}ed on ${task.url} — skipped`, { url: task.url });
        } else if (task.action === 'comment') {
          const platformLimit = serverPlatformLimits[task.platform] || 10;
          const updated = await incrementPlatformCounter(task.platform, 'comments');
          const newCount = getPlatformCount(updated, task.platform, 'comments');
          await GetMentionAPI.sendLog(task.platform, 'success', 'post',
            `Comment posted (${newCount}/${platformLimit} ${task.platform} today) on ${task.url}`,
            { url: task.url, textPreview: task.text?.slice(0, 80), platformCount: newCount, platformLimit });
        } else {
          const updated = await incrementPlatformCounter(task.platform, 'likes');
          const newCount = getPlatformCount(updated, task.platform, 'likes');
          await GetMentionAPI.sendLog(task.platform, 'success', 'like',
            `Liked (${newCount}/10 ${task.platform} today) on ${task.url}`,
            { url: task.url, platformCount: newCount });
        }
      } else {
        // Like/upvote failures are low-risk — log as warning, not error
        const isLikeAction = task.action === 'like' || task.action === 'upvote';
        const logLevel = isLikeAction ? 'warn' : 'error';
        const logType = isLikeAction ? 'like_failed' : 'post_failed';
        await GetMentionAPI.sendLog(task.platform, logLevel, logType,
          `Failed on ${task.platform}: ${result.error || 'Unknown'}`,
          { url: task.url, error: result.error });
      }
    } catch (err) {
      markTaskProcessed(task.id);
      // executeTask already reported to server, just log
      await GetMentionAPI.sendLog(task.platform, 'error', 'post_failed',
        `Task crashed: ${((err && err.message) || String(err) || 'unknown')}`, { url: task.url }).catch(() => {});
    }
  } catch (err) {
    console.error('[GetMention] Poll error:', ((err && err.message) || String(err) || 'unknown'));
  } finally {
    isProcessing = false;
  }
}

// ── Task execution ──────────────────────────────────────────────────────────

// Track tabs opened by the extension
const extensionTabs = new Set();

/**
 * Aggressive tab cleanup — runs every 3 minutes via the cleanupTabs alarm.
 *
 * Two passes:
 *   1. Close any tab in `extensionTabs` Set that's still alive (tracked stale tabs).
 *   2. Close ALL tabs in the scrape window (`scrapeWindowId`) except one placeholder,
 *      regardless of whether they're in the Set. This catches orphans from failed
 *      chrome.tabs.remove calls, the initial about:blank tab, and anything else that
 *      piled up from previous scrape cycles.
 *
 * After cleanup the scrape window has exactly one about:blank tab (to keep the
 * window alive) and nothing else.
 */
async function cleanupStaleTabs() {
  // Pass 1: tracked tabs
  for (const tabId of extensionTabs) {
    try { await chrome.tabs.remove(tabId); } catch {}
    extensionTabs.delete(tabId);
  }

  // Pass 2: nuke everything in the scrape window
  if (scrapeWindowId === null) return;
  try {
    const allTabs = await chrome.tabs.query({ windowId: scrapeWindowId });
    if (!allTabs || allTabs.length === 0) return;

    // Keep exactly one tab (navigate it to about:blank to free memory).
    // Close all the rest.
    let kept = false;
    for (const t of allTabs) {
      // Skip tabs that are currently in use by an active scrape/task
      if (extensionTabs.has(t.id)) continue;

      if (!kept) {
        // Keep this one alive so the window doesn't close
        try { await chrome.tabs.update(t.id, { url: 'about:blank' }); } catch {}
        kept = true;
      } else {
        try { await chrome.tabs.remove(t.id); } catch {}
      }
    }

    if (!kept && allTabs.length > 0) {
      // All tabs were in-use — navigate the first non-tracked one to blank
      try { await chrome.tabs.update(allTabs[0].id, { url: 'about:blank' }); } catch {}
    }

    const remaining = await chrome.tabs.query({ windowId: scrapeWindowId }).catch(() => []);
    if (remaining && remaining.length > 3) {
      console.warn('[GetMention] Still', remaining.length, 'tabs in scrape window after cleanup');
    }
  } catch (e) {
    // Window may have been closed externally
    console.warn('[GetMention] Scrape window cleanup error:', (e && e.message) || e);
    scrapeWindowId = null;
  }
}

async function executeTask(task) {
  const { platform, action, url, text } = task;

  // All platforms get 120s. YouTube watching was reduced from 60-120s to 20-40s
  // so it no longer needs a special longer timeout.
  const timeoutMs = 120_000;
  return Promise.race([
    _executeTaskInner(task),
    new Promise(resolve => setTimeout(() => {
      resolve({ success: false, error: `Task timed out after ${timeoutMs/1000}s (${platform} ${action})` });
    }, timeoutMs)),
  ]);
}

async function _executeTaskInner(task) {
  const { platform, action, url, text } = task;

  let tab;
  try {
    tab = await createBackgroundTab(url);
  } catch (err) {
    await sleep(3000);
    try {
      tab = await createBackgroundTab(url);
    } catch (err2) {
      console.error('[GetMention] Could not open task tab:', err2);
      return { success: false, error: 'Could not open tab: ' + ((err2 && ((err2 && err2.message) || String(err2) || 'unknown')) || 'unknown') };
    }
  }
  const tabId = tab.id;
  extensionTabs.add(tabId);

  // ── Un-minimize the scrape window while executing a task ──────────
  // Content scripts need a VISIBLE window for proper DOM rendering:
  //  - getBoundingClientRect() returns zeros in minimized windows
  //  - Reddit/Lexical editor ignores mouse events with zero coordinates
  //  - Facebook/Twitter React apps may not hydrate fully when minimized
  //
  // We restore the window to 'normal' before the task starts, and
  // re-minimize it once the task completes. This briefly shows the window
  // but ensures every platform's DOM works correctly.
  let windowWasMinimized = false;
  if (scrapeWindowId !== null) {
    try {
      const winInfo = await chrome.windows.get(scrapeWindowId);
      if (winInfo.state === 'minimized') {
        windowWasMinimized = true;
        await chrome.windows.update(scrapeWindowId, { state: 'normal', focused: false });
        await sleep(500); // let Chrome render the restored window
      }
    } catch {}
  }
  async function reminimize() {
    if (windowWasMinimized && scrapeWindowId !== null) {
      try { await chrome.windows.update(scrapeWindowId, { state: 'minimized', focused: false }); } catch {}
    }
  }

  // Close ONLY our tab — but if removing it would leave its window with
  // zero tabs, Chrome closes the window (and exits if it's the last window).
  // To prevent that cascade, we navigate the tab to about:blank instead of
  // removing it whenever it's the only tab in its window.
  function closeTab() {
    extensionTabs.delete(tabId);
    chrome.tabs.get(tabId, (t) => {
      if (chrome.runtime.lastError || !t) return;
      chrome.tabs.query({ windowId: t.windowId }, (tabsInWin) => {
        if (chrome.runtime.lastError) return;
        if (tabsInWin && tabsInWin.length <= 1) {
          // Last tab in this window — navigate to about:blank instead of removing.
          // The tab stays as a harmless empty page; user can close it manually,
          // or cleanupStaleTabs will reuse/remove it later when other tabs exist.
          chrome.tabs.update(tabId, { url: 'about:blank' }).catch(() => {});
          console.log('[GetMention] Tab is the last tab in its window — navigated to about:blank instead of closing');
        } else {
          // Safe to remove — other tabs exist in the window
          chrome.tabs.remove(tabId).catch(() => {});
        }
      });
    });
  }

  // Keep service worker alive — ping every 2 seconds (aggressive but necessary for Quora)
  const keepAlive = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => {});
    chrome.storage.local.get('_keepAlive'); // double ping
  }, 2000);

  const forceClose = setTimeout(closeTab, 150000); // 2.5 minutes max (page load + 90s task)

  try {
    await waitForTabLoad(tabId);

    // Wait for content script to be ready
    // First wait gives page time to fully render + content script to inject
    await sleep(3000);
    const maxPings = 8; // 8 pings × 3s = 24s max wait
    let scriptReady = false;
    for (let ping = 0; ping < maxPings; ping++) {
      try {
        await chrome.tabs.sendMessage(tabId, { type: 'SCROLL_DOWN' });
        scriptReady = true;
        break;
      } catch {}
      await sleep(3000);
    }
    if (!scriptReady) {
      // Check if we're on a Cloudflare/captcha page (URL changed from original)
      let currentUrl = '';
      try {
        const tabInfo = await chrome.tabs.get(tabId);
        currentUrl = tabInfo?.url || '';
      } catch {}
      const isChallenge = currentUrl.includes('challenges') || currentUrl.includes('captcha') || !currentUrl.includes(platform);
      const errorMsg = isChallenge
        ? `${platform} blocked by Cloudflare/captcha — open ${platform} manually first`
        : `Content script not loaded after ${maxPings * 3}s`;
      // Report failure to server so postAttempts increments
      try { await GetMentionAPI.completeTask(task.id, { success: false, error: errorMsg, action }); } catch {}
      await reminimize();
      return { success: false, error: errorMsg };
    }

    // Save task info so we can check storage later if service worker dies
    await chrome.storage.local.set({ pendingTask: { id: task.id, action, platform, url, startedAt: Date.now() } });

    let result = null;
    try {
      result = await new Promise((resolve) => {
        const timeout = setTimeout(async () => {
          // Before resolving as timeout, check if content script saved a result
          const { lastQuoraResult, lastRedditResult } = await chrome.storage.local.get(['lastQuoraResult', 'lastRedditResult']);
          const stored = platform === 'quora' ? lastQuoraResult : platform === 'reddit' ? lastRedditResult : null;
          if (stored && stored.timestamp > Date.now() - 120000) {
            resolve({ success: stored.success, verified: true, fromStorage: true });
          } else {
            resolve({ success: false, error: 'Timeout after 90s' });
          }
        }, 90000);

        chrome.tabs.sendMessage(tabId, { type: 'EXECUTE_TASK', action, text, platform }, (response) => {
          clearTimeout(timeout);
          if (chrome.runtime.lastError) {
            // Service worker got error — but check storage as backup
            chrome.storage.local.get(['lastQuoraResult', 'lastRedditResult'], (data) => {
              const stored = platform === 'quora' ? data.lastQuoraResult : platform === 'reddit' ? data.lastRedditResult : null;
              if (stored && stored.timestamp > Date.now() - 120000 && stored.success) {
                resolve({ success: true, verified: true, fromStorage: true });
              } else {
                resolve({ success: false, error: chrome.runtime.lastError.message });
              }
            });
          } else {
            resolve(response || { success: false, error: 'Empty response' });
          }
        });
      });
    } catch (err) {
      result = { success: false, error: (err && err.message) || String(err) || 'Unknown task error' };
    }

    // Clean up storage
    await chrome.storage.local.remove(['pendingTask', 'lastQuoraResult', 'lastRedditResult']);

    if (!result.success && !result.error) {
      result.error = 'Task failed — no details';
    }

    // Report to server
    try {
      await GetMentionAPI.completeTask(task.id, { ...result, action });
    } catch {}

    return result;
  } catch (err) {
    return { success: false, error: ((err && err.message) || String(err) || 'unknown') || 'Task execution error' };
  } finally {
    clearInterval(keepAlive);
    clearTimeout(forceClose);
    closeTab();
    setTimeout(closeTab, 2000);
    // Re-minimize the scrape window after the task completes
    await reminimize();
  }
}

// ── Review queue ────────────────────────────────────────────────────────────

async function queueForReview(task) {
  const { reviewQueue = [] } = await chrome.storage.local.get('reviewQueue');
  reviewQueue.push(task);
  await chrome.storage.local.set({ reviewQueue });
  chrome.action.setBadgeText({ text: String(reviewQueue.length) });
  chrome.action.setBadgeBackgroundColor({ color: '#1d9bf0' });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    const listener = (id, changeInfo) => {
      if (id === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); resolve(); }, 30000);
  });
}

// ── Message handler from popup ──────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'FORCE_POLL') {
    processTasks().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'FORCE_SCRAPE') {
    scrapeOnePlatform().then(() => sendResponse({ ok: true }));
    return true;
  }
  // Triggered by autopost.js — relay task to the platform content script on the SAME tab
  if (msg.type === 'EXECUTE_DASHBOARD_TASK') {
    // Fetch task details from server, then send back to the SAME tab (no new tab)
    const senderTabId = sender.tab?.id;
    (async () => {
      try {
        const serverUrl = await GetMentionAPI.getServerUrl();
        const apiKey = await GetMentionAPI.getApiKey();
        const res = await fetch(`${serverUrl}/api/extension/immediate?taskId=${msg.taskId}`, {
          headers: { 'X-Extension-Key': apiKey },
        });
        const data = await res.json();
        if (!data.task) {
          sendResponse({ started: false, error: 'Task not found' });
          return;
        }

        // Send task directly back to the sender tab — platform content script is already there
        sendResponse({ started: true, task: data.task });
      } catch (err) {
        sendResponse({ started: false, error: ((err && err.message) || String(err) || 'unknown') });
      }
    })();
    return true;
  }
  if (msg.type === 'REPORT_TASK_RESULT') {
    // Report dashboard approve result to server
    (async () => {
      try {
        const serverUrl = await GetMentionAPI.getServerUrl();
        const apiKey = await GetMentionAPI.getApiKey();
        await fetch(`${serverUrl}/api/extension/immediate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Extension-Key': apiKey },
          body: JSON.stringify({ taskId: msg.taskId, success: msg.success, error: msg.error }),
        });
        await GetMentionAPI.sendLog(msg.platform, msg.success ? 'success' : 'error',
          msg.success ? 'post' : 'post_failed',
          msg.success ? `Dashboard approve: posted on ${msg.url}` : `Dashboard approve failed: ${msg.error}`,
          { url: msg.url, via: 'dashboard-approve' });
      } catch {}
    })();
    return;
  }
  if (msg.type === 'RELAY_EXECUTE_TASK') {
    const tabId = sender.tab?.id;
    console.log('[GetMention] RELAY_EXECUTE_TASK from tab:', tabId, 'platform:', msg.platform);

    if (!tabId) {
      console.error('[GetMention] No sender tab ID — cannot relay');
      sendResponse({ success: false, error: 'No tab ID — are you on the right page?' });
      return true;
    }

    // Ping the platform content script first, then send EXECUTE_TASK.
    // SCROLL_DOWN is handled only by the platform-specific script (reddit.js, quora.js, etc.),
    // NOT by autopost.js. So if SCROLL_DOWN times out it means the platform script failed
    // to inject — even though autopost.js (which sent us this RELAY_EXECUTE_TASK) is alive.
    // Fix: after the initial retry loop, force-inject the platform script and try again.
    const PLATFORM_SCRIPT_FILES = {
      reddit:    ['content/reddit.js'],
      facebook:  ['content/facebook.js'],
      quora:     ['content/quora.js'],
      twitter:   ['content/twitter.js'],
      youtube:   ['content/youtube.js'],
      pinterest: ['content/pinterest.js'],
      skool:     ['content/skool.js'],
    };
    const pingTab = () => new Promise((res, rej) => {
      chrome.tabs.sendMessage(tabId, { type: 'SCROLL_DOWN' }, (r) => {
        if (chrome.runtime.lastError) rej(chrome.runtime.lastError);
        else res(r);
      });
    });
    (async () => {
      let scriptReady = false;
      // Round 1: 5 retries × 1.5s = 7.5s (declarative injection usually finishes in <5s)
      for (let i = 0; i < 5; i++) {
        try { await pingTab(); scriptReady = true; break; }
        catch { await new Promise(res => setTimeout(res, 1500)); }
      }

      if (!scriptReady) {
        // Round 2: force-inject the platform script and retry
        const files = PLATFORM_SCRIPT_FILES[msg.platform] || [];
        if (files.length > 0) {
          try {
            console.log('[GetMention] Force-injecting', files, 'into tab', tabId);
            await chrome.scripting.executeScript({ target: { tabId }, files });
            await new Promise(res => setTimeout(res, 1500));
            for (let i = 0; i < 3; i++) {
              try { await pingTab(); scriptReady = true; break; }
              catch { await new Promise(res => setTimeout(res, 1500)); }
            }
          } catch (injErr) {
            console.error('[GetMention] Force-inject failed:', ((injErr && injErr.message) || String(injErr) || 'unknown'));
          }
        }
      }

      if (!scriptReady) {
        let finalUrl = '';
        try { const t = await chrome.tabs.get(tabId); finalUrl = t.url || ''; } catch {}
        sendResponse({
          success: false,
          error: `Content script never responded${finalUrl ? ` (tab URL: ${finalUrl.slice(0,120)})` : ''} — page may have redirected to a login wall or the platform script failed to inject`,
        });
        return;
      }

      // Script is alive — now send the actual task
      chrome.tabs.sendMessage(tabId, {
        type: 'EXECUTE_TASK',
        action: msg.action,
        text: msg.text,
        platform: msg.platform,
      }, (result) => {
        if (chrome.runtime.lastError) {
          console.error('[GetMention] Relay sendMessage error:', chrome.runtime.lastError.message);
          sendResponse({ success: false, error: 'Content script disconnected mid-task: ' + chrome.runtime.lastError.message });
          return;
        }
        console.log('[GetMention] Relay result:', JSON.stringify(result));
        sendResponse(result || { success: false, error: 'No response from platform script' });
      });
    })();
    return true;
  }
  if (msg.type === 'EXECUTE_REVIEW_TASK') {
    executeTask(msg.task)
      .then(result => GetMentionAPI.completeTask(msg.task.id, { ...result, action: msg.task.action }))
      .then(() => sendResponse({ ok: true }))
      .catch(err => sendResponse({ ok: false, error: ((err && err.message) || String(err) || 'unknown') }));
    return true;
  }
  if (msg.type === 'GET_STATUS') {
    getStatus().then(sendResponse);
    return true;
  }
  if (msg.type === 'CLOSE_MY_TAB') {
    // Content script (autopost.js) asks us to close its tab safely.
    // Using chrome.tabs.remove never affects sibling tabs or other windows,
    // unlike window.close() which can shut the entire window/browser.
    const senderTabId = sender.tab && sender.tab.id;
    if (senderTabId) {
      chrome.tabs.remove(senderTabId).catch(err => {
        console.warn('[GetMention] CLOSE_MY_TAB failed:', err && ((err && err.message) || String(err) || 'unknown'));
      });
    }
    return false;
  }
});

async function getStatus() {
  const { apiKey } = await chrome.storage.sync.get('apiKey');
  const { autoPost } = await chrome.storage.sync.get('autoPost');
  const { reviewQueue = [] } = await chrome.storage.local.get('reviewQueue');
  return { connected: !!apiKey, autoPost: !!autoPost, pendingReview: reviewQueue.length };
}
