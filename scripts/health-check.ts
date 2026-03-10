import { config } from 'dotenv';
config({ path: '.env.local' });
import mongoose from 'mongoose';
import { readFileSync, readdirSync } from 'fs';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const db = mongoose.connection.db!;

  const users = await db.collection('settings').find({ userId: { $exists: true, $nin: [null, ''] } }).project({ userId: 1, companyName: 1, autoPostingPaused: 1, socialAccounts: 1, keywords: 1, twitterKeywords: 1 }).toArray();

  console.log('=== ALL USERS ===');
  for (const u of users) {
    const accts = (u.socialAccounts || []).map((a: any) => a.platform + ':' + (a.username || '?')).join(', ') || '(none)';
    const kws = (u.twitterKeywords?.length ? u.twitterKeywords : u.keywords || []).slice(0, 2).join(', ') || '(none)';
    const paused = u.autoPostingPaused ? 'PAUSED' : 'ACTIVE';
    console.log(`  ${u.userId} | ${u.companyName || '(no name)'} | ${paused} | ${accts} | KW: ${kws}`);
  }

  console.log('\n=== POST STATS ===');
  const stats = await db.collection('posts').aggregate([
    { $group: { _id: { userId: '$userId', status: '$status', platform: '$platform' }, count: { $sum: 1 } } },
    { $sort: { '_id.userId': 1 } }
  ]).toArray();
  const byUser: Record<string, Record<string, number>> = {};
  for (const s of stats) {
    const uid = s._id.userId || 'no-user';
    const key = `${s._id.platform}:${s._id.status}`;
    if (!byUser[uid]) byUser[uid] = {};
    byUser[uid][key] = s.count;
  }
  for (const [uid, statuses] of Object.entries(byUser)) {
    const posted = Object.entries(statuses).filter(([k]) => k.includes(':posted')).map(([k, v]) => `${k.split(':')[0]}=${v}`).join(', ');
    const evaluated = Object.entries(statuses).filter(([k]) => k.includes(':evaluated')).reduce((sum, [, v]) => sum + v, 0);
    const newCount = Object.entries(statuses).filter(([k]) => k.includes(':new')).reduce((sum, [, v]) => sum + v, 0);
    console.log(`  ${uid.slice(-10)}: posted=[${posted}] evaluated=${evaluated} new=${newCount}`);
  }

  console.log('\n=== LAST 5 POSTED COMMENTS ===');
  const recent = await db.collection('posts').find({ status: 'posted' }).sort({ postedAt: -1 }).limit(5).project({ platform: 1, postedAt: 1, postedByAccount: 1, userId: 1, editedReply: 1 }).toArray();
  for (const p of recent) {
    const date = p.postedAt ? new Date(p.postedAt).toISOString().slice(0, 16) : 'no-date';
    const reply = (p.editedReply || '').slice(0, 60);
    console.log(`  ${p.platform} | ${p.postedByAccount || '?'} | ${date} | "${reply}..."`);
  }

  console.log('\n=== LAST 5 CRON RUNS ===');
  try {
    const log = JSON.parse(readFileSync('data/cron-log.json', 'utf8'));
    for (const e of log.slice(-5)) {
      const dur = e.finishedAt ? Math.round((new Date(e.finishedAt).getTime() - new Date(e.startedAt).getTime()) / 1000) + 's' : 'running';
      console.log(`  ${e.platform} | user:${(e.userId || 'default').slice(-8)} | exit:${e.exitCode ?? '?'} | ${dur} | ${new Date(e.startedAt).toISOString().slice(11, 19)}`);
    }
  } catch { console.log('  (no log)'); }

  try {
    const pids = readdirSync('data').filter(f => f.endsWith('.pid'));
    console.log(`\n=== ACTIVE LOCKS: ${pids.length ? pids.join(', ') : 'none'} ===`);
  } catch {}

  // OpenClaw check
  try {
    const token = process.env.OPENCLAW_GATEWAY_TOKEN;
    const res = await fetch(`http://127.0.0.1:18789/v1/responses`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'google-antigravity/gemini-3-flash', input: 'Say OK', max_output_tokens: 5 }),
    });
    const data = await res.json() as any;
    const text = data?.output?.[0]?.content?.[0]?.text || '';
    console.log(`\n=== OPENCLAW: ${res.status === 200 ? 'OK' : 'ERROR'} | model: ${data.model} | response: "${text}" ===`);
  } catch (e: any) {
    console.log(`\n=== OPENCLAW: FAILED | ${e.message} ===`);
  }

  // Twitter HTTP check
  try {
    const { verifyCredentialsHttp, isTwitterConfiguredHttp } = await import('../src/lib/twitterHttp');
    const { join } = await import('path');
    const dir = join(process.cwd(), '.twitter-profile');
    const configured = isTwitterConfiguredHttp(dir);
    if (configured) {
      const user = await verifyCredentialsHttp(dir);
      console.log(`=== TWITTER HTTP: OK | @${user.username} (${user.name}) ===`);
    } else {
      console.log('=== TWITTER HTTP: No cookies.json ===');
    }
  } catch (e: any) {
    console.log(`=== TWITTER HTTP: ERROR | ${e.message} ===`);
  }

  process.exit(0);
}
main();
