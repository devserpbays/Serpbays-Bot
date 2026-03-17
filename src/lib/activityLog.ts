/**
 * Per-user activity logger for cron scripts.
 * Writes structured log entries to MongoDB so users can see their own logs.
 */

import { connectDB } from './mongodb';
import ActivityLog from '../models/ActivityLog';
import Notification from '../models/Notification';

export type LogLevel = 'info' | 'warn' | 'error' | 'success';

export async function logActivity(
  userId: string,
  platform: string,
  level: LogLevel,
  action: string,
  message: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  try {
    await connectDB();
    await ActivityLog.create({ userId, platform, level, action, message, meta: meta || {} });
  } catch {
    // Never let logging failures break cron scripts
    console.error(`[activityLog] Failed to write log: ${message}`);
  }
}

/**
 * Create a notification for auth/cookie errors (deduped: max 1 per platform per 24h).
 * Call this alongside logActivity('auth_error') in cron scripts.
 */
export async function notifyAuthError(
  userId: string,
  platform: string,
  message?: string,
): Promise<void> {
  try {
    await connectDB();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const existing = await Notification.findOne({
      userId,
      type: 'cookie_expired',
      platform,
      createdAt: { $gte: oneDayAgo },
    });
    if (existing) return;

    const platformName = platform.charAt(0).toUpperCase() + platform.slice(1);
    await Notification.create({
      userId,
      type: 'cookie_expired',
      platform,
      title: `${platformName} cookies expired`,
      message: message || `Your ${platformName} session has expired. Please reconnect from the Accounts page.`,
      actionUrl: '/dashboard/accounts',
      actionLabel: 'Reconnect',
    });
  } catch {
    console.error(`[activityLog] Failed to create auth notification for ${platform}`);
  }
}
