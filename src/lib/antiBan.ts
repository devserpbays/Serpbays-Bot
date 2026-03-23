/**
 * Anti-Ban Utility — Human-like behavior patterns to prevent account bans
 *
 * Key strategies:
 * 1. Randomized delays with jitter (no fixed intervals)
 * 2. Account age-based daily limits (warm-up period)
 * 3. Random skip probability (humans don't post every cycle)
 * 4. Cross-platform gap enforcement
 * 5. Session-based activity budgets
 */

/**
 * Add human-like jitter to any delay.
 * Returns a randomized delay between min and max milliseconds.
 * Distribution is biased toward the middle (bell-curve-ish) for realism.
 */
export function humanDelay(minMs: number, maxMs: number): number {
  // Use two random values averaged for a more natural distribution
  const r1 = Math.random();
  const r2 = Math.random();
  const avg = (r1 + r2) / 2; // tends toward center
  return Math.round(minMs + avg * (maxMs - minMs));
}

/**
 * Sleep for a human-like randomized duration.
 */
export function humanSleep(minMs: number, maxMs: number): Promise<void> {
  const ms = humanDelay(minMs, maxMs);
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Add jitter to a cooldown (e.g., 90 min ± 30%).
 * Returns jittered cooldown in milliseconds.
 */
export function jitterCooldown(baseMinutes: number, jitterPercent = 30): number {
  const baseMs = baseMinutes * 60 * 1000;
  const jitter = baseMs * (jitterPercent / 100);
  const offset = (Math.random() * 2 - 1) * jitter; // -jitter to +jitter
  return Math.max(baseMs * 0.5, baseMs + offset); // never less than 50% of base
}

/**
 * Calculate safe daily limit based on account age.
 * New accounts start very low and gradually ramp up over 30 days.
 *
 * Day 1-3:  1 post/day (warm-up)
 * Day 4-7:  2 posts/day
 * Day 8-14: 50% of configured limit
 * Day 15-30: 75% of configured limit
 * Day 30+:  full configured limit
 */
export function getWarmupLimit(configuredLimit: number, accountAddedAt: string | Date | undefined): number {
  if (!accountAddedAt) return Math.min(configuredLimit, 2); // no date = assume new

  const ageMs = Date.now() - new Date(accountAddedAt).getTime();
  const ageDays = ageMs / (24 * 60 * 60 * 1000);

  if (ageDays < 3) return 1;
  if (ageDays < 7) return Math.min(configuredLimit, 2);
  if (ageDays < 14) return Math.max(1, Math.ceil(configuredLimit * 0.5));
  if (ageDays < 30) return Math.max(1, Math.ceil(configuredLimit * 0.75));

  return configuredLimit;
}

/**
 * Should this cron run randomly skip posting? (simulates human inconsistency)
 * Returns true X% of the time to make posting patterns less predictable.
 *
 * @param skipProbability - chance of skipping (0.0 to 1.0), default 0.15 (15%)
 */
export function shouldRandomlySkip(skipProbability = 0.15): boolean {
  return Math.random() < skipProbability;
}

/**
 * Get a randomized inter-reply delay for batch posting.
 * Much longer and more varied than the current fixed 45s.
 *
 * Returns delay in milliseconds (60-180 seconds with jitter).
 */
export function getInterReplyDelay(): number {
  return humanDelay(60_000, 180_000);
}

/**
 * Get the account added date from settings socialAccounts array.
 */
export function getAccountAge(
  settings: { socialAccounts?: Array<{ platform: string; addedAt?: string }> },
  platform: string
): string | undefined {
  const account = settings.socialAccounts?.find(a => a.platform === platform);
  return account?.addedAt;
}

/**
 * Platform-specific safe defaults.
 * These are the MAXIMUM safe limits — actual limits should be lower during warm-up.
 */
export const SAFE_DEFAULTS = {
  twitter:   { dailyLimit: 4,  cooldownMinutes: 90,  batchSize: 2 },
  reddit:    { dailyLimit: 3,  cooldownMinutes: 120, batchSize: 1 },
  facebook:  { dailyLimit: 3,  cooldownMinutes: 120, batchSize: 1 },
  quora:     { dailyLimit: 2,  cooldownMinutes: 180, batchSize: 1 },
  youtube:   { dailyLimit: 2,  cooldownMinutes: 240, batchSize: 1 },
  pinterest: { dailyLimit: 2,  cooldownMinutes: 120, batchSize: 1 },
} as const;

/* ────────────────────────────────────────────────────────────────
 * Human-Like Engagement Engine
 *
 * Instead of always doing like → reply, a real human browses,
 * sometimes just likes, sometimes bookmarks, occasionally retweets,
 * and doesn't reply to every post. This engine randomises the mix.
 * ──────────────────────────────────────────────────────────────── */

export type EngagementAction = 'like' | 'retweet' | 'bookmark' | 'reply';

interface EngagementRates {
  likeRate?: number;      // 0-100, default 70
  retweetRate?: number;   // 0-100, default 10
  bookmarkRate?: number;  // 0-100, default 8
  replyRate?: number;     // 0-100, default 60
}

/**
 * Decide which engagement actions to take on a post.
 * Higher relevance scores increase the chance of each action.
 * Returns a shuffled list of actions to execute.
 */
export function pickEngagementActions(
  relevanceScore: number,
  rates: EngagementRates = {}
): EngagementAction[] {
  const likeRate = rates.likeRate ?? 70;
  const retweetRate = rates.retweetRate ?? 10;
  const bookmarkRate = rates.bookmarkRate ?? 8;
  const replyRate = rates.replyRate ?? 60;

  // Score multiplier: higher scores boost all rates slightly
  const boost = relevanceScore >= 80 ? 1.2
    : relevanceScore >= 60 ? 1.0
    : 0.7;

  const actions: EngagementAction[] = [];

  if (Math.random() * 100 < likeRate * boost) actions.push('like');
  if (Math.random() * 100 < retweetRate * boost && relevanceScore >= 75) actions.push('retweet');
  if (Math.random() * 100 < bookmarkRate * boost) actions.push('bookmark');
  if (Math.random() * 100 < replyRate * boost) actions.push('reply');

  // 5% chance of doing nothing at all (scroll past)
  if (actions.length > 0 && Math.random() < 0.05) return [];

  // Shuffle order — don't always like-then-reply
  for (let i = actions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [actions[i], actions[j]] = [actions[j], actions[i]];
  }

  return actions;
}

/**
 * Simulate reading a post before engaging.
 * Longer posts get more reading time. Returns ms to wait.
 */
export function getReadingDelay(postLength: number): number {
  if (postLength < 100) return humanDelay(2_000, 5_000);
  if (postLength < 280) return humanDelay(5_000, 12_000);
  return humanDelay(10_000, 20_000);
}

/**
 * Delay between individual engagement actions on the same post
 * (e.g., pause between liking and replying). 2-8 seconds.
 */
export function getActionGap(): number {
  return humanDelay(2_000, 8_000);
}
