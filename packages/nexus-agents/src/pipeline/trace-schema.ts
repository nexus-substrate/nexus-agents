/**
 * Execution Trace Schema (Epic #952, Phase 1)
 *
 * Defines the ExecutionTraceEntry schema for JSONL serialization
 * of pipeline execution traces with agent + model attribution.
 *
 * @module pipeline/trace-schema
 */

import { z } from 'zod';

const identity = z.string().min(1).max(256);
export const TraceRunOriginSchema = z
  .object({
    kind: z.literal('run'),
    producer: z.enum(['dev-pipeline', 'contract-pipeline', 'graph-pipeline']),
    runId: identity,
    taskId: identity.optional(),
    attemptId: identity.optional(),
  })
  .strict();
export const TraceOriginSchema = z.discriminatedUnion('kind', [
  TraceRunOriginSchema,
  z
    .object({
      kind: z.literal('global'),
      producer: z.enum(['consensus', 'fitness-review', 'swarm-health', 'failover']),
    })
    .strict(),
]);
export type TraceRunOrigin = z.infer<typeof TraceRunOriginSchema>;
export type TraceOrigin = z.infer<typeof TraceOriginSchema>;
export const TraceRelationSchema = z.enum([
  'run_related',
  'attempt_owned',
  'global_context',
  'unattributed',
]);
export type TraceRelation = z.infer<typeof TraceRelationSchema>;

/** Diagnostic equality; never permissions, invocation identity or callback settlement. */
export function traceRelation(
  eventType: string,
  origin: TraceOrigin | undefined,
  capture: TraceRunOrigin | undefined
): TraceRelation | 'foreign' {
  if (origin === undefined) return 'unattributed';
  if (origin.kind === 'global')
    return eventType.startsWith('signal.') ? 'global_context' : 'unattributed';
  if (capture === undefined) return 'unattributed';
  if (conflictingRunIdentity(origin, capture)) return 'foreign';
  if (origin.attemptId === undefined && capture.attemptId === undefined) return 'run_related';
  return exactCommittedAttempt(origin, capture) ? 'attempt_owned' : 'unattributed';
}

function differentKnownIdentity(a: string | undefined, b: string | undefined): boolean {
  return a !== undefined && b !== undefined && a !== b;
}
function conflictingRunIdentity(origin: TraceRunOrigin, capture: TraceRunOrigin): boolean {
  return (
    origin.producer !== capture.producer ||
    origin.runId !== capture.runId ||
    differentKnownIdentity(origin.taskId, capture.taskId) ||
    differentKnownIdentity(origin.attemptId, capture.attemptId)
  );
}
function exactCommittedAttempt(origin: TraceRunOrigin, capture: TraceRunOrigin): boolean {
  return (
    origin.producer === 'contract-pipeline' &&
    origin.taskId !== undefined &&
    origin.taskId === capture.taskId &&
    origin.attemptId !== undefined &&
    origin.attemptId === capture.attemptId
  );
}

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
const TraceEntrySchema = z.object({
  /** Optional/versioned so historical rows remain readable UNKNOWN. */
  attributionVersion: z.literal(1).optional(),
  origin: TraceOriginSchema.optional(),
  captureOrigin: TraceRunOriginSchema.optional(),
  captureRelation: TraceRelationSchema.optional(),
  intentId: identity.optional(),
  attemptId: identity.optional(),
  taskId: identity.optional(),
  invocationId: identity.optional(),
  proposalId: z.string().max(256).optional(),
  approvalPercentage: z.number().optional(),
  rejectionRules: z.array(z.string().max(256)).max(20).optional(),
  reason: z.string().max(1024).optional(),
  score: z.number().optional(),
  floor: z.number().optional(),
  dimension: z.string().max(256).optional(),
  provenanceTruncated: z.boolean().optional(),
  attributionIssue: z.literal('invalid_origin').optional(),

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

  /** Wave number (1-based) for wave dispatch events. */
  waveNumber: z.number().optional(),

  /** Total waves in the dispatch plan. */
  totalWaves: z.number().optional(),

  /** Number of workers in this wave. */
  workerCount: z.number().optional(),
});

type TraceEntryFields = z.infer<typeof TraceEntrySchema>;
function legacyAttribution(entry: TraceEntryFields): boolean {
  return (
    entry.attributionVersion === undefined &&
    entry.origin === undefined &&
    entry.captureOrigin === undefined &&
    entry.captureRelation === undefined
  );
}
function eventIdentityAgrees(entry: TraceEntryFields): boolean {
  if (entry.origin?.kind !== 'run') return true;
  return (
    !differentKnownIdentity(entry.attemptId, entry.origin.attemptId) &&
    !differentKnownIdentity(entry.taskId, entry.origin.taskId)
  );
}
function consistentAttribution(entry: TraceEntryFields): boolean {
  if (entry.attributionVersion !== 1 || entry.captureRelation === undefined) return false;
  if (entry.captureOrigin !== undefined && entry.captureOrigin.runId !== entry.runId) return false;
  if (entry.origin?.kind === 'global' && entry.agentId !== undefined && entry.agentId.length > 256)
    return false;
  return (
    traceRelation(entry.eventType, entry.origin, entry.captureOrigin) === entry.captureRelation &&
    eventIdentityAgrees(entry)
  );
}
export const ExecutionTraceEntrySchema = TraceEntrySchema.superRefine((entry, ctx) => {
  if (legacyAttribution(entry)) return;
  if (!consistentAttribution(entry))
    ctx.addIssue({ code: 'custom', message: 'Contradictory trace attribution' });
});
export type ExecutionTraceEntry = z.infer<typeof ExecutionTraceEntrySchema>;

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const TraceRelationCountsSchema = z
  .object({
    run_related: count,
    attempt_owned: count,
    global_context: count,
    unattributed: count,
  })
  .strict();
export type TraceRelationCounts = z.infer<typeof TraceRelationCountsSchema>;

/** One writer's observations of the exact retained JSONL snapshot, never all-run history. */
export const TraceAttributionSnapshotSchema = z
  .object({
    attributionVersion: z.literal(1),
    runId: identity,
    captureOrigin: TraceRunOriginSchema.optional(),
    traceSha256: z.string().regex(/^[a-f0-9]{64}$/),
    traceBytes: count,
    writerObserved: z.object({ observed: count, foreignDropped: count, evicted: count }).strict(),
    retained: TraceRelationCountsSchema,
  })
  .strict()
  .superRefine((snapshot, ctx) => {
    const retained = Object.values(snapshot.retained).reduce((sum, value) => sum + value, 0);
    const total =
      retained + snapshot.writerObserved.foreignDropped + snapshot.writerObserved.evicted;
    if (
      !Number.isSafeInteger(total) ||
      total !== snapshot.writerObserved.observed ||
      (snapshot.captureOrigin !== undefined && snapshot.captureOrigin.runId !== snapshot.runId)
    ) {
      ctx.addIssue({ code: 'custom', message: 'Inconsistent trace observation counts/context' });
    }
  });
export type TraceAttributionSnapshot = z.infer<typeof TraceAttributionSnapshotSchema>;
