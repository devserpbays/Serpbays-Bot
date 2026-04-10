import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Settings from '@/models/Settings';
import type { SocialAccount } from '@/lib/types';
import { getAuthUserId } from '@/lib/apiAuth';
import { rm } from 'fs/promises';
import { existsSync } from 'fs';
import { getWarmupStatus } from '@/lib/humanize';
import { computeHealthScore } from '@/lib/accountHealth';
import AccountState from '@/models/AccountState';

export const dynamic = 'force-dynamic';

// GET — return social accounts for the authenticated user.
// Merges Settings.socialAccounts with AccountState (the extension's per-platform
// state doc) so health/pause/proxy info comes through to the UI.
export async function GET() {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  await connectDB();
  const settings = await Settings.findOne({ userId });
  const accounts: SocialAccount[] = [...(settings?.socialAccounts ?? [])];

  // Load all AccountState docs for this user
  const allStates = await AccountState.find(
    { userId },
    { platform: 1, accountId: 1, username: 1, displayName: 1, createdAt: 1, healthScore: 1, autoPaused: 1, totalPosts: 1, totalErrors: 1, errorCount: 1, backoffUntil: 1, lastPostedAt: 1, proxyUrl: 1 },
  ).lean();

  // Build a map: platform → state metadata
  const stateMap = new Map<string, { username?: string; displayName?: string; accountId?: string; connectedAt?: string; healthScore?: number; autoPaused?: boolean; totalPosts?: number; totalErrors?: number; proxyUrl?: string }>();
  for (const c of allStates) {
    // Always recompute from live AccountState fields — never serve stale default 100
    const liveHealth = computeHealthScore({
      totalPosts:   c.totalPosts  ?? 0,
      totalErrors:  c.totalErrors ?? 0,
      errorCount:   c.errorCount  ?? 0,
      backoffUntil: c.backoffUntil ?? null,
      createdAt:    c.createdAt,
      lastPostedAt: c.lastPostedAt ?? null,
      autoPaused:   c.autoPaused  ?? false,
    });
    stateMap.set(c.platform, {
      username: c.username || '',
      displayName: c.displayName || '',
      accountId: c.accountId || '',
      connectedAt: c.createdAt ? new Date(c.createdAt).toISOString() : undefined,
      healthScore: liveHealth.score,
      autoPaused: c.autoPaused ?? false,
      totalPosts: c.totalPosts ?? 0,
      totalErrors: c.totalErrors ?? 0,
      proxyUrl: (c as typeof c & { proxyUrl?: string }).proxyUrl || '',
    });
  }

  // Enrich existing accounts with state + fill in missing username from AccountState.
  // Remove stale entries whose AccountState document no longer exists.
  let settingsNeedsSave = false;
  const validAccounts: SocialAccount[] = [];
  for (const acc of accounts) {
    const state = stateMap.get(acc.platform);
    if (state) {
      if (!acc.username && state.username) acc.username = state.username;
      if (!acc.displayName && state.displayName) acc.displayName = state.displayName;
      (acc as SocialAccount & { healthScore?: number; autoPaused?: boolean; totalPosts?: number; totalErrors?: number }).healthScore = state.healthScore ?? 100;
      (acc as SocialAccount & { healthScore?: number; autoPaused?: boolean; totalPosts?: number; totalErrors?: number }).autoPaused = state.autoPaused ?? false;
      (acc as SocialAccount & { healthScore?: number; autoPaused?: boolean; totalPosts?: number; totalErrors?: number }).totalPosts = state.totalPosts ?? 0;
      (acc as SocialAccount & { healthScore?: number; autoPaused?: boolean; totalPosts?: number; totalErrors?: number }).totalErrors = state.totalErrors ?? 0;
      acc.proxyUrl = state.proxyUrl || '';
      (acc as SocialAccount & { warmup?: ReturnType<typeof getWarmupStatus> }).warmup =
        getWarmupStatus(state.connectedAt ? new Date(state.connectedAt) : null);
      validAccounts.push(acc);
    } else {
      // No AccountState document at all — entry is stale, remove it
      settingsNeedsSave = true;
    }
  }

  // Persist cleanup if any stale entries were removed
  if (settingsNeedsSave && settings) {
    settings.socialAccounts = validAccounts;
    await settings.save().catch(() => {});
  }

  // Add any state entries not yet in socialAccounts
  const existingPlatforms = new Set(validAccounts.map((a: SocialAccount) => a.platform));
  for (const [platform, state] of stateMap.entries()) {
    if (!existingPlatforms.has(platform)) {
      const newAcc: SocialAccount & { warmup?: ReturnType<typeof getWarmupStatus> } = {
        id: state.accountId || `${platform.slice(0, 2)}_${userId}`,
        platform,
        username: state.username || '',
        displayName: state.displayName || '',
        profileDir: `profiles/${userId}/${platform}`,
        accountIndex: 0,
        addedAt: state.connectedAt || new Date().toISOString(),
        active: true,
        warmup: getWarmupStatus(state.connectedAt ? new Date(state.connectedAt) : null),
      };
      validAccounts.push(newAcc);

      // Backfill into Settings so it stays in sync
      if (settings) {
        settings.socialAccounts = validAccounts;
        await settings.save().catch(() => {});
      }
    }
  }

  return NextResponse.json({ accounts: validAccounts });
}

// DELETE — remove a social account by id from the user's Settings
// Also cleans up the profile directory and AccountState entry
export async function DELETE(req: NextRequest) {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  await connectDB();
  let body: { accountId?: string };
  try { body = await req.json(); } catch { body = {}; }
  const id = body.accountId;

  if (!id) {
    return NextResponse.json({ error: 'accountId required' }, { status: 400 });
  }

  const settings = await Settings.findOne({ userId });
  if (!settings) {
    return NextResponse.json({ error: 'Settings not found' }, { status: 404 });
  }

  // Find the account before removing to get platform + profileDir
  const removedAccount = (settings.socialAccounts || []).find(
    (a: SocialAccount) => a.id === id
  );

  settings.socialAccounts = (settings.socialAccounts || []).filter(
    (a: SocialAccount) => a.id !== id
  );
  await settings.save();

  if (removedAccount) {
    // Delete AccountState entry so the account doesn't reappear on next GET
    await AccountState.deleteOne({ userId, platform: removedAccount.platform });

    // Clean up any leftover profile directory from the legacy Playwright pipeline
    if (removedAccount.profileDir) {
      try {
        const pathMod = require('path');
        const resolved = pathMod.resolve(process.cwd(), removedAccount.profileDir);
        const profilesBase = pathMod.resolve(process.cwd(), 'profiles');
        const relative = pathMod.relative(profilesBase, resolved);
        if (resolved.startsWith(profilesBase + pathMod.sep) && !relative.startsWith('..') && existsSync(resolved)) {
          await rm(resolved, { recursive: true, force: true });
          console.log(`[social-accounts] Removed profile dir: ${resolved}`);
        }
      } catch (err) {
        console.error(`[social-accounts] Failed to remove profile dir: ${(err as Error).message}`);
      }
    }
  }

  return NextResponse.json({
    success: true,
    accounts: settings.socialAccounts,
    removed: removedAccount ? { platform: removedAccount.platform, username: removedAccount.username } : null,
  });
}

// PATCH — update proxy URL for a specific platform account
export async function PATCH(req: NextRequest) {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  await connectDB();
  let body: { platform?: string; proxyUrl?: string };
  try { body = await req.json(); } catch { body = {}; }

  const { platform, proxyUrl } = body;
  if (!platform) return NextResponse.json({ error: 'platform required' }, { status: 400 });

  await AccountState.findOneAndUpdate(
    { userId, platform },
    { $set: { proxyUrl: (proxyUrl || '').trim() } },
    { upsert: true },
  );

  return NextResponse.json({ success: true });
}
