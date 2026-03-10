/**
 * SSE endpoint for real-time dashboard notifications.
 * User-scoped: each user only receives their own notifications.
 */
import { NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/apiAuth';

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
    // Remove dead clients
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

/** Broadcast to ALL users (use sparingly — only for system-wide announcements). */
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

export async function GET() {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      const entry: ClientEntry = { ctrl, userId };
      clients.add(entry);

      // Initial ping to confirm connection
      send(ctrl, JSON.stringify({ type: 'info', title: 'Connected', message: 'SSE connected', ts: Date.now() }));

      // Keep-alive ping every 25s
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
