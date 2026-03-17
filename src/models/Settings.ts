import mongoose, { Schema } from 'mongoose';

const SocialAccountSchema = new Schema({
  id: { type: String, required: true },
  platform: { type: String, required: true },
  username: { type: String, default: '' },
  displayName: { type: String, default: '' },
  profileDir: { type: String, default: '' },
  accountIndex: { type: Number, default: 0 },
  addedAt: { type: String, default: () => new Date().toISOString() },
  active: { type: Boolean, default: true },
}, { _id: false });

const SettingsSchema = new Schema({
  userId: { type: String, unique: true, index: true, sparse: true },
  companyName: { type: String, default: '' },
  companyDescription: { type: String, default: '' },
  keywords: [{ type: String }],
  platforms: [{ type: String, enum: ['twitter', 'reddit', 'facebook', 'quora', 'youtube', 'pinterest'] }],
  subreddits: [{ type: String }],
  promptTemplate: { type: String, default: '' },
  socialAccounts: { type: [SocialAccountSchema], default: [] },
  facebookGroups: [{ type: String }],
  facebookKeywords: [{ type: String }],
  facebookDailyLimit: { type: Number, default: 5 },
  facebookAutoPostThreshold: { type: Number, default: 70 },
  twitterKeywords: [{ type: String }],
  twitterDailyLimit: { type: Number, default: 10 },
  twitterAutoPostThreshold: { type: Number, default: 70 },
  redditKeywords: [{ type: String }],
  redditDailyLimit: { type: Number, default: 5 },
  redditAutoPostThreshold: { type: Number, default: 70 },
  quoraKeywords: [{ type: String }],
  quoraDailyLimit: { type: Number, default: 3 },
  quoraAutoPostThreshold: { type: Number, default: 70 },
  youtubeKeywords: [{ type: String }],
  youtubeDailyLimit: { type: Number, default: 5 },
  youtubeAutoPostThreshold: { type: Number, default: 70 },
  pinterestKeywords: [{ type: String }],
  pinterestDailyLimit: { type: Number, default: 5 },
  pinterestAutoPostThreshold: { type: Number, default: 70 },
  autoPostingPaused: { type: Boolean, default: false },
  cronTimezone: { type: String, default: '' },
  cronStartHour: { type: Number, default: 9 },
  cronEndHour: { type: Number, default: 18 },
  cronDays: { type: [Number], default: [0, 1, 2, 3, 4, 5, 6] },
  cronIntervalMinutes: { type: Number, default: 15, min: 15, max: 360 },
  lastCronRunAt: { type: Date, default: null },
  isAdmin: { type: Boolean, default: false },
  // Notification preferences
  notificationEmail: { type: String, default: '' },
  notifyViaEmail: { type: Boolean, default: true },
  lastNotificationEmailSentAt: { type: Date, default: null },
}, { timestamps: true });

// Index for cron scheduler query: find active users not paused
SettingsSchema.index({ autoPostingPaused: 1, userId: 1 });

export default mongoose.models.Settings || mongoose.model('Settings', SettingsSchema);
