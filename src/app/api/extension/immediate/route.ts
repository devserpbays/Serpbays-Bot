import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Post from '@/models/Post';

export const dynamic = 'force-dynamic';

/**
 * GET — Content scripts call this to check if there's an immediate task for the current URL.
 * Query: ?url=https://x.com/...&apiKey=gm_xxx
 * Returns the task if found, or empty.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  const taskId = req.nextUrl.searchParams.get('taskId');

  if (!taskId) {
    return NextResponse.json({ task: null });
  }

  await connectDB();

  const post = await Post.findById(taskId).lean() as Record<string, unknown> | null;
  if (!post || post.status !== 'approved') {
    return NextResponse.json({ task: null });
  }

  return NextResponse.json({
    task: {
      id: String(post._id),
      platform: post.platform,
      action: 'comment',
      url: post.url,
      text: ((post.editedReply || post.aiReply) as string) || '',
    },
  });
}

/**
 * POST — Mark task as completed after content script posts it.
 */
export async function POST(req: NextRequest) {
  let body: { taskId?: string; success?: boolean; error?: string; postUrl?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { taskId, success, postUrl } = body;
  if (!taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 });

  await connectDB();

  if (success) {
    const update: Record<string, unknown> = {
      status: 'posted',
      postedAt: new Date(),
      postedByAccount: 'extension-manual',
    };
    // Save the specific post permalink (FB post, reddit comment URL, etc.)
    // so "View reply" in the dashboard links to the actual post — not the
    // group/subreddit index.
    if (postUrl) update.replyUrl = postUrl;
    await Post.findByIdAndUpdate(taskId, update);
  }

  return NextResponse.json({ ok: true });
}
