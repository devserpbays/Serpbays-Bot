import mongoose, { Schema } from 'mongoose';

const BrowserCookieSchema = new Schema(
  {
    userId:      { type: String, required: true },
    platform:    { type: String, required: true },
    cookies:     { type: Schema.Types.Mixed, required: true },
    verified:    { type: Boolean, default: false },
    verifiedAt:  { type: Date },
    accountId:   { type: String, default: '' },
    username:    { type: String, default: '' },
    displayName: { type: String, default: '' },
    // Earliest expiration among all cookies — used for TTL auto-delete
    expiresAt:   { type: Date, default: null },
  },
  { timestamps: true }
);

BrowserCookieSchema.index({ userId: 1, platform: 1 }, { unique: true });
// Auto-delete expired cookies — MongoDB TTL index
BrowserCookieSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true });

export default mongoose.models.BrowserCookie ||
  mongoose.model('BrowserCookie', BrowserCookieSchema);
