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
    expiresAt:      { type: Date, default: null },
    // Audit trail — updated every time cookies are loaded for use
    lastAccessedAt: { type: Date, default: null },

    // ── Anti-detection: error tracking & backoff ──────────────────────────────
    // Incremented on each posting failure; reset to 0 on success.
    errorCount:   { type: Number, default: 0 },
    // When set and in the future, the account must not post until this time.
    backoffUntil: { type: Date,   default: null },
    // Timestamp of the most recent error, for audit purposes.
    lastErrorAt:  { type: Date,   default: null },

    // ── Account health scoring ────────────────────────────────────────────────
    // Lifetime post counters — updated on every post attempt.
    totalPosts:    { type: Number, default: 0 },
    totalErrors:   { type: Number, default: 0 },
    // Computed health score 0–100. Recalculated after every post.
    healthScore:   { type: Number, default: 100 },
    // When health < AUTO_PAUSE_THRESHOLD the account is auto-paused.
    autoPaused:    { type: Boolean, default: false },
    // Timestamp of most recent successful post.
    lastPostedAt:  { type: Date,   default: null },
  },
  { timestamps: true }
);

BrowserCookieSchema.index({ userId: 1, platform: 1 }, { unique: true });
// Auto-delete expired cookies — MongoDB TTL index
BrowserCookieSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true });

export default mongoose.models.BrowserCookie ||
  mongoose.model('BrowserCookie', BrowserCookieSchema);
