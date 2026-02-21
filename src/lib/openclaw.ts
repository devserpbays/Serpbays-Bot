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

// --- Parse AI evaluation from raw text ---
function parseEvaluation(text: string): AIEvaluation | null {
  // Try direct JSON parse
  try {
    const parsed = JSON.parse(text);
    if ('relevant' in parsed && 'score' in parsed) {
      return parsed as AIEvaluation;
    }
  } catch {
    // not direct JSON
  }

  // Extract JSON from markdown code blocks or mixed text
  const jsonMatch = text.match(/\{[\s\S]*?"relevant"[\s\S]*?"reasoning"[\s\S]*?\}/);
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

  const data = await res.json();

  // Extract text from various response shapes
  return data?.payloads?.[0]?.text
    || data?.result?.content
    || data?.content
    || data?.message
    || (typeof data === 'string' ? data : JSON.stringify(data));
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

    // Parse the OpenClaw JSON response - find JSON in stdout
    const lines = stdout.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('{')) {
        try {
          const parsed = JSON.parse(trimmed);
          // Extract AI text from OpenClaw wrapper
          const aiText = parsed?.payloads?.[0]?.text
            || parsed?.result?.content
            || parsed?.content
            || parsed?.message;
          if (aiText) return typeof aiText === 'string' ? aiText : JSON.stringify(aiText);
        } catch {
          continue;
        }
      }
    }

    // Try to find the full JSON payload
    const jsonMatch = stdout.match(/\{[\s\S]*"payloads"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const aiText = parsed?.payloads?.[0]?.text || parsed?.content;
      if (aiText) return typeof aiText === 'string' ? aiText : JSON.stringify(aiText);
    }

    return stdout;
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
      const data = await res.json();
      return data?.payloads?.[0]?.text || data?.content || data?.message || JSON.stringify(data);
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

    const lines = stdout.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('{')) {
        try {
          const parsed = JSON.parse(trimmed);
          return parsed?.payloads?.[0]?.text || parsed?.content || parsed?.message || trimmed;
        } catch {
          continue;
        }
      }
    }
    return stdout.trim();
  } finally {
    await unlink(tmpFile).catch(() => {});
  }
}
