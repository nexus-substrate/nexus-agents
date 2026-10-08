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
 * Whether `text` is one JSON document. Every context-rule prefix starts with a
 * letter, and in a JSON document letters occur only inside string literals, so
 * this one test places every match inside a JSON string.
 */
function isJsonDocument(text: string): boolean {
  if (!/^\s*[[{"]/.test(text)) return false;
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * End of a context value. Plain text keeps the pre-#7296 extent: the whole
 * non-whitespace run (`&`-bounded for a query value). Inside a JSON string the
 * value also ends at the unescaped `"` that closes the string, and an escape is
 * consumed as an indivisible pair, so the redaction never splits one (#7296).
 */
function contextValueEnd(text: string, start: number, query: boolean, json: boolean): number {
  let end = start;
  while (end < text.length) {
    const char = text[end] ?? '';
    if (/\s/.test(char) || (query && char === '&')) break;
    if (json && char === '"') break;
    if (json && char === '\\') end++;
    end++;
  }
  return Math.min(end, text.length);
}

/** `file:line` straight after a rule id's `secret:`, as `sarif-parser` builds finding ids. */
const SEMGREP_FINDING_LOCATION = /^[\w./@+-]+:\d+(?![\w.])/;

/**
 * A semgrep finding id (`semgrep:<rule>generic-secret:<file>:<line>`) rather than a
 * `generic-secret:` assignment. `start` indexes the `secret` keyword; `valueStart`
 * the character after its colon. The rule must be dotted/dashed identifier text and
 * the colon must be followed, without whitespace, by a `file:line` location.
 */
function isSemgrepRuleId(text: string, start: number, valueStart: number): boolean {
  const scannerStart = text.lastIndexOf('semgrep:', start);
  if (scannerStart < 0) return false;
  const rule = text.slice(scannerStart, start);
  if (!/^semgrep:(?:[\w.-]*[._-])?generic-$/i.test(rule)) return false;
  return SEMGREP_FINDING_LOCATION.test(text.slice(valueStart, valueStart + 4096));
}

interface ContextRule {
  /** Matches the key and separator; named group `q` is an optional opening quote. */
  readonly prefixes: RegExp;
  readonly minimumLength: number;
  readonly query?: boolean;
}

/** Redact only value spans; scanning avoids regex stack growth on large outputs. */
function redactContextValues(
  text: string,
  rule: ContextRule,
  placeholder: string,
  json: boolean
): string {
  let result = '';
  let copiedUntil = 0;
  for (const match of text.matchAll(rule.prefixes)) {
    if (match.index < copiedUntil) continue;
    const quote = match.groups?.['q'] ?? '';
    const keyEnd = match.index + match[0].length - quote.length;
    if (match[0].toLowerCase() === 'secret:' && isSemgrepRuleId(text, match.index, keyEnd)) {
      continue;
    }
    // Plain text: the quote is part of the value, as before #7296. JSON: an escaped
    // or single quote opens the value; a bare `"` closes the string and is never taken.
    const start = json && quote !== '"' ? keyEnd + quote.length : keyEnd;
    const end = contextValueEnd(text, start, rule.query === true, json);
    if (end - start < rule.minimumLength) continue;
    result += text.slice(copiedUntil, start) + placeholder;
    copiedUntil = end;
  }
  return result + text.slice(copiedUntil);
}

// Bearer and Basic stay separate passes, as before #7296: a value one consumes can hold the other.
const BEARER_HEADER_RULE: ContextRule = {
  prefixes: /authorization:\s*bearer\s+(?<q>\\?["'])?/gi,
  minimumLength: 1,
};
const BASIC_HEADER_RULE: ContextRule = {
  prefixes: /authorization:\s*basic\s+(?<q>\\?["'])?/gi,
  minimumLength: 1,
};
const ASSIGNMENT_RULE: ContextRule = {
  prefixes: /\b(?:password|passwd|secret)\s*[=:]\s*(?<q>\\?["'])?/gi,
  minimumLength: 4,
};
const QUERY_RULE: ContextRule = {
  prefixes:
    /[?&](?:api[_-]?key|token|access[_-]?token|secret|password|prompt|system_prompt|user_prompt)=/gi,
  minimumLength: 1,
  query: true,
};

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

  // Plain text keeps the pre-#7296 extents; inside a JSON document a value also
  // stops at its string's closing quote, so the output still parses (#7296).
  const json = isJsonDocument(result);
  result = redactContextValues(result, BEARER_HEADER_RULE, placeholder, json);
  result = redactContextValues(result, BASIC_HEADER_RULE, placeholder, json);
  // The token class excludes quotes and backslashes, and `\s` cannot leave a JSON string.
  result = result.replace(/(bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, `$1${placeholder}`);

  // Redact plain text assignments like password=... or secret: ...
  result = redactContextValues(result, ASSIGNMENT_RULE, placeholder, json);

  // Redact sensitive query parameters in URLs or logs (?api_key=..., &token=..., &prompt=...)
  result = redactContextValues(result, QUERY_RULE, placeholder, json);

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
