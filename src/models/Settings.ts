import mongoose, { Schema } from 'mongoose';

const SettingsSchema = new Schema({
  companyName: { type: String, required: true },
  companyDescription: { type: String, required: true },
  keywords: [{ type: String }],
  platforms: [{ type: String, enum: ['twitter', 'reddit', 'facebook', 'linkedin', 'quora'], default: ['twitter', 'reddit'] }],
  subreddits: [{ type: String }],
  promptTemplate: { type: String, default: '' },
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
  linkedinKeywords: [{ type: String }],
  linkedinDailyLimit: { type: Number, default: 5 },
  linkedinAutoPostThreshold: { type: Number, default: 70 },
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
