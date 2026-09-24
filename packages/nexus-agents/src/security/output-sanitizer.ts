/**
 * nexus-agents/security - Output Sanitizer
 *
 * Redacts API keys and tokens from CLI subprocess stdout/stderr
 * before the output is returned, logged, or traced.
 *
 * @module security/output-sanitizer
 * (Source: Issue #1597 — subprocess output scrubbing gap)
 */

import { redactCredentialShapes } from '../core/credential-patterns.js';

/** Placeholder text that replaces redacted keys. */
export const REDACTED_KEY_PLACEHOLDER = '[REDACTED_KEY]';

/**
 * Redacts known API key patterns from a string: the shared credential-shape
 * set (`core/credential-patterns`, #6753) and URL userinfo. Context rules
 * (Authorization headers, `password=`, query and JSON fields) are NOT applied
 * here — subprocess output is prose, where they misfire (`bearer\s+` takes
 * "the bearer of"); they are the local
 * extension {@link sanitizeErrorDetails} adds for upstream error bodies.
 *
 * Designed to be called on subprocess stdout/stderr before the output
 * is returned to callers, written to logs, or included in trace data.
 *
 * @param text - Raw subprocess output
 * @param placeholder - Replacement placeholder (default: [REDACTED_KEY])
 * @returns The same text with API keys replaced by placeholder
 */
export function sanitizeOutput(
  text: string,
  placeholder: string = REDACTED_KEY_PLACEHOLDER
): string {
  if (text === '') return text;

  return redactCredentialShapes(text, placeholder);
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
export function sanitizeErrorDetails(
  text: string,
  apiKey?: string,
  placeholder: string = REDACTED_KEY_PLACEHOLDER
): string {
  if (text === '') return '';

  let result = text;
  if (apiKey !== undefined && apiKey.trim() !== '') {
    result = result.replaceAll(apiKey.trim(), placeholder);
  }

  // Redact known key patterns and URL credentials (user:pass@ / token@)
  result = sanitizeOutput(result, placeholder);

  // Redact Authorization headers: Bearer and Basic tokens
  result = result.replace(/(authorization:\s*bearer\s+)\S+/gi, `$1${placeholder}`);
  result = result.replace(/(authorization:\s*basic\s+)\S+/gi, `$1${placeholder}`);
  result = result.replace(/(bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, `$1${placeholder}`);

  // Redact plain text assignments like password=... or secret: ...
  result = result.replace(/(\b(?:password|passwd|secret)\s*[=:]\s*)\S{4,}/gi, `$1${placeholder}`);

  // Redact sensitive query parameters in URLs or logs (?api_key=..., &token=..., &prompt=...)
  result = result.replace(
    /([?&](?:api[_-]?key|token|access[_-]?token|secret|password|prompt|system_prompt|user_prompt)=)[^&\s]+/gi,
    `$1${placeholder}`
  );

  // Redact sensitive JSON keys: "api_key": "...", "token": "...", "prompt": "...", etc.
  result = result.replace(
    /"(api[_-]?key|access[_-]?token|token|secret|password|prompt|system_prompt|user_prompt)"\s*:\s*"(?:[^"\\]|\\.)*"/gi,
    `"$1": "${placeholder}"`
  );

  return result;
}

/** `value.toJSON()` when it has one (a `Date`), as `JSON.stringify` would; else `value`. */
function serializedForm(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value;
  const toJSON: unknown = (value as { toJSON?: unknown }).toJSON;
  return typeof toJSON === 'function' ? (toJSON as () => unknown).call(value) : value;
}

/**
 * `value` with `sanitize` applied to every string LEAF. A `toJSON` object (a
 * `Date`) is taken in its serialized form first, as `JSON.stringify` would;
 * arrays are mapped and objects copied from their own enumerable entries.
 * Keys, numbers, booleans and `null` are untouched, so the structure a JSON
 * reader sees survives. Returns a copy — the input is not mutated.
 */
export function sanitizeStringLeaves(input: unknown, sanitize: (text: string) => string): unknown {
  const value = serializedForm(input);
  if (typeof value === 'string') return sanitize(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeStringLeaves(item, sanitize));
  if (typeof value === 'object' && value !== null) {
    const copy: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      copy[key] = sanitizeStringLeaves(entry, sanitize);
    }
    return copy;
  }
  return value;
}
