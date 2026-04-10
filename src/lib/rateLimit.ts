import { getRedis } from './redis';

export const RATE_LIMITS = {
  api: { maxRequests: 60, windowSec: 60 },           // 60 req/min for general API
  scrape: { maxRequests: 5, windowSec: 300 },         // 5 per 5 min for scraping
  post: { maxRequests: 20, windowSec: 60 },           // 20 posts/min
  auth: { maxRequests: 10, windowSec: 60 },           // 10 auth attempts/min
  billing: { maxRequests: 10, windowSec: 60 },        // 10 billing ops/min
  cookieUpload: { maxRequests: 8, windowSec: 900 },   // 8 uploads per 15 min (generous for re-uploads, blocks brute force)
} as const;

export type RateLimitTier = keyof typeof RATE_LIMITS;

/**
 * Check rate limit for a given key (usually userId or IP).
 * Uses Redis INCR + EXPIRE for cross-process atomicity.
 * Returns null if allowed, or { error, retryAfter } if blocked.
 * Fails open (allows request) if Redis is unavailable.
 */
export async function checkRateLimit(
  key: string,
  tier: RateLimitTier = 'api'
): Promise<{ error: string; retryAfter: number } | null> {
  const config = RATE_LIMITS[tier];
  const redisKey = `rl:${tier}:${key}`;

  try {
    const redis = getRedis();
    const count = await redis.incr(redisKey);

    // Set TTL on first request in window
    if (count === 1) {
      await redis.expire(redisKey, config.windowSec);
    }

    if (count > config.maxRequests) {
      const ttl = await redis.ttl(redisKey);
      // TTL returns -1 (no expiry set) or -2 (key gone) — treat as expired window, reset
      if (ttl < 0) {
        await redis.expire(redisKey, config.windowSec);
      }
      const retryAfter = ttl > 0 ? ttl : config.windowSec;
      return {
        error: `Rate limit exceeded. Try again in ${retryAfter}s.`,
        retryAfter,
      };
    }

    return null;
  } catch {
    // Fail open — allow the request if Redis is down
    return null;
  }
}
