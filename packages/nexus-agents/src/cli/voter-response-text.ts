/**
 * Text extraction for a voter's completion response — the ONE seam every seat
 * passes through before its text becomes `reasoning` on a vote record.
 * Extracted from voter-execution.ts for the per-file line cap (#6269); the
 * behaviour and its tests (voter-execution.test.ts) are unchanged.
 *
 * @module cli/voter-response-text
 */

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
