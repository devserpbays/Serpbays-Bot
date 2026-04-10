/**
 * accountHealth.ts — Per-account health scoring for social media accounts.
 *
 * Health score (0–100) reflects how "safe" an account is to keep posting.
 * Low scores trigger auto-pause to prevent bans.
 *
 * Score factors:
 *   - Error rate (errors / total posts)
 *   - Current backoff depth (1h / 4h / 24h)
 *   - Account age (newer accounts are more fragile)
 *   - Recent activity (dormant accounts need gentle re-warm)
 */

import { connectDB } from './mongodb';

export const AUTO_PAUSE_THRESHOLD = 25; // pause if score drops below this
export const RESUME_THRESHOLD     = 50; // resume only when score recovers above this

export interface HealthScore {
  score: number;          // 0–100
  status: 'healthy' | 'warning' | 'critical' | 'paused';
  reasons: string[];      // human-readable breakdown
}

/**
 * Compute a health score for an account based on its tracked metrics.
 * Call this after every successful or failed post, then persist the result.
 */
export function computeHealthScore(account: {
  totalPosts?: number;
  totalErrors?: number;
  errorCount?: number;
  backoffUntil?: Date | null;
  createdAt?: Date;
  lastPostedAt?: Date | null;
  autoPaused?: boolean;
}): HealthScore {
  const reasons: string[] = [];
  let score = 100;

  const totalPosts  = account.totalPosts  ?? 0;
  const totalErrors = account.totalErrors ?? 0;
  const errorCount  = account.errorCount  ?? 0;

  // 1. Lifetime error rate (weight: up to -50 pts)
  if (totalPosts > 0) {
    const errorRate = totalErrors / totalPosts;
    if (errorRate > 0.5) {
      score -= 50;
      reasons.push(`High error rate: ${Math.round(errorRate * 100)}% of posts fail`);
    } else if (errorRate > 0.3) {
      score -= 30;
      reasons.push(`Elevated error rate: ${Math.round(errorRate * 100)}% of posts fail`);
    } else if (errorRate > 0.15) {
      score -= 15;
      reasons.push(`Some errors: ${Math.round(errorRate * 100)}% of posts fail`);
    }
  }

  // 2. Current backoff depth (weight: up to -35 pts)
  if (account.backoffUntil && account.backoffUntil > new Date()) {
    const remainingMs = account.backoffUntil.getTime() - Date.now();
    const remainingHrs = remainingMs / (1000 * 60 * 60);
    if (errorCount >= 3 || remainingHrs >= 20) {
      score -= 35;
      reasons.push(`Account in 24h cooldown (${errorCount} consecutive errors)`);
    } else if (errorCount === 2 || remainingHrs >= 3) {
      score -= 20;
      reasons.push(`Account in 4h cooldown (${errorCount} consecutive errors)`);
    } else {
      score -= 10;
      reasons.push(`Account in 1h cooldown`);
    }
  }

  // 3. Account age (newer accounts are more vulnerable — weight: up to -15 pts)
  if (account.createdAt) {
    const daysSince = Math.floor((Date.now() - new Date(account.createdAt).getTime()) / 86400000);
    if (daysSince < 3) {
      score -= 15;
      reasons.push(`Brand new account (day ${daysSince + 1}) — very fragile`);
    } else if (daysSince < 7) {
      score -= 8;
      reasons.push(`New account (day ${daysSince + 1}) — warming up`);
    }
  }

  // 4. Dormancy penalty — if last post was > 30 days ago, score dips (cold re-start risk)
  if (account.lastPostedAt) {
    const daysSinceLast = Math.floor((Date.now() - new Date(account.lastPostedAt).getTime()) / 86400000);
    if (daysSinceLast > 30) {
      score -= 10;
      reasons.push(`Account dormant for ${daysSinceLast} days — re-warm recommended`);
    }
  }

  // 5. Positive track — successful posting history raises the floor
  // This means a recovered account can earn its way back above the damage floor.
  if (totalPosts >= 50) {
    score = Math.min(100, score + 10);
    if (score < 100) reasons.push(`Established account (${totalPosts} posts) — +10 trust bonus`);
  } else if (totalPosts >= 20) {
    score = Math.min(100, score + 5);
    if (score < 100) reasons.push(`Growing account (${totalPosts} posts) — +5 trust bonus`);
  } else if (totalPosts >= 5) {
    score = Math.min(100, score + 2);
  }

  score = Math.max(0, Math.min(100, score));

  let status: HealthScore['status'];
  if (account.autoPaused) {
    status = 'paused';
  } else if (score < AUTO_PAUSE_THRESHOLD) {
    status = 'critical';
  } else if (score < 50) {
    status = 'warning';
  } else {
    status = 'healthy';
  }

  return { score, status, reasons };
}

/**
 * Activity profile based on account health score.
 *
 * Health 80–100 → Healthy:   full daily limit, 1–3 reacts/session
 * Health 50–79  → Cautious:  scaled-down limit (20–80%), 2–6 reacts/session
 * Health  0–49  → Recovery:  0 comments, 4–12 reacts, triggers 3–5 day browse-only
 *
 * The recovery period is set once (checked via browseOnlyUntil) so the cron
 * doesn't reset the timer on every run.
 */
export interface ActivityProfile {
  /** Multiplier applied to the configured daily limit (0 = no commenting) */
  commentMultiplier: number;
  /** Min reacts/upvotes per session */
  minReacts: number;
  /** Max reacts/upvotes per session */
  maxReacts: number;
  /** True when health < 50 and we should start a browse-only recovery window */
  needsRecovery: boolean;
  /** How many days the recovery window should last (randomised 3–5) */
  recoveryDays: number;
  /** Human-readable label for logs */
  label: string;
}

export function getActivityProfile(healthScore: number): ActivityProfile {
  const score = Math.max(0, Math.min(100, healthScore));

  // Below 50 → recovery: no commenting, heavy upvoting/browsing
  if (score < 50) {
    const recoveryDays = 3 + Math.floor(Math.random() * 3); // 3, 4, or 5
    const minReacts = score < 25 ? 6 : 4;
    const maxReacts = score < 25 ? 12 : 8;
    return { commentMultiplier: 0, minReacts, maxReacts, needsRecovery: true, recoveryDays, label: `recovery (${score}/100)` };
  }

  // 50–100: smooth gradient
  // At 50:  commentMultiplier=0.20, reacts 4–8
  // At 70:  commentMultiplier=0.52, reacts 3–6
  // At 100: commentMultiplier=1.00, reacts 1–3
  const t = (score - 50) / 50; // 0→1 as score 50→100
  const commentMultiplier = Math.round((0.2 + t * 0.8) * 100) / 100;
  const maxReacts = Math.max(3, Math.round(8 - t * 5));
  const minReacts = Math.max(1, Math.round(maxReacts * 0.4));
  const label = score >= 80 ? 'healthy' : 'cautious';

  return { commentMultiplier, minReacts, maxReacts, needsRecovery: false, recoveryDays: 0, label };
}

/**
 * Build the MongoDB $set patch to apply after a successful post.
 * Increments totalPosts, resets errorCount/backoff, updates lastPostedAt,
 * and recomputes healthScore.
 */
export function buildSuccessPatch(account: Parameters<typeof computeHealthScore>[0] & { _id?: unknown }) {
  const updated = {
    ...account,
    totalPosts:  (account.totalPosts ?? 0) + 1,
    errorCount:  0,
    backoffUntil: null,
    lastPostedAt: new Date(),
  };
  const { score } = computeHealthScore(updated);
  // After a successful post, recompute pause state from the new score.
  // (Same convention as buildFailurePatch.) A successful post on a healthy-score
  // account should always clear a stale autoPaused flag — otherwise the account
  // can get stuck paused forever once any code path sets the flag.
  const autoPaused = score < AUTO_PAUSE_THRESHOLD;
  return {
    $set: {
      totalPosts:          updated.totalPosts,
      errorCount:          0,
      backoffUntil:        null,
      lastPostedAt:        updated.lastPostedAt,
      healthScore:         score,
      autoPaused,
      automationBlockCount: 0,
      browseOnlyUntil:     null,
    },
    $unset: {},
  };
}

/**
 * Tiered response to an automation-detection event.
 *
 * Keeps a rolling 7-day block counter per account.  Each block escalates:
 *   Block 1  → 2 h backoff
 *   Block 2  → 6 h backoff
 *   Block 3  → browse-only 24 h  (scrape/engage OK, no posting)
 *   Block 4  → 12 h backoff
 *   Block 5  → 24 h backoff
 *   Block 6  → browse-only 24 h
 *   Block 7  → 48 h backoff
 *   Block 8  → 48 h backoff
 *   Block 9  → browse-only 24 h
 *   Block 10+ → hard pause (requires user action to resume)
 *
 * On a successful post (buildSuccessPatch) the counter resets to 0.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handleAutomationBlock(
  userId: string,
  platform: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  AccountStateModel: any,
): Promise<{ action: 'backoff' | 'browse_only' | 'hard_pause'; hours: number; blockCount: number }> {
  await connectDB();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const doc = await AccountStateModel.findOne({ userId, platform }).lean() as Record<string, unknown> | null;
  const lastBlockAt = doc?.automationBlockedAt ? new Date(doc.automationBlockedAt as string) : null;
  const inWindow = !!(lastBlockAt && lastBlockAt >= sevenDaysAgo);
  const prevCount = inWindow ? ((doc?.automationBlockCount as number) ?? 0) : 0;
  const blockCount = prevCount + 1;

  // Backoff hours by block index (0 = browse_only or hard_pause, handled below)
  const BACKOFF_HOURS = [0, 2, 6, 0, 12, 24, 0, 48, 48, 0];

  let action: 'backoff' | 'browse_only' | 'hard_pause';
  let hours = 0;

  if (blockCount >= 10) {
    action = 'hard_pause';
  } else if (blockCount === 3 || blockCount === 6 || blockCount === 9) {
    action = 'browse_only';
    hours = 24;
  } else {
    action = 'backoff';
    hours = BACKOFF_HOURS[Math.min(blockCount, 9)] || 2;
  }

  const update: Record<string, unknown> = {
    automationBlockCount: blockCount,
    automationBlockedAt:  inWindow ? doc!.automationBlockedAt : now,
    lastErrorAt:          now,
  };

  if (action === 'hard_pause') {
    update.autoPaused = true;
    update.autoPausedReason = `Automation detected ${blockCount} times in 7 days — resume from the Accounts page after refreshing cookies`;
  } else if (action === 'browse_only') {
    update.browseOnlyUntil = new Date(now.getTime() + hours * 60 * 60 * 1000);
  } else {
    update.backoffUntil = new Date(now.getTime() + hours * 60 * 60 * 1000);
  }

  await AccountStateModel.findOneAndUpdate(
    { userId, platform },
    { $set: update },
    { upsert: true },
  );

  return { action, hours, blockCount };
}

/**
 * Build the MongoDB $set patch to apply after a failed post.
 * Increments totalErrors + errorCount, sets backoffUntil, recomputes healthScore.
 * Auto-pauses account if score drops below threshold.
 */
export function buildFailurePatch(
  account: Parameters<typeof computeHealthScore>[0],
  backoffUntil: Date
) {
  const newErrorCount = (account.errorCount ?? 0) + 1;
  const updated = {
    ...account,
    totalErrors:  (account.totalErrors ?? 0) + 1,
    errorCount:   newErrorCount,
    backoffUntil,
    lastErrorAt:  new Date(),
  };
  const { score } = computeHealthScore(updated);
  const autoPaused = score < AUTO_PAUSE_THRESHOLD;
  return {
    $set: {
      totalErrors:  updated.totalErrors,
      errorCount:   newErrorCount,
      backoffUntil,
      lastErrorAt:  updated.lastErrorAt,
      healthScore:  score,
      autoPaused,
    },
  };
}
