import { NextRequest, NextResponse } from 'next/server';
import { getExtensionUserId } from '@/lib/extensionAuth';
import { connectDB } from '@/lib/mongodb';
import Post from '@/models/Post';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const userId = await getExtensionUserId(req);
  if (userId instanceof NextResponse) return userId;

  let body: { taskId?: string; success?: boolean; error?: string; action?: string; alreadyCommented?: boolean; alreadyLiked?: boolean; alreadyUpvoted?: boolean; skipped?: boolean; reason?: string; verifiedAnswerUrl?: string; postUrl?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { taskId, success, action, alreadyCommented, alreadyLiked, alreadyUpvoted, skipped, reason, verifiedAnswerUrl, postUrl } = body;
  if (!taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 });

  await connectDB();

  const post = await Post.findById(taskId);
  if (!post || post.userId !== userId) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  if (success) {
    const isLikeAction = action === 'like' || action === 'upvote';
    const isCommentAction = action === 'comment' || !action;

    if (isLikeAction) {
      // Mark likedByBot regardless of whether we just liked or it was already liked —
      // either way the desired state (bot-liked) is now true, so we must stop
      // re-dispatching this task on every cron cycle.
      const update: Record<string, unknown> = { likedByBot: true };
      if (post.platform === 'facebook' && !alreadyLiked) update.botReaction = 'Like';
      await Post.findByIdAndUpdate(taskId, update);
    } else if (isCommentAction) {
      // Same reasoning as likes — if we detected our own existing comment,
      // still mark the post as posted so the task queue drops it.
      const commentUpdate: Record<string, unknown> = {
        status: 'posted',
        postedAt: post.postedAt || new Date(),
        postedByAccount: post.postedByAccount || 'extension',
      };
      // Persist the verified answer URL (Quora /stats match) and/or the
      // content-script-reported postUrl so the dashboard can link to the
      // actual comment/answer, not just the original post.
      if (verifiedAnswerUrl) {
        commentUpdate.verifiedAnswerUrl = verifiedAnswerUrl;
        commentUpdate.verifiedAt = new Date();
        commentUpdate.replyUrl = verifiedAnswerUrl;
      } else if (postUrl && postUrl !== post.url) {
        commentUpdate.replyUrl = postUrl;
      }
      await Post.findByIdAndUpdate(taskId, commentUpdate);
    }
  } else if (skipped) {
    // Intentional skip (comments_disabled, already_commented, etc.) —
    // mark the post as terminal so it won't be re-dispatched every cycle.
    const update: Record<string, unknown> = {
      status: reason === 'already_commented' ? 'posted' : 'skipped',
      skipReason: reason || 'unknown',
    };
    if (reason === 'already_commented') {
      update.postedAt = post.postedAt || new Date();
      update.postedByAccount = post.postedByAccount || 'extension';
    }
    await Post.findByIdAndUpdate(taskId, update);
  } else {
    await Post.findByIdAndUpdate(taskId, { $inc: { postAttempts: 1 } });
  }

  // Logging is handled by background.js — no double logging here
  return NextResponse.json({ ok: true });
}
