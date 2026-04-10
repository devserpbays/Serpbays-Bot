import { NextRequest, NextResponse } from 'next/server';
import { getExtensionUserId } from '@/lib/extensionAuth';
import { connectDB } from '@/lib/mongodb';
import Post from '@/models/Post';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const userId = await getExtensionUserId(req);
  if (userId instanceof NextResponse) return userId;

  let body: { taskId?: string; success?: boolean; error?: string; action?: string; alreadyCommented?: boolean; alreadyLiked?: boolean; alreadyUpvoted?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { taskId, success, action, alreadyCommented, alreadyLiked, alreadyUpvoted } = body;
  if (!taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 });

  await connectDB();

  const post = await Post.findById(taskId);
  if (!post || post.userId !== userId) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  if (success) {
    const isLikeAction = action === 'like' || action === 'upvote';
    const isCommentAction = action === 'comment' || !action;

    if (isLikeAction && !alreadyLiked && !alreadyUpvoted) {
      const update: Record<string, unknown> = { likedByBot: true };
      if (post.platform === 'facebook') update.botReaction = 'Like';
      await Post.findByIdAndUpdate(taskId, update);
    } else if (isCommentAction && !alreadyCommented) {
      await Post.findByIdAndUpdate(taskId, {
        status: 'posted',
        postedAt: new Date(),
        postedByAccount: 'extension',
      });
    }
  } else {
    await Post.findByIdAndUpdate(taskId, { $inc: { postAttempts: 1 } });
  }

  // Logging is handled by background.js — no double logging here
  return NextResponse.json({ ok: true });
}
