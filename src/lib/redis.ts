/**
 * Redis client singleton for rate limiting, caching, etc.
 * Uses BullMQ's bundled ioredis to avoid version conflicts.
 */
import IORedis from 'bullmq/node_modules/ioredis';

export const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

declare global {
  // eslint-disable-next-line no-var
  var _redisClient: InstanceType<typeof IORedis> | undefined;
}

/** Shared singleton for rate limiting, caching, etc. */
export function getRedis(): InstanceType<typeof IORedis> {
  if (!global._redisClient) {
    global._redisClient = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
    });
    global._redisClient.connect().catch(() => {});
  }
  return global._redisClient;
}

declare global {
  // eslint-disable-next-line no-var
  var _redisSubscriber: InstanceType<typeof IORedis> | undefined;
}

/** Separate subscriber connection (ioredis can't mix subscribe + commands on one conn). */
export function getRedisSubscriber(): InstanceType<typeof IORedis> {
  if (!global._redisSubscriber) {
    global._redisSubscriber = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
    });
    global._redisSubscriber.connect().catch(() => {});
  }
  return global._redisSubscriber;
}

/** Publish a notification event so SSE clients in any process receive it. */
export async function publishNotification(userId: string, payload: object): Promise<void> {
  try {
    const redis = getRedis();
    await redis.publish(`notif:${userId}`, JSON.stringify(payload));
  } catch { /* Redis down — skip */ }
}
