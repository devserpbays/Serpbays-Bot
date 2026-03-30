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
    // When set, the account is paused until the user manually resumes it.
    autoPaused:       { type: Boolean, default: false },
    autoPausedReason: { type: String,  default: '' },
    // Timestamp of most recent successful post.
    lastPostedAt:  { type: Date,   default: null },

    // ── Per-account residential proxy ────────────────────────────────────────
    // Full proxy URL including auth, e.g. http://user:pass@host:port or socks5://...
    // When set, this proxy is used for all browser sessions for this account.
    proxyUrl: { type: String, default: '' },

    // ── Consistent timezone fingerprint ──────────────────────────────────────
    // Assigned once and reused every session — consistency prevents cross-session
    // timezone mismatch which is a known ML detection signal.
    assignedTimezone: { type: String, default: '' },

    // ── Tiered automation-block tracking ─────────────────────────────────────
    // # of consecutive automation blocks in the current 7-day window.
    automationBlockCount:  { type: Number, default: 0 },
    // When the current block window started (reset when first block is > 7 days ago).
    automationBlockedAt:   { type: Date,   default: null },
    // If set and in the future, the account is in browse-only mode (no posting).
    // Scraping, evaluating, and social engagement still run normally.
    browseOnlyUntil:       { type: Date,   default: null },
  },
  { timestamps: true }
);

BrowserCookieSchema.index({ userId: 1, platform: 1 }, { unique: true });
// Auto-delete expired cookies — MongoDB TTL index
BrowserCookieSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true });

export default mongoose.models.BrowserCookie ||
  mongoose.model('BrowserCookie', BrowserCookieSchema);
