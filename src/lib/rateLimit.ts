interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key);
  }
}, 60_000);

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export const RATE_LIMITS = {
  api: { maxRequests: 60, windowMs: 60_000 },           // 60 req/min for general API
  scrape: { maxRequests: 5, windowMs: 300_000 },         // 5 per 5 min for scraping
  post: { maxRequests: 20, windowMs: 60_000 },           // 20 posts/min
  auth: { maxRequests: 10, windowMs: 60_000 },           // 10 auth attempts/min
  billing: { maxRequests: 10, windowMs: 60_000 },        // 10 billing ops/min
} as const;

export type RateLimitTier = keyof typeof RATE_LIMITS;

/**
 * Check rate limit for a given key (usually userId or IP).
 * Returns null if allowed, or { error, retryAfter } if blocked.
 */
export function checkRateLimit(
  key: string,
  tier: RateLimitTier = 'api'
): { error: string; retryAfter: number } | null {
  const config = RATE_LIMITS[tier];
  const now = Date.now();
  const existing = store.get(key);

  if (!existing || existing.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + config.windowMs });
    return null;
  }

  existing.count++;
  if (existing.count > config.maxRequests) {
    const retryAfter = Math.ceil((existing.resetAt - now) / 1000);
    return {
      error: `Rate limit exceeded. Try again in ${retryAfter}s.`,
      retryAfter,
    };
  }

  return null;
}
