import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { connectDB } from './mongodb';
import Settings from '@/models/Settings';

const ENV_ADMIN_IDS = new Set(
  (process.env.ADMIN_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean)
);

/**
 * Check if a userId has admin access.
 * Checks env ADMIN_USER_IDS first (fast), then falls back to Settings.isAdmin in DB.
 */
export async function isAdmin(userId: string): Promise<boolean> {
  if (ENV_ADMIN_IDS.has(userId)) return true;

  await connectDB();
  const settings = await Settings.findOne({ userId }, { isAdmin: 1 }).lean();
  return settings?.isAdmin === true;
}

/**
 * Auth guard for admin API routes.
 * Returns the userId string if admin, or a 401/403 NextResponse if not.
 */
export async function getAdminUserId(): Promise<string | NextResponse> {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const admin = await isAdmin(userId);
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
  }
  return userId;
}
