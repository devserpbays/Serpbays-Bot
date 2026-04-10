/**
 * Notifications API — REST + SSE.
 * GET ?limit=N  → JSON list of notifications
 * GET (no limit) → SSE stream
 * PATCH → mark all as read
 *
 * Real-time push: worker processes publish to Redis channel `notif:{userId}`.
 * A single module-level Redis subscriber routes those messages to SSE clients.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/apiAuth';
import { connectDB } from '@/lib/mongodb';
import Notification from '@/models/Notification';
import { getRedisSubscriber } from '@/lib/redis';

export const dynamic = 'force-dynamic';

type Controller = ReadableStreamDefaultController<Uint8Array>;

interface ClientEntry {
  ctrl: Controller;
  userId: string;
}

// NOTE: This Set is per-process. In a multi-process deployment, SSE clients
// only receive notifications from the process they are connected to.
// Cross-process delivery relies on the Redis pub/sub layer.
const clients = new Set<ClientEntry>();
const encoder = new TextEncoder();

// Heartbeat/cleanup interval: remove stale clients every 30s
setInterval(() => {
  for (const entry of clients) {
    try {
      entry.ctrl.enqueue(encoder.encode(': heartbeat\n\n'));
    } catch {
      // Client is stale/disconnected — remove it
      clients.delete(entry);
    }
  }
}, 30_000);

// Track which Redis channels we're subscribed to (per-userId)
const subscribedChannels = new Set<string>();
let redisListenerAttached = false;

function send(ctrl: Controller, data: string) {
  try {
    ctrl.enqueue(encoder.encode(`data: ${data}\n\n`));
  } catch {
    for (const entry of clients) {
      if (entry.ctrl === ctrl) {
        clients.delete(entry);
        break;
      }
    }
  }
}

/** Ensure the single Redis subscriber is listening and routes messages to SSE clients. */
function ensureRedisListener() {
  if (redisListenerAttached) return;
  try {
    const sub = getRedisSubscriber();
    sub.on('message', (channel: string, message: string) => {
      // channel = notif:{userId}
      const userId = channel.startsWith('notif:') ? channel.slice(6) : null;
      if (!userId) return;
      for (const entry of clients) {
        if (entry.userId === userId) {
          send(entry.ctrl, message);
        }
      }
    });
    redisListenerAttached = true;
  } catch { /* Redis unavailable — fallback to client polling */ }
}

/** Subscribe to a user's Redis channel (once), routing messages to their SSE clients. */
async function subscribeUser(userId: string) {
  ensureRedisListener();
  const channel = `notif:${userId}`;
  if (subscribedChannels.has(channel)) return;
  try {
    const sub = getRedisSubscriber();
    await sub.subscribe(channel);
    subscribedChannels.add(channel);
  } catch { /* Redis unavailable */ }
}

/** Unsubscribe from a user's Redis channel when they have no more active SSE clients. */
async function unsubscribeUserIfIdle(userId: string) {
  const channel = `notif:${userId}`;
  if (!subscribedChannels.has(channel)) return;
  const hasActiveClients = [...clients].some(e => e.userId === userId);
  if (hasActiveClients) return;
  try {
    const sub = getRedisSubscriber();
    await sub.unsubscribe(channel);
    subscribedChannels.delete(channel);
  } catch { /* ignore */ }
}

/** Push a notification to a specific user's SSE clients. */
export function pushNotification(
  userId: string,
  type: 'success' | 'warning' | 'error' | 'info',
  title: string,
  message: string,
  platform?: string | null,
) {
  const payload = JSON.stringify({ type, title, message, platform: platform ?? null, ts: Date.now() });
  for (const entry of clients) {
    if (entry.userId === userId) {
      send(entry.ctrl, payload);
    }
  }
}

/** Broadcast to ALL users (use sparingly). */
export function broadcastNotification(
  type: 'success' | 'warning' | 'error' | 'info',
  title: string,
  message: string,
) {
  const payload = JSON.stringify({ type, title, message, platform: null, ts: Date.now() });
  for (const entry of clients) {
    send(entry.ctrl, payload);
  }
}

export async function GET(req: NextRequest) {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  // If ?limit param is present, return JSON list
  const limitParam = req.nextUrl.searchParams.get('limit');
  if (limitParam) {
    await connectDB();
    const limit = Math.min(parseInt(limitParam) || 20, 50);
    const notifications = await Notification.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return NextResponse.json({ notifications });
  }

  // Otherwise SSE stream
  let _entry: ClientEntry | undefined;
  let _ping: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      _entry = { ctrl, userId };
      clients.add(_entry);

      send(ctrl, JSON.stringify({ type: 'info', title: 'Connected', message: 'SSE connected', ts: Date.now() }));

      _ping = setInterval(() => {
        try {
          ctrl.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          clearInterval(_ping);
          if (_entry) clients.delete(_entry);
        }
      }, 25000);

      // Subscribe to this user's Redis channel for cross-process push
      await subscribeUser(userId);
    },
    async cancel() {
      if (_ping) clearInterval(_ping);
      if (_entry) clients.delete(_entry);
      await unsubscribeUserIfIdle(userId);
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

/** Mark one or all notifications as read */
export async function PATCH(req: NextRequest) {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  await connectDB();

  try {
    const body = await req.json();
    if (body?.id) {
      // Mark single notification as read
      await Notification.updateOne({ _id: body.id, userId }, { $set: { read: true } });
      return NextResponse.json({ ok: true });
    }
  } catch { /* no body = mark all */ }

  // Mark all as read
  await Notification.updateMany({ userId, read: false }, { $set: { read: true } });
  return NextResponse.json({ ok: true });
}
