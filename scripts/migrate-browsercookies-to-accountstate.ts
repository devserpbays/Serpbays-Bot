/**
 * One-shot migration: copy `browsercookies` documents → `accountstates`,
 * stripping cookie/verification/expiry fields. Idempotent — re-running it
 * will upsert.
 *
 * Run: npx tsx scripts/migrate-browsercookies-to-accountstate.ts
 *
 * After verifying the new collection looks correct, drop the old one:
 *   db.browsercookies.drop()
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import mongoose from 'mongoose';

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set');

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) throw new Error('No db handle');

  const src = db.collection('browsercookies');
  const dst = db.collection('accountstates');

  const total = await src.countDocuments();
  console.log(`[migrate] Found ${total} browsercookies docs`);

  if (total === 0) {
    console.log('[migrate] Nothing to migrate. Exiting.');
    await mongoose.disconnect();
    return;
  }

  // Ensure unique index on the destination so duplicates fail loudly
  await dst.createIndex({ userId: 1, platform: 1 }, { unique: true });

  let migrated = 0;
  let skipped = 0;

  const cursor = src.find({});
  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    if (!doc) continue;

    // Strip cookie-pipeline-only fields
    const {
      _id, cookies, verified, verifiedAt, expiresAt, lastAccessedAt,
      ...keep
    } = doc;
    void _id; void cookies; void verified; void verifiedAt; void expiresAt; void lastAccessedAt;

    try {
      await dst.updateOne(
        { userId: keep.userId, platform: keep.platform },
        { $setOnInsert: keep },
        { upsert: true }
      );
      migrated++;
    } catch (err) {
      console.error(`[migrate] Failed for ${keep.userId}/${keep.platform}:`, (err as Error).message);
      skipped++;
    }
  }

  console.log(`[migrate] Done. migrated=${migrated} skipped=${skipped}`);
  console.log(`[migrate] Verify: db.accountstates.countDocuments() == ${migrated}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[migrate] FATAL:', err);
  process.exit(1);
});
