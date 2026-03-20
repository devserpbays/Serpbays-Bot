import { NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/apiAuth';
import { connectDB } from '@/lib/mongodb';
import Settings from '@/models/Settings';

export async function GET() {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  await connectDB();
  const settings = await Settings.findOne({ userId }).select('blockedUntil').lean() as { blockedUntil?: Date | null } | null;

  const blockedUntil = settings?.blockedUntil ? new Date(settings.blockedUntil) : null;
  const isBlocked = !!(blockedUntil && blockedUntil > new Date());

  return NextResponse.json({
    isBlocked,
    blockedUntil: isBlocked ? blockedUntil!.toISOString() : null,
  });
}
