/**
 * cookieUploadGuard — security layer applied to all 6 /api/set-*-cookies routes.
 *
 * Enforces:
 *   1. Rate limiting — max 8 uploads per 15 minutes per user (blocks automated abuse)
 *   2. Payload size cap — rejects bodies > 200 KB (prevents DoS / memory exhaustion)
 *   3. Returns the raw body string so the caller parses JSON after validation
 */
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from './rateLimit';

const MAX_PAYLOAD_BYTES = 200_000; // 200 KB — far more than any real cookie payload

export async function cookieUploadGuard(
  req: NextRequest,
  userId: string,
): Promise<{ rawBody: string; error?: never } | { rawBody?: never; error: NextResponse }> {
  // 1. Rate limit: per user to prevent brute-force cookie stuffing
  const rl = await checkRateLimit(userId, 'cookieUpload');
  if (rl) {
    return {
      error: NextResponse.json(
        { error: rl.error, retryAfter: rl.retryAfter },
        { status: 429 },
      ),
    };
  }

  // 2. Payload size: read raw body as text so we can measure it
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return {
      error: NextResponse.json({ error: 'Failed to read request body' }, { status: 400 }),
    };
  }

  if (rawBody.length > MAX_PAYLOAD_BYTES) {
    return {
      error: NextResponse.json(
        { error: `Payload too large (${rawBody.length} bytes). Maximum is 200 KB.` },
        { status: 413 },
      ),
    };
  }

  return { rawBody };
}
