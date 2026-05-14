/**
 * nexus-agents/mcp - Structured Tool Error Envelope
 *
 * Caller-facing error contract for MCP tools. Replaces the opaque
 * `{ isError: true, content: [{ text }] }` string shape with a structured
 * envelope so callers (other tools, voter panels, the Claude/Codex/Gemini/
 * OpenCode harnesses) can reason about retry-safety and recovery path
 * instead of string-matching arbitrary text.
 *
 * SCOPE — this envelope is caller-facing ONLY. The routing/circuit-breaker
 * layer classifies adapter subprocess failures through its own
 * `categorizeOutcomeError()` path (orchestration/outcomes/outcome-types.ts)
 * and never reads this envelope. `coarsenFailureCategory()` is a one-way
 * convenience for the rare tool that internally catches an
 * `OutcomeFailureCategory`-classified error and wants to surface it to its
 * caller — it is not, and must not become, a routing input. The two
 * taxonomies serve different layers; this is the single authoritative
 * projection between them.
 *
 * @module mcp/error-envelope
 * @see Issue #2649
 */

import { z } from 'zod';
import type { OutcomeFailureCategory } from '../orchestration/outcomes/outcome-types.js';

// ============================================================================
// Schema
// ============================================================================

/**
 * Caller-facing error category. Deliberately coarser than the routing
 * layer's 11-value `OutcomeFailureCategory` — a tool's caller only needs
 * enough resolution to choose a recovery path:
 *
 * - `transient`  — network blip, rate limit, timeout. Retry is safe.
 * - `validation` — input shape/values wrong. Caller must fix its args.
 * - `permission` — auth / authorization / sandbox / access-policy denial.
 * - `business`   — domain-logic refusal (dedup hit, precondition not met).
 *                  An expected, non-bug outcome — not a failure to retry.
 * - `internal`   — unexpected, bug-class. Not retry-class; escalate.
 */
export const ErrorCategorySchema = z.enum([
  'transient',
  'validation',
  'permission',
  'business',
  'internal',
]);

export type ErrorCategory = z.infer<typeof ErrorCategorySchema>;

/**
 * Structured error envelope returned by MCP tools. Carried in the tool
 * result's `structuredContent` under the `error` key; the human-readable
 * `message` is also mirrored into `content[].text` for display.
 */
export const ToolErrorEnvelopeSchema = z.object({
  errorCategory: ErrorCategorySchema,
  /** Whether retrying the same call could succeed without caller changes. */
  isRetryable: z.boolean(),
  /** Human-readable summary. Bounded to keep stack traces out of results. */
  message: z.string().min(1).max(2000),
  /**
   * Optional structured context. MUST NOT carry secrets, credentials,
   * absolute filesystem paths, or raw Error/response objects — those are
   * an information-disclosure risk (this field is not output-sanitized).
   */
  detail: z.record(z.string(), z.unknown()).optional(),
});

export type ToolErrorEnvelope = z.infer<typeof ToolErrorEnvelopeSchema>;

/**
 * `_meta` key the envelope is carried under on a tool result. It lives in
 * `_meta` — NOT `structuredContent` — because the MCP client validates
 * `structuredContent` against the tool's `outputSchema` even on error
 * results (SDK `client/index.js`: it only guards on presence, not on
 * `isError`), so an envelope in `structuredContent` breaks every tool
 * that has an `outputSchema`. `_meta` is the spec's out-of-band metadata
 * channel and is never schema-validated. Namespaced to avoid collisions.
 */
export const ERROR_ENVELOPE_META_KEY = 'nexus-agents/error';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Default retry-safety for a category. Only `transient` errors are
 * retry-safe by default; callers can override per-call when a specific
 * `internal` or `business` error is known to be retryable.
 */
export function defaultRetryable(category: ErrorCategory): boolean {
  return category === 'transient';
}

/**
 * The single authoritative projection from the routing layer's 11-value
 * `OutcomeFailureCategory` down to the 5-value caller-facing
 * `ErrorCategory`. A `Record` over every key — adding a 12th
 * `OutcomeFailureCategory` value without extending this map is a compile
 * error, which is the drift safeguard.
 *
 * One-way only: there is no `un-coarsen`, by design — the routing layer
 * keeps its own granular classification and never round-trips through here.
 */
const FAILURE_CATEGORY_COARSENING: Record<OutcomeFailureCategory, ErrorCategory> = {
  timeout: 'transient',
  rate_limit: 'transient',
  connection: 'transient',
  authentication: 'permission',
  validation: 'validation',
  parse: 'validation',
  crash: 'internal',
  adapter_unavailable: 'internal',
  execution: 'internal',
  generic: 'internal',
  unknown: 'internal',
};

/**
 * Coarsen a routing-layer `OutcomeFailureCategory` to a caller-facing
 * `ErrorCategory`. Use this only when a tool has caught an error already
 * classified by the routing layer and wants to surface it in its envelope.
 */
export function coarsenFailureCategory(category: OutcomeFailureCategory): ErrorCategory {
  return FAILURE_CATEGORY_COARSENING[category];
}

/**
 * Extract and validate a `ToolErrorEnvelope` from a tool result's `_meta`
 * object. Returns `null` when `_meta` is absent or does not carry a
 * parseable envelope under {@link ERROR_ENVELOPE_META_KEY}. Used by
 * envelope-aware callers.
 */
export function parseToolErrorEnvelope(meta: unknown): ToolErrorEnvelope | null {
  if (meta === null || typeof meta !== 'object') {
    return null;
  }
  const candidate = (meta as Record<string, unknown>)[ERROR_ENVELOPE_META_KEY];
  const result = ToolErrorEnvelopeSchema.safeParse(candidate);
  return result.success ? result.data : null;
}
