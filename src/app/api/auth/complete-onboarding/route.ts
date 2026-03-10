import { NextRequest, NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { connectDB } from '@/lib/mongodb';
import Settings from '@/models/Settings';
import { ensureSubscription } from '@/lib/subscription';

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { companyName, companyDescription, keywords, promptTemplate, platforms } = body;

  await connectDB();

  if (companyName) {
    const existing = await Settings.findOne({ userId });
    if (!existing) {
      await Settings.create({
        userId,
        companyName,
        companyDescription: companyDescription || '',
        keywords: keywords || [],
        promptTemplate: promptTemplate || '',
        platforms: platforms || ['twitter', 'reddit'],
      });
    }
  }

  // Ensure free subscription record exists
  await ensureSubscription(userId);

  // Mark onboarding complete in Clerk's publicMetadata
  // so the middleware JWT claim updates on next request
  const client = await clerkClient();
  await client.users.updateUser(userId, {
    publicMetadata: { onboardingCompleted: true },
  });

  // Set a cookie so the middleware can bypass the onboarding check
  // before the Clerk JWT refreshes with the new publicMetadata
  const res = NextResponse.json({ ok: true });
  res.cookies.set('ob_done', '1', {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
