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
  const autoPaused = score < AUTO_PAUSE_THRESHOLD ? false : (account.autoPaused ?? false);
  return {
    $set: {
      totalPosts:   updated.totalPosts,
      errorCount:   0,
      backoffUntil: null,
      lastPostedAt: updated.lastPostedAt,
      healthScore:  score,
      autoPaused,
    },
    $unset: {},
  };
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
