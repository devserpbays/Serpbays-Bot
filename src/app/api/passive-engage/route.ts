import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/apiAuth';
import { checkRateLimit } from '@/lib/rateLimit';
import { runPassiveEngagement } from '@/lib/passiveEngage';

export const dynamic = 'force-dynamic';

const VALID_PLATFORMS = ['twitter', 'reddit', 'facebook', 'youtube'];

/**
 * POST /api/passive-engage
 * Body: { platform: string }
 *
 * Runs passive engagement (likes/reactions/watch) on the given platform
 * without posting any comments. Used to build account trust between comment runs.
 */
export async function POST(req: NextRequest) {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  const rl = await checkRateLimit(userId, 'api');
  if (rl) return NextResponse.json({ error: rl.error }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const platform = body.platform as string;

  if (!platform || !VALID_PLATFORMS.includes(platform)) {
    return NextResponse.json(
      { error: `Invalid platform. Valid: ${VALID_PLATFORMS.join(', ')}` },
      { status: 400 }
    );
  }

  const result = await runPassiveEngagement(userId, platform);

  return NextResponse.json({ success: true, result });
}
