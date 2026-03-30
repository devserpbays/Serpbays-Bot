/**
 * Per-user activity logger for cron scripts.
 * Writes structured log entries to MongoDB so users can see their own logs.
 */

import { connectDB } from './mongodb';
import ActivityLog from '../models/ActivityLog';
import Notification from '../models/Notification';
import { publishNotification } from './redis';

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
    // Build specific reason for the notification
    let reason = message || `Your ${platformName} session has expired.`;
    if (message?.includes('automation') || message?.includes('blocked')) {
      reason = `${platformName} detected automated activity. The bot has been paused to protect your account.`;
    } else if (message?.includes('not logged') || message?.includes('session expired')) {
      reason = `${platformName} cookies expired — the bot cannot log in. Please re-upload fresh cookies.`;
    } else if (message?.includes('shadow')) {
      reason = `${platformName} shadow-removed a comment. The bot is backing off to protect your account.`;
    }
    const notifData = {
      userId,
      type: 'cookie_expired',
      platform,
      title: `${platformName} — Action Required`,
      message: reason + ' Reconnect from the Accounts page to resume.',
      actionUrl: '/dashboard/accounts',
      actionLabel: 'Reconnect',
    };
    const doc = await Notification.create(notifData);
    await publishNotification(userId, { ...notifData, _id: doc._id, ts: Date.now() });
  } catch {
    console.error(`[activityLog] Failed to create auth notification for ${platform}`);
  }
}

/**
 * Notify user that a platform is enabled but has no connected account.
 * Deduped: fires at most once per platform per 7 days to avoid repeated nags.
 */
export async function notifyNotConnected(
  userId: string,
  platform: string,
): Promise<void> {
  try {
    await connectDB();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const existing = await Notification.findOne({
      userId,
      type: 'not_connected',
      platform,
      createdAt: { $gte: sevenDaysAgo },
    });
    if (existing) return;

    const platformName = platform.charAt(0).toUpperCase() + platform.slice(1);
    const notifData = {
      userId,
      type: 'not_connected',
      platform,
      title: `${platformName} not connected`,
      message: `${platformName} is enabled but no account has been connected. Upload cookies from the Accounts page to activate it.`,
      actionUrl: '/dashboard/accounts',
      actionLabel: 'Connect',
    };
    const doc = await Notification.create(notifData);
    await publishNotification(userId, { ...notifData, _id: doc._id, ts: Date.now() });
  } catch {
    console.error(`[activityLog] Failed to create not_connected notification for ${platform}`);
  }
}
