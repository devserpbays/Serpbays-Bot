/**
 * SSE endpoint for real-time dashboard notifications.
 * Uses a module-level Set of writer controllers so pushNotification()
 * can broadcast from anywhere in the server process.
 */
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type Controller = ReadableStreamDefaultController<Uint8Array>;
const clients = new Set<Controller>();
const encoder = new TextEncoder();

function send(ctrl: Controller, data: string) {
  try {
    ctrl.enqueue(encoder.encode(`data: ${data}\n\n`));
  } catch {
    clients.delete(ctrl);
  }
}

/** Push a notification to all connected SSE clients. */
export function pushNotification(
  type: 'success' | 'warning' | 'error' | 'info',
  title: string,
  message: string,
  platform?: string | null,
) {
  const payload = JSON.stringify({ type, title, message, platform: platform ?? null, ts: Date.now() });
  for (const ctrl of clients) send(ctrl, payload);
}

export async function GET() {
  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      clients.add(ctrl);

      // Initial ping to confirm connection
      send(ctrl, JSON.stringify({ type: 'info', title: 'Connected', message: 'SSE connected', ts: Date.now() }));

      // Keep-alive ping every 25 s
      const ping = setInterval(() => {
        try {
          ctrl.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          clearInterval(ping);
          clients.delete(ctrl);
        }
      }, 25000);
    },
    cancel(ctrl) {
      clients.delete(ctrl);
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
