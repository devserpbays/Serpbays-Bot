import { NextResponse } from 'next/server';
import { readFileSync, statSync } from 'fs';
import { join } from 'path';
import { getAuthUserId } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

/**
 * Authenticated download endpoint for the GetMention Chrome extension.
 *
 * The zip lives OUTSIDE the Next.js `public/` folder so it cannot be fetched
 * without passing Clerk auth. We read the version from the bundled
 * manifest.json at request time so the filename the user downloads always
 * matches the currently-built extension.
 */

const ZIP_PATH = join(process.cwd(), 'extension-builds', 'getmention-latest.zip');
const MANIFEST_PATH = join(process.cwd(), 'extension', 'manifest.json');

function getCurrentVersion(): string {
  try {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8')) as { version?: string };
    return manifest.version || 'latest';
  } catch {
    return 'latest';
  }
}

// HEAD — lightweight metadata probe used by the dashboard UI to show the
// current version next to the download button. No auth required, only the
// version string is exposed.
export async function HEAD() {
  try {
    const stat = statSync(ZIP_PATH);
    const version = getCurrentVersion();
    return new NextResponse(null, {
      status: 200,
      headers: {
        'X-Extension-Version': version,
        'X-Extension-Size': String(stat.size),
        'X-Extension-Built-At': stat.mtime.toISOString(),
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}

// GET — authenticated download. Only signed-in users can pull the zip.
export async function GET() {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  let file: Buffer;
  try {
    file = readFileSync(ZIP_PATH);
  } catch {
    return NextResponse.json(
      { error: 'Extension build not found — contact support' },
      { status: 404 },
    );
  }

  const version = getCurrentVersion();
  const filename = `getmention-${version}.zip`;

  return new NextResponse(file as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Length': String(file.length),
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-Extension-Version': version,
      // Don't cache — version can change at any time when a new zip ships
      'Cache-Control': 'no-store, must-revalidate',
    },
  });
}
