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
  "suggestedReply": "A helpful, non-salesy reply that naturally mentions how ${companyName} could help. Keep it conversational and genuine.",
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

// --- Method 1: OpenClaw Gateway HTTP API ---
async function evaluateViaHTTP(prompt: string): Promise<string> {
  const sessionId = `social-bot-eval-${Date.now()}`;
  const gatewayUrl = `http://${OPENCLAW_HOST}:${OPENCLAW_PORT}`;

  // OpenClaw Gateway exposes an agent endpoint via POST
  const res = await fetch(`${gatewayUrl}/api/agent/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: prompt,
      sessionId,
      json: true,
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (!res.ok) {
    throw new Error(`OpenClaw HTTP API returned ${res.status}: ${await res.text()}`);
  }

  // Read as text first — the server may prefix the JSON body with debug lines
  // like "[agent/embedded] google tool schema snapshot" making res.json() fail
  const body = await res.text();
  const cleanBody = stripAnsi(body);
  const firstBrace = cleanBody.indexOf('{');

  let data: Record<string, unknown> = {};
  if (firstBrace !== -1) {
    try {
      data = JSON.parse(cleanBody.slice(firstBrace));
    } catch {
      throw new Error(`OpenClaw HTTP response not parseable as JSON: ${cleanBody.slice(0, 200)}`);
    }
  } else {
    throw new Error(`OpenClaw HTTP response has no JSON object: ${cleanBody.slice(0, 200)}`);
  }

  const raw = (data?.payloads as Array<{ text?: string }>)?.[0]?.text
    || (data?.result as { content?: string })?.content
    || data?.content as string
    || data?.message as string
    || JSON.stringify(data);

  return stripAnsi(String(raw));
}

// --- Method 2: OpenClaw CLI (fallback) ---
async function evaluateViaCLI(prompt: string): Promise<string> {
  const tmpFile = join(tmpdir(), `openclaw-prompt-${randomUUID()}.txt`);
  await writeFile(tmpFile, prompt, 'utf-8');

  try {
    const sessionId = `social-bot-eval-${Date.now()}`;
    const { stdout } = await execAsync(
      `openclaw agent --local --session-id "${sessionId}" --message "$(cat '${tmpFile}')" --json`,
      { timeout: 120000, maxBuffer: 1024 * 1024 }
    );

    // Strip ANSI escape codes — debug prefix "[agent/embedded] google tool schema snapshot"
    // appears before multi-line pretty-printed JSON. Find first '{' and parse from there.
    const clean = stripAnsi(stdout);

    const firstBrace = clean.indexOf('{');
    if (firstBrace !== -1) {
      try {
        const parsed = JSON.parse(clean.slice(firstBrace));
        const aiText = parsed?.payloads?.[0]?.text
          || parsed?.result?.content
          || parsed?.content
          || parsed?.message;
        if (aiText) return typeof aiText === 'string' ? aiText : JSON.stringify(aiText);
      } catch { /* malformed */ }
    }

    // Last resort: return cleaned text (never raw stdout with ANSI codes)
    return clean.trim();
  } finally {
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
  } catch (httpErr) {
    console.warn('OpenClaw HTTP API failed, falling back to CLI:', (httpErr as Error).message);
    try {
      rawResponse = await evaluateViaCLI(prompt);
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

  // Fallback: CLI
  const tmpFile = join(tmpdir(), `openclaw-msg-${randomUUID()}.txt`);
  await writeFile(tmpFile, message, 'utf-8');

  try {
    const { stdout } = await execAsync(
      `openclaw agent --local --session-id "${sid}" --message "$(cat '${tmpFile}')" --json`,
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
    await unlink(tmpFile).catch(() => {});
  }
}
