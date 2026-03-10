import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

/**
 * Returns the authenticated Clerk userId, or a 401 NextResponse if not authenticated.
 */
export async function getAuthUserId(): Promise<string | NextResponse> {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return userId;
}
