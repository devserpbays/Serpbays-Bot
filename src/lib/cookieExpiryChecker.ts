/**
 * Checks all users for platforms with no valid cookies for 3+ hours.
 * Fetches user email from Clerk (no manual email entry needed).
 * Sends email (and optionally WhatsApp) notifications.
 */
import { createClerkClient } from '@clerk/backend';
import { connectDB } from './mongodb';
import Settings from '@/models/Settings';
import Notification from '@/models/Notification';
import { getCookieMeta } from './cookieStore';
import { sendCookieExpiryEmail } from './emailNotifier';

const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
const EMAIL_COOLDOWN_MS = 12 * 60 * 60 * 1000;

interface SocialAccount {
  id: string;
  platform: string;
  active?: boolean;
  profileDir?: string;
}

function getClerk() {
  return createClerkClient({
    secretKey: process.env.CLERK_SECRET_KEY!,
  });
}

/**
 * Get user's primary email from Clerk.
 */
async function getUserEmail(userId: string): Promise<string | null> {
  try {
    const clerk = getClerk();
    const user = await clerk.users.getUser(userId);
    return user.emailAddresses[0]?.emailAddress || null;
  } catch (err) {
    console.error(`[cookieExpiryChecker] Failed to fetch Clerk user ${userId}:`, (err as Error).message);
    return null;
  }
}

/**
 * Check all users for expired/missing cookies and send notifications.
 */
export async function checkAndNotifyCookieExpiry(): Promise<{
  checked: number;
  notified: string[];
}> {
  await connectDB();

  const allSettings = await Settings.find({
    userId: { $exists: true, $nin: [null, ''] },
  }).lean();

  const notified: string[] = [];

  for (const settings of allSettings) {
    const userId = settings.userId as string;
    const accounts = (settings.socialAccounts as SocialAccount[]) || [];
    const enabledPlatforms = (settings.platforms as string[]) || [];

    if (enabledPlatforms.length === 0) continue;

    // Find platforms that are enabled but have no valid cookies
    const expiredPlatforms: string[] = [];

    for (const platform of enabledPlatforms) {
      const account = accounts.find(
        a => a.platform === platform && a.active !== false
      );
      if (!account) {
        expiredPlatforms.push(platform);
        continue;
      }

      const meta = await getCookieMeta(userId, platform);
      if (!meta || !meta.verified) {
        expiredPlatforms.push(platform);
      }
    }

    if (expiredPlatforms.length === 0) continue;

    // Check if we already notified recently (in-app)
    const threeHoursAgo = new Date(Date.now() - THREE_HOURS_MS);
    const recentInAppNotif = await Notification.findOne({
      userId,
      type: 'cookie_expired',
      createdAt: { $gte: threeHoursAgo },
    });

    if (!recentInAppNotif) {
      const platformNames = expiredPlatforms
        .map(p => p.charAt(0).toUpperCase() + p.slice(1))
        .join(', ');

      await Notification.create({
        userId,
        type: 'cookie_expired',
        platform: expiredPlatforms[0],
        title: `${platformNames} — cookies expired`,
        message: `Your ${platformNames} cookies have been expired for over 3 hours. Reconnect to resume posting.`,
        actionUrl: '/dashboard/accounts',
        actionLabel: 'Reconnect',
      });
    }

    // Email notification — fetch email from Clerk automatically
    const notifyEmail = settings.notifyViaEmail !== false; // default true
    const lastEmailSent = settings.lastNotificationEmailSentAt as Date | null;

    if (notifyEmail) {
      const canSendEmail =
        !lastEmailSent ||
        Date.now() - new Date(lastEmailSent).getTime() > EMAIL_COOLDOWN_MS;

      if (canSendEmail) {
        // Use manually set email if provided, otherwise fetch from Clerk
        let email = (settings.notificationEmail as string) || '';
        if (!email) {
          email = (await getUserEmail(userId)) || '';
        }

        if (email) {
          const sent = await sendCookieExpiryEmail(email, expiredPlatforms);
          if (sent) {
            await Settings.updateOne(
              { userId },
              { $set: { lastNotificationEmailSentAt: new Date() } },
            );
            notified.push(`${userId} (${email})`);
          }
        }
      }
    }

  }

  return { checked: allSettings.length, notified };
}
