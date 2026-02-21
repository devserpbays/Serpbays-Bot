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
import { unlinkSync } from 'fs';

const TWITTER_GRAPHQL_BASE = 'https://x.com/i/api/graphql';
const BEARER =
  'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

const PROFILE_DIR = join(process.cwd(), '.twitter-profile');
const NAVIGATION_TIMEOUT = 30000;

interface TweetResponse {
  data: {
    id: string;
    text: string;
  };
}

let _context: BrowserContext | null = null;
let _page: Page | null = null;

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

  // Remove stale browser lock from previous crash
  try { unlinkSync(join(PROFILE_DIR, 'SingletonLock')); } catch {}

  _context = await chromium.launchPersistentContext(PROFILE_DIR, {
    executablePath: '/usr/bin/chromium-browser',
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

  // Inject Twitter cookies into the browser context from env vars
  const cookies = buildCookies();
  if (cookies.length > 0) {
    await _context.addCookies(cookies);
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
  return !!(process.env.TWITTER_AUTH_TOKEN && process.env.TWITTER_CT0);
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

// --- Internal helper: call CreateTweet GraphQL inside Chromium ---
async function createTweet(variables: Record<string, unknown>): Promise<TweetResponse> {
  const ct0 = process.env.TWITTER_CT0 || '';
  const page = await getPage();

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
      url: `${TWITTER_GRAPHQL_BASE}/a1p9RWpkYKBjWv_I3WzS-A/CreateTweet`,
      bearer: BEARER,
      csrfToken: ct0,
      body: JSON.stringify({
        variables,
        features: CREATE_TWEET_FEATURES,
        queryId: 'a1p9RWpkYKBjWv_I3WzS-A',
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
  const ct0 = process.env.TWITTER_CT0 || '';
  const page = await getPage();

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
      url: `${TWITTER_GRAPHQL_BASE}/lI07N6Otwv1PhnEgXILM7A/FavoriteTweet`,
      bearer: BEARER,
      csrfToken: ct0,
      body: JSON.stringify({
        variables: { tweet_id: tweetId },
        queryId: 'lI07N6Otwv1PhnEgXILM7A',
      }),
    }
  );
}
