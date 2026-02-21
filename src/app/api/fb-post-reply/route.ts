import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Post from '@/models/Post';
import { postComment } from '@/lib/facebook';

export async function POST(req: NextRequest) {
  await connectDB();

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

  if (post.platform !== 'facebook') {
    return NextResponse.json(
      { error: 'This endpoint only supports Facebook posts' },
      { status: 400 }
    );
  }

  const replyText = post.editedReply || post.aiReply;
  if (!replyText) {
    return NextResponse.json({ error: 'No reply text available' }, { status: 400 });
  }

  try {
    const success = await postComment(post.url, replyText);

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to post comment on Facebook. Check browser login status.' },
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
      { error: `Failed to post Facebook comment: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}
