import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Post from '@/models/Post';
import Settings from '@/models/Settings';
import { evaluatePost } from '@/lib/openclaw';

export async function POST() {
  await connectDB();

  const settings = await Settings.findOne();
  if (!settings) {
    return NextResponse.json({ error: 'Settings not configured' }, { status: 400 });
  }

  const posts = await Post.find({ status: 'new' }).limit(10);

  if (posts.length === 0) {
    return NextResponse.json({ message: 'No new posts to evaluate', evaluated: 0 });
  }

  let evaluated = 0;
  const results = [];

  for (const post of posts) {
    try {
      await Post.findByIdAndUpdate(post._id, { status: 'evaluating' });

      const evaluation = await evaluatePost(
        post.content,
        settings.companyName,
        settings.companyDescription,
        settings.promptTemplate || undefined
      );

      await Post.findByIdAndUpdate(post._id, {
        status: 'evaluated',
        aiReply: evaluation.suggestedReply,
        aiRelevanceScore: evaluation.score,
        aiTone: evaluation.tone,
        aiReasoning: evaluation.reasoning,
        evaluatedAt: new Date(),
      });

      evaluated++;
      results.push({ postId: post._id, ...evaluation });
    } catch (err) {
      console.error(`Failed to evaluate post ${post._id}:`, err);
      await Post.findByIdAndUpdate(post._id, { status: 'new' });
      results.push({ postId: post._id, error: (err as Error).message });
    }
  }

  return NextResponse.json({ evaluated, total: posts.length, results });
}
