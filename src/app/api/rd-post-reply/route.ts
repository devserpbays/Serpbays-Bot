import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Post from '@/models/Post';
import Settings from '@/models/Settings';
import { postRedditComment, closeBrowser, setProfileDir } from '@/lib/reddit';
import { getAuthUserId } from '@/lib/apiAuth';
import { checkDailyPostLimit } from '@/lib/featureGate';
import { checkRateLimit } from '@/lib/rateLimit';

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  const rl = checkRateLimit(userId, 'post');
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

  if (post.platform !== 'reddit') {
    return NextResponse.json(
      { error: 'This endpoint only supports Reddit posts' },
      { status: 400 }
    );
  }

  // Enforce daily post limit
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayCount = await Post.countDocuments({ userId, platform: 'reddit', status: 'posted', postedAt: { $gte: todayStart } });
  const limitBlocked = await checkDailyPostLimit(userId, todayCount);
  if (limitBlocked) return limitBlocked;

  const replyText = post.editedReply || post.aiReply;
  if (!replyText) {
    return NextResponse.json({ error: 'No reply text available' }, { status: 400 });
  }

  // Load user's Reddit profile directory so we use their browser session
  const settings = await Settings.findOne({ userId }).lean();
  const redditAccount = (settings?.socialAccounts as Array<{ platform: string; profileDir?: string; active?: boolean }> || [])
    .find((a) => a.platform === 'reddit' && a.active !== false);
  if (redditAccount?.profileDir) {
    setProfileDir(redditAccount.profileDir);
  }

  try {
    const result = await postRedditComment(post.url, replyText);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to post comment on Reddit. Check browser login status.' },
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
    console.error('Failed to post Reddit comment:', err);
    return NextResponse.json(
      { error: `Failed to post Reddit comment: ${(err as Error).message}` },
      { status: 500 }
    );
  } finally {
    await closeBrowser().catch(() => {});
  }
}
