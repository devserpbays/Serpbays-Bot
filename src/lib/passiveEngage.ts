/**
 * passiveEngage.ts — Passive engagement orchestrator.
 *
 * Runs platform-specific non-comment engagement (likes, reactions, watching)
 * to build account trust and simulate realistic human activity.
 *
 * Called from the /api/passive-engage route or from cron scripts as a warm-up
 * step before or after posting comments.
 */

import { connectDB } from './mongodb';
import Settings from '@/models/Settings';
import BrowserCookie from '@/models/BrowserCookie';
import { loadCookies } from './cookieStore';
import { join } from 'path';
import { mkdirSync, writeFileSync } from 'fs';

export type PassiveResult = {
  platform: string;
  action: string;
  count: number;
  detail?: string;
};

/** Write cookies to disk so platform scripts can use the profile. */
async function prepareCookieFile(
  userId: string,
  platform: string,
  profileDir: string
): Promise<boolean> {
  try {
    mkdirSync(profileDir, { recursive: true });
    const cookies = await loadCookies(userId, platform);
    if (!cookies || !Array.isArray(cookies) || cookies.length === 0) return false;
    writeFileSync(join(profileDir, 'cookies.json'), JSON.stringify(cookies));
    return true;
  } catch {
    return false;
  }
}

/**
 * Run passive engagement for a user on a specific platform.
 * Loads cookies, sets up profile dir, then calls the appropriate function.
 */
export async function runPassiveEngagement(
  userId: string,
  platform: string
): Promise<PassiveResult> {
  await connectDB();

  const settings = await Settings.findOne({ userId }).lean() as { socialAccounts?: Array<{ platform: string; profileDir?: string }> } | null;
  const account = settings?.socialAccounts?.find((a) => a.platform === platform);
  const profileDir = account?.profileDir
    ? join(process.cwd(), account.profileDir)
    : join(process.cwd(), 'profiles', userId, platform);

  const cookieReady = await prepareCookieFile(userId, platform, profileDir);
  if (!cookieReady) {
    return { platform, action: 'skipped', count: 0, detail: 'No cookies found' };
  }

  switch (platform) {
    case 'twitter':  return runTwitterPassive(profileDir);
    case 'reddit':   return runRedditPassive(userId, profileDir, settings);
    case 'facebook': return runFacebookPassive(userId, profileDir, settings);
    case 'youtube':  return runYouTubePassive(profileDir);
    default:
      return { platform, action: 'skipped', count: 0, detail: 'No passive handler for this platform' };
  }
}

async function runTwitterPassive(profileDir: string): Promise<PassiveResult> {
  try {
    // Set the twitter lib's profile dir then browse-and-like
    const { setProfileDir, browseFeedAndLike } = await import('./twitter');
    setProfileDir(profileDir);
    const maxLikes = 1 + Math.floor(Math.random() * 2); // 1–2
    const result = await browseFeedAndLike(maxLikes);
    return { platform: 'twitter', action: 'like', count: result.liked };
  } catch (err) {
    return { platform: 'twitter', action: 'like', count: 0, detail: (err as Error).message };
  }
}

async function runRedditPassive(
  userId: string,
  profileDir: string,
  settings: { socialAccounts?: Array<{ platform: string; profileDir?: string }> } | null
): Promise<PassiveResult> {
  try {
    const { setProfileDir, browseAndUpvote } = await import('./reddit');
    setProfileDir(profileDir);

    // Use subreddits from user's settings keywords as a proxy
    const userSettings = await Settings.findOne({ userId }).lean() as { keywords?: string[] } | null;
    const keywords = userSettings?.keywords ?? [];
    // Map keywords to likely subreddits (just use as subreddit names directly if they look like r/xxx)
    // Otherwise use generic popular subreddits as fallback
    const subreddits = keywords.length > 0
      ? keywords.slice(0, 3).map((k: string) => k.replace(/^r\//, '').replace(/\s+/g, ''))
      : ['popular'];

    const maxUpvotes = 1 + Math.floor(Math.random() * 2); // 1–2
    const result = await browseAndUpvote(subreddits, maxUpvotes);
    return { platform: 'reddit', action: 'upvote', count: result.upvoted };
  } catch (err) {
    return { platform: 'reddit', action: 'upvote', count: 0, detail: (err as Error).message };
  }
}

async function runFacebookPassive(
  userId: string,
  profileDir: string,
  settings: { socialAccounts?: Array<{ platform: string; profileDir?: string }> } | null
): Promise<PassiveResult> {
  try {
    const { setProfileDir, browseFeedAndReact, getJoinedGroups } = await import('./facebook');
    setProfileDir(profileDir);

    // Get the user's joined groups (up to 3)
    const groups = await getJoinedGroups().catch(() => [] as string[]);
    if (groups.length === 0) {
      return { platform: 'facebook', action: 'react', count: 0, detail: 'No joined groups found' };
    }

    const maxReactions = 1 + Math.floor(Math.random() * 2); // 1–2
    const groupSample = groups.sort(() => Math.random() - 0.5).slice(0, 2);
    const result = await browseFeedAndReact(groupSample, maxReactions);
    return {
      platform: 'facebook',
      action: 'react',
      count: result.reacted,
      detail: result.reactions.join(', '),
    };
  } catch (err) {
    return { platform: 'facebook', action: 'react', count: 0, detail: (err as Error).message };
  }
}

async function runYouTubePassive(profileDir: string): Promise<PassiveResult> {
  try {
    const { browseAndWatch } = await import('./youtube');
    const maxVideos = 1 + Math.floor(Math.random() * 2); // 1–2 videos
    const result = await browseAndWatch(profileDir, maxVideos);
    return { platform: 'youtube', action: 'watch+like', count: result.watched };
  } catch (err) {
    return { platform: 'youtube', action: 'watch+like', count: 0, detail: (err as Error).message };
  }
}
