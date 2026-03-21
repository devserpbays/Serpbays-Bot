import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Post from '@/models/Post';
import BrowserCookie from '@/models/BrowserCookie';
import { postComment } from '@/lib/facebook';
import { getAuthUserId } from '@/lib/apiAuth';
import { checkDailyPostLimit } from '@/lib/featureGate';
import { checkRateLimit } from '@/lib/rateLimit';
import { PLATFORM_SAFE_LIMITS, checkBackoff, getBackoffMs, getWarmupLimit } from '@/lib/humanize';
import { checkContentSafety } from '@/lib/contentSafety';
import { buildSuccessPatch, buildFailurePatch } from '@/lib/accountHealth';

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

  // Load account for backoff + safety limit checks
  const account = await BrowserCookie.findOne({ userId, platform: 'facebook' });

  // Backoff + auto-pause check
  if (account) {
    if (account.autoPaused) {
      return NextResponse.json(
        { error: `Account is auto-paused due to low health score (${account.healthScore ?? 0}/100). Check the Accounts page for details.` },
        { status: 429 }
      );
    }
    const backoff = checkBackoff(account.backoffUntil);
    if (backoff.blocked) {
      const retryIn = Math.ceil((backoff.retryAt.getTime() - Date.now()) / 60000);
      return NextResponse.json(
        { error: `Account is in cooldown after repeated errors. Retry in ${retryIn} minute(s).` },
        { status: 429 }
      );
    }
  }

  // Hard platform safety cap
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayCount = await Post.countDocuments({ userId, platform: 'facebook', status: 'posted', postedAt: { $gte: todayStart } });
  const safeLimit = PLATFORM_SAFE_LIMITS['facebook'] ?? 15;
  if (todayCount >= safeLimit) {
    return NextResponse.json(
      { error: `Daily safety limit of ${safeLimit} posts reached for Facebook. Resumes tomorrow.` },
      { status: 429 }
    );
  }

  // Warm-up cap — new accounts post less to avoid spam detection
  const warmupLimit = getWarmupLimit(account?.createdAt);
  if (warmupLimit !== null && todayCount >= warmupLimit) {
    return NextResponse.json(
      { error: `Account is still warming up (day ${Math.floor((Date.now() - new Date(account!.createdAt).getTime()) / 86400000) + 1} of 14). Daily limit is ${warmupLimit} posts today. This increases automatically over time.` },
      { status: 429 }
    );
  }

  // Plan-level daily limit
  const limitBlocked = await checkDailyPostLimit(userId, todayCount);
  if (limitBlocked) return limitBlocked;

  const replyText = post.editedReply || post.aiReply;
  if (!replyText) {
    return NextResponse.json({ error: 'No reply text available' }, { status: 400 });
  }

  // Content safety — quality score + duplicate check
  const safety = await checkContentSafety(userId, 'facebook', replyText);
  if (!safety.allowed) {
    return NextResponse.json(
      { error: `Content safety blocked: ${safety.reason}`, flags: safety.flags, score: safety.score },
      { status: 422 }
    );
  }

  try {
    const result = await postComment(post.url, replyText);

    if (!result.success) {
      if (account) {
        const newCount = (account.errorCount ?? 0) + 1;
        const backoffUntil = new Date(Date.now() + getBackoffMs(newCount));
        await BrowserCookie.updateOne(
          { _id: account._id },
          buildFailurePatch(account, backoffUntil)
        );
      }
      return NextResponse.json(
        { error: result.error || 'Failed to post comment on Facebook. Check browser login status.' },
        { status: 500 }
      );
    }

    await Post.findByIdAndUpdate(id, {
      status: 'posted',
      postedAt: new Date(),
    });

    // Success — reset error counter
    if (account) {
      await BrowserCookie.updateOne(
        { _id: account._id },
        buildSuccessPatch(account)
      );
    }

    return NextResponse.json({
      success: true,
      postUrl: post.url,
      commentText: replyText,
    });
  } catch (err) {
    console.error('Failed to post Facebook comment:', err);

    if (account) {
      const newCount = (account.errorCount ?? 0) + 1;
      const backoffUntil = new Date(Date.now() + getBackoffMs(newCount));
      await BrowserCookie.updateOne(
        { _id: account._id },
        buildFailurePatch(account, backoffUntil)
      );
    }

    return NextResponse.json(
      { error: 'Failed to post Facebook comment. Please try again or check your account connection.' },
      { status: 500 }
    );
  }
}
