import { connectDB } from './mongodb';
import Subscription from '@/models/Subscription';
import { getPlanLimits, type PlanLimits } from './plans';

export interface UserPlan {
  plan: string;
  status: string;
  limits: PlanLimits;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId?: string;
}

// Internal user IDs that get unlimited (business-tier) access for free.
// Comma-separated Clerk user IDs in env, e.g. "user_abc,user_xyz"
const INTERNAL_USER_IDS = new Set(
  (process.env.INTERNAL_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean)
);

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

  await connectDB();
  const sub = await Subscription.findOne({ userId }).lean();

  if (!sub || sub.plan === 'free') {
    return {
      plan: 'free',
      status: 'active',
      limits: getPlanLimits('free'),
      cancelAtPeriodEnd: false,
    };
  }

  return {
    plan: sub.plan,
    status: sub.status,
    limits: getPlanLimits(sub.plan),
    currentPeriodEnd: sub.currentPeriodEnd,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    stripeCustomerId: sub.stripeCustomerId,
  };
}

export async function ensureSubscription(userId: string): Promise<void> {
  await connectDB();
  const existing = await Subscription.findOne({ userId });
  if (!existing) {
    await Subscription.create({ userId, plan: 'free', status: 'active' });
  }
}
