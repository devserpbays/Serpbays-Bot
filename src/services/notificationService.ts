/**
 * Notification data access layer.
 * All Notification DB operations go through here.
 */
import { connectDB } from '@/lib/mongodb';
import Notification from '@/models/Notification';

export interface NotificationDoc {
  _id: string;
  userId: string;
  type: 'cookie_expired' | 'cookie_expiring_soon' | 'account_removed' | 'not_connected' | 'info';
  platform: string;
  accountId?: string;
  title: string;
  message: string;
  read: boolean;
  actionUrl: string;
  actionLabel: string;
  createdAt: Date;
}

// ── Reads ──

export async function getNotifications(
  userId: string,
  opts: { limit?: number; unreadOnly?: boolean } = {},
): Promise<NotificationDoc[]> {
  await connectDB();
  const filter: Record<string, unknown> = { userId };
  if (opts.unreadOnly) filter.read = false;
  return Notification.find(filter)
    .sort({ createdAt: -1 })
    .limit(opts.limit || 50)
    .lean() as Promise<NotificationDoc[]>;
}

export async function hasRecentNotification(
  userId: string,
  type: string,
  platform: string,
  withinMs: number,
): Promise<boolean> {
  await connectDB();
  const since = new Date(Date.now() - withinMs);
  const existing = await Notification.findOne({
    userId,
    type,
    platform,
    createdAt: { $gte: since },
  }).lean();
  return !!existing;
}

// ── Writes ──

export async function createNotification(data: {
  userId: string;
  type: string;
  platform?: string;
  title: string;
  message: string;
  actionUrl?: string;
  actionLabel?: string;
}): Promise<NotificationDoc> {
  await connectDB();
  const doc = await Notification.create(data);
  return doc.toObject() as NotificationDoc;
}

export async function markAllRead(userId: string): Promise<void> {
  await connectDB();
  await Notification.updateMany(
    { userId, read: false },
    { $set: { read: true } },
  );
}

export async function markRead(id: string): Promise<void> {
  await connectDB();
  await Notification.findByIdAndUpdate(id, { $set: { read: true } });
}
