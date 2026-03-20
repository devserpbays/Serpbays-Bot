import mongoose, { Schema } from 'mongoose';

const NotificationSchema = new Schema({
  userId: { type: String, required: true, index: true },
  type: { type: String, enum: ['cookie_expired', 'cookie_expiring_soon', 'account_removed', 'not_connected', 'info'], required: true },
  platform: { type: String, default: '' },
  accountId: { type: String, default: '' },
  title: { type: String, required: true },
  message: { type: String, required: true },
  read: { type: Boolean, default: false },
  actionUrl: { type: String, default: '' },
  actionLabel: { type: String, default: '' },
}, { timestamps: true });

// Auto-expire after 30 days
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });
NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, type: 1, platform: 1, createdAt: -1 });

export default mongoose.models.Notification || mongoose.model('Notification', NotificationSchema);
