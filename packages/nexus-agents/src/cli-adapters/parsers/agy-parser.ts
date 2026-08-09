/**
 * nexus-agents/cli-adapters - Antigravity (`agy`) CLI Response Parser
 *
 * Parses `agy --output-format json`, the replacement for the retired standalone
 * `gemini` CLI (#4346).
 *
 * FAIL-CLOSED BY CONSTRUCTION. `agy` exits 0 even when the run failed — a bad
 * model returns `{"status":"ERROR","response":"","error":"…"}` with exit code 0.
 * The verdict lives in the `status` field, so this parser treats anything that
 * is not an explicit `SUCCESS` envelope with a string `response` as a failure:
 * unparseable output, truncated JSON, a missing `status`, an unrecognized
 * `status`, and a non-string `response` all yield `null`. Callers must not
 * infer success from the process exit code.
 *
 * Verified against `agy` v1.1.9 (2026-08-09).
 *
 * @module cli-adapters/parsers/agy-parser
 */

import { z } from 'zod';
import type { ICliResponseParser, TokenUsage } from '../types.js';

/**
 * The usage block agy reports. `thinking_tokens` and `cache_read_tokens` have no
 * home in {@link TokenUsage}; see {@link AgyResponseParser.extractUsage} for how
 * they are handled rather than dropped.
 */
const AgyUsageSchema = z.object({
  input_tokens: z.number(),
  output_tokens: z.number(),
  thinking_tokens: z.number().optional(),
  cache_read_tokens: z.number().optional(),
  total_tokens: z.number(),
});

/**
 * A successful agy envelope. `status` is pinned to the literal `SUCCESS` so an
 * unrecognized future status (e.g. a `PARTIAL`) fails the parse instead of being
 * waved through as a success.
 */
const AgySuccessSchema = z.object({
  status: z.literal('SUCCESS'),
  response: z.string(),
  conversation_id: z.string().optional(),
  duration_seconds: z.number().optional(),
  num_turns: z.number().optional(),
  usage: AgyUsageSchema.optional(),
});

/** A failed agy envelope — still delivered with exit code 0. */
const AgyErrorSchema = z.object({
  status: z.string(),
  error: z.string().optional(),
  response: z.string().optional(),
  conversation_id: z.string().optional(),
});

/** A parsed, validated agy success envelope. */
export type AgyCliResponse = z.infer<typeof AgySuccessSchema>;

/** Parse raw stdout as JSON, or undefined when it is not JSON at all. */
function asJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/**
 * Parser for `agy --output-format json`.
 *
 * `parse` returns a value ONLY for a well-formed success envelope. Failure
 * detail is available separately via {@link AgyResponseParser.extractErrorMessage}.
 */
export class AgyResponseParser implements ICliResponseParser<AgyCliResponse> {
  readonly name = 'agy-parser';
  readonly supportedVersionRange = '>=1.0.0 <2.0.0';

  parse(raw: string): AgyCliResponse | null {
    const json = asJson(raw);
    if (json === undefined) return null;
    const parsed = AgySuccessSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  }

  extractResponse(raw: string): string | null {
    return this.parse(raw)?.response ?? null;
  }

  /**
   * The error text from a non-SUCCESS envelope, or null when the run succeeded
   * or the output was not a recognizable agy envelope at all.
   *
   * Returning the message lets the adapter classify it (rate limit, auth,
   * bad model) through the shared taxonomy rather than reporting a bare
   * PARSE_ERROR — the same reason `opencode-parser` grew this method.
   */
  extractErrorMessage(raw: string): string | null {
    const json = asJson(raw);
    if (json === undefined) return null;
    // A valid success envelope has no error to report.
    if (AgySuccessSchema.safeParse(json).success) return null;
    const parsed = AgyErrorSchema.safeParse(json);
    if (!parsed.success) return null;
    return parsed.data.error ?? `agy reported status '${parsed.data.status}'`;
  }

  /**
   * Maps agy's usage block onto {@link TokenUsage}.
   *
   * `thinking_tokens` are **folded into `outputTokens`** rather than dropped:
   * they are generated, billable tokens, and discarding them would understate
   * cost in exactly the outcome data the routing loop learns from.
   * `cache_read_tokens` are deliberately NOT added — they are a subset of input
   * already counted in `input_tokens`, so adding them would double-count.
   */
  /**
   * agy's `conversation_id` is the session handle — it is what `--conversation`
   * accepts to resume a run, so it maps directly onto the session-id contract.
   */
  extractSessionId(raw: string): string | null {
    const id = this.parse(raw)?.conversation_id;
    return id === undefined || id === '' ? null : id;
  }

  extractUsage(raw: string): TokenUsage | null {
    const parsed = this.parse(raw);
    if (parsed?.usage === undefined) return null;
    const { input_tokens, output_tokens, thinking_tokens, total_tokens } = parsed.usage;
    return {
      inputTokens: input_tokens,
      outputTokens: output_tokens + (thinking_tokens ?? 0),
      totalTokens: total_tokens,
    };
  }
}
