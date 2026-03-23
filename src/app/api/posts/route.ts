import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Post from '@/models/Post';
import { getAuthUserId } from '@/lib/apiAuth';

export async function GET(req: NextRequest) {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  await connectDB();

  const { searchParams } = req.nextUrl;
  const status = searchParams.get('status');
  const platform = searchParams.get('platform');
  const minScore = searchParams.get('minScore');
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');

  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const source = searchParams.get('source'); // 'community' | 'keyword' | 'original'

  const filter: Record<string, unknown> = { userId };
  if (status) filter.status = status;
  if (platform) filter.platform = platform;
  if (minScore) filter.aiRelevanceScore = { $gte: parseInt(minScore) };
  if (source === 'community') {
    filter.keywordsMatched = { $elemMatch: { $regex: '^community:' } };
    filter.isOriginalTweet = { $ne: true };
  } else if (source === 'original') {
    filter.isOriginalTweet = true;
  } else if (source === 'keyword') {
    filter.keywordsMatched = { $not: { $elemMatch: { $regex: '^community:' } } };
    filter.isOriginalTweet = { $ne: true };
  }
  const likedByBot = searchParams.get('likedByBot');
  if (likedByBot === 'true') filter.likedByBot = true;
  if (from || to) {
    const dateFilter: Record<string, Date> = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to) dateFilter.$lt = new Date(to);
    filter.postedAt = dateFilter;
  }

  const [posts, total] = await Promise.all([
    Post.find(filter)
      .sort({ postedAt: -1, scrapedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Post.countDocuments(filter),
  ]);

  return NextResponse.json({ posts, total, page, limit });
}

export async function PATCH(req: NextRequest) {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  await connectDB();

  const body = await req.json();
  const { id, status, editedReply } = body;

  if (!id) {
    return NextResponse.json({ error: 'Post ID required' }, { status: 400 });
  }

  // Only allow user-facing status transitions (not 'posted' — that's set by the worker)
  const ALLOWED_STATUSES = ['approved', 'rejected'] as const;

  const update: Record<string, unknown> = {};
  if (status) {
    if (!ALLOWED_STATUSES.includes(status)) {
      return NextResponse.json({ error: `Invalid status. Allowed: ${ALLOWED_STATUSES.join(', ')}` }, { status: 400 });
    }
    update.status = status;
    if (status === 'approved') update.approvedAt = new Date();
  }
  if (editedReply !== undefined) update.editedReply = editedReply;

  const post = await Post.findOneAndUpdate({ _id: id, userId }, update, { returnDocument: 'after' }).lean();

  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  return NextResponse.json({ post });
}
