import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Post from '@/models/Post';
import { postComment } from '@/lib/facebook';
import { getAuthUserId } from '@/lib/apiAuth';
import { checkDailyPostLimit } from '@/lib/featureGate';
import { checkRateLimit } from '@/lib/rateLimit';

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  const rl = await checkRateLimit(userId, 'post');
  if (rl) return NextResponse.json({ error: rl.error }, { status: 429 });

  await connectDB();

  const { id } = await req.json();

  if (!id) {
    return NextResponse.json({ error: 'Post ID is required' }, { status: 400 });
  }

  const post = await Post.findOne({ _id: id, userId });
  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  if (post.status !== 'approved') {
    return NextResponse.json({ error: 'Post must be approved before posting' }, { status: 400 });
  }

  if (post.platform !== 'facebook') {
    return NextResponse.json(
      { error: 'This endpoint only supports Facebook posts' },
      { status: 400 }
    );
  }

  // Enforce daily post limit
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayCount = await Post.countDocuments({ userId, platform: 'facebook', status: 'posted', postedAt: { $gte: todayStart } });
  const limitBlocked = await checkDailyPostLimit(userId, todayCount);
  if (limitBlocked) return limitBlocked;

  const replyText = post.editedReply || post.aiReply;
  if (!replyText) {
    return NextResponse.json({ error: 'No reply text available' }, { status: 400 });
  }

  try {
    const result = await postComment(post.url, replyText);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to post comment on Facebook. Check browser login status.' },
        { status: 500 }
      );
    }

    await Post.findByIdAndUpdate(id, {
      status: 'posted',
      postedAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      postUrl: post.url,
      commentText: replyText,
    });
  } catch (err) {
    console.error('Failed to post Facebook comment:', err);
    return NextResponse.json(
      { error: 'Failed to post Facebook comment. Please try again or check your account connection.' },
      { status: 500 }
    );
  }
}
