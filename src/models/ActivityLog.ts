import mongoose, { Schema } from 'mongoose';

const ActivityLogSchema = new Schema({
  userId: { type: String, required: true, index: true },
  platform: { type: String, required: true },
  level: { type: String, enum: ['info', 'warn', 'error', 'success'], default: 'info' },
  action: { type: String, required: true }, // e.g. 'cron_start', 'scrape', 'evaluate', 'post', 'auth_error'
  message: { type: String, required: true },
  meta: { type: Schema.Types.Mixed, default: {} }, // extra data (counts, urls, scores, etc.)
}, { timestamps: true });

// Auto-expire logs after 7 days
ActivityLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });
// Query index
ActivityLogSchema.index({ userId: 1, createdAt: -1 });
ActivityLogSchema.index({ userId: 1, platform: 1, createdAt: -1 });

export default mongoose.models.ActivityLog || mongoose.model('ActivityLog', ActivityLogSchema);
