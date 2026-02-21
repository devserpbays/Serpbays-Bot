import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Post from '@/models/Post';
import { replyToTweet, postTweet, extractTweetId, isTwitterConfigured } from '@/lib/twitter';

export async function POST(req: NextRequest) {
  await connectDB();

  if (!isTwitterConfigured()) {
    return NextResponse.json(
      { error: 'Twitter cookie credentials not configured. Add TWITTER_AUTH_TOKEN and TWITTER_CT0 to .env.local' },
      { status: 400 }
    );
  }

  const { id } = await req.json();

  if (!id) {
    return NextResponse.json({ error: 'Post ID is required' }, { status: 400 });
  }

  const post = await Post.findById(id);
  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  if (post.status !== 'approved') {
    return NextResponse.json({ error: 'Post must be approved before posting' }, { status: 400 });
  }

  if (post.platform !== 'twitter') {
    return NextResponse.json({ error: 'This endpoint only supports Twitter/X posts' }, { status: 400 });
  }

  const replyText = post.editedReply || post.aiReply;
  if (!replyText) {
    return NextResponse.json({ error: 'No reply text available' }, { status: 400 });
  }

  // Truncate to Twitter's 280 character limit
  const tweetText = replyText.length > 280 ? replyText.slice(0, 277) + '...' : replyText;

  try {
    let tweetResult;
    const tweetId = extractTweetId(post.url);

    if (tweetId) {
      // Reply to the original tweet
      tweetResult = await replyToTweet(tweetText, tweetId);
    } else {
      // No tweet ID found - post as a standalone tweet
      tweetResult = await postTweet(tweetText);
    }

    // Update post status to 'posted'
    await Post.findByIdAndUpdate(id, {
      status: 'posted',
      postedAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      tweetId: tweetResult.data.id,
      tweetText: tweetResult.data.text,
      tweetUrl: `https://x.com/i/status/${tweetResult.data.id}`,
      isReply: !!tweetId,
    });
  } catch (err) {
    console.error('Failed to post to Twitter:', err);
    return NextResponse.json(
      { error: `Failed to post to Twitter: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}
