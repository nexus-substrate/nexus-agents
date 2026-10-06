/**
 * Text extraction for a voter's completion response — the ONE seam every seat
 * passes through before its text becomes reasoning or conditions on a vote record.
 * Extracted from voter-execution.ts for the per-file line cap (#6269); the
 * behaviour and its tests (voter-execution.test.ts) are unchanged.
 *
 * @module cli/voter-response-text
 */

import { MAX_VOTER_CONDITIONS, MAX_VOTER_CONDITION_CHARS } from '../audit/vote-record.js';
import { sanitizeOutput } from '../security/output-sanitizer.js';

/**
 * Extracts text content from completion response.
 *
 * The result is passed through `sanitizeOutput` (#6267): the subprocess
 * adapter scrubs API keys from CLI stdout, but the API adapters (gateway,
 * SDK, Claude) return raw model text, and since #6194 this string becomes
 * the `reasoning` of a record committed to the public ledger. Scrubbing here
 * bounds every seat uniformly; already-scrubbed CLI text is unchanged.
 */
export function extractTextFromResponse(content: unknown): string {
  return sanitizeOutput(rawTextFromResponse(content));
}

function rawTextFromResponse(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === 'object' && block !== null && 'type' in block) {
          const typed = block as { type: string; text?: string };
          if (typed.type === 'text' && typeof typed.text === 'string') {
            return typed.text;
          }
        }
        return '';
      })
      .join('');
  }
  return String(content);
}

/**
 * #3497: some backends don't silently ignore an unsupported `responseFormat`.
 * OpenRouter implements `json_schema` via provider tool-use, so a role routed to
 * a provider without tool-use returns a hard 404 "No endpoints found that
 * support tool use" instead of ignoring the field — silently shrinking the panel
 * (observed on devex/catfish). Detect it so the caller retries without it.
 */
export function isStructuredOutputUnsupported(errorMessage: string): boolean {
  return /support tool use/i.test(errorMessage);
}

/** Response-schema caps: reasoning and finding claims. */
const REASONING_MAX_CHARS = 4000;
const CLAIM_MAX_CHARS = 2000;
const TRUNCATION_MARKER = ' …[truncated]';

/** Truncate `s` to `max` chars with a marker; a no-op when already within cap. */
function clampWithMarker(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - TRUNCATION_MARKER.length)) + TRUNCATION_MARKER;
}

/**
 * Clamp vote text before validation (#4131, #7134), keeping the real vote with
 * visible markers. Malformed shapes still fail validation.
 */
export function clampOversizeVoteStrings(parsed: unknown): unknown {
  if (typeof parsed !== 'object' || parsed === null) return parsed;
  const obj = { ...(parsed as Record<string, unknown>) };
  if (typeof obj['reasoning'] === 'string') {
    obj['reasoning'] = clampWithMarker(obj['reasoning'], REASONING_MAX_CHARS);
  }
  // [] is valid; reject malformed items even beyond the clipping boundary.
  if (
    Array.isArray(obj['conditions']) &&
    obj['conditions'].every((c: unknown) => typeof c === 'string')
  ) {
    const conditions = obj['conditions'].map((c: string) =>
      clampWithMarker(c, MAX_VOTER_CONDITION_CHARS)
    );
    if (conditions.length > MAX_VOTER_CONDITIONS) {
      const dropped = conditions.length - MAX_VOTER_CONDITIONS + 1;
      conditions.splice(
        MAX_VOTER_CONDITIONS - 1,
        dropped,
        `${TRUNCATION_MARKER} ${String(dropped)} conditions dropped`
      );
    }
    obj['conditions'] = conditions;
  }
  if (Array.isArray(obj['findings'])) {
    obj['findings'] = (obj['findings'] as unknown[]).map((finding): unknown => {
      if (
        typeof finding === 'object' &&
        finding !== null &&
        typeof (finding as Record<string, unknown>)['claim'] === 'string'
      ) {
        const f = finding as Record<string, unknown>;
        return { ...f, claim: clampWithMarker(f['claim'] as string, CLAIM_MAX_CHARS) };
      }
      return finding;
    });
  }
  return obj;
}
