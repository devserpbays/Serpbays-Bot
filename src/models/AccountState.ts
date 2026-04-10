import mongoose, { Schema } from 'mongoose';

/**
 * AccountState — per-(user, platform) operational state for the extension-driven
 * engagement system. Replaces the old `BrowserCookie` model after the cookie/Playwright
 * pipeline was removed.
 *
 * What this stores:
 *  - Identity (username, displayName, accountId)
 *  - Health scoring (totalPosts, totalErrors, healthScore)
 *  - Pause / backoff / automation-block state
 *  - Per-account proxy URL and timezone fingerprint
 *
 * What this no longer stores (was on BrowserCookie):
 *  - cookies blob, verified flag, verifiedAt, expiresAt TTL, lastAccessedAt —
 *    the extension uses the user's live browser session, so none of these apply.
 */
const AccountStateSchema = new Schema(
  {
    userId:      { type: String, required: true },
    platform:    { type: String, required: true },
    accountId:   { type: String, default: '' },
    username:    { type: String, default: '' },
    displayName: { type: String, default: '' },

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
    proxyUrl: { type: String, default: '' },

    // ── Consistent timezone fingerprint ──────────────────────────────────────
    assignedTimezone: { type: String, default: '' },

    // ── Tiered automation-block tracking ─────────────────────────────────────
    // # of consecutive automation blocks in the current 7-day window.
    automationBlockCount:  { type: Number, default: 0 },
    // When the current block window started (reset when first block is > 7 days ago).
    automationBlockedAt:   { type: Date,   default: null },
    // If set and in the future, the account is in browse-only mode (no posting).
    browseOnlyUntil:       { type: Date,   default: null },
  },
  { timestamps: true, collection: 'accountstates' }
);

AccountStateSchema.index({ userId: 1, platform: 1 }, { unique: true });

export default mongoose.models.AccountState ||
  mongoose.model('AccountState', AccountStateSchema);
