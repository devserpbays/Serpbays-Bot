import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import { getAuthUserId } from '@/lib/apiAuth';
import Settings from '@/models/Settings';

export async function GET() {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  await connectDB();

  // Fetch saved community IDs from settings
  const settings = await Settings.findOne({ userId }).lean() as Record<string, any> | null;
  const savedIds: string[] = (settings?.twitterCommunityIds as string[]) ?? [];

  return NextResponse.json({ communityIds: savedIds });
}

export async function POST() {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  await connectDB();

  // Dynamically import twitter lib (uses Playwright — server only)
  let communities: Array<{ id: string; name: string }> = [];
  try {
    const { getJoinedCommunities, closeBrowser } = await import('@/lib/twitter');
    communities = await getJoinedCommunities();
    await closeBrowser();
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to scrape communities: ' + (err as Error).message },
      { status: 500 }
    );
  }

  if (communities.length === 0) {
    return NextResponse.json({ communities: [], message: 'No joined communities found' });
  }

  // Merge with existing saved IDs (don't remove manually added ones)
  const settings = await Settings.findOne({ userId }).lean() as Record<string, any> | null;
  const existingIds: string[] = (settings?.twitterCommunityIds as string[]) ?? [];
  const merged = Array.from(new Set([...existingIds, ...communities.map((c) => c.id)]));

  await Settings.findOneAndUpdate(
    { userId },
    { $set: { twitterCommunityIds: merged } },
    { upsert: true }
  );

  return NextResponse.json({ communities, saved: merged.length });
}
