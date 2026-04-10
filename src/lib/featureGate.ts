import { NextResponse } from 'next/server';
import { getUserPlan } from './subscription';

/**
 * Check if user's plan allows the requested feature/limit.
 * Returns null if allowed, or a NextResponse 403 if blocked.
 */
export async function checkPlanLimit(
  userId: string,
  feature: 'platforms' | 'keywords' | 'autoPosting' | 'cronScheduling',
  currentCount?: number
): Promise<NextResponse | null> {
  const { plan, status, limits } = await getUserPlan(userId);

  // Subscription status check:
  // - Free users (plan === 'free') have no Stripe subscription, so status will be
  //   something like 'none' or undefined — they should always be allowed through.
  // - Paid users must have an active or trialing subscription to proceed.
  // - Canceled or past_due paid users are blocked even if they somehow still have a plan set.
  if (status !== 'active' && status !== 'trialing' && plan !== 'free') {
    return NextResponse.json(
      { error: 'Your subscription is inactive. Please update your payment method.', upgrade: true },
      { status: 403 }
    );
  }

  // Block paid plans with canceled/past_due status — they should not retain paid features
  if ((status === 'canceled' || status === 'past_due') && plan !== 'free') {
    return NextResponse.json(
      { error: 'Your subscription is inactive. Please update your payment method.', upgrade: true },
      { status: 403 }
    );
  }

  if (feature === 'platforms' && currentCount !== undefined) {
    if (currentCount > limits.platforms) {
      return NextResponse.json(
        { error: `Your ${plan} plan allows ${limits.platforms} platform(s). Upgrade to add more.`, upgrade: true },
        { status: 403 }
      );
    }
  }

  if (feature === 'keywords' && currentCount !== undefined) {
    if (currentCount > limits.keywords) {
      return NextResponse.json(
        { error: `Your ${plan} plan allows ${limits.keywords} keyword(s). Upgrade to add more.`, upgrade: true },
        { status: 403 }
      );
    }
  }

  if (feature === 'autoPosting' && !limits.autoPosting) {
    return NextResponse.json(
      { error: 'Auto-posting is not available on your plan. Upgrade to Pro or Business.', upgrade: true },
      { status: 403 }
    );
  }

  if (feature === 'cronScheduling' && !limits.cronScheduling) {
    return NextResponse.json(
      { error: 'Cron scheduling is not available on your plan. Upgrade to Pro or Business.', upgrade: true },
      { status: 403 }
    );
  }

  return null;
}

/**
 * Check daily post limit for a user's plan.
 */
export async function checkDailyPostLimit(
  userId: string,
  todayCount: number
): Promise<NextResponse | null> {
  const { limits } = await getUserPlan(userId);

  if (todayCount >= limits.dailyPostsPerPlatform) {
    return NextResponse.json(
      { error: `Daily post limit reached (${todayCount}/${limits.dailyPostsPerPlatform}). Upgrade for more.`, upgrade: true },
      { status: 403 }
    );
  }

  return null;
}
