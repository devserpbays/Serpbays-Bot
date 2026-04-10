import { spawn } from 'child_process';
import type { AIEvaluation } from './types';

const OPENCLAW_HOST = process.env.OPENCLAW_HOST || '127.0.0.1';
const OPENCLAW_PORT = process.env.OPENCLAW_PORT || '18789';

// Concurrency limiter for CLI fallback — prevents spawning 100+ subprocesses
const MAX_CONCURRENT_CLI = parseInt(process.env.MAX_OPENCLAW_CLI || '5', 10);
let _activeCLI = 0;
const _cliQueue: Array<() => void> = [];

async function acquireCLISlot(): Promise<void> {
  if (_activeCLI < MAX_CONCURRENT_CLI) { _activeCLI++; return; }
  await new Promise<void>(resolve => _cliQueue.push(resolve));
  _activeCLI++;
}

function releaseCLISlot(): void {
  _activeCLI--;
  const next = _cliQueue.shift();
  if (next) next();
}

// Reply style + length pools — randomly selected each evaluation so replies don't feel uniform
const REPLY_STYLES = [
  { weight: 30, style: 'add_insight',      instruction: 'Add a related insight or practical tip that builds on what they said — like a knowledgeable peer sharing from real experience, not lecturing' },
  { weight: 20, style: 'ask_followup',     instruction: 'Respond briefly, then end with a genuine follow-up question that shows real curiosity about their specific situation' },
  { weight: 20, style: 'short_agree',      instruction: 'Write a SHORT punchy validation or agreement — 1 sentence max, like a quick nod from someone who gets it. Very casual.' },
  { weight: 25, style: 'share_experience', instruction: 'Frame the reply as a brief personal story or "I dealt with this too" — use first person, specific details, make it feel real and lived, not generic advice' },
  { weight: 5,  style: 'mild_disagree',    instruction: 'Gently add a nuance they might have missed — stay warm and conversational, never confrontational or lecturing' },
] as const;

const REPLY_LENGTHS = [
  { weight: 25, instruction: 'Keep it VERY SHORT — 1 punchy sentence, under 90 characters. Brevity is the whole point.' },
  { weight: 45, instruction: 'Aim for 1–2 sentences, 90–180 characters — concise and complete.' },
  { weight: 30, instruction: '2–3 sentences, up to 240 characters. Enough room to add context or a question.' },
] as const;

function pickWeighted<T extends { weight: number }>(pool: readonly T[]): T {
  const total = pool.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  for (const item of pool) { r -= item.weight; if (r <= 0) return item; }
  return pool[pool.length - 1];
}

// --- Build the evaluation prompt ---
function buildPrompt(
  postContent: string,
  companyName: string,
  companyDescription: string,
  promptTemplate?: string,
  brandMentionRate?: number,
): string {
  if (promptTemplate) {
    return promptTemplate
      .replace(/\{postContent\}/g, postContent.slice(0, 1000))
      .replace(/\{companyName\}/g, companyName)
      .replace(/\{companyDescription\}/g, companyDescription);
  }

  const style = pickWeighted(REPLY_STYLES);
  const length = pickWeighted(REPLY_LENGTHS);
  const seed = Math.floor(Math.random() * 9999);

  // Brand mention logic:
  // 1. Buying intent → always try to mention (based on rate)
  // 2. Relevant discussion → sometimes mention company expertise (lower rate)
  // 3. General post → share company insight without name-dropping
  const rate = brandMentionRate ?? 25;

  const buyingIntentPatterns = /\b(looking for|need|want to buy|recommend|suggestion|where can i|anyone know|which service|best tool|best platform|help me find|can someone suggest|any recommendations|who provides|where to get|need help with|searching for|trying to find|should i use|what do you use|how do you handle)\b/i;
  const discussionPatterns = /\b(how to|what is the best|tips for|advice on|strategy for|experience with|thoughts on|opinion on|anyone tried|what works|struggling with|challenge with|problem with|issue with|help with)\b/i;

  const hasBuyingIntent = buyingIntentPatterns.test(postContent);
  const hasDiscussion = discussionPatterns.test(postContent);

  let brandRule;
  if (hasBuyingIntent && Math.random() < (rate / 100)) {
    // Direct brand mention — someone is looking for a solution
    brandRule = `- The person is actively looking for a solution. You MUST include "${companyName}" in your reply — mention it as something you personally use or work with. Examples: "I've been using ${companyName} for this", "check out ${companyName}, they handle this well", "we switched to ${companyName} and it worked out". The reply MUST contain the word "${companyName}".`;
  } else if (hasDiscussion && Math.random() < (rate / 200)) {
    // Soft brand mention — relevant discussion, share expertise
    brandRule = `- This is a relevant discussion. Naturally weave in what "${companyName}" does — mention it once as part of your experience. Examples: "at ${companyName} we've found that...", "working with ${companyName} taught me...", "from my experience at ${companyName}...". Keep it subtle — the focus should be on the insight, not the brand.`;
  } else if (Math.random() < 0.15) {
    // Company expertise without name — spread what the company does
    brandRule = `- Share insight related to what ${companyName} does (${companyDescription?.slice(0, 100)}). Don't mention the company name, but share knowledge that positions you as someone who works in this space. Show expertise naturally.`;
  } else {
    brandRule = `- Do NOT mention any brand or company name — just share helpful insight`;
  }

  // Detect if this is a Facebook group post (URL contains /groups/)
  const isGroupPost = postContent.includes('/groups/') || postContent.includes('facebook.com/groups');

  // In Facebook groups: NEVER mention brand (gets flagged as spam by admins)
  const effectiveBrandRule = isGroupPost
    ? `- IMPORTANT: Do NOT mention any brand, company, or service name. This is a Facebook group — promotional comments get removed. Just share genuine helpful insight.`
    : brandRule;

  return `You are a social media engagement analyst. Analyze the following social media post and determine if it describes a problem or need that "${companyName}" can help solve.

Company: ${companyName}
Company Description: ${companyDescription}

Social Media Post:
"""
${postContent.slice(0, 1000)}
"""

For the suggestedReply field:
- STYLE: ${style.instruction}
- LENGTH: ${length.instruction}
- Sound like a REAL person casually chatting on social media — NOT an expert, analyst, or brand rep
- Reference something SPECIFIC from their post — never write a generic reply that could fit any post
- Use first person ("I", "we", "my") — share your own perspective, not universal truths
- Use casual language, contractions, lowercase where natural. Imperfect grammar is fine.
${effectiveBrandRule}
- Never start with "Hey", "Hi", "Great post", "Absolutely", "This!", "So true"
- Never use: "game-changer", "seamless", "leverage", "robust", "excited to share", "vanity metrics", "high-intent", "trap", "most people"
- Never lecture, diagnose, or tell them what they should do. React to what they said like a friend would.
- Avoid sounding like a marketing professional — no jargon, no buzzwords, no frameworks
- Variety seed: ${seed}

Respond ONLY with valid JSON (no markdown, no code blocks, no extra text):
{
  "relevant": true or false,
  "score": 0 to 100,
  "suggestedReply": "reply text here",
  "tone": "helpful or empathetic or informative or casual",
  "reasoning": "Brief explanation of why this is or isn't relevant"
}`;
}

// Strip ANSI escape codes from a string
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

// Validate that text looks like a human-readable response, not a JSON/debug dump.
// Returns false if the text is an OpenClaw envelope, debug prefix, or raw JSON.
function isHumanReadable(text: string): boolean {
  if (!text || text.trim().length < 5) return false;
  if (/^\s*[\[{]/.test(text)) return false;           // starts with JSON array/object
  if (/"payloads"\s*:/.test(text)) return false;       // OpenClaw response envelope key
  if (/\[agent\/embedded\]/.test(text)) return false;  // OpenClaw debug prefix
  // eslint-disable-next-line no-control-regex
  if (/\x1b\[[\d;]*m/.test(text)) return false;       // residual ANSI escape codes
  return true;
}

// --- Parse AI evaluation from raw text ---
function parseEvaluation(text: string): AIEvaluation | null {
  const clean = stripAnsi(text).trim();

  // Try direct JSON parse
  try {
    const parsed = JSON.parse(clean);
    if ('relevant' in parsed && 'score' in parsed) {
      return parsed as AIEvaluation;
    }
  } catch {
    // not direct JSON
  }

  // Extract JSON from markdown code blocks or mixed text
  const jsonMatch = clean.match(/\{[\s\S]*?"relevant"[\s\S]*?"reasoning"[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]) as AIEvaluation;
    } catch {
      // malformed JSON
    }
  }

  return null;
}

// --- Method 1: OpenClaw Gateway Responses API (raw, no agent context) ---
async function evaluateViaHTTP(prompt: string): Promise<string> {
  const gatewayUrl = `http://${OPENCLAW_HOST}:${OPENCLAW_PORT}`;
  const gatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN || '';

  const res = await fetch(`${gatewayUrl}/v1/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(gatewayToken && { Authorization: `Bearer ${gatewayToken}` }),
    },
    body: JSON.stringify({
      model: 'google-antigravity/gemini-3-flash',
      instructions: 'You are a social media post evaluation API. Analyze the user message and return ONLY valid JSON as specified in the prompt. No markdown, no code blocks, no extra text.',
      input: prompt,
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (!res.ok) {
    throw new Error(`OpenClaw HTTP API returned ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const content = data?.output?.[0]?.content?.[0]?.text;
  if (!content) {
    throw new Error(`OpenClaw HTTP API returned no content: ${JSON.stringify(data).slice(0, 200)}`);
  }

  return stripAnsi(String(content));
}

// --- Spawn CLI safely, passing prompt via stdin to avoid shell injection ---
function spawnCLI(args: string[], input: string, timeoutMs: number = 120000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('openclaw', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: timeoutMs,
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    child.on('close', (code) => {
      if (code === 0 || stdout.trim().length > 0) {
        resolve(stdout);
      } else {
        reject(new Error(`openclaw exited with code ${code}: ${stderr.slice(0, 300)}`));
      }
    });
    child.on('error', reject);

    child.stdin.write(input);
    child.stdin.end();
  });
}

// --- Method 2: OpenClaw CLI (fallback, concurrency-limited) ---
async function evaluateViaCLI(prompt: string): Promise<string> {
  await acquireCLISlot();

  try {
    const sessionId = `social-bot-eval-${Date.now()}`;
    const stdout = await spawnCLI(
      ['agent', '--session-id', sessionId, '--message', prompt, '--json'],
      prompt,
    );

    const clean = stripAnsi(stdout);

    const firstBrace = clean.indexOf('{');
    if (firstBrace !== -1) {
      try {
        const parsed = JSON.parse(clean.slice(firstBrace));
        const aiText = parsed?.result?.payloads?.[0]?.text
          || parsed?.payloads?.[0]?.text
          || parsed?.result?.content
          || parsed?.content
          || parsed?.message;
        if (aiText) return typeof aiText === 'string' ? aiText : JSON.stringify(aiText);
      } catch { /* malformed */ }
    }

    return clean.trim();
  } finally {
    releaseCLISlot();
  }
}

// --- Main evaluation function ---
export async function evaluatePost(
  postContent: string,
  companyName: string,
  companyDescription: string,
  promptTemplate?: string,
  brandMentionRate?: number,
): Promise<AIEvaluation> {
  const prompt = buildPrompt(postContent, companyName, companyDescription, promptTemplate, brandMentionRate);

  let rawResponse: string;

  // Try HTTP API first, fall back to CLI
  try {
    rawResponse = await evaluateViaHTTP(prompt);
    console.log('[openclaw] HTTP success, response:', rawResponse.slice(0, 120));
  } catch (httpErr) {
    console.warn('[openclaw] HTTP failed, falling back to CLI:', (httpErr as Error).message);
    try {
      rawResponse = await evaluateViaCLI(prompt);
      console.log('[openclaw] CLI response:', rawResponse.slice(0, 120));
    } catch (cliErr) {
      console.error('OpenClaw CLI also failed:', (cliErr as Error).message);
      return {
        relevant: false,
        score: 0,
        suggestedReply: '',
        tone: 'helpful',
        reasoning: `OpenClaw evaluation failed: ${(cliErr as Error).message}`,
      };
    }
  }

  // Parse the evaluation from the response
  const evaluation = parseEvaluation(rawResponse);
  if (evaluation) {
    return evaluation;
  }

  return {
    relevant: false,
    score: 0,
    suggestedReply: '',
    tone: 'helpful',
    reasoning: `Could not parse AI response: ${rawResponse.slice(0, 200)}`,
  };
}

// --- Direct OpenClaw agent call (for general-purpose AI tasks) ---
export async function askOpenClaw(message: string, sessionId?: string): Promise<string> {
  const sid = sessionId || `social-bot-${Date.now()}`;

  // Try HTTP first
  try {
    const gatewayUrl = `http://${OPENCLAW_HOST}:${OPENCLAW_PORT}`;
    const res = await fetch(`${gatewayUrl}/api/agent/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, sessionId: sid, json: true }),
      signal: AbortSignal.timeout(120000),
    });

    if (res.ok) {
      const body = stripAnsi(await res.text());
      const firstBrace = body.indexOf('{');
      if (firstBrace !== -1) {
        try {
          const data = JSON.parse(body.slice(firstBrace));
          const text = (data?.payloads as Array<{ text?: string }>)?.[0]?.text
            || (data?.result as { content?: string })?.content
            || data?.content as string
            || data?.message as string;
          if (text && isHumanReadable(String(text))) return String(text);
        } catch { /* fall through to CLI */ }
      }
    }
  } catch {
    // fall through to CLI
  }

  // Fallback: CLI (concurrency-limited)
  await acquireCLISlot();

  try {
    const stdout = await spawnCLI(
      ['agent', '--session-id', sid, '--message', message, '--json'],
      message,
    );

    const clean = stripAnsi(stdout);

    const firstBrace = clean.indexOf('{');
    if (firstBrace !== -1) {
      try {
        const parsed = JSON.parse(clean.slice(firstBrace));
        const aiText = parsed?.payloads?.[0]?.text
          || parsed?.result?.content
          || parsed?.content
          || parsed?.message;
        if (aiText && isHumanReadable(String(aiText))) return String(aiText);
        if ('payloads' in parsed || 'meta' in parsed) return '';
      } catch { /* malformed or truncated */ }
    }

    const result = clean.trim();
    return isHumanReadable(result) ? result : '';
  } finally {
    releaseCLISlot();
  }
}
