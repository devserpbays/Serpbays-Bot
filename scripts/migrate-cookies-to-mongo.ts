// One-time migration: reads all profiles/{userId}/{platform}/cookies.json from disk
// and saves them into the BrowserCookie MongoDB collection.
// Run: npx tsx scripts/migrate-cookies-to-mongo.ts
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/social-engagement-bot';
const PROFILES_DIR = join(process.cwd(), 'profiles');
const PLATFORMS = ['twitter', 'facebook', 'reddit', 'quora', 'youtube', 'pinterest'];

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  // Import model after connection
  const BrowserCookie = (await import('../src/models/BrowserCookie')).default;

  if (!existsSync(PROFILES_DIR)) {
    console.log('No profiles directory found — nothing to migrate');
    process.exit(0);
  }

  const userDirs = readdirSync(PROFILES_DIR);
  let migrated = 0;
  let skipped = 0;

  for (const userId of userDirs) {
    for (const platform of PLATFORMS) {
      const cookiePath = join(PROFILES_DIR, userId, platform, 'cookies.json');
      const verifiedPath = join(PROFILES_DIR, userId, platform, '.verified');

      if (!existsSync(cookiePath)) continue;

      try {
        const cookies = JSON.parse(readFileSync(cookiePath, 'utf8'));
        let meta: Record<string, unknown> = {};
        if (existsSync(verifiedPath)) {
          try { meta = JSON.parse(readFileSync(verifiedPath, 'utf8')); } catch {}
        }

        await BrowserCookie.findOneAndUpdate(
          { userId, platform },
          {
            userId,
            platform,
            cookies,
            verified: meta.loggedIn === true,
            verifiedAt: meta.ts ? new Date(meta.ts as string) : new Date(),
            accountId: (meta.accountId as string) || '',
            username: (meta.username as string) || '',
            displayName: (meta.displayName as string) || '',
          },
          { upsert: true },
        );
        migrated++;
        console.log(`  ✓ ${userId}/${platform} — ${cookies.length} cookies`);
      } catch (err) {
        skipped++;
        console.error(`  ✗ ${userId}/${platform} — ${(err as Error).message}`);
      }
    }
  }

  console.log(`\nMigration complete: ${migrated} migrated, ${skipped} skipped`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
