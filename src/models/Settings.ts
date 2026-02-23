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
  companyName: { type: String, required: true },
  companyDescription: { type: String, required: true },
  keywords: [{ type: String }],
  platforms: [{ type: String, enum: ['twitter', 'reddit', 'facebook', 'quora'], default: ['twitter', 'reddit'] }],
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
  platformSchedules: {
    type: Map,
    of: new Schema({
      timezone: { type: String, default: 'Asia/Kolkata' },
      days: [{ type: Number }],
      startHour: { type: Number, default: 9 },
      endHour: { type: Number, default: 18 },
      cronInterval: { type: String, default: '*/15 * * * *' },
    }, { _id: false }),
    default: {},
  },
}, { timestamps: true });

export default mongoose.models.Settings || mongoose.model('Settings', SettingsSchema);
