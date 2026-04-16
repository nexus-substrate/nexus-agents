/**
 * nexus-agents/core - Safe JSON substring extraction
 *
 * Shared helpers for extracting the first JSON object/array substring from
 * LLM / CLI output. Uses index-based slicing (O(n), no regex backtracking)
 * to avoid polynomial ReDoS on pathological inputs.
 *
 * (Source: Issue #1912 — bug-hunt wave 1; generalized from the fix in
 * pipeline/agent-executor.ts for CodeQL js/polynomial-redos, #1899.)
 *
 * @module core/json-extract
 */

/**
 * Extracts the first JSON array substring from text, defined as the span from
 * the first `[` to the last `]` at or after it. Returns `undefined` when no
 * array is found. O(n), no regex backtracking.
 */
export function extractJsonArray(text: string): string | undefined {
  const start = text.indexOf('[');
  if (start === -1) return undefined;
  const end = text.lastIndexOf(']');
  if (end <= start) return undefined;
  return text.slice(start, end + 1);
}

/**
 * Extracts the first JSON object substring from text, defined as the span from
 * the first `{` to the last `}` at or after it. Returns `undefined` when no
 * object is found. O(n), no regex backtracking.
 */
export function extractJsonObject(text: string): string | undefined {
  const start = text.indexOf('{');
  if (start === -1) return undefined;
  const end = text.lastIndexOf('}');
  if (end <= start) return undefined;
  return text.slice(start, end + 1);
}
