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

/** Update HTTP query IDs from browser-resolved values */
export function setHttpQueryIds(createTweet?: string, favoriteTweet?: string) {
  if (createTweet) _httpCreateTweetQueryId = createTweet;
  if (favoriteTweet) _httpFavoriteTweetQueryId = favoriteTweet;
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

// --- Common headers for Twitter GraphQL ---
function getHeaders(ct0: string, cookieHeader: string): Record<string, string> {
  return {
    Authorization: BEARER,
    'Content-Type': 'application/json',
    'X-Csrf-Token': ct0,
    'X-Twitter-Auth-Type': 'OAuth2Session',
    'X-Twitter-Active-User': 'yes',
    'X-Twitter-Client-Language': 'en',
    Cookie: cookieHeader,
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
    Referer: 'https://x.com/',
    Origin: 'https://x.com',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Sec-Ch-Ua': '"Google Chrome";v="145", "Chromium";v="145", "Not-A.Brand";v="24"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Linux"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
  };
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

  const res = await fetch(`${TWITTER_GRAPHQL_BASE}/${_httpCreateTweetQueryId}/CreateTweet`, {
    method: 'POST',
    headers: getHeaders(ct0, cookieHeader),
    body: JSON.stringify({
      variables,
      features: CREATE_TWEET_FEATURES,
      queryId: _httpCreateTweetQueryId,
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Twitter API error ${res.status}: ${errorBody.slice(0, 300)}`);
  }

  const data = await res.json();
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
export async function replyToTweetHttp(profileDir: string, text: string, inReplyToTweetId: string): Promise<TweetResponse> {
  return createTweetHttp(profileDir, {
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

// --- Like a tweet (HTTP) ---
export async function likeTweetHttp(profileDir: string, tweetId: string): Promise<void> {
  const cookies = loadCookies(profileDir);
  const ct0 = getCt0(cookies);
  const cookieHeader = buildCookieHeader(cookies);

  const res = await fetch(`${TWITTER_GRAPHQL_BASE}/${_httpFavoriteTweetQueryId}/FavoriteTweet`, {
    method: 'POST',
    headers: getHeaders(ct0, cookieHeader),
    body: JSON.stringify({
      variables: { tweet_id: tweetId },
      queryId: _httpFavoriteTweetQueryId,
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Twitter like error ${res.status}: ${errorBody.slice(0, 300)}`);
  }
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
