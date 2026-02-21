/**
 * Twitter/X Credential Verifier & Setup
 *
 * Verifies that TWITTER_AUTH_TOKEN and TWITTER_CT0 are configured and valid.
 * Mirrors fb-login.ts for Twitter — no browser needed (cookie-based auth).
 *
 * Usage:
 *   npx tsx scripts/twitter-verify.ts
 *
 * How to get your Twitter cookies:
 *   1. Log in to x.com in your browser
 *   2. Open DevTools → Application → Cookies → https://x.com
 *   3. Copy the values of "auth_token", "ct0", and optionally "twid"
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { isTwitterConfigured, verifyCredentials } from '../src/lib/twitter';
import { createInterface } from 'readline';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const ENV_FILE = join(process.cwd(), '.env.local');

function readEnvFile(): Record<string, string> {
  if (!existsSync(ENV_FILE)) return {};
  const content = readFileSync(ENV_FILE, 'utf-8');
  const env: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const match = line.match(/^([A-Z_0-9]+)=(.*)$/);
    if (match) env[match[1]] = match[2];
  }
  return env;
}

function updateEnvFile(updates: Record<string, string>): void {
  let content = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf-8') : '';
  const lines = content.split('\n');

  for (const [key, value] of Object.entries(updates)) {
    const idx = lines.findIndex((l) => l.startsWith(`${key}=`));
    if (idx >= 0) {
      lines[idx] = `${key}=${value}`;
    } else {
      lines.push(`${key}=${value}`);
    }
    process.env[key] = value;
  }

  writeFileSync(ENV_FILE, lines.join('\n'));
}

async function prompt(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

async function main() {
  console.log('=== Twitter/X Credential Setup ===\n');

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  // Step 1: Check if already configured and valid
  if (isTwitterConfigured()) {
    console.log('Credentials found in .env.local. Verifying...');
    try {
      const user = await verifyCredentials();
      console.log(`\n✓ Twitter authenticated as: @${user.username} (${user.name})`);
      console.log(`  User ID: ${user.id}`);
      console.log('\nSetup complete. You can now run:');
      console.log('  npx tsx scripts/twitter-cron.ts\n');
      rl.close();
      return;
    } catch (err) {
      console.log(`\n✗ Credentials are invalid or expired: ${(err as Error).message}`);
      console.log('Please enter new credentials below.\n');
    }
  } else {
    console.log('No Twitter credentials found. Please enter them below.\n');
    console.log('How to get your cookies:');
    console.log('  1. Log in to x.com in your browser');
    console.log('  2. Open DevTools (F12) → Application → Cookies → https://x.com');
    console.log('  3. Copy the values for: auth_token, ct0, twid\n');
  }

  // Step 2: Prompt for credentials
  const authToken = await prompt(rl, 'auth_token (TWITTER_AUTH_TOKEN): ');
  if (!authToken) {
    console.error('\nError: auth_token is required.');
    rl.close();
    process.exit(1);
  }

  const ct0 = await prompt(rl, 'ct0 (TWITTER_CT0): ');
  if (!ct0) {
    console.error('\nError: ct0 is required.');
    rl.close();
    process.exit(1);
  }

  const twid = await prompt(rl, 'twid (TWITTER_TWID, optional — press Enter to skip): ');

  // Step 3: Save to .env.local
  const updates: Record<string, string> = {
    TWITTER_AUTH_TOKEN: authToken,
    TWITTER_CT0: ct0,
  };
  if (twid) updates['TWITTER_TWID'] = twid;

  updateEnvFile(updates);
  console.log('\nCredentials saved to .env.local. Verifying...');

  // Step 4: Verify the new credentials
  try {
    const user = await verifyCredentials();
    console.log(`\n✓ Twitter authenticated as: @${user.username} (${user.name})`);
    console.log(`  User ID: ${user.id}`);
    console.log('\nSetup complete. You can now run:');
    console.log('  npx tsx scripts/twitter-cron.ts');
  } catch (err) {
    console.error(`\n✗ Verification failed: ${(err as Error).message}`);
    console.log('Check your credentials and run this script again.');
  }

  rl.close();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
