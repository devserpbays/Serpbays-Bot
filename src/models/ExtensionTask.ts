import mongoose, { Schema } from 'mongoose';

const ExtensionTaskSchema = new Schema({
  userId: { type: String, required: true, index: true },
  postId: { type: String, default: '' },
  platform: { type: String, required: true, enum: ['twitter', 'facebook', 'reddit', 'quora', 'youtube', 'pinterest'] },
  action: { type: String, required: true, enum: ['comment', 'like', 'upvote', 'follow', 'retweet', 'bookmark'] },
  url: { type: String, required: true },
  text: { type: String, default: '' },
  status: {
    type: String,
    enum: ['pending', 'dispatched', 'completed', 'failed', 'skipped'],
    default: 'pending',
  },
  // Result from extension
  result: {
    success: { type: Boolean, default: null },
    error: { type: String, default: '' },
    completedAt: { type: Date, default: null },
  },
  dispatchedAt: { type: Date, default: null },
  // Auto-expire pending tasks after 24 hours
  expiresAt: { type: Date, default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) },
}, { timestamps: true });

ExtensionTaskSchema.index({ userId: 1, status: 1 });
ExtensionTaskSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.ExtensionTask || mongoose.model('ExtensionTask', ExtensionTaskSchema);
