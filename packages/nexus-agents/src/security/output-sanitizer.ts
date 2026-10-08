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
import { isJsonDocument, contextValueEnd } from '../core/redaction-boundaries.js';

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
 * Sensitive JSON keys, optionally inside JSON encoded into a string (`\\"key\\":`;
 * group `esc` is the backslash run, the same before both key quotes). The
 * secret-named alternatives (`client_secret`, any `*_secret`, `secret_access_key`,
 * `private_key`, `private_key_id`) were redacted before #7315 only when a broken
 * shape replacement made an earlier rule greedy. Bounded quantifiers keep the
 * match linear (#1496).
 */
const SENSITIVE_JSON_KEY =
  /(?<esc>\\{0,15})"(?<key>api[_-]?key|access[_-]?token|token|secret|password|prompt|system_prompt|user_prompt|[a-z0-9_-]{0,64}[_-]secret|(?:[a-z0-9_-]{0,64}[_-])?secret[_-]access[_-]key|private[_-]key(?:[_-]id)?)\k<esc>"\s*:\s*/gi;

/** A complete JSON string literal at `lastIndex` (sticky). */
const JSON_STRING_LITERAL = /"(?:[^"\\]|\\.)*"/y;

function stringLiteralEnd(text: string, start: number): number {
  JSON_STRING_LITERAL.lastIndex = start;
  return start + (JSON_STRING_LITERAL.exec(text)?.[0].length ?? 0);
}

/**
 * End (after the closing quote) of a string literal whose quotes are escaped by
 * a run of `depth` backslashes, starting after its opening quote; `start` when
 * the literal is not closed before the enclosing JSON string ends. A quote
 * closes it when its backslash run is `depth` modulo `2 * depth + 2`: a longer
 * run is a quote escaped one level further in; an even run is unescaped.
 */
function nestedStringEnd(text: string, start: number, depth: number): number {
  let index = start;
  while (index < text.length) {
    if (text[index] === '"') return start;
    if (text[index] !== '\\') {
      index++;
      continue;
    }
    let run = 0;
    while (text[index + run] === '\\') run++;
    if (text[index + run] !== '"') {
      index += run;
      continue;
    }
    if (run % 2 === 0) return start;
    if (run % (2 * depth + 2) === depth) return index + run + 1;
    index += run + 1;
  }
  return start;
}

/** `placeholder` as a string literal whose quotes are escaped by `depth` backslashes. */
function placeholderLiteral(placeholder: string, depth: number): string {
  if (depth === 0) return JSON.stringify(placeholder);
  // Escaped once per enclosing string: the nested literal's own, then each outer one.
  let content = JSON.stringify(placeholder).slice(1, -1);
  for (let level = depth; level > 0; level = (level - 1) / 2) {
    content = JSON.stringify(content).slice(1, -1);
  }
  const quote = `${'\\'.repeat(depth)}"`;
  return `${quote}${content}${quote}`;
}

/** End of a sensitive key's value; `valueStart` when there is none to replace. */
function sensitiveValueEnd(text: string, valueStart: number, depth: number, json: boolean): number {
  if (depth > 0) {
    const opener = `${'\\'.repeat(depth)}"`;
    if (!text.startsWith(opener, valueStart)) return valueStart;
    const end = nestedStringEnd(text, valueStart + opener.length, depth);
    return end === valueStart + opener.length ? valueStart : end;
  }
  return json
    ? contextValueEnd(text, valueStart, false, true, 'json-field')
    : stringLiteralEnd(text, valueStart);
}

/**
 * Replaces each sensitive key's value with `placeholder`. In a JSON document the
 * shared field scanner bounds any value type, so the document still parses; in
 * other text only a complete string literal is replaced, as before #7315. A key
 * in JSON encoded into a string keeps its escaping, and only its string value
 * is replaced.
 */
function redactSensitiveJsonFields(text: string, placeholder: string, json: boolean): string {
  let result = '';
  let copiedUntil = 0;
  for (const match of text.matchAll(SENSITIVE_JSON_KEY)) {
    if (match.index < copiedUntil) continue;
    const esc = match.groups?.['esc'] ?? '';
    const valueStart = match.index + match[0].length;
    const end = sensitiveValueEnd(text, valueStart, esc.length, json);
    if (end <= valueStart) continue;
    const key = `${esc}"${match.groups?.['key'] ?? ''}${esc}"`;
    const value = placeholderLiteral(placeholder, esc.length);
    result += `${text.slice(copiedUntil, match.index)}${key}: ${value}`;
    copiedUntil = end;
  }
  return result + text.slice(copiedUntil);
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

  // Redact sensitive JSON keys: "api_key": "...", "client_secret": "...", "prompt": "...", etc.
  return redactSensitiveJsonFields(result, placeholder, json);
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
