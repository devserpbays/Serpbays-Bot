/**
 * Periodic cleanup — sets TTL expiry on terminal posts.
 * Can be run as a BullMQ repeatable job or manually.
 */
import { connectDB } from './mongodb';

const TERMINAL_STATUSES = ['posted', 'rejected'];
const TTL_DAYS = 90; // Auto-delete posted/rejected posts after 90 days

/**
 * Mark terminal posts for TTL deletion.
 * MongoDB's TTL index on ttlExpireAt handles the actual deletion.
 */
export async function runCleanup(): Promise<{ marked: number }> {
  await connectDB();
  const Post = (await import('@/models/Post')).default;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - TTL_DAYS);
  const ttlDate = new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000);

  // Set ttlExpireAt on terminal posts that don't have it yet
  const result = await Post.updateMany(
    {
      status: { $in: TERMINAL_STATUSES },
      ttlExpireAt: null,
      updatedAt: { $lt: cutoff },
    },
    { $set: { ttlExpireAt: ttlDate } },
  );

  return { marked: result.modifiedCount };
}
