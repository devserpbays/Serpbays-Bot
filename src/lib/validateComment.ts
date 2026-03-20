/**
 * Shared comment/reply validation — prevents posting error dumps,
 * code snippets, JSON blobs, or stack traces to social platforms.
 */
export function isValidComment(text: string, minLength: number = 5): boolean {
  if (!text || text.trim().length < minLength) return false;
  if (text.trim().length > 2000) return false;

  const errorPatterns = [
    /Error:\s*\w+/,
    /ERR_/,
    /stack\s*trace/i,
    /\bundefined\b.*\bundefined\b/i,
    /\bnull\b.*\bnull\b/i,
    /\bNaN\b.*\bNaN\b/,
    /\b(500|404|403|401|400)\b.*\b(status|code|error)\b/i,
    /at\s+\w+\s*\(.*:\d+:\d+\)/,
    /^\s*\{[\s\S]*\}\s*$/,
    /^\s*\[[\s\S]*\]\s*$/,
    /TypeError|ReferenceError|SyntaxError/,
    /ECONNREFUSED|ETIMEDOUT|ENOTFOUND/,
    /Could not parse/i,
    /```[\s\S]*```/,
  ];

  for (const pattern of errorPatterns) {
    if (pattern.test(text)) return false;
  }

  return true;
}
