import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Post from '@/models/Post';

export async function GET(req: NextRequest) {
  await connectDB();

  const { searchParams } = req.nextUrl;
  const status = searchParams.get('status');
  const platform = searchParams.get('platform');
  const minScore = searchParams.get('minScore');
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');

  const from = searchParams.get('from');
  const to = searchParams.get('to');

  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  if (platform) filter.platform = platform;
  if (minScore) filter.aiRelevanceScore = { $gte: parseInt(minScore) };
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
  await connectDB();

  const body = await req.json();
  const { id, status, editedReply } = body;

  if (!id) {
    return NextResponse.json({ error: 'Post ID required' }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (status) {
    update.status = status;
    if (status === 'approved') update.approvedAt = new Date();
    if (status === 'posted') update.postedAt = new Date();
  }
  if (editedReply !== undefined) update.editedReply = editedReply;

  const post = await Post.findByIdAndUpdate(id, update, { new: true }).lean();

  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  return NextResponse.json({ post });
}
