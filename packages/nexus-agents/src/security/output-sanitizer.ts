/**
 * nexus-agents/security - Output Sanitizer
 *
 * Redacts API keys and tokens from CLI subprocess stdout/stderr
 * before the output is returned, logged, or traced.
 *
 * @module security/output-sanitizer
 * (Source: Issue #1597 — subprocess output scrubbing gap)
 */

/** Placeholder text that replaces redacted keys. */
export const REDACTED_KEY_PLACEHOLDER = '[REDACTED_KEY]';

/**
 * Patterns matching known API key formats.
 *
 * Order matters: more-specific prefixes (sk-ant-, sk-proj-) come before
 * the generic sk-* pattern so they match first.
 *
 * Each pattern requires a minimum token length after the prefix to avoid
 * false positives on short strings like "sk-ab".
 */
const KEY_PATTERNS: readonly RegExp[] = [
  // Anthropic: sk-ant-api03-... (at least 20 chars after prefix)
  /sk-ant-[A-Za-z0-9_-]{20,}/g,
  // OpenAI project: sk-proj-... (at least 20 chars after prefix)
  /sk-proj-[A-Za-z0-9_-]{20,}/g,
  // Generic OpenAI: sk-... (at least 20 chars after prefix)
  /sk-[A-Za-z0-9_-]{20,}/g,
  // Google AI / Gemini: AIzaSy... (at least 30 chars total)
  /AIzaSy[A-Za-z0-9_-]{24,}/g,
  // GitHub PAT: ghp_...
  /ghp_[A-Za-z0-9]{20,}/g,
  // GitHub OAuth: gho_...
  /gho_[A-Za-z0-9]{20,}/g,
  // GitLab PAT: glpat-...
  /glpat-[A-Za-z0-9_-]{10,}/g,
  // npm token: npm_...
  /npm_[A-Za-z0-9]{20,}/g,
  // PyPI token: pypi-...
  /pypi-[A-Za-z0-9_-]{20,}/g,
];

/**
 * Redacts known API key patterns from a string.
 *
 * Designed to be called on subprocess stdout/stderr before the output
 * is returned to callers, written to logs, or included in trace data.
 *
 * @param text - Raw subprocess output
 * @returns The same text with API keys replaced by [REDACTED_KEY]
 */
export function sanitizeOutput(text: string): string {
  if (text === '') return text;

  let result = text;
  for (const pattern of KEY_PATTERNS) {
    // Reset lastIndex for global regex reuse
    pattern.lastIndex = 0;
    result = result.replace(pattern, REDACTED_KEY_PLACEHOLDER);
  }
  return result;
}

/**
 * Redacts credentials (API keys, authorization headers, Bearer tokens, URL credentials,
 * and sensitive JSON fields) from error messages and response bodies.
 *
 * Designed to be called on upstream API error representations before they are
 * attached to error envelopes, logged, or returned to callers.
 *
 * @param text - Raw error message or serialized error body
 * @param apiKey - Optional configured API key to redact by exact match
 * @returns The sanitized text with credentials redacted
 */
export function sanitizeErrorDetails(text: string, apiKey?: string): string {
  if (text === '') return '';

  let result = text;
  if (apiKey !== undefined && apiKey.trim() !== '') {
    result = result.replaceAll(apiKey.trim(), REDACTED_KEY_PLACEHOLDER);
  }

  // Redact known key patterns
  result = sanitizeOutput(result);

  // Redact URL credentials like https://user:pass@host or https://token@host
  result = result.replace(/https?:\/\/[^\s/@]+@[^\s/]+/g, (match) => {
    return match.replace(/https?:\/\/[^\s/@]+@/, `https://${REDACTED_KEY_PLACEHOLDER}@`);
  });

  // Redact Authorization headers: Bearer and Basic tokens
  result = result.replace(/(authorization:\s*bearer\s+)\S+/gi, `$1${REDACTED_KEY_PLACEHOLDER}`);
  result = result.replace(/(authorization:\s*basic\s+)\S+/gi, `$1${REDACTED_KEY_PLACEHOLDER}`);
  result = result.replace(/(bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, `$1${REDACTED_KEY_PLACEHOLDER}`);

  // Redact sensitive query parameters in URLs or logs (?api_key=..., &token=..., &prompt=...)
  result = result.replace(
    /([?&](?:api[_-]?key|token|access[_-]?token|secret|password|prompt|system_prompt|user_prompt)=)[^&\s]+/gi,
    `$1${REDACTED_KEY_PLACEHOLDER}`
  );

  // Redact sensitive JSON keys: "api_key": "...", "token": "...", "prompt": "...", etc.
  result = result.replace(
    /"(api[_-]?key|access[_-]?token|token|secret|password|prompt|system_prompt|user_prompt)"\s*:\s*"(?:[^"\\]|\\.)*"/gi,
    `"$1": "${REDACTED_KEY_PLACEHOLDER}"`
  );

  return result;
}
