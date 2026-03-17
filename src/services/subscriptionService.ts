/**
 * Subscription data access layer.
 * All Subscription DB operations go through here.
 */
import { connectDB } from '@/lib/mongodb';
import Subscription from '@/models/Subscription';

export interface SubscriptionDoc {
  _id: string;
  userId: string;
  paypalSubscriptionId: string;
  paypalPayerId: string;
  plan: 'free' | 'pro' | 'business';
  status: 'active' | 'past_due' | 'canceled' | 'trialing' | 'incomplete';
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd: boolean;
}

// ── Reads ──

export async function getSubscription(userId: string): Promise<SubscriptionDoc | null> {
  await connectDB();
  return Subscription.findOne({ userId }).lean() as Promise<SubscriptionDoc | null>;
}

export async function getSubscriptionMutable(userId: string) {
  await connectDB();
  return Subscription.findOne({ userId });
}

export async function getAllSubscriptions(): Promise<SubscriptionDoc[]> {
  await connectDB();
  return Subscription.find({}).lean() as Promise<SubscriptionDoc[]>;
}

// ── Writes ──

export async function createSubscription(
  userId: string,
  data: Partial<SubscriptionDoc> = {},
): Promise<SubscriptionDoc> {
  await connectDB();
  const doc = await Subscription.create({
    userId,
    plan: 'free',
    status: 'active',
    ...data,
  });
  return doc.toObject() as SubscriptionDoc;
}

export async function ensureSubscription(userId: string): Promise<void> {
  await connectDB();
  const existing = await Subscription.findOne({ userId });
  if (!existing) {
    await Subscription.create({ userId, plan: 'free', status: 'active' });
  }
}

export async function updateSubscription(
  userId: string,
  update: Partial<SubscriptionDoc>,
): Promise<SubscriptionDoc | null> {
  await connectDB();
  return Subscription.findOneAndUpdate(
    { userId },
    { $set: update },
    { new: true },
  ).lean() as Promise<SubscriptionDoc | null>;
}

export async function upsertSubscription(
  userId: string,
  update: Partial<SubscriptionDoc>,
): Promise<SubscriptionDoc> {
  await connectDB();
  return Subscription.findOneAndUpdate(
    { userId },
    { $set: update, $setOnInsert: { userId } },
    { upsert: true, new: true },
  ).lean() as Promise<SubscriptionDoc>;
}
