import { NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/apiAuth';
import { getPostStats } from '@/services/postService';

export async function GET() {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  const stats = await getPostStats(userId);

  return NextResponse.json(stats);
}
