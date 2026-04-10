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
  // Auto-discovery via Playwright is no longer supported (extension handles
  // engagement directly using the user's live browser session). Users add
  // community IDs manually in settings.
  return NextResponse.json(
    { error: 'Auto-discovery is no longer supported — add community IDs manually in Settings.' },
    { status: 410 }
  );
}
