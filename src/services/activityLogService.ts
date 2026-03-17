/**
 * ActivityLog data access layer.
 * All ActivityLog DB operations go through here.
 */
import { connectDB } from '@/lib/mongodb';
import ActivityLog from '@/models/ActivityLog';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LogFilter = Record<string, any>;

export interface ActivityLogDoc {
  _id: string;
  userId: string;
  platform: string;
  level: 'info' | 'warn' | 'error' | 'success';
  action: string;
  message: string;
  meta?: Record<string, unknown>;
  createdAt: Date;
}

// ── Reads ──

export async function getLogs(
  filter: LogFilter,
  opts: { limit?: number; sort?: Record<string, 1 | -1> } = {},
): Promise<ActivityLogDoc[]> {
  await connectDB();
  return ActivityLog.find(filter)
    .sort(opts.sort || { createdAt: -1 })
    .limit(opts.limit || 100)
    .lean() as Promise<ActivityLogDoc[]>;
}

export async function getRecentAuthErrors(
  userId: string,
  platform: string,
  sinceMs: number,
  limit = 5,
): Promise<ActivityLogDoc[]> {
  await connectDB();
  const since = new Date(Date.now() - sinceMs);
  return ActivityLog.find({
    userId,
    platform,
    action: 'auth_error',
    createdAt: { $gte: since },
  }).limit(limit).lean() as Promise<ActivityLogDoc[]>;
}

// ── Writes ──

export async function logActivity(data: {
  userId: string;
  platform: string;
  level: string;
  action: string;
  message: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  await connectDB();
  await ActivityLog.create(data);
}
