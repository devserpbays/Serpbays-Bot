/**
 * BullMQ job queue for browser tasks.
 * Moves Playwright work off the Next.js process into dedicated workers.
 */
import { Queue } from 'bullmq';
import IORedis from 'bullmq/node_modules/ioredis';
import { REDIS_URL, getRedis } from './redis';

// Per-user fairness: max concurrent + queued jobs per user (by plan)
const PLAN_JOB_LIMITS: Record<string, number> = {
  free: 4,
  pro: 8,
  business: 16,
};

// BullMQ priority: lower number = higher priority
const PLAN_PRIORITY: Record<string, number> = {
  business: 1,
  pro: 5,
  free: 10,
};

// ── Job data types ─────────────────────────────────────────────
export interface ValidateCookiesJob {
  type: 'validate-cookies';
  userId: string;
  platform: string;
  cookies: unknown[];
  meta?: Record<string, unknown>;
}

export interface ScrapeJob {
  type: 'scrape';
  userId: string;
  platforms?: string[];
}

export interface PostReplyJob {
  type: 'post-reply';
  userId: string;
  platform: string;
  postId: string;
}

export interface CronRunJob {
  type: 'cron-run';
  userId: string;
  platform: string;
  mode?: string;
}

export interface EvaluatePostsJob {
  type: 'evaluate-posts';
  userId: string;
  /** Optional: only evaluate posts from this scrape batch */
  scrapeJobId?: string;
}

export type BrowserJobData =
  | ValidateCookiesJob
  | ScrapeJob
  | PostReplyJob
  | CronRunJob
  | EvaluatePostsJob;

// ── Queue singleton ────────────────────────────────────────────
let _queue: Queue | null = null;

export function getBrowserQueue(): Queue {
  if (!_queue) {
    _queue = new Queue('browser-tasks', {
      connection: new IORedis(REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: false }),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 200, age: 86400 },  // keep 200 or 24h
        removeOnFail: { count: 100, age: 172800 },    // keep 100 or 48h
      },
    });
  }
  return _queue;
}

// ── Per-user fairness check ─────────────────────────────────────

async function getUserPlanTier(userId: string): Promise<string> {
  try {
    const { getUserPlan } = await import('./subscription');
    const plan = await getUserPlan(userId);
    return plan.plan || 'free';
  } catch {
    return 'free';
  }
}

async function checkUserFairness(userId: string, planTier?: string): Promise<void> {
  try {
    const redis = getRedis();
    const tier = planTier || 'free';
    const maxJobs = PLAN_JOB_LIMITS[tier] || PLAN_JOB_LIMITS.free;
    const count = await redis.get(`user-jobs:${userId}`);
    if (count && parseInt(count) >= maxJobs) {
      throw new Error('Too many jobs queued. Please wait for current tasks to complete.');
    }
    // Increment with TTL (auto-cleanup if worker crashes)
    await redis.incr(`user-jobs:${userId}`);
    await redis.expire(`user-jobs:${userId}`, 600); // 10 min safety
  } catch (err) {
    if ((err as Error).message.includes('Too many')) throw err;
    // Redis down — allow the request
  }
}

/** Decrement user job counter (called by worker on completion). */
export async function releaseUserSlot(userId: string): Promise<void> {
  try {
    const redis = getRedis();
    const val = await redis.decr(`user-jobs:${userId}`);
    if (val <= 0) await redis.del(`user-jobs:${userId}`);
  } catch { /* best effort */ }
}

// ── Enqueue helpers ────────────────────────────────────────────

/** Enqueue a job and return immediately (fire-and-forget). */
export async function enqueueJob(
  jobData: BrowserJobData,
  opts?: { priority?: number; delay?: number; removeOnComplete?: boolean | { count: number; age: number } },
): Promise<string> {
  const planTier = await getUserPlanTier(jobData.userId);
  await checkUserFairness(jobData.userId, planTier);
  const queue = getBrowserQueue();
  // Cookie validation gets highest priority (user-facing, interactive wait)
  // Other jobs get plan-based priority
  const basePriority = jobData.type === 'validate-cookies'
    ? 1
    : (PLAN_PRIORITY[planTier] ?? PLAN_PRIORITY.free);
  const jobOpts = {
    ...opts,
    priority: opts?.priority ?? basePriority,
  };
  const job = await queue.add(jobData.type, jobData, jobOpts);
  return job.id!;
}

/** Get a job's current state and result. */
export async function getJobStatus(jobId: string) {
  const queue = getBrowserQueue();
  const job = await queue.getJob(jobId);
  if (!job) return null;
  const state = await job.getState();
  return {
    id: job.id,
    state,
    data: job.data,
    result: job.returnvalue,
    failedReason: job.failedReason,
    progress: job.progress,
    timestamp: job.timestamp,
    finishedOn: job.finishedOn,
  };
}

/**
 * Stop all cron-run jobs for a specific user+platform.
 * Removes waiting jobs and discards active ones.
 * Returns the number of jobs that were stopped.
 */
export async function stopCronJobs(userId: string, platform: string): Promise<number> {
  const queue = getBrowserQueue();
  let stopped = 0;

  try {
    // Get waiting and active jobs
    const [waiting, active] = await Promise.all([
      queue.getJobs(['waiting', 'delayed']),
      queue.getJobs(['active']),
    ]);

    // Remove matching waiting/delayed jobs
    for (const job of waiting) {
      if (
        job.data?.type === 'cron-run' &&
        job.data?.userId === userId &&
        job.data?.platform === platform
      ) {
        await job.remove().catch(() => { });
        await releaseUserSlot(userId);
        stopped++;
      }
    }

    // For active jobs, we can't directly stop them — set the abort signal
    // (the worker checks this and kills the child process)
    for (const job of active) {
      if (
        job.data?.type === 'cron-run' &&
        job.data?.userId === userId &&
        job.data?.platform === platform
      ) {
        // Mark as failed so BullMQ considers it done
        try {
          await job.moveToFailed(new Error('Stopped by user'), '0', true);
          await releaseUserSlot(userId);
          stopped++;
        } catch {
          // Job might have completed between our check and action
        }
      }
    }
  } catch (err) {
    console.error(`[queue] Error stopping cron jobs for ${userId}/${platform}:`, (err as Error).message);
  }

  return stopped;
}
