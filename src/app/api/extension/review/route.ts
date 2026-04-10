import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/apiAuth';
import { connectDB } from '@/lib/mongodb';
import Post from '@/models/Post';
import Settings from '@/models/Settings';

export const dynamic = 'force-dynamic';

const WINDOW_SIZE = 3;

/**
 * GET — Returns top 3 most relevant evaluated posts per enabled extension platform.
 * Sliding window: after one is posted/rejected, the next one slides in.
 */
export async function GET() {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  await connectDB();

  const settings = await Settings.findOne({ userId }).lean() as Record<string, unknown> | null;
  if (!settings) return NextResponse.json({ platforms: {} });

  const extensionPlatforms = (settings.extensionPlatforms as string[]) || [];
  if (extensionPlatforms.length === 0) return NextResponse.json({ platforms: {} });

  const freshCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const result: Record<string, Array<{
    id: string;
    url: string;
    platform: string;
    content: string;
    author: string;
    aiReply: string;
    aiRelevanceScore: number;
    scrapedAt: string;
  }>> = {};

  for (const platform of extensionPlatforms) {
    const threshold = (settings[`${platform}AutoPostThreshold`] as number) ?? 70;

    const posts = await Post.find({
      userId,
      platform,
      status: 'evaluated',
      aiRelevanceScore: { $gte: threshold },
      aiReply: { $exists: true, $ne: '' },
      likedByBot: { $ne: true },
      postAttempts: { $not: { $gte: 3 } },
      scrapedAt: { $gte: freshCutoff },
    })
      .sort({ aiRelevanceScore: -1 })
      .limit(WINDOW_SIZE)
      .lean() as Record<string, unknown>[];

    result[platform] = posts.map(p => ({
      id: String(p._id),
      url: p.url as string,
      platform: p.platform as string,
      content: ((p.content as string) || '').slice(0, 500),
      author: (p.author as string) || 'Unknown',
      aiReply: ((p.editedReply || p.aiReply) as string) || '',
      aiRelevanceScore: p.aiRelevanceScore as number,
      scrapedAt: (p.scrapedAt as Date)?.toISOString() || '',
    }));
  }

  return NextResponse.json({ platforms: result });
}

/**
 * POST — Approve or reject a post.
 * Approve: marks as ready for extension to pick up (keeps status evaluated).
 * Reject: sets status to rejected so it never appears again.
 * Edit: updates the reply text before approving.
 */
export async function POST(req: NextRequest) {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  let body: { postId?: string; action?: string; editedReply?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { postId, action, editedReply } = body;
  if (!postId || !action) {
    return NextResponse.json({ error: 'postId and action required' }, { status: 400 });
  }

  await connectDB();

  const post = await Post.findOne({ _id: postId, userId });
  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  if (action === 'approve') {
    const update: Record<string, unknown> = { status: 'approved', approvedAt: new Date() };
    if (editedReply) update.editedReply = editedReply;
    await Post.findByIdAndUpdate(postId, update);
    return NextResponse.json({
      ok: true,
      action: 'approved',
      task: {
        id: String(post._id),
        url: post.url,
        platform: post.platform,
        text: editedReply || post.editedReply || post.aiReply || '',
      },
    });
  }

  if (action === 'reject') {
    await Post.findByIdAndUpdate(postId, { status: 'rejected' });
    return NextResponse.json({ ok: true, action: 'rejected' });
  }

  if (action === 'edit') {
    if (!editedReply) return NextResponse.json({ error: 'editedReply required' }, { status: 400 });
    await Post.findByIdAndUpdate(postId, { editedReply });
    return NextResponse.json({ ok: true, action: 'edited' });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
