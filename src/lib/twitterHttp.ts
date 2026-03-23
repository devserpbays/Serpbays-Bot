/**
 * Twitter HTTP-only client — no Chromium/Playwright required.
 *
 * Uses cookies from cookies.json to make direct GraphQL API calls.
 * This is 100x lighter than the Playwright-based twitter.ts and can
 * handle 100+ concurrent users without RAM issues.
 *
 * Used for: verifyCredentials, replyToTweet, likeTweet, postTweet
 * NOT used for: searchTweets (needs browser network interception)
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const TWITTER_GRAPHQL_BASE = 'https://x.com/i/api/graphql';
const BEARER =
  'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

// Mutable query IDs — updated by browser-based twitter.ts when it resolves fresh IDs
let _httpCreateTweetQueryId = 'a1p9RWpkYKBjWv_I3WzS-A';
let _httpFavoriteTweetQueryId = 'lI07N6Otwv1PhnEgXILM7A';
let _httpCreateRetweetQueryId = 'ojPdsZsimiJrUGLR1sjUtA';
let _httpCreateBookmarkQueryId = 'aoDbu3RHznuiSkQ9aNM67Q';

/** Update HTTP query IDs from browser-resolved values */
export function setHttpQueryIds(createTweet?: string, favoriteTweet?: string, createRetweet?: string, createBookmark?: string) {
  if (createTweet) _httpCreateTweetQueryId = createTweet;
  if (favoriteTweet) _httpFavoriteTweetQueryId = favoriteTweet;
  if (createRetweet) _httpCreateRetweetQueryId = createRetweet;
  if (createBookmark) _httpCreateBookmarkQueryId = createBookmark;
}

interface TweetResponse {
  data: { id: string; text: string };
}

interface CookieEntry {
  name: string;
  value: string;
  domain: string;
}

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

// --- Load cookies from profile dir ---
function loadCookies(profileDir: string): CookieEntry[] {
  const cookiesPath = join(profileDir, 'cookies.json');
  if (!existsSync(cookiesPath)) return [];
  try {
    return JSON.parse(readFileSync(cookiesPath, 'utf8'));
  } catch {
    return [];
  }
}

function buildCookieHeader(cookies: CookieEntry[]): string {
  return cookies
    .filter(c => c.domain.includes('x.com') || c.domain.includes('twitter.com'))
    .map(c => `${c.name}=${c.value}`)
    .join('; ');
}

function getCt0(cookies: CookieEntry[]): string {
  return cookies.find(c => c.name === 'ct0')?.value || '';
}

// Rotate Chrome versions to avoid fixed-UA bot fingerprinting.
// In 2026, Chrome 128–134 covers the realistic "didn't update immediately" range.
const CHROME_UA_POOL: { version: number; secChUaBrand: string }[] = [
  { version: 128, secChUaBrand: '"Chromium";v="128", "Google Chrome";v="128", "Not-A.Brand";v="24"' },
  { version: 129, secChUaBrand: '"Chromium";v="129", "Google Chrome";v="129", "Not-A.Brand";v="8"' },
  { version: 130, secChUaBrand: '"Chromium";v="130", "Google Chrome";v="130", "Not-A.Brand";v="99"' },
  { version: 131, secChUaBrand: '"Chromium";v="131", "Google Chrome";v="131", "Not-A.Brand";v="24"' },
  { version: 132, secChUaBrand: '"Chromium";v="132", "Google Chrome";v="132", "Not-A.Brand";v="24"' },
  { version: 133, secChUaBrand: '"Chromium";v="133", "Google Chrome";v="133", "Not-A.Brand";v="24"' },
  { version: 134, secChUaBrand: '"Chromium";v="134", "Google Chrome";v="134", "Not-A.Brand";v="24"' },
];

// iPhone / Safari mobile UA pool — real heavy users switch between desktop and phone
const MOBILE_UA_POOL = [
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_7_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
];

interface UAProfile {
  userAgent: string;
  isMobile: boolean;
  secChUa?: string;
}

/** Pick a UA — 25% chance mobile (iPhone), 75% desktop Chrome. */
function pickUA(): UAProfile {
  if (Math.random() < 0.25) {
    return {
      userAgent: MOBILE_UA_POOL[Math.floor(Math.random() * MOBILE_UA_POOL.length)],
      isMobile: true,
    };
  }
  const pick = CHROME_UA_POOL[Math.floor(Math.random() * CHROME_UA_POOL.length)];
  return {
    userAgent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${pick.version}.0.0.0 Safari/537.36`,
    isMobile: false,
    secChUa: pick.secChUaBrand,
  };
}

// --- Common headers for Twitter GraphQL ---
function getHeaders(ct0: string, cookieHeader: string): Record<string, string> {
  const ua = pickUA();
  const base: Record<string, string> = {
    Authorization: BEARER,
    'Content-Type': 'application/json',
    'X-Csrf-Token': ct0,
    'X-Twitter-Auth-Type': 'OAuth2Session',
    'X-Twitter-Active-User': 'yes',
    'X-Twitter-Client-Language': 'en',
    Cookie: cookieHeader,
    'User-Agent': ua.userAgent,
    Referer: 'https://x.com/',
    Origin: 'https://x.com',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
  };
  if (ua.isMobile) {
    base['Sec-Ch-Ua-Mobile'] = '?1';
    base['Sec-Ch-Ua-Platform'] = '"iOS"';
  } else {
    base['Sec-Ch-Ua'] = ua.secChUa!;
    base['Sec-Ch-Ua-Mobile'] = '?0';
    base['Sec-Ch-Ua-Platform'] = '"Windows"';
  }
  return base;
}

/** Random jitter: wait between min and max ms */
function jitter(min = 1500, max = 4000): Promise<void> {
  return new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min)) + min));
}

/** Parse a Twitter API error body into a short human-readable message */
export function parseTwitterError(bodyStr: string): string {
  const CODE_MAP: Record<number, string> = {
    32:  'Twitter session expired — re-upload cookies from dashboard',
    64:  'Twitter account is suspended',
    88:  'Twitter rate limit reached — will retry later',
    89:  'Twitter access token expired — re-upload cookies',
    135: 'Twitter timestamp out of bounds — check server time',
    161: 'Twitter follow limit reached',
    179: 'Not authorised to view this tweet',
    185: 'Twitter daily tweet limit reached',
    187: 'Duplicate tweet — identical reply already posted',
    215: 'Twitter authentication failed — re-upload cookies',
    226: 'Twitter flagged this as automated activity — posting paused temporarily',
    261: 'Twitter app write permissions revoked — re-connect account',
    326: 'Twitter account is temporarily locked',
    349: 'Cannot reply to this tweet (deleted or restricted)',
    385: 'Cannot reply to this tweet (deleted or not found)',
    416: 'Twitter application suspended',
  };

  try {
    const parsed = JSON.parse(bodyStr);
    const errors = parsed?.errors as Array<{ code: number; message: string }> | undefined;
    if (errors && errors.length > 0) {
      const first = errors[0];
      const mapped = CODE_MAP[first.code];
      if (mapped) return mapped;
      // Strip the verbose suffix Twitter appends and return cleaned message
      const cleaned = (first.message || '')
        .replace(/\s*\(\d+\)\s*$/, '')   // remove trailing "(226)"
        .replace(/\s*Please try again later\.\s*/i, '')
        .replace(/\s*To protect our users.*$/i, '')
        .trim();
      return cleaned || `Twitter error ${first.code}`;
    }
  } catch { /* not JSON */ }

  // Not JSON or no errors array — strip the raw body
  return bodyStr.slice(0, 120).replace(/[\r\n]+/g, ' ').trim();
}

// --- Verify credentials: read from .verified file + test ct0 cookie exists ---
export async function verifyCredentialsHttp(profileDir: string): Promise<{ id: string; name: string; username: string }> {
  const cookies = loadCookies(profileDir);
  if (cookies.length === 0) throw new Error('No cookies.json found in ' + profileDir);

  const ct0 = getCt0(cookies);
  if (!ct0) throw new Error('No ct0 cookie found — session may be expired');

  const authToken = cookies.find(c => c.name === 'auth_token');
  if (!authToken) throw new Error('No auth_token cookie — session expired');

  // Read identity from .verified file (written when cookies were set)
  const verifiedPath = join(profileDir, '.verified');
  if (existsSync(verifiedPath)) {
    try {
      const data = JSON.parse(readFileSync(verifiedPath, 'utf8'));
      if (data.username) {
        return {
          id: data.accountId || '',
          name: data.displayName || '',
          username: data.username,
        };
      }
    } catch {}
  }

  // Fallback: extract user ID from twid cookie
  const twid = cookies.find(c => c.name === 'twid')?.value || '';
  const userId = twid ? decodeURIComponent(twid).replace('u=', '') : '';

  return { id: userId, name: '', username: '' };
}

// --- Internal: call CreateTweet GraphQL via HTTP ---
async function createTweetHttp(profileDir: string, variables: Record<string, unknown>): Promise<TweetResponse> {
  const cookies = loadCookies(profileDir);
  const ct0 = getCt0(cookies);
  const cookieHeader = buildCookieHeader(cookies);

  if (!ct0) throw new Error('No ct0 cookie — cannot post tweet');

  // Human-like jitter before posting (avoids mechanical request timing patterns)
  await jitter(1500, 4000);

  const maxAttempts = 3;
  let lastError = '';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(`${TWITTER_GRAPHQL_BASE}/${_httpCreateTweetQueryId}/CreateTweet`, {
      method: 'POST',
      headers: getHeaders(ct0, cookieHeader),
      body: JSON.stringify({
        variables,
        features: CREATE_TWEET_FEATURES,
        queryId: _httpCreateTweetQueryId,
      }),
    });

    const body = await res.text();

    if (!res.ok) {
      const humanError = parseTwitterError(body);
      lastError = humanError;
      // Error 226 = automation detection — back off and retry
      if (body.includes('"code":226') || body.includes('"code": 226')) {
        if (attempt < maxAttempts) {
          const backoff = attempt * 8000 + Math.floor(Math.random() * 4000);
          console.warn(`[Twitter] 226 on attempt ${attempt}/${maxAttempts} — waiting ${backoff}ms`);
          await new Promise(r => setTimeout(r, backoff));
          continue;
        }
      }
      throw new Error(humanError);
    }

    let data: Record<string, unknown>;
    try { data = JSON.parse(body); } catch { throw new Error(`Twitter returned non-JSON response — session may be expired`); }

    // Check for error 226 inside a 200-OK body (Twitter sometimes does this)
    const bodyStr = JSON.stringify(data);
    if (bodyStr.includes('"code":226') || bodyStr.includes('"code": 226')) {
      if (attempt < maxAttempts) {
        const backoff = attempt * 8000 + Math.floor(Math.random() * 4000);
        console.warn(`[Twitter] 226 in body on attempt ${attempt}/${maxAttempts} — waiting ${backoff}ms`);
        await new Promise(r => setTimeout(r, backoff));
        continue;
      }
      throw new Error(parseTwitterError(bodyStr));
    }

    const result = (data as Record<string, unknown> & { data?: { create_tweet?: { tweet_results?: { result?: Record<string, unknown> } } } })
      ?.data?.create_tweet?.tweet_results?.result;
    if (!result) {
      throw new Error(parseTwitterError(bodyStr));
    }

    return {
      data: {
        id: (result.rest_id as string) || ((result.legacy as Record<string, string>)?.id_str) || '',
        text: ((result.legacy as Record<string, string>)?.full_text) || (variables.tweet_text as string) || '',
      },
    };
  }

  throw new Error(lastError || 'Twitter: max retry attempts exceeded');
}

// --- Post a new tweet (HTTP) ---
export async function postTweetHttp(profileDir: string, text: string): Promise<TweetResponse> {
  return createTweetHttp(profileDir, {
    tweet_text: text,
    dark_request: false,
    media: { media_entities: [], possibly_sensitive: false },
    semantic_annotation_ids: [],
  });
}

// --- Reply to a tweet (HTTP) ---
// Pass communityId when replying to a community tweet — required by Twitter's API
// to post the reply within the community context (otherwise it's invisible to members).
export async function replyToTweetHttp(
  profileDir: string,
  text: string,
  inReplyToTweetId: string,
  communityId?: string
): Promise<TweetResponse> {
  return createTweetHttp(profileDir, {
    tweet_text: text,
    reply: {
      in_reply_to_tweet_id: inReplyToTweetId,
      exclude_reply_user_ids: [],
    },
    dark_request: false,
    media: { media_entities: [], possibly_sensitive: false },
    semantic_annotation_ids: [],
    ...(communityId ? { community_id: communityId } : {}),
  });
}

// --- Like a tweet (HTTP) ---
export async function likeTweetHttp(profileDir: string, tweetId: string): Promise<void> {
  const cookies = loadCookies(profileDir);
  const ct0 = getCt0(cookies);
  const cookieHeader = buildCookieHeader(cookies);
  if (!ct0) throw new Error('No ct0 cookie — cannot like');

  await jitter(800, 3000);

  const res = await fetch(`${TWITTER_GRAPHQL_BASE}/${_httpFavoriteTweetQueryId}/FavoriteTweet`, {
    method: 'POST',
    headers: getHeaders(ct0, cookieHeader),
    body: JSON.stringify({
      variables: { tweet_id: tweetId },
      queryId: _httpFavoriteTweetQueryId,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Twitter like error ${res.status}: ${parseTwitterError(body)}`);
  }
}

// --- Retweet a tweet (HTTP) ---
export async function retweetHttp(profileDir: string, tweetId: string): Promise<void> {
  const cookies = loadCookies(profileDir);
  const ct0 = getCt0(cookies);
  const cookieHeader = buildCookieHeader(cookies);
  if (!ct0) throw new Error('No ct0 cookie — cannot retweet');

  await jitter(1500, 4000);

  const res = await fetch(`${TWITTER_GRAPHQL_BASE}/${_httpCreateRetweetQueryId}/CreateRetweet`, {
    method: 'POST',
    headers: getHeaders(ct0, cookieHeader),
    body: JSON.stringify({
      variables: { tweet_id: tweetId, dark_request: false },
      queryId: _httpCreateRetweetQueryId,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Twitter retweet error ${res.status}: ${parseTwitterError(body)}`);
  }
}

// --- Bookmark a tweet (HTTP) ---
export async function bookmarkHttp(profileDir: string, tweetId: string): Promise<void> {
  const cookies = loadCookies(profileDir);
  const ct0 = getCt0(cookies);
  const cookieHeader = buildCookieHeader(cookies);
  if (!ct0) throw new Error('No ct0 cookie — cannot bookmark');

  await jitter(800, 2500);

  const res = await fetch(`${TWITTER_GRAPHQL_BASE}/${_httpCreateBookmarkQueryId}/CreateBookmark`, {
    method: 'POST',
    headers: getHeaders(ct0, cookieHeader),
    body: JSON.stringify({
      variables: { tweet_id: tweetId },
      queryId: _httpCreateBookmarkQueryId,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Twitter bookmark error ${res.status}: ${parseTwitterError(body)}`);
  }
}

// --- Follow a user by screen name (HTTP REST) ---
export async function followUserHttp(profileDir: string, screenName: string): Promise<void> {
  const cookies = loadCookies(profileDir);
  const ct0 = getCt0(cookies);
  const cookieHeader = buildCookieHeader(cookies);
  if (!ct0) throw new Error('No ct0 cookie — cannot follow');

  await jitter(2000, 5000);

  const res = await fetch('https://x.com/i/api/1.1/friendships/create.json', {
    method: 'POST',
    headers: {
      ...getHeaders(ct0, cookieHeader),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `screen_name=${encodeURIComponent(screenName)}&skip_status=1`,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Twitter follow error ${res.status}: ${parseTwitterError(body)}`);
  }
}

// --- Simulate visiting the notifications tab (every real user does this constantly) ---
export async function visitNotificationsFeed(profileDir: string): Promise<void> {
  const cookies = loadCookies(profileDir);
  const ct0 = getCt0(cookies);
  const cookieHeader = buildCookieHeader(cookies);
  if (!ct0 || !cookieHeader) return;

  const params = new URLSearchParams({
    include_profile_interstitial_type: '1',
    include_blocking: '1',
    include_blocked_by: '1',
    include_followed_by: '1',
    include_want_retweets: '1',
    include_mute_edge: '1',
    include_can_dm: '1',
    include_can_media_tag: '1',
    count: '20',
  });

  try {
    await fetch(`https://x.com/i/api/2/notifications/all.json?${params}`, {
      headers: { ...getHeaders(ct0, cookieHeader), 'Content-Type': 'application/json' },
    });
    // small reading pause — simulates user glancing at notifications
    await jitter(1500, 4000);
  } catch { /* non-critical — silent */ }
}

// --- Simulate visiting a user's profile before following (human behaviour) ---
export async function visitUserProfile(profileDir: string, screenName: string): Promise<void> {
  const cookies = loadCookies(profileDir);
  const ct0 = getCt0(cookies);
  const cookieHeader = buildCookieHeader(cookies);
  if (!ct0 || !cookieHeader) return;

  const variables = JSON.stringify({
    screen_name: screenName,
    withSafetyModeUserFields: true,
  });
  const features = JSON.stringify({
    hidden_profile_subscriptions_enabled: true,
    rweb_tipjar_consumption_enabled: true,
    responsive_web_graphql_exclude_directive_enabled: true,
    verified_phone_label_enabled: false,
    subscriptions_verification_info_is_identity_verified_enabled: true,
    subscriptions_verification_info_verified_since_enabled: true,
    highlights_tweets_tab_ui_enabled: true,
    responsive_web_twitter_article_notes_tab_enabled: true,
    creator_subscriptions_tweet_preview_api_enabled: true,
    responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
    responsive_web_graphql_timeline_navigation_enabled: true,
  });

  try {
    await fetch(`${TWITTER_GRAPHQL_BASE}/G3KGOASz96M-Qu0nwmGXNg/UserByScreenName?variables=${encodeURIComponent(variables)}&features=${encodeURIComponent(features)}`, {
      headers: getHeaders(ct0, cookieHeader),
    });
    // simulate reading their profile for 3–12 seconds
    await jitter(3000, 12000);
  } catch { /* non-critical — silent */ }
}

// --- Check if Twitter is configured (has cookies.json) ---
export function isTwitterConfiguredHttp(profileDir: string): boolean {
  return existsSync(join(profileDir, 'cookies.json'));
}

// --- Extract tweet ID from URL ---
export function extractTweetId(url: string): string | null {
  const match = url.match(/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/);
  return match ? match[1] : null;
}
