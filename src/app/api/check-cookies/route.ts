import { NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/apiAuth';
import { connectDB } from '@/lib/mongodb';
import Settings from '@/models/Settings';
import Notification from '@/models/Notification';
import { getCookieMeta } from '@/lib/cookieStore';
import { publishNotification } from '@/lib/redis';
import { checkRateLimit } from '@/lib/rateLimit';

/**
 * GET /api/check-cookies
 * Checks BrowserCookie status for each connected platform directly.
 * - Missing BrowserCookie  → cookie expired / TTL-deleted
 * - verified=false         → validation failed
 * Creates in-app notification + pushes via Redis SSE if not already notified in last 24h.
 */
export async function GET() {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  const rl = await checkRateLimit(userId, 'api');
  if (rl) return NextResponse.json({ error: rl.error }, { status: 429 });

  await connectDB();

  const settings = await Settings.findOne({ userId }).lean();
  if (!settings) return NextResponse.json({ expired: [], healthy: [] });

  const accounts = (settings.socialAccounts as Array<{
    id: string; platform: string; username: string;
    displayName: string; profileDir: string; active?: boolean;
  }>) || [];

  if (accounts.length === 0) return NextResponse.json({ expired: [], healthy: [] });

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const expired: { platform: string; accountId: string; username: string }[] = [];
  const healthy: { platform: string; accountId: string; username: string }[] = [];

  for (const account of accounts) {
    if (account.active === false) continue;

    const label = account.displayName || account.username || account.platform;
    const platform = account.platform.toLowerCase();

    // Check BrowserCookie directly — the authoritative source
    const meta = await getCookieMeta(userId, platform);
    const isExpired = !meta || !meta.verified;

    if (isExpired) {
      expired.push({ platform: account.platform, accountId: account.id, username: label });

      // Deduplicate: at most 1 notification per platform per 24h
      const recentNotif = await Notification.findOne({
        userId,
        type: 'cookie_expired',
        platform: account.platform,
        createdAt: { $gte: oneDayAgo },
      });

      if (!recentNotif) {
        const reason = !meta ? 'expired or disconnected' : 'failed validation';
        const notifData = {
          userId,
          type: 'cookie_expired',
          platform: account.platform,
          accountId: account.id,
          title: `${capitalize(account.platform)} cookies expired`,
          message: `Your ${capitalize(account.platform)} session has ${reason}. Reconnect to resume posting.`,
          actionUrl: '/dashboard/accounts',
          actionLabel: 'Reconnect',
        };
        const doc = await Notification.create(notifData);
        // Real-time push via Redis → SSE
        await publishNotification(userId, { ...notifData, _id: doc._id, ts: Date.now() });
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
