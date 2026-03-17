import { NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/apiAuth';
import { connectDB } from '@/lib/mongodb';
import Settings from '@/models/Settings';
import Notification from '@/models/Notification';
import ActivityLog from '@/models/ActivityLog';
import { deleteCookies } from '@/lib/cookieStore';
import { checkRateLimit } from '@/lib/rateLimit';

interface SocialAccount {
  id: string;
  platform: string;
  username: string;
  displayName: string;
  profileDir: string;
  active?: boolean;
}

/**
 * GET /api/check-cookies
 * Checks error logs for auth_error entries per platform to detect expired cookies.
 * - Recent auth_error → deactivates account, creates notification
 * Returns { expired: [...], healthy: [...] }
 */
export async function GET() {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  const rl = await checkRateLimit(userId, 'api');
  if (rl) return NextResponse.json({ error: rl.error }, { status: 429 });

  await connectDB();

  const settings = await Settings.findOne({ userId }).lean();
  if (!settings) return NextResponse.json({ expired: [], healthy: [] });

  const accounts: SocialAccount[] = (settings.socialAccounts as SocialAccount[]) || [];
  if (accounts.length === 0) return NextResponse.json({ expired: [], healthy: [] });

  // Look for auth_error logs in the last 24 hours per platform
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const authErrors = await ActivityLog.find({
    userId,
    action: 'auth_error',
    level: 'error',
    createdAt: { $gte: oneDayAgo },
  }).lean();

  // Build a set of platforms that have auth errors
  const errorPlatforms = new Set<string>();
  for (const log of authErrors) {
    if (log.platform) errorPlatforms.add(log.platform.toLowerCase());
  }

  const expired: { platform: string; accountId: string; username: string }[] = [];
  const healthy: { platform: string; accountId: string; username: string }[] = [];

  for (const account of accounts) {
    if (account.active === false) continue;

    const label = account.displayName || account.username || account.platform;

    if (errorPlatforms.has(account.platform.toLowerCase())) {
      expired.push({ platform: account.platform, accountId: account.id, username: label });

      // Remove the account entirely so user can reconnect fresh
      await Settings.updateOne(
        { userId },
        { $pull: { socialAccounts: { id: account.id } } },
      );

      // Clean up stored cookies from MongoDB
      await deleteCookies(userId, account.platform.toLowerCase()).catch(() => {});

      // Create notification if not already created in last 24 hours
      const recentNotif = await Notification.findOne({
        userId,
        type: 'cookie_expired',
        accountId: account.id,
        createdAt: { $gte: oneDayAgo },
      });

      if (!recentNotif) {
        await Notification.create({
          userId,
          type: 'cookie_expired',
          platform: account.platform,
          accountId: account.id,
          title: `${capitalize(account.platform)} disconnected`,
          message: `Your ${capitalize(account.platform)} account "${label}" was removed due to expired cookies. Reconnect with fresh cookies to continue.`,
          actionUrl: '/dashboard/accounts',
          actionLabel: 'Reconnect',
        });
      }
    } else {
      healthy.push({ platform: account.platform, accountId: account.id, username: label });
    }
  }

  return NextResponse.json({ expired, healthy });
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
