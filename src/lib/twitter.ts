/**
 * Twitter/X Playwright-based API client.
 *
 * Runs all API calls inside a real Chromium browser via page.evaluate(),
 * which gives a proper browser TLS fingerprint, correct cookies, and passes
 * Twitter's bot detection — mirroring how facebook.ts works.
 *
 * Persistent browser context stored at: /var/www/ai-bot/bot-serp/.twitter-profile/
 * One-time setup: run `npx tsx scripts/twitter-login.ts` to inject cookies.
 */

import { chromium, type BrowserContext, type Page } from 'playwright';
import { join } from 'path';
import { unlinkSync, readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { detectChromiumPath } from './browserPath';

const TWITTER_GRAPHQL_BASE = 'https://x.com/i/api/graphql';
const BEARER =
  'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

const PROFILE_DIR = process.env.TWITTER_PROFILE_DIR
  ? join(process.cwd(), process.env.TWITTER_PROFILE_DIR)
  : join(process.cwd(), '.twitter-profile');
const NAVIGATION_TIMEOUT = 30000;

interface TweetResponse {
  data: {
    id: string;
    text: string;
  };
}

let _context: BrowserContext | null = null;
let _page: Page | null = null;
let _activeProfileDir: string = PROFILE_DIR;

/**
 * Set the profile directory for the next browser session.
 * If the profile dir changes, the current browser is closed and a new one opened.
 */
export function setProfileDir(profileDir: string): void {
  const resolved = profileDir.startsWith('/') ? profileDir : join(process.cwd(), profileDir);
  if (resolved !== _activeProfileDir) {
    if (_context) {
      _context.close().catch(() => {});
      _context = null;
      _page = null;
    }
    _activeProfileDir = resolved;
  }
}

// --- Build cookie array from env vars for context.addCookies() ---
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

// --- Launch or reuse persistent browser context ---
async function getPage(): Promise<Page> {
  if (_page && !_page.isClosed()) return _page;

  const profileDir = _activeProfileDir;

  // Clear stale lock files from previous crash
  try { unlinkSync(join(profileDir, 'SingletonLock')); } catch {}

  const execPath = detectChromiumPath();
  _context = await chromium.launchPersistentContext(profileDir, {
    ...(execPath && { executablePath: execPath }),
    headless: true,
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

  // Inject cookies: prefer cookies.json from profile dir, fall back to env vars
  const cookiesJsonPath = join(profileDir, 'cookies.json');
  let injectedCookies = false;
  if (existsSync(cookiesJsonPath)) {
    try {
      const savedCookies = JSON.parse(readFileSync(cookiesJsonPath, 'utf8'));
      if (Array.isArray(savedCookies) && savedCookies.length > 0) {
        await _context.addCookies(savedCookies);
        injectedCookies = true;
      }
    } catch (e) {
      console.error('Failed to load cookies.json:', e);
    }
  }
  if (!injectedCookies) {
    const cookies = buildCookies();
    if (cookies.length > 0) {
      await _context.addCookies(cookies);
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

// --- Check if Twitter credentials are configured ---
export function isTwitterConfigured(): boolean {
  if (process.env.TWITTER_AUTH_TOKEN && process.env.TWITTER_CT0) return true;
  if (existsSync(join(_activeProfileDir, 'cookies.json'))) return true;
  if (existsSync(join(_activeProfileDir, 'Default'))) return true;
  try {
    const data = JSON.parse(readFileSync(join(_activeProfileDir, '.verified'), 'utf8'));
    return data.loggedIn === true;
  } catch { return false; }
}

// --- Extract tweet ID from a Twitter/X URL ---
export function extractTweetId(url: string): string | null {
  const match = url.match(/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/);
  return match ? match[1] : null;
}

// --- Verify credentials by checking if the browser lands on /home (not /login) ---
export async function verifyCredentials(): Promise<{ id: string; name: string; username: string }> {
  const page = await getPage();

  await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const currentUrl = page.url();
  if (currentUrl.includes('/login') || currentUrl.includes('/i/flow/login')) {
    throw new Error('Not authenticated: redirected to login page. Cookies may be expired.');
  }

  // Extract user ID from twid cookie (format: u%3D<userId>)
  const cookies = await _context!.cookies('https://x.com');
  const twid = cookies.find((c) => c.name === 'twid')?.value || '';
  const userId = twid ? decodeURIComponent(twid).replace('u=', '') : '';

  // Try to extract username from page — Twitter puts it in aria-label or nav links
  const username = await page
    .evaluate(() => {
      // Look for the "Profile" nav link — href is /<screen_name>
      const profileLink = document.querySelector(
        'nav a[href^="/"][aria-label="Profile"], a[data-testid="AppTabBar_Profile_Link"]'
      ) as HTMLAnchorElement | null;
      if (profileLink?.href) {
        const parts = profileLink.href.split('/').filter(Boolean);
        return parts[parts.length - 1] || '';
      }
      return '';
    })
    .catch(() => '');

  // Try to extract display name from the account switcher button
  const displayName = await page
    .evaluate(() => {
      const switcher = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
      if (switcher) {
        const spans = switcher.querySelectorAll('span');
        for (const span of spans) {
          const text = span.textContent?.trim() || '';
          // Skip @handle spans and empty spans
          if (text && !text.startsWith('@')) return text;
        }
      }
      return '';
    })
    .catch(() => '');

  return {
    id: userId,
    name: displayName,
    username,
  };
}

// --- Search tweets by intercepting Twitter's own SearchTimeline network call ---
export interface SearchTweet {
  id: string;
  text: string;
  author: string;
  authorHandle: string;
  url: string;
  createdAt: string;
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  bookmarkCount: number;
  viewCount: number;
}

export async function searchTweets(
  query: string,
  count: number = 20
): Promise<SearchTweet[]> {
  const page = await getPage();
  const searchUrl = `https://x.com/search?q=${encodeURIComponent(query)}&f=live`;

  // Intercept Twitter's own SearchTimeline API call — the page's JS handles queryId for us
  const [apiResponse] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('SearchTimeline') && r.status() === 200,
      { timeout: NAVIGATION_TIMEOUT }
    ),
    page.goto(searchUrl, { waitUntil: 'domcontentloaded' }),
  ]);

  const data = await apiResponse.json();

  const tweets: SearchTweet[] = [];

  const instructions: any[] =
    data?.data?.search_by_raw_query?.search_timeline?.timeline?.instructions || [];

  for (const instruction of instructions) {
    const entries: any[] = instruction?.entries || [];
    for (const entry of entries) {
      if (!entry.entryId?.startsWith('tweet-')) continue;
      const result = entry?.content?.itemContent?.tweet_results?.result;
      if (!result) continue;

      const tweetId = result.rest_id || '';
      const legacy = result.legacy || {};
      const userLegacy = result.core?.user_results?.result?.legacy || {};
      const views = result.views || {};

      tweets.push({
        id: tweetId,
        text: legacy.full_text || '',
        author: userLegacy.name || 'Unknown',
        authorHandle: userLegacy.screen_name ? `@${userLegacy.screen_name}` : 'Unknown',
        url: userLegacy.screen_name
          ? `https://x.com/${userLegacy.screen_name}/status/${tweetId}`
          : `https://x.com/i/status/${tweetId}`,
        createdAt: legacy.created_at || '',
        likeCount: legacy.favorite_count || 0,
        retweetCount: legacy.retweet_count || 0,
        replyCount: legacy.reply_count || 0,
        bookmarkCount: legacy.bookmark_count || 0,
        viewCount: parseInt(views.count || '0', 10) || 0,
      });
    }
  }

  return tweets;
}

// --- Get communities the logged-in user has joined ---
export async function getJoinedCommunities(): Promise<Array<{ id: string; name: string }>> {
  const page = await getPage();
  const communities: Array<{ id: string; name: string }> = [];

  try {
    await page.goto('https://x.com/i/communities', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    // Scroll to load more communities
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, 600));
      await page.waitForTimeout(1000);
    }

    // Extract all community links from the page
    const links = await page.$$eval('a[href*="/i/communities/"]', (anchors) =>
      anchors.map((a) => ({
        href: (a as HTMLAnchorElement).href,
        text: ((a as HTMLAnchorElement).textContent || '').trim(),
      }))
    ).catch(() => [] as { href: string; text: string }[]);

    const seen = new Set<string>();
    for (const link of links) {
      const match = link.href.match(/communities\/(\d{10,})/);
      if (match && !seen.has(match[1])) {
        seen.add(match[1]);
        communities.push({ id: match[1], name: link.text || match[1] });
      }
    }
  } catch (err) {
    console.error('Failed to get joined communities:', (err as Error).message);
  }

  return communities;
}

// --- Search tweets within a specific Twitter Community ---
export async function searchCommunityTweets(
  communityId: string,
  count: number = 20
): Promise<SearchTweet[]> {
  const page = await getPage();
  const communityUrl = `https://x.com/i/communities/${communityId}`;

  const [apiResponse] = await Promise.all([
    page.waitForResponse(
      (r) =>
        (r.url().includes('CommunityTweetTimeline') || r.url().includes('communityResults')) &&
        r.status() === 200,
      { timeout: NAVIGATION_TIMEOUT }
    ),
    page.goto(communityUrl, { waitUntil: 'domcontentloaded' }),
  ]);

  const data = await apiResponse.json();

  const tweets: SearchTweet[] = [];

  // Try multiple known response shapes Twitter has used
  const communityResult =
    data?.data?.communityResults?.result ||
    data?.data?.community_results?.result ||
    {};

  const instructions: any[] =
    communityResult?.ranked_community_timeline?.timeline?.instructions ||
    communityResult?.community_tweet_timeline?.timeline?.instructions ||
    communityResult?.timeline_by_id?.timeline?.instructions ||
    [];

  function extractTweetsFromInstructions(instrs: any[]) {
    for (const instruction of instrs) {
      const entries: any[] = instruction?.entries || [];
      for (const entry of entries) {
        if (!entry.entryId?.startsWith('tweet-')) continue;
        const result = entry?.content?.itemContent?.tweet_results?.result;
        if (!result) continue;

        const tweetId = result.rest_id || '';
        const legacy = result.legacy || {};
        const userLegacy = result.core?.user_results?.result?.legacy || {};
        const views = result.views || {};

        tweets.push({
          id: tweetId,
          text: legacy.full_text || '',
          author: userLegacy.name || 'Unknown',
          authorHandle: userLegacy.screen_name ? `@${userLegacy.screen_name}` : 'Unknown',
          url: userLegacy.screen_name
            ? `https://x.com/${userLegacy.screen_name}/status/${tweetId}`
            : `https://x.com/i/status/${tweetId}`,
          createdAt: legacy.created_at || '',
          likeCount: legacy.favorite_count || 0,
          retweetCount: legacy.retweet_count || 0,
          replyCount: legacy.reply_count || 0,
          bookmarkCount: legacy.bookmark_count || 0,
          viewCount: parseInt(views.count || '0', 10) || 0,
        });

        if (tweets.length >= count) return;
      }
    }
  }

  extractTweetsFromInstructions(instructions);
  return tweets;
}

// --- Shared features flags for CreateTweet ---
const CREATE_TWEET_FEATURES = {
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  tweetypie_unmention_optimization_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  tweet_awards_web_tipping_enabled: false,
  creator_subscriptions_quote_tweet_preview_enabled: false,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  articles_preview_enabled: true,
  rweb_video_timestamps_enabled: true,
  rweb_tipjar_consumption_enabled: true,
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_enhance_cards_enabled: false,
};

// --- Dynamic query ID cache ---
let _cachedCreateTweetQueryId: string | null = null;
let _cachedFavoriteTweetQueryId: string | null = null;

const FALLBACK_CREATE_TWEET_ID = 'a1p9RWpkYKBjWv_I3WzS-A';
const FALLBACK_FAVORITE_TWEET_ID = 'lI07N6Otwv1PhnEgXILM7A';

/**
 * Dynamically extract GraphQL query IDs from Twitter's JS bundles.
 * Twitter rotates these IDs periodically, so hardcoding them breaks.
 */
async function fetchQueryIds(page: Page): Promise<void> {
  if (_cachedCreateTweetQueryId) return;

  try {
    // Get all script src URLs from the page
    const scriptSrcs: string[] = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('script[src]'))
        .map(s => (s as HTMLScriptElement).src)
        .filter(s => s.includes('/client-web/') || s.includes('api.'));
    });

    // Fetch each script and look for CreateTweet query ID pattern
    for (const src of scriptSrcs) {
      try {
        const content: string = await page.evaluate(async (url: string) => {
          const r = await fetch(url);
          return r.text();
        }, src);

        // Pattern: queryId:"<id>",operationName:"CreateTweet"
        // or: {queryId:"<id>",...operationName:"CreateTweet"}
        const createMatch = content.match(/queryId:\s*"([^"]+)"[^}]*operationName:\s*"CreateTweet"/);
        if (createMatch) {
          _cachedCreateTweetQueryId = createMatch[1];
          console.log(`[twitter] Found CreateTweet queryId: ${_cachedCreateTweetQueryId}`);
        }

        const favMatch = content.match(/queryId:\s*"([^"]+)"[^}]*operationName:\s*"FavoriteTweet"/);
        if (favMatch) {
          _cachedFavoriteTweetQueryId = favMatch[1];
          console.log(`[twitter] Found FavoriteTweet queryId: ${_cachedFavoriteTweetQueryId}`);
        }

        if (_cachedCreateTweetQueryId && _cachedFavoriteTweetQueryId) break;
      } catch { /* skip this script */ }
    }
  } catch (err) {
    console.error('[twitter] Failed to extract query IDs:', (err as Error).message);
  }

  // Fallback to hardcoded if extraction failed
  if (!_cachedCreateTweetQueryId) {
    _cachedCreateTweetQueryId = FALLBACK_CREATE_TWEET_ID;
    console.log(`[twitter] Using fallback CreateTweet queryId: ${FALLBACK_CREATE_TWEET_ID}`);
  }
  if (!_cachedFavoriteTweetQueryId) {
    _cachedFavoriteTweetQueryId = FALLBACK_FAVORITE_TWEET_ID;
  }
}

function getCreateTweetQueryId(): string {
  return _cachedCreateTweetQueryId || FALLBACK_CREATE_TWEET_ID;
}

function getFavoriteTweetQueryId(): string {
  return _cachedFavoriteTweetQueryId || FALLBACK_FAVORITE_TWEET_ID;
}

/** Exported so twitterHttp.ts can use the resolved ID */
export { getCreateTweetQueryId, getFavoriteTweetQueryId };

// --- Internal helper: call CreateTweet GraphQL inside Chromium ---
async function createTweet(variables: Record<string, unknown>): Promise<TweetResponse> {
  const page = await getPage();

  // Navigate to x.com if not already there (needed to load JS bundles)
  const currentUrl = page.url();
  if (!currentUrl.includes('x.com')) {
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT });
    await new Promise(r => setTimeout(r, 2000));
  }

  // Dynamically resolve query IDs from loaded JS bundles
  await fetchQueryIds(page);
  const queryId = getCreateTweetQueryId();

  // Get ct0 from browser context cookies (works for per-user profiles)
  const contextCookies = await _context!.cookies('https://x.com');
  const ct0 = contextCookies.find(c => c.name === 'ct0')?.value || process.env.TWITTER_CT0 || '';

  const data = await page.evaluate(
    async ({
      url,
      bearer,
      csrfToken,
      body,
    }: {
      url: string;
      bearer: string;
      csrfToken: string;
      body: string;
    }) => {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: bearer,
          'Content-Type': 'application/json',
          'X-Csrf-Token': csrfToken,
          'X-Twitter-Auth-Type': 'OAuth2Session',
          'X-Twitter-Active-User': 'yes',
          'X-Twitter-Client-Language': 'en',
        },
        body,
      });
      if (!res.ok) {
        const errorBody = await res.text();
        throw new Error(`Twitter API error ${res.status}: ${errorBody}`);
      }
      return res.json();
    },
    {
      url: `${TWITTER_GRAPHQL_BASE}/${queryId}/CreateTweet`,
      bearer: BEARER,
      csrfToken: ct0,
      body: JSON.stringify({
        variables,
        features: CREATE_TWEET_FEATURES,
        queryId,
      }),
    }
  );

  const result = data?.data?.create_tweet?.tweet_results?.result;
  if (!result) {
    throw new Error(`Unexpected Twitter response: ${JSON.stringify(data).slice(0, 500)}`);
  }

  return {
    data: {
      id: result.rest_id || result.legacy?.id_str || '',
      text: result.legacy?.full_text || (variables.tweet_text as string) || '',
    },
  };
}

// --- Post a new tweet ---
export async function postTweet(text: string): Promise<TweetResponse> {
  return createTweet({
    tweet_text: text,
    dark_request: false,
    media: { media_entities: [], possibly_sensitive: false },
    semantic_annotation_ids: [],
  });
}

// --- Post a reply to a specific tweet ---
export async function replyToTweet(text: string, inReplyToTweetId: string): Promise<TweetResponse> {
  return createTweet({
    tweet_text: text,
    reply: {
      in_reply_to_tweet_id: inReplyToTweetId,
      exclude_reply_user_ids: [],
    },
    dark_request: false,
    media: { media_entities: [], possibly_sensitive: false },
    semantic_annotation_ids: [],
  });
}

// --- Like a tweet ---
export async function likeTweet(tweetId: string): Promise<void> {
  const page = await getPage();
  await fetchQueryIds(page);
  const favQueryId = getFavoriteTweetQueryId();
  const contextCookies = await _context!.cookies('https://x.com');
  const ct0 = contextCookies.find(c => c.name === 'ct0')?.value || process.env.TWITTER_CT0 || '';

  await page.evaluate(
    async ({
      url,
      bearer,
      csrfToken,
      body,
    }: {
      url: string;
      bearer: string;
      csrfToken: string;
      body: string;
    }) => {
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
      if (!res.ok) {
        const errorBody = await res.text();
        throw new Error(`Twitter like error ${res.status}: ${errorBody}`);
      }
    },
    {
      url: `${TWITTER_GRAPHQL_BASE}/${favQueryId}/FavoriteTweet`,
      bearer: BEARER,
      csrfToken: ct0,
      body: JSON.stringify({
        variables: { tweet_id: tweetId },
        queryId: favQueryId,
      }),
    }
  );
}
