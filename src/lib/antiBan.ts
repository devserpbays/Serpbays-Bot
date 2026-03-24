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
 * Calculate safe daily limit based on account age + configured limit + platform ceiling.
 *
 * Warmup stages (based on when the account was added to the bot):
 *   Stage 1 — Days  0–3:   1 post/day                          (brand new, zero trust)
 *   Stage 2 — Days  4–7:   2 posts/day                         (still new, minimal footprint)
 *   Stage 3 — Days  8–14:  3 posts/day OR 30% of configured    (establishing pattern)
 *   Stage 4 — Days 15–30:  5 posts/day OR 55% of configured    (building trust)
 *   Stage 5 — Days 31–60:  7 posts/day OR 75% of configured    (semi-established)
 *   Stage 6 — Days 60+:    configured limit (capped at platform max)
 *
 * The result is always capped at PLATFORM_SAFE_LIMITS.maxDaily regardless of stage.
 */
export function getWarmupLimit(
  configuredLimit: number,
  accountAddedAt: string | Date | undefined,
  platform?: string,
): number {
  // First apply the platform absolute ceiling to the configured limit
  const safeMax = platform
    ? (PLATFORM_SAFE_LIMITS[platform as SupportedPlatform]?.maxDaily ?? 7)
    : 7;
  const cappedLimit = Math.min(configuredLimit, safeMax);

  if (!accountAddedAt) return Math.min(cappedLimit, 1); // no date = treat as day 0

  const ageMs = Date.now() - new Date(accountAddedAt).getTime();
  const ageDays = ageMs / (24 * 60 * 60 * 1000);

  // Stage 1: Days 0–3
  if (ageDays < 3)  return 1;
  // Stage 2: Days 4–7
  if (ageDays < 7)  return Math.min(cappedLimit, 2);
  // Stage 3: Days 8–14
  if (ageDays < 14) return Math.min(cappedLimit, Math.max(3, Math.ceil(cappedLimit * 0.30)));
  // Stage 4: Days 15–30
  if (ageDays < 30) return Math.min(cappedLimit, Math.max(5, Math.ceil(cappedLimit * 0.55)));
  // Stage 5: Days 31–60
  if (ageDays < 60) return Math.min(cappedLimit, Math.max(7, Math.ceil(cappedLimit * 0.75)));
  // Stage 6: Days 60+ — full configured limit (already capped at platform max)
  return cappedLimit;
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
 * Absolute safe ceilings per platform — enforced regardless of what users configure.
 * Based on observed ban thresholds. Never set configuredLimit above these.
 *
 * Platform research notes:
 *  Twitter:   10 comments/day max; stricter for accounts < 30 days old
 *  Facebook:  7 comments/day; aggressive spam detection, groups are stricter
 *  Reddit:    7 comments/day; karma checks + spam filters catch high-volume
 *  Quora:     5 answers/day; collapses answers from low-trust accounts quickly
 *  YouTube:   7 comments/day; comment spam filters are bot-fingerprint sensitive
 *  Pinterest: 7 comments/day; lower detection but still flags velocity spikes
 */
export const PLATFORM_SAFE_LIMITS = {
  twitter:   { maxDaily: 10, minCooldownMinutes: 45  },
  facebook:  { maxDaily: 7,  minCooldownMinutes: 60  },
  reddit:    { maxDaily: 7,  minCooldownMinutes: 60  },
  quora:     { maxDaily: 5,  minCooldownMinutes: 90  },
  youtube:   { maxDaily: 7,  minCooldownMinutes: 90  },
  pinterest: { maxDaily: 7,  minCooldownMinutes: 60  },
} as const;

export type SupportedPlatform = keyof typeof PLATFORM_SAFE_LIMITS;

/**
 * Cap a user-configured daily limit to the absolute platform safe ceiling.
 * Use this everywhere a user-supplied limit is consumed.
 */
export function capDailyLimit(platform: string, configuredLimit: number): number {
  const limits = PLATFORM_SAFE_LIMITS[platform as SupportedPlatform];
  if (!limits) return Math.min(configuredLimit, 5); // unknown platform: be conservative
  return Math.min(configuredLimit, limits.maxDaily);
}

/**
 * Enforce minimum cooldown per platform — users cannot go below this
 * even if they set a lower value in Settings.
 */
export function capCooldown(platform: string, configuredMinutes: number): number {
  const limits = PLATFORM_SAFE_LIMITS[platform as SupportedPlatform];
  const min = limits?.minCooldownMinutes ?? 60;
  return Math.max(configuredMinutes, min);
}

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
