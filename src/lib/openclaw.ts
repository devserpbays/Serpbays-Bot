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
  { weight: 35, style: 'add_insight',      instruction: 'Add a related insight or practical tip that builds on what they said — like a knowledgeable peer sharing experience' },
  { weight: 20, style: 'ask_followup',     instruction: 'Respond briefly, then end with a genuine follow-up question that shows real curiosity about their situation' },
  { weight: 20, style: 'short_agree',      instruction: 'Write a SHORT punchy validation or agreement — 1 sentence max, like a quick nod from someone who gets it' },
  { weight: 15, style: 'share_experience', instruction: 'Frame the reply as a brief personal anecdote or "same happened to me" — make it feel like lived experience, not advice' },
  { weight: 10, style: 'mild_disagree',    instruction: 'Respectfully push back on one assumption or add a nuance they might have missed — stay friendly, not combative' },
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
  promptTemplate?: string
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
- Sound like a real person on social media — NOT a brand rep or analyst
- Never start with "Hey", "Hi", "Great post", or "Absolutely"
- Never use: "game-changer", "seamless", "leverage", "robust", "excited to share"
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
  promptTemplate?: string
): Promise<AIEvaluation> {
  const prompt = buildPrompt(postContent, companyName, companyDescription, promptTemplate);

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
