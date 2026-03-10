import { NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/apiAuth';
import { getUserPlan } from '@/lib/subscription';

export const dynamic = 'force-dynamic';

export async function GET() {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  const plan = await getUserPlan(userId);
  return NextResponse.json(plan);
}
