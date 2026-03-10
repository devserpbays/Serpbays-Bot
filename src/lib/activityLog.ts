/**
 * Per-user activity logger for cron scripts.
 * Writes structured log entries to MongoDB so users can see their own logs.
 */

import { connectDB } from './mongodb';
import ActivityLog from '../models/ActivityLog';

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
