/**
 * Centralized cookie storage — MongoDB with AES-256-GCM encryption at rest.
 * Platform libs can load cookies from DB and inject into Playwright contexts.
 */
import { connectDB } from './mongodb';
import BrowserCookie from '@/models/BrowserCookie';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getEncryptionKey(): Buffer | null {
  const key = process.env.COOKIE_ENCRYPTION_KEY;
  if (!key) return null;
  // Key must be 32 bytes (64 hex chars) for AES-256
  return Buffer.from(key, 'hex');
}

function encrypt(data: string): string {
  const key = getEncryptionKey();
  if (!key) return data; // Fallback: no encryption if key not set

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();
  // Format: iv:tag:ciphertext
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
  const encryptedCookies = encrypt(JSON.stringify(cookies));

  // Compute earliest cookie expiry for TTL auto-delete
  let expiresAt: Date | null = null;
  const expiryTimes = (cookies as Array<{ expires?: number; expirationDate?: number }>)
    .map(c => c.expires || c.expirationDate || 0)
    .filter(t => t > 0);
  if (expiryTimes.length > 0) {
    const earliest = Math.min(...expiryTimes);
    expiresAt = new Date(earliest * 1000);
  }

  try {
    await BrowserCookie.findOneAndUpdate(
      { userId, platform },
      {
        userId,
        platform,
        cookies: encryptedCookies,
        verified: meta.verified ?? true,
        verifiedAt: new Date(),
        accountId: meta.accountId || '',
        username: meta.username || '',
        displayName: meta.displayName || '',
        ...(expiresAt ? { expiresAt } : {}),
      },
      { upsert: true, returnDocument: 'after' },
    );
    console.log(`[cookieStore] Saved ${platform} cookies for ${userId} (${cookies.length} cookies, encrypted: ${encryptedCookies.startsWith('enc:')})`);
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

  // Handle both encrypted (string) and legacy plaintext (array) formats
  if (typeof doc.cookies === 'string') {
    try {
      return JSON.parse(decrypt(doc.cookies));
    } catch {
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
