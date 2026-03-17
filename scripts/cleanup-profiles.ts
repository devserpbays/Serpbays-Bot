/**
 * Cleanup stale browser profiles from disk.
 * Removes profile directories for users who no longer have settings/accounts.
 *
 * Run: npx tsx scripts/cleanup-profiles.ts [--dry-run]
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { readdirSync, rmSync, statSync } from 'fs';
import { join } from 'path';
import { connectDB } from '../src/lib/mongodb';
import Settings from '../src/models/Settings';

const PROFILES_DIR = join(process.cwd(), 'profiles');
const DRY_RUN = process.argv.includes('--dry-run');
const MAX_AGE_DAYS = 30;

async function main() {
  await connectDB();

  let cleaned = 0;
  let skipped = 0;
  let totalSize = 0;

  let userDirs: string[];
  try {
    userDirs = readdirSync(PROFILES_DIR);
  } catch {
    console.log('No profiles directory found — nothing to clean');
    return;
  }

  for (const userId of userDirs) {
    const userPath = join(PROFILES_DIR, userId);
    try {
      const stat = statSync(userPath);
      if (!stat.isDirectory()) continue;
    } catch { continue; }

    // Check if user still has settings
    const settings = await Settings.findOne({ userId }).lean();
    const connectedPlatforms = new Set(
      (settings?.socialAccounts || [])
        .filter((a: { active?: boolean }) => a.active !== false)
        .map((a: { platform: string }) => a.platform)
    );

    // Check each platform subdir
    let platformDirs: string[];
    try {
      platformDirs = readdirSync(userPath);
    } catch { continue; }

    for (const platform of platformDirs) {
      const platformPath = join(userPath, platform);
      try {
        const stat = statSync(platformPath);
        if (!stat.isDirectory()) continue;

        // Skip if platform is still connected
        if (connectedPlatforms.has(platform)) {
          skipped++;
          continue;
        }

        // Check age
        const ageDays = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24);
        if (ageDays < MAX_AGE_DAYS) {
          skipped++;
          continue;
        }

        // Calculate size (rough)
        const sizeEstimate = getDirectorySize(platformPath);
        totalSize += sizeEstimate;

        if (DRY_RUN) {
          console.log(`[DRY RUN] Would remove: ${platformPath} (${Math.round(sizeEstimate / 1024)}KB, ${Math.round(ageDays)}d old)`);
        } else {
          rmSync(platformPath, { recursive: true, force: true });
          console.log(`Removed: ${platformPath} (${Math.round(sizeEstimate / 1024)}KB)`);
        }
        cleaned++;
      } catch {}
    }

    // Remove empty user dirs
    if (!DRY_RUN) {
      try {
        const remaining = readdirSync(userPath);
        if (remaining.length === 0) {
          rmSync(userPath, { recursive: true, force: true });
        }
      } catch {}
    }
  }

  console.log(`\nCleanup complete: ${cleaned} removed, ${skipped} skipped, ~${Math.round(totalSize / (1024 * 1024))}MB freed${DRY_RUN ? ' (dry run)' : ''}`);
}

function getDirectorySize(dir: string): number {
  let size = 0;
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      try {
        const stat = statSync(join(dir, entry));
        size += stat.isFile() ? stat.size : 0;
      } catch {}
    }
  } catch {}
  return size;
}

main().catch(err => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
