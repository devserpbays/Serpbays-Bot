/**
 * Centralized cookie storage — MongoDB with AES-256-GCM encryption at rest.
 * Platform libs can load cookies from DB and inject into Playwright contexts.
 *
 * Security properties:
 *   - AES-256-GCM: authenticated encryption — any bit-flip in the DB record
 *     will cause decryption to throw, not silently return garbage.
 *   - Cookie field allowlist: only known browser-cookie fields are persisted;
 *     arbitrary extra fields (e.g. injected by a malicious export) are stripped.
 *   - No cookie values ever appear in server logs.
 *   - Every upload is audit-logged (count + metadata, never values).
 *   - lastAccessedAt is stamped on every load for an access trail.
 */
import { connectDB } from './mongodb';
import BrowserCookie from '@/models/BrowserCookie';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { logActivity } from './activityLog';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

// Fields allowed to be persisted. Any extra keys from the browser export are stripped.
const ALLOWED_COOKIE_FIELDS = new Set([
  'name', 'value', 'domain', 'path', 'expires', 'expirationDate',
  'secure', 'httpOnly', 'sameSite', 'url', 'partitionKey',
]);

function getEncryptionKey(): Buffer | null {
  const key = process.env.COOKIE_ENCRYPTION_KEY;
  if (!key) {
    // Warn loudly — cookies will be stored in plaintext until the key is set.
    // Generate one: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
    // Then add COOKIE_ENCRYPTION_KEY=<hex> to .env.local
    console.error(
      '[cookieStore] ⚠ COOKIE_ENCRYPTION_KEY is not set — cookies stored in PLAINTEXT. ' +
      'Set it in .env.local: COOKIE_ENCRYPTION_KEY=$(node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))")',
    );
    return null;
  }
  if (key.length !== 64) {
    console.error('[cookieStore] ⚠ COOKIE_ENCRYPTION_KEY must be exactly 64 hex chars (32 bytes). Encryption disabled.');
    return null;
  }
  return Buffer.from(key, 'hex');
}

function encrypt(data: string): string {
  const key = getEncryptionKey();
  if (!key) return data; // Fallback: plaintext (with warning above)

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();
  // Format: enc:<iv>:<authTag>:<ciphertext>
  return `enc:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

function decrypt(data: string): string {
  if (!data || !data.startsWith('enc:')) return data; // Plaintext fallback

  const key = getEncryptionKey();
  if (!key) return data;

  const parts = data.split(':');
  if (parts.length !== 4) return data;

  const iv = Buffer.from(parts[1], 'hex');
  const tag = Buffer.from(parts[2], 'hex');
  const encrypted = parts[3];

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Strip any fields not in the allowlist and ensure name/value are plain strings.
 * This prevents arbitrary data smuggled inside a cookie export from reaching the DB.
 */
function sanitizeCookies(cookies: unknown[]): Record<string, unknown>[] {
  return cookies
    .filter(c => typeof c === 'object' && c !== null && !Array.isArray(c))
    .map(c => {
      const raw = c as Record<string, unknown>;
      const safe: Record<string, unknown> = {};
      for (const field of ALLOWED_COOKIE_FIELDS) {
        if (field in raw) {
          // Coerce name and value to string — never allow objects/functions here
          if (field === 'name' || field === 'value') {
            safe[field] = String(raw[field] ?? '');
          } else {
            safe[field] = raw[field];
          }
        }
      }
      return safe;
    })
    .filter(c => c.name && c.value); // drop cookies without name or value
}

interface CookieMeta {
  accountId?: string;
  username?: string;
  displayName?: string;
  verified?: boolean;
}

/** Save/update cookies for a user+platform combo. Encrypted at rest. */
export async function saveCookies(
  userId: string,
  platform: string,
  cookies: unknown[],
  meta: CookieMeta = {},
): Promise<void> {
  await connectDB();

  // Sanitize: strip unknown fields and coerce types before storing
  const sanitized = sanitizeCookies(cookies);
  if (sanitized.length === 0) {
    throw new Error('No valid cookies remain after sanitization');
  }

  const encryptedCookies = encrypt(JSON.stringify(sanitized));
  const isEncrypted = encryptedCookies.startsWith('enc:');

  // Compute cookie expiry for TTL auto-delete.
  // Use the MAXIMUM expiry among cookies that last at least 1 hour, but
  // always enforce a minimum of 90 days so short-lived session cookies
  // (e.g. Facebook xs, Twitter ct0) don't cause premature document deletion.
  const ninetyDaysFromNow = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  const oneHourFromNow = Math.floor(Date.now() / 1000) + 3600;
  const expiryTimes = (sanitized as Array<{ expires?: number; expirationDate?: number }>)
    .map(c => c.expires || c.expirationDate || 0)
    .filter(t => t > oneHourFromNow); // only consider cookies that last > 1 hour
  let expiresAt: Date = ninetyDaysFromNow; // default: 90 days
  if (expiryTimes.length > 0) {
    const latest = Math.max(...expiryTimes);
    const fromCookies = new Date(latest * 1000);
    // Use whichever is further in the future — cookie expiry or our 90-day minimum
    expiresAt = fromCookies > ninetyDaysFromNow ? fromCookies : ninetyDaysFromNow;
  }

  try {
    await BrowserCookie.findOneAndUpdate(
      { userId, platform },
      {
        $set: {
          userId,
          platform,
          cookies: encryptedCookies,
          verified: meta.verified ?? true,
          verifiedAt: new Date(),
          accountId: meta.accountId || '',
          username: meta.username || '',
          displayName: meta.displayName || '',
          expiresAt,
          // Clear auto-pause on cookie re-upload (fresh session)
          autoPaused: false,
          autoPausedReason: '',
        },
        // Only set accountAddedAt on FIRST creation — never overwrite on re-upload
        $setOnInsert: {
          accountAddedAt: new Date(),
          healthScore: 100,
        },
      },
      { upsert: true, returnDocument: 'after' },
    );
    // Audit log: record the upload event (count + encryption status only — never log cookie values)
    await logActivity(userId, platform, 'info', 'cookie_uploaded',
      `${platform} cookies stored (${sanitized.length} cookies, encrypted: ${isEncrypted})`,
      { cookieCount: sanitized.length, encrypted: isEncrypted },
    ).catch(() => {}); // non-fatal
    console.log(`[cookieStore] Saved ${platform} cookies for ${userId} (${sanitized.length} cookies, encrypted: ${isEncrypted})`);
  } catch (err) {
    console.error(`[cookieStore] FAILED to save ${platform} cookies for ${userId}:`, (err as Error).message);
    throw err;
  }
}

/** Load cookies for a user+platform. Returns decrypted array or null. */
export async function loadCookies(
  userId: string,
  platform: string,
): Promise<unknown[] | null> {
  await connectDB();
  const doc = await BrowserCookie.findOne({ userId, platform }).lean();
  if (!doc || !doc.cookies) return null;

  // Stamp access time for audit trail (fire-and-forget, non-fatal)
  BrowserCookie.updateOne(
    { userId, platform },
    { $set: { lastAccessedAt: new Date() } },
  ).catch(() => {});

  // Handle both encrypted (string) and legacy plaintext (array) formats
  if (typeof doc.cookies === 'string') {
    try {
      return JSON.parse(decrypt(doc.cookies));
    } catch {
      console.error(`[cookieStore] Decryption failed for ${platform}/${userId} — possible key mismatch or tampered data`);
      return null;
    }
  }
  // Legacy: already an array (unencrypted)
  return doc.cookies as unknown[];
}

/** Get cookie metadata (verified status, username, etc.). */
export async function getCookieMeta(
  userId: string,
  platform: string,
): Promise<(CookieMeta & { verifiedAt?: Date }) | null> {
  await connectDB();
  const doc = await BrowserCookie.findOne(
    { userId, platform },
    { verified: 1, verifiedAt: 1, accountId: 1, username: 1, displayName: 1 },
  ).lean();
  if (!doc) return null;
  return {
    verified: doc.verified,
    verifiedAt: doc.verifiedAt,
    accountId: doc.accountId,
    username: doc.username,
    displayName: doc.displayName,
  };
}

/** Delete cookies for a user+platform (e.g., when disconnecting account). */
export async function deleteCookies(
  userId: string,
  platform: string,
): Promise<void> {
  await connectDB();
  await BrowserCookie.deleteOne({ userId, platform });
}
