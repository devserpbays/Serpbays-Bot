import { connectDB } from './mongodb';
import Subscription from '@/models/Subscription';
import { getPlanLimits, type PlanLimits } from './plans';
import { getRedis } from './redis';

export interface UserPlan {
  plan: string;
  status: string;
  limits: PlanLimits;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd: boolean;
  paypalSubscriptionId?: string;
}

// Internal user IDs that get unlimited (business-tier) access for free.
// Comma-separated Clerk user IDs in env, e.g. "user_abc,user_xyz"
const INTERNAL_USER_IDS = new Set(
  (process.env.INTERNAL_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean)
);

const PLAN_CACHE_TTL = 60; // 60 seconds

export async function getUserPlan(userId: string): Promise<UserPlan> {
  // Internal/dev users get full business-tier access unconditionally
  if (INTERNAL_USER_IDS.has(userId)) {
    return {
      plan: 'business',
      status: 'active',
      limits: getPlanLimits('business'),
      cancelAtPeriodEnd: false,
    };
  }

  // Check Redis cache first
  try {
    const redis = getRedis();
    const cached = await redis.get(`plan:${userId}`);
    if (cached) {
      const parsed = JSON.parse(cached);
      return {
        ...parsed,
        limits: getPlanLimits(parsed.plan),
        currentPeriodEnd: parsed.currentPeriodEnd ? new Date(parsed.currentPeriodEnd) : undefined,
      };
    }
  } catch { /* fall through to DB */ }

  await connectDB();
  const sub = await Subscription.findOne({ userId }).lean();

  let result: UserPlan;

  if (!sub || sub.plan === 'free') {
    result = {
      plan: 'free',
      status: 'active',
      limits: getPlanLimits('free'),
      cancelAtPeriodEnd: false,
    };
  } else {
    result = {
      plan: sub.plan,
      status: sub.status,
      limits: getPlanLimits(sub.plan),
      currentPeriodEnd: sub.currentPeriodEnd,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      paypalSubscriptionId: sub.paypalSubscriptionId,
    };
  }

  // Cache in Redis for 60s
  try {
    const redis = getRedis();
    await redis.set(`plan:${userId}`, JSON.stringify({
      plan: result.plan,
      status: result.status,
      cancelAtPeriodEnd: result.cancelAtPeriodEnd,
      currentPeriodEnd: result.currentPeriodEnd?.toISOString(),
      paypalSubscriptionId: result.paypalSubscriptionId,
    }), 'EX', PLAN_CACHE_TTL);
  } catch { /* best effort */ }

  return result;
}

export async function ensureSubscription(userId: string): Promise<void> {
  await connectDB();
  const existing = await Subscription.findOne({ userId });
  if (!existing) {
    await Subscription.create({ userId, plan: 'free', status: 'active' });
  }
}
