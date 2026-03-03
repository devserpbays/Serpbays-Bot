import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export const dynamic = 'force-dynamic';

const OUT_LOG = join(homedir(), '.pm2', 'logs', 'bot-serp-out.log');
const ERR_LOG = join(homedir(), '.pm2', 'logs', 'bot-serp-error.log');

// Lines to skip (server startup noise)
const SKIP_PATTERNS = [
  /^\s*$/,
  /^▲ Next\.js/,
  /^> next-init/,
  /^> next start/,
  /^✓ Starting/,
  /^✓ Ready in/,
  /^- Local:/,
  /^- Network:/,
  /^- Environments:/,
];

interface LogEntry {
  timestamp: string;
  level: 'error' | 'warn' | 'info';
  message: string;
  platform?: string;
}

function detectLevel(line: string): 'error' | 'warn' | 'info' {
  const lower = line.toLowerCase();
  // Mongoose deprecation warnings are warnings, not errors
  if (lower.includes('[mongoose]') || lower.includes('deprecated')) return 'warn';
  if (
    lower.includes('error') || lower.includes('fail') || lower.includes('fatal') ||
    lower.includes('exception') || lower.includes('killed') || lower.includes('not logged in')
  ) return 'error';
  if (
    lower.includes('warn') || lower.includes('warning') || lower.includes('skip') ||
    lower.includes('cooldown') || lower.includes('daily limit') || lower.includes('outside scheduled') ||
    lower.includes('paused') || lower.includes('retry')
  ) return 'warn';
  return 'info';
}

function extractTimestamp(line: string): string | null {
  // Match ISO timestamp in brackets: [2026-03-03T04:44:00.000Z]
  const m = line.match(/\[(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\]/);
  return m ? m[1] : null;
}

function detectPlatform(line: string): string | undefined {
  const lower = line.toLowerCase();
  if (lower.includes('facebook cron') || lower.includes('[fb-') || lower.includes('facebook login') || lower.includes('fb comment')) return 'facebook';
  if (lower.includes('twitter cron') || lower.includes('[tw-') || lower.includes('twitter login')) return 'twitter';
  if (lower.includes('reddit cron') || lower.includes('[rd-') || lower.includes('reddit login')) return 'reddit';
  if (lower.includes('quora cron') || lower.includes('[qa-') || lower.includes('quora login')) return 'quora';
  if (lower.includes('pinterest cron') || lower.includes('[pi-') || lower.includes('pinterest login')) return 'pinterest';
  if (lower.includes('youtube cron') || lower.includes('[yt-') || lower.includes('youtube login')) return 'youtube';
  return undefined;
}

function parseLogFile(filePath: string, defaultLevel: 'error' | 'info'): LogEntry[] {
  if (!existsSync(filePath)) return [];

  const content = readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  // Take last 500 lines
  const recent = lines.slice(-500);

  const entries: LogEntry[] = [];
  // Start with file modification time as the fallback timestamp anchor
  let lastTs = new Date().toISOString();

  for (const line of recent) {
    const msg = line.trim();
    if (!msg) continue;
    if (SKIP_PATTERNS.some(p => p.test(msg))) continue;

    const ts = extractTimestamp(msg);
    if (ts) lastTs = ts;

    entries.push({
      timestamp: lastTs,
      level: defaultLevel === 'error' ? 'error' : detectLevel(msg),
      message: msg,
      platform: detectPlatform(msg),
    });
  }

  return entries;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const level = searchParams.get('level');
  const platform = searchParams.get('platform');
  const limit = Math.min(parseInt(searchParams.get('limit') || '500', 10), 1000);

  const outLogs = parseLogFile(OUT_LOG, 'info');
  const errLogs = parseLogFile(ERR_LOG, 'error');

  let logs = [...outLogs, ...errLogs];

  // Sort chronologically (newest last, like a terminal)
  logs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  if (level) logs = logs.filter(l => l.level === level);
  if (platform) logs = logs.filter(l => l.platform === platform);

  // Return last `limit` entries
  logs = logs.slice(-limit);

  return NextResponse.json({ logs });
}
