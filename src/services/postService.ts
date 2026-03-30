/**
 * Post data access layer.
 * All Post DB operations go through here.
 * To switch DB engines, only this file needs to change.
 */
import { connectDB } from '@/lib/mongodb';
import Post from '@/models/Post';
import ActivityLog from '@/models/ActivityLog';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MongoFilter = Record<string, any>;
type SortOrder = 1 | -1;

// ── Types ──

export interface PostDoc {
  _id: string;
  userId: string;
  url: string;
  platform: string;
  author: string;
  content: string;
  scrapedAt: Date;
  status: 'new' | 'evaluating' | 'evaluated' | 'approved' | 'rejected' | 'posted';
  aiReply?: string;
  aiRelevanceScore?: number;
  aiTone?: string;
  aiReasoning?: string;
  keywordsMatched?: string[];
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  bookmarkCount: number;
  viewCount: number;
  likedByBot: boolean;
  editedReply?: string;
  replyUrl?: string;
  evaluatedAt?: Date;
  approvedAt?: Date;
  postedAt?: Date;
  postedByAccount?: string;
  postAttempts: number;
  monitorUntil?: Date;
  followUpStatus?: string;
  followUpText?: string;
  followUpPostedAt?: Date;
  botReplyEngagement?: { likes: number; replies: number; lastChecked?: Date };
  ttlExpireAt?: Date;
}

export interface PostFilter {
  userId?: string;
  platform?: string;
  status?: string | string[];
  postedAt?: { $gte?: Date; $lte?: Date };
  monitorUntil?: { $gte?: Date };
  likedByBot?: boolean;
}

export interface PostSort {
  [key: string]: SortOrder;
}

// ── Reads ──

export async function getPostById(id: string): Promise<PostDoc | null> {
  await connectDB();
  return Post.findById(id).lean() as Promise<PostDoc | null>;
}

export async function getPostByIdForUser(id: string, userId: string): Promise<PostDoc | null> {
  await connectDB();
  return Post.findOne({ _id: id, userId }).lean() as Promise<PostDoc | null>;
}

export async function getPostByUrl(userId: string, url: string): Promise<PostDoc | null> {
  await connectDB();
  return Post.findOne({ userId, url }).lean() as Promise<PostDoc | null>;
}

export async function getPosts(
  filter: PostFilter,
  opts: { sort?: PostSort; skip?: number; limit?: number } = {},
): Promise<PostDoc[]> {
  await connectDB();
  let query = Post.find(filter as MongoFilter);
  if (opts.sort) query = query.sort(opts.sort);
  if (opts.skip) query = query.skip(opts.skip);
  if (opts.limit) query = query.limit(opts.limit);
  return query.lean() as Promise<PostDoc[]>;
}

export async function countPosts(filter: PostFilter): Promise<number> {
  await connectDB();
  return Post.countDocuments(filter as MongoFilter);
}

export async function getNewPosts(userId: string, limit = 20): Promise<PostDoc[]> {
  await connectDB();
  return Post.find({ userId, status: 'new' }).limit(limit).lean() as Promise<PostDoc[]>;
}

export async function getPostCandidate(
  userId: string,
  platform: string,
  status: string = 'approved',
): Promise<PostDoc | null> {
  await connectDB();
  return Post.findOne({
    userId,
    platform,
    status,
    likedByBot: false,
  }).lean() as Promise<PostDoc | null>;
}

export async function getDailyPostCount(
  userId: string,
  platform: string,
): Promise<number> {
  await connectDB();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  return Post.countDocuments({
    userId,
    platform,
    status: 'posted',
    postedAt: { $gte: todayStart },
  });
}

export async function getPostStats(userId: string): Promise<{
  total: number;
  byStatus: Record<string, number>;
  byPlatform: Record<string, number>;
  postedByPlatform: Record<string, number>;
  likedByPlatform: Record<string, number>;
  evaluatedByPlatform: Record<string, number>;
  approvedByPlatform: Record<string, number>;
  totalLikes: number;
  postedByAccount: Record<string, number>;
  likedByAccount: Record<string, number>;
}> {
  await connectDB();
  const [rows, likedRows, postedAccRows, likedAccRows] = await Promise.all([
    Post.aggregate<{ _id: { platform: string; status: string }; count: number }>([
      { $match: { userId } },
      { $group: { _id: { platform: '$platform', status: '$status' }, count: { $sum: 1 } } },
    ]),
    Post.aggregate<{ _id: string; count: number }>([
      { $match: { userId, likedByBot: true } },
      { $group: { _id: '$platform', count: { $sum: 1 } } },
    ]),
    Post.aggregate<{ _id: string; count: number }>([
      { $match: { userId, status: 'posted', postedByAccount: { $exists: true, $ne: '' } } },
      { $group: { _id: '$postedByAccount', count: { $sum: 1 } } },
    ]),
    Post.aggregate<{ _id: string; count: number }>([
      { $match: { userId, likedByBot: true, postedByAccount: { $exists: true, $ne: '' } } },
      { $group: { _id: '$postedByAccount', count: { $sum: 1 } } },
    ]),
  ]);

  const statuses = ['new', 'evaluating', 'evaluated', 'approved', 'rejected', 'posted'];
  const platforms = ['facebook', 'twitter', 'reddit', 'quora', 'youtube', 'pinterest'];

  const byStatus: Record<string, number> = {};
  statuses.forEach(s => { byStatus[s] = 0; });
  const byPlatform: Record<string, number> = {};
  const postedByPlatform: Record<string, number> = {};
  const likedByPlatform: Record<string, number> = {};
  const evaluatedByPlatform: Record<string, number> = {};
  const approvedByPlatform: Record<string, number> = {};
  platforms.forEach(p => { byPlatform[p] = 0; postedByPlatform[p] = 0; likedByPlatform[p] = 0; evaluatedByPlatform[p] = 0; approvedByPlatform[p] = 0; });

  let total = 0;
  for (const row of rows) {
    const { platform, status } = row._id;
    total += row.count;
    if (status in byStatus) byStatus[status] += row.count;
    if (platform in byPlatform) {
      byPlatform[platform] += row.count;
      if (status === 'posted') postedByPlatform[platform] += row.count;
      if (status === 'evaluated') evaluatedByPlatform[platform] += row.count;
      if (status === 'approved') approvedByPlatform[platform] += row.count;
    }
  }

  let totalLikes = 0;
  for (const row of likedRows) {
    if (row._id in likedByPlatform) likedByPlatform[row._id] = row.count;
    totalLikes += row.count;
  }

  // Supplement with activity log counts for platforms where likedByBot is 0
  // (Quora upvotes, YouTube Shorts likes, Pinterest saves are tracked in logs)
  const engageActions = ['react', 'upvote_post', 'upvote_answer', 'like', 'save_pin', 'shorts_watched'];
  try {
    const logCounts = await ActivityLog.aggregate<{ _id: string; count: number }>([
      { $match: { userId, action: { $in: engageActions } } },
      { $group: { _id: '$platform', count: { $sum: 1 } } },
    ]);
    for (const row of logCounts) {
      if (row._id in likedByPlatform && likedByPlatform[row._id] === 0) {
        likedByPlatform[row._id] = row.count;
        totalLikes += row.count;
      }
    }
  } catch { /* non-critical — activity log fallback */ }

  const postedByAccount: Record<string, number> = {};
  for (const row of postedAccRows) {
    if (row._id) postedByAccount[row._id] = row.count;
  }

  const likedByAccount: Record<string, number> = {};
  for (const row of likedAccRows) {
    if (row._id) likedByAccount[row._id] = row.count;
  }

  return { total, byStatus, byPlatform, postedByPlatform, likedByPlatform, evaluatedByPlatform, approvedByPlatform, totalLikes, postedByAccount, likedByAccount };
}

// ── Writes ──

export async function createPost(data: Partial<PostDoc>): Promise<PostDoc> {
  await connectDB();
  const doc = await Post.create(data);
  return doc.toObject() as PostDoc;
}

export async function upsertPost(
  userId: string,
  url: string,
  data: Partial<PostDoc>,
): Promise<PostDoc> {
  await connectDB();
  return Post.findOneAndUpdate(
    { userId, url },
    { $set: data, $setOnInsert: { userId, url } },
    { upsert: true, returnDocument: 'after' },
  ).lean() as Promise<PostDoc>;
}

export async function updatePost(id: string, update: Partial<PostDoc>): Promise<PostDoc | null> {
  await connectDB();
  return Post.findByIdAndUpdate(id, update, { returnDocument: 'after' }).lean() as Promise<PostDoc | null>;
}

export async function updatePostForUser(
  id: string,
  userId: string,
  update: Partial<PostDoc>,
): Promise<PostDoc | null> {
  await connectDB();
  return Post.findOneAndUpdate(
    { _id: id, userId },
    update,
    { returnDocument: 'after' },
  ).lean() as Promise<PostDoc | null>;
}

export async function batchSetStatus(ids: string[], status: string): Promise<void> {
  await connectDB();
  await Post.updateMany({ _id: { $in: ids } }, { $set: { status } });
}

export async function bulkUpdatePosts(
  ops: { updateOne: { filter: object; update: object } }[],
): Promise<void> {
  await connectDB();
  if (ops.length > 0) await Post.bulkWrite(ops);
}

export async function incrementPostAttempts(id: string): Promise<void> {
  await connectDB();
  await Post.findByIdAndUpdate(id, { $inc: { postAttempts: 1 } });
}

export async function markPostPosted(
  id: string,
  data: { replyUrl?: string; postedByAccount?: string },
): Promise<PostDoc | null> {
  await connectDB();
  return Post.findByIdAndUpdate(
    id,
    {
      status: 'posted',
      postedAt: new Date(),
      ...data,
    },
    { returnDocument: 'after' },
  ).lean() as Promise<PostDoc | null>;
}

export async function markPostLiked(id: string): Promise<void> {
  await connectDB();
  await Post.findByIdAndUpdate(id, { likedByBot: true });
}

export async function setTtlExpiry(filter: PostFilter, ttlExpireAt: Date): Promise<void> {
  await connectDB();
  await Post.updateMany(filter, { $set: { ttlExpireAt } });
}

export async function deletePost(id: string): Promise<void> {
  await connectDB();
  await Post.findByIdAndDelete(id);
}
