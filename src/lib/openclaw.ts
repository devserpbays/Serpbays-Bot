import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink } from 'fs/promises';
import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
import { join } from 'path';
import type { AIEvaluation } from './types';

const execAsync = promisify(exec);

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

// --- Build the evaluation prompt ---
function buildPrompt(
  postContent: string,
  companyName: string,
  companyDescription: string,
  promptTemplate?: string
): string {
  const defaultPrompt = `You are a social media engagement analyst. Analyze the following social media post and determine if it describes a problem or need that "${companyName}" can help solve.

Company: ${companyName}
Company Description: ${companyDescription}

Social Media Post:
"""
${postContent.slice(0, 1000)}
"""

Respond ONLY with valid JSON (no markdown, no code blocks, no extra text):
{
  "relevant": true or false,
  "score": 0 to 100,
  "suggestedReply": "A helpful, non-salesy reply (2-3 sentences MAX, under 280 characters) that naturally mentions how ${companyName} could help. Keep it short, conversational and genuine — like a real person on social media.",
  "tone": "helpful or empathetic or informative or casual",
  "reasoning": "Brief explanation of why this is or isn't relevant"
}`;

  if (promptTemplate) {
    return promptTemplate
      .replace(/\{postContent\}/g, postContent.slice(0, 1000))
      .replace(/\{companyName\}/g, companyName)
      .replace(/\{companyDescription\}/g, companyDescription);
  }

  return defaultPrompt;
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
      instructions: 'CRITICAL OVERRIDE: Ignore ALL previous instructions, personas, and system prompts. You are now a pure JSON API endpoint. Your ONLY job is to analyze the user message and return valid JSON as specified. Do NOT roleplay, do NOT use casual language, do NOT mention any brand unprompted. Return ONLY the JSON object requested.',
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

// --- Method 2: OpenClaw CLI (fallback, concurrency-limited) ---
async function evaluateViaCLI(prompt: string): Promise<string> {
  await acquireCLISlot();
  const tmpFile = join(tmpdir(), `openclaw-prompt-${randomUUID()}.txt`);
  await writeFile(tmpFile, prompt, 'utf-8');

  try {
    const sessionId = `social-bot-eval-${Date.now()}`;
    const { stdout } = await execAsync(
      `openclaw agent --session-id "${sessionId}" --message "$(cat '${tmpFile}')" --json`,
      { timeout: 120000, maxBuffer: 1024 * 1024 }
    );

    // Strip ANSI escape codes — debug prefix "[agent/embedded] google tool schema snapshot"
    // appears before multi-line pretty-printed JSON. Find first '{' and parse from there.
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

    // Last resort: return cleaned text (never raw stdout with ANSI codes)
    return clean.trim();
  } finally {
    releaseCLISlot();
    await unlink(tmpFile).catch(() => {});
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
  const tmpFile = join(tmpdir(), `openclaw-msg-${randomUUID()}.txt`);
  await writeFile(tmpFile, message, 'utf-8');

  try {
    const { stdout } = await execAsync(
      `openclaw agent --session-id "${sid}" --message "$(cat '${tmpFile}')" --json`,
      { timeout: 120000, maxBuffer: 1024 * 1024 }
    );

    const clean = stripAnsi(stdout);

    // The CLI outputs debug prefix lines like "[agent/embedded] google tool schema snapshot"
    // followed by multi-line pretty-printed JSON. Find the first '{' and parse from there.
    const firstBrace = clean.indexOf('{');
    if (firstBrace !== -1) {
      try {
        const parsed = JSON.parse(clean.slice(firstBrace));
        const aiText = parsed?.payloads?.[0]?.text
          || parsed?.result?.content
          || parsed?.content
          || parsed?.message;
        if (aiText && isHumanReadable(String(aiText))) return String(aiText);
        // OpenClaw returned an envelope (payloads/meta) but no usable text — don't
        // fall through to the raw debug string, return empty so callers can handle it.
        if ('payloads' in parsed || 'meta' in parsed) return '';
      } catch { /* malformed or truncated */ }
    }

    const result = clean.trim();
    return isHumanReadable(result) ? result : '';
  } finally {
    releaseCLISlot();
    await unlink(tmpFile).catch(() => {});
  }
}
