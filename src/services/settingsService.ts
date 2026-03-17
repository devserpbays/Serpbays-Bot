/**
 * Settings data access layer.
 * All Settings DB operations go through here.
 * To switch DB engines, only this file needs to change.
 */
import { connectDB } from '@/lib/mongodb';
import Settings from '@/models/Settings';

export interface SettingsDoc {
  _id: string;
  userId: string;
  companyName: string;
  companyDescription: string;
  keywords: string[];
  platforms: string[];
  subreddits: string[];
  promptTemplate: string;
  socialAccounts: SocialAccount[];
  facebookGroups: string[];
  facebookKeywords: string[];
  facebookDailyLimit: number;
  facebookAutoPostThreshold: number;
  twitterKeywords: string[];
  twitterDailyLimit: number;
  twitterAutoPostThreshold: number;
  redditKeywords: string[];
  redditDailyLimit: number;
  redditAutoPostThreshold: number;
  quoraKeywords: string[];
  quoraDailyLimit: number;
  quoraAutoPostThreshold: number;
  youtubeKeywords: string[];
  youtubeDailyLimit: number;
  youtubeAutoPostThreshold: number;
  pinterestKeywords: string[];
  pinterestDailyLimit: number;
  pinterestAutoPostThreshold: number;
  cronTimezone: string;
  cronStartHour: number;
  cronEndHour: number;
  cronDays: number[];
  cronIntervalMinutes: number;
  lastCronRunAt: Date | null;
  autoPostingPaused: boolean;
  isAdmin: boolean;
  notificationEmail: string;
  notifyViaEmail: boolean;
  lastNotificationEmailSentAt: Date | null;
}

export interface SocialAccount {
  id: string;
  platform: string;
  username: string;
  displayName: string;
  profileDir: string;
  accountIndex: number;
  active: boolean;
  addedAt: string;
}

// ── Reads ──

export async function getSettings(userId: string): Promise<SettingsDoc | null> {
  await connectDB();
  return Settings.findOne({ userId }).lean() as Promise<SettingsDoc | null>;
}

export async function getSettingsField<K extends keyof SettingsDoc>(
  userId: string,
  field: K,
): Promise<Pick<SettingsDoc, K> | null> {
  await connectDB();
  return Settings.findOne({ userId }).select(field as string).lean() as Promise<Pick<SettingsDoc, K> | null>;
}

export async function getAllActiveSettings(): Promise<SettingsDoc[]> {
  await connectDB();
  return Settings.find({
    userId: { $exists: true, $nin: [null, ''] },
    autoPostingPaused: { $ne: true },
  }).lean() as Promise<SettingsDoc[]>;
}

export async function getAllSettings(): Promise<SettingsDoc[]> {
  await connectDB();
  return Settings.find({
    userId: { $exists: true, $nin: [null, ''] },
  }).lean() as Promise<SettingsDoc[]>;
}

export async function getAdminUserList(projection?: Record<string, number>): Promise<SettingsDoc[]> {
  await connectDB();
  return Settings.find({}, projection).lean() as Promise<SettingsDoc[]>;
}

export async function isUserAdmin(userId: string): Promise<boolean> {
  await connectDB();
  const doc = await Settings.findOne({ userId }, { isAdmin: 1 }).lean();
  return !!(doc as SettingsDoc | null)?.isAdmin;
}

// ── Writes ──

export async function upsertSettings(userId: string, data: Partial<SettingsDoc>): Promise<SettingsDoc> {
  await connectDB();
  return Settings.findOneAndUpdate(
    { userId },
    { $set: data, $setOnInsert: { userId } },
    { upsert: true, new: true, runValidators: true },
  ).lean() as Promise<SettingsDoc>;
}

export async function createSettings(userId: string, data: Partial<SettingsDoc> = {}): Promise<SettingsDoc> {
  await connectDB();
  const doc = await Settings.create({ userId, ...data });
  return doc.toObject() as SettingsDoc;
}

export async function updateSettingsField(
  userId: string,
  update: Record<string, unknown>,
): Promise<void> {
  await connectDB();
  await Settings.updateOne({ userId }, { $set: update });
}

export async function setAdminStatus(userId: string, isAdmin: boolean): Promise<void> {
  await connectDB();
  await Settings.updateOne({ userId }, { $set: { isAdmin } });
}

export async function recordCronRun(userId: string): Promise<void> {
  await connectDB();
  await Settings.updateOne({ userId }, { $set: { lastCronRunAt: new Date() } });
}

export async function batchRecordCronRun(userIds: string[]): Promise<void> {
  await connectDB();
  await Settings.updateMany(
    { userId: { $in: userIds } },
    { $set: { lastCronRunAt: new Date() } },
  );
}
