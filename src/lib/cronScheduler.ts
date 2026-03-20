/**
 * Queue-based cron scheduler.
 * Replaces direct process spawning with BullMQ job enqueuing.
 * The worker picks up cron-run jobs and executes the platform scripts.
 */
import { connectDB } from './mongodb';
import Settings from '@/models/Settings';
import { isWithinSchedule } from './schedule';
import { enqueueJob } from './queue';

const ALL_PLATFORMS = ['twitter', 'reddit', 'facebook', 'quora', 'youtube', 'pinterest'] as const;

interface ScheduledTask {
  userId: string;
  platform: string;
  jobId?: string;
}

/**
 * Schedule cron jobs for all eligible users via BullMQ queue.
 * Returns summary of what was enqueued.
 */
export async function scheduleCronJobs(options?: {
  platform?: string;
  mode?: string;
}): Promise<{ enqueued: ScheduledTask[]; skipped: number; errors: string[] }> {
  await connectDB();

  const allSettings = await Settings.find({
    userId: { $exists: true, $nin: [null, ''] },
    autoPostingPaused: { $ne: true },
  }).lean();

  const enqueued: ScheduledTask[] = [];
  const errors: string[] = [];
  let skipped = 0;

  for (const settings of allSettings) {
    const userId = settings.userId as string;

    // Check schedule
    const userTz = (settings.cronTimezone as string) || '';
    const userStartHour = (settings.cronStartHour as number) ?? 9;
    const userEndHour = (settings.cronEndHour as number) ?? 18;
    const userDays = (settings.cronDays as number[]) ?? [0, 1, 2, 3, 4, 5, 6];

    if (userTz) {
      const inSchedule = isWithinSchedule({
        timezone: userTz,
        days: userDays,
        startHour: userStartHour,
        endHour: userEndHour,
      });
      if (!inSchedule) { skipped++; continue; }
    }

    // Check interval
    const intervalMinutes = (settings.cronIntervalMinutes as number) || 15;
    const lastRun = settings.lastCronRunAt as Date | null;
    if (lastRun) {
      const minSinceLastRun = (Date.now() - new Date(lastRun).getTime()) / 60000;
      if (minSinceLastRun < intervalMinutes - 1) { skipped++; continue; }
    }

    const accounts = (settings.socialAccounts as Array<{ platform: string; profileDir?: string; active?: boolean }>) || [];
    const connectedPlatforms = new Set(
      accounts.filter(a => a.active !== false && a.profileDir).map(a => a.platform)
    );

    const platforms = options?.platform
      ? (connectedPlatforms.has(options.platform) ? [options.platform] : [])
      : ALL_PLATFORMS.filter(p => connectedPlatforms.has(p));

    for (let i = 0; i < platforms.length; i++) {
      const platform = platforms[i];
      try {
        // Stagger jobs: 2s between platforms for the same user
        const delay = i * 2000;
        const jobId = await enqueueJob({
          type: 'cron-run',
          userId,
          platform,
          mode: options?.mode || 'full',
        }, delay > 0 ? { delay } : undefined);
        enqueued.push({ userId, platform, jobId });
      } catch (err) {
        errors.push(`${userId}/${platform}: ${(err as Error).message}`);
      }
    }

    // Only update lastCronRunAt if at least one job was successfully enqueued
    if (enqueued.some(e => e.userId === userId)) {
      await Settings.updateOne({ userId }, { $set: { lastCronRunAt: new Date() } });
    }
  }

  return { enqueued, skipped, errors };
}
