import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

const OPENCLAW_HOST = process.env.OPENCLAW_HOST || '127.0.0.1';
const OPENCLAW_PORT = process.env.OPENCLAW_PORT || '18789';

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"')
    .replace(/\s{2,}/g, ' ').trim();
}

/** Get meta/attribute value — tries both attribute orderings */
function getMeta(html: string, ...patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const m = html.match(pattern);
    if (m?.[1]) return stripHtml(m[1]).trim().slice(0, 500);
  }
  return '';
}

function extractFromHtml(html: string): { companyName: string; companyDescription: string } | null {
  // --- Company name ---
  let companyName =
    getMeta(html,
      /property=["']og:site_name["'][^>]*content=["']([^"'<>]+)["']/i,
      /content=["']([^"'<>]+)["'][^>]*property=["']og:site_name["']/i,
    );

  if (!companyName) {
    // Try JSON-LD organization name
    const jm = html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi);
    if (jm) {
      for (const block of jm) {
        try {
          const src = block.replace(/<[^>]+>/g, '');
          const data = JSON.parse(src);
          const graph: unknown[] = data['@graph'] || [data];
          const org = graph.find((n: unknown) => {
            const t = (n as Record<string, unknown>)['@type'];
            return Array.isArray(t) ? t.some((s: string) => /Organization|LocalBusiness/.test(s)) : /Organization|LocalBusiness/.test(String(t || ''));
          }) as Record<string, unknown> | undefined;
          if (org?.name) { companyName = String(org.name).trim(); break; }
        } catch { /* skip */ }
      }
    }
  }

  if (!companyName) {
    // Fall back to title tag: "Brand Name | Page" or "Page | Brand Name"
    const title = getMeta(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
    if (title) {
      const parts = title.split(/\s*[\|–\-—]\s*/);
      // Take the shorter part (usually the brand name)
      companyName = parts.sort((a, b) => a.length - b.length)[0]?.trim() || '';
    }
  }

  // --- Description ---
  let companyDescription =
    getMeta(html,
      /property=["']og:description["'][^>]*content=["']([^"'<>]+)["']/i,
      /content=["']([^"'<>]+)["'][^>]*property=["']og:description["']/i,
      /name=["']description["'][^>]*content=["']([^"'<>]+)["']/i,
      /content=["']([^"'<>]+)["'][^>]*name=["']description["']/i,
    );

  // Try JSON-LD service/organization description (often richer)
  const jsonBlocks = html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const block of jsonBlocks) {
    try {
      const src = block.replace(/<[^>]+>/g, '');
      const data = JSON.parse(src);
      const graph: unknown[] = data['@graph'] || [data];

      // Prefer Service or ProfessionalService description
      const svc = graph.find((n: unknown) => {
        const t = String((n as Record<string, unknown>)['@type'] || '');
        return /Service|ProfessionalService/.test(t);
      }) as Record<string, unknown> | undefined;

      if (svc?.description && String(svc.description).length > (companyDescription?.length || 0)) {
        companyDescription = String(svc.description).slice(0, 600);
        break;
      }
    } catch { /* skip */ }
  }

  // Fall back to first meaningful paragraph
  if (!companyDescription) {
    const pMatch = html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || [];
    for (const p of pMatch) {
      const text = stripHtml(p).trim();
      if (text.length > 60) { companyDescription = text.slice(0, 400); break; }
    }
  }

  if (!companyName || !companyDescription) return null;
  return { companyName, companyDescription };
}

/** Call OpenClaw directly, bypassing the isHumanReadable JSON filter */
async function polishWithAI(name: string, rawDesc: string): Promise<string | null> {
  const prompt = `Rewrite this company description in 2-3 clear, factual sentences (80-160 words). Third person. No marketing fluff. Keep all key facts.

Company: ${name}
Raw description: ${rawDesc}

Output only the rewritten description, no labels or formatting.`;

  try {
    const res = await fetch(`http://${OPENCLAW_HOST}:${OPENCLAW_PORT}/api/agent/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: prompt, sessionId: `extract-${Date.now()}` }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const raw = await res.text();
    // Extract text from payloads envelope if present
    const firstBrace = raw.indexOf('{');
    if (firstBrace !== -1) {
      try {
        const data = JSON.parse(raw.slice(firstBrace));
        const text = (data?.payloads as Array<{ text?: string }>)?.[0]?.text
          || (data?.result as { content?: string })?.content
          || data?.content as string;
        if (text && typeof text === 'string' && text.length > 20 && !text.startsWith('{')) {
          return text.trim();
        }
      } catch { /* fall through */ }
    }
    // If no JSON envelope, use raw text directly
    const clean = raw.replace(/\x1b\[[0-9;]*m/g, '').trim();
    if (clean.length > 20 && !clean.startsWith('{') && !clean.includes('"payloads"')) {
      return clean.slice(0, 600);
    }
    return null;
  } catch { return null; }
}

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  const body = await req.json().catch(() => ({}));
  const rawUrl = (body.url as string || '').trim();
  if (!rawUrl) return NextResponse.json({ error: 'URL is required' }, { status: 400 });

  // Normalize URL
  let url: URL;
  try {
    url = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
  } catch {
    return NextResponse.json({ error: 'Invalid URL — please include https://' }, { status: 400 });
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    return NextResponse.json({ error: 'Only http/https URLs are allowed' }, { status: 400 });
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.startsWith('127.') || hostname.startsWith('192.168.') || hostname.startsWith('10.')) {
    return NextResponse.json({ error: 'Private URLs are not allowed' }, { status: 400 });
  }

  try {
    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return NextResponse.json({ error: `Website returned error ${response.status} — check the URL and try again` }, { status: 422 });
    }

    const html = await response.text();
    const extracted = extractFromHtml(html);

    if (!extracted) {
      return NextResponse.json({ error: 'This website does not have enough meta information. Please fill in manually.' }, { status: 422 });
    }

    // Try to polish the description with AI (optional, falls back to raw if AI fails)
    const polished = await polishWithAI(extracted.companyName, extracted.companyDescription);

    return NextResponse.json({
      companyName: extracted.companyName,
      companyDescription: polished || extracted.companyDescription,
    });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes('timeout') || msg.includes('abort')) {
      return NextResponse.json({ error: 'Website took too long to respond — try again or fill in manually' }, { status: 422 });
    }
    console.error('[extract-company-info]', msg);
    return NextResponse.json({ error: 'Could not reach this website — check the URL and try again' }, { status: 422 });
  }
}
