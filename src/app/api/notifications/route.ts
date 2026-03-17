/**
 * Notifications API — REST + SSE.
 * GET ?limit=N  → JSON list of notifications
 * GET (no limit) → SSE stream
 * PATCH → mark all as read
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/apiAuth';
import { connectDB } from '@/lib/mongodb';
import Notification from '@/models/Notification';

export const dynamic = 'force-dynamic';

type Controller = ReadableStreamDefaultController<Uint8Array>;

interface ClientEntry {
  ctrl: Controller;
  userId: string;
}

const clients = new Set<ClientEntry>();
const encoder = new TextEncoder();

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
  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      const entry: ClientEntry = { ctrl, userId };
      clients.add(entry);

      send(ctrl, JSON.stringify({ type: 'info', title: 'Connected', message: 'SSE connected', ts: Date.now() }));

      const ping = setInterval(() => {
        try {
          ctrl.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          clearInterval(ping);
          clients.delete(entry);
        }
      }, 25000);
    },
    cancel(ctrl) {
      for (const entry of clients) {
        if (entry.ctrl === ctrl) {
          clients.delete(entry);
          break;
        }
      }
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
