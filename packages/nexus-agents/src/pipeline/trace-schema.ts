/**
 * Execution Trace Schema (Epic #952, Phase 1)
 *
 * Defines the ExecutionTraceEntry schema for JSONL serialization
 * of pipeline execution traces with agent + model attribution.
 *
 * @module pipeline/trace-schema
 */

import { z } from 'zod';

// ============================================================================
// Error Taxonomy
// ============================================================================

/** Error classification for trace entries. */
export const ErrorTaxonomy = {
  /** Transient error — can be retried (timeout, rate limit, network). */
  RETRIABLE: 'retriable',
  /** Permanent error — cannot be retried (logic error, invalid input). */
  FATAL: 'fatal',
} as const;

export type ErrorTaxonomyType = (typeof ErrorTaxonomy)[keyof typeof ErrorTaxonomy];

// ============================================================================
// Trace Entry Schema
// ============================================================================

/**
 * Schema for a single execution trace entry (one line in trace.jsonl).
 *
 * Carries enough data to reconstruct: which agent did what,
 * with which model, why that model was selected.
 */
export const ExecutionTraceEntrySchema = z.object({
  /** Unix timestamp (ms). */
  timestamp: z.number(),

  /** Run identifier (typically TaskContract.id). */
  runId: z.string().min(1),

  /** Pipeline event type that produced this trace entry. */
  eventType: z.string().min(1),

  /** Execution ID for pipeline correlation. */
  executionId: z.string().optional(),

  /** Graph node or stage that produced this event. */
  nodeId: z.string().optional(),

  /** Agent that executed this step. */
  agentId: z.string().optional(),

  /** Model used for this step. */
  modelId: z.string().optional(),

  /** Agent role (e.g., code_expert, security_expert). */
  role: z.string().optional(),

  /** Duration in milliseconds. */
  durationMs: z.number().optional(),

  /** Human-readable model selection reasoning. */
  reasoning: z.string().optional(),

  /** Routing decision path (stage:result pairs). */
  decisionPath: z.array(z.string()).optional(),

  /** Error classification. */
  errorTaxonomy: z.enum(['retriable', 'fatal']).optional(),

  /** Error message if this is a failure event. */
  error: z.string().optional(),
});

export type ExecutionTraceEntry = z.infer<typeof ExecutionTraceEntrySchema>;
