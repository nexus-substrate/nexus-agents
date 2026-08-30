/**
 * nexus-agents/audit - Audit Event Types
 *
 * Zod schemas and TypeScript types for structured audit logging.
 * SIEM-compatible format with cryptographic integrity support.
 *
 * (Source: Issue #193 - Phase 3 structured audit logging)
 *
 * @module audit/audit-types
 */

import { z } from 'zod';

// ============================================================================
// Error Types
// ============================================================================

export class AuditError extends Error {
  readonly code = 'AUDIT_ERROR';
  readonly context: Record<string, unknown> | undefined;
  override readonly cause: Error | undefined;

  constructor(message: string, options?: { cause?: Error; context?: Record<string, unknown> }) {
    super(message);
    this.name = 'AuditError';
    this.cause = options?.cause;
    this.context = options?.context;
  }
}

// ============================================================================
// Audit Event Categories (SIEM-aligned)
// ============================================================================

export const AuditCategorySchema = z.enum([
  'authentication', // Login, logout, token refresh
  'authorization', // Permission checks, policy decisions
  'tool_invocation', // MCP tool calls
  'data_access', // File reads, data queries
  'data_modification', // File writes, data updates
  'configuration', // Settings changes
  'security', // Security events, violations
  'system', // System events, startup, shutdown
  'governance', // Authority-tier transitions, ratification (Epic D, #3842)
]);
export type AuditCategory = z.infer<typeof AuditCategorySchema>;

// ============================================================================
// Tier-Transition Audit Events (Epic D / ADR-0017, #3842)
// ============================================================================

/**
 * The two directions a loop can move on the authority ladder (ADR-0017
 * §"Transition Rules"). A `promotion` moves UP a tier and is invalid without a
 * linked ratification vote; a `demotion` moves DOWN and is automatic (needs no
 * vote). The ratification gate (`scripts/check-authority-tier-drift.ts`) keys
 * off this kind: a `promotion` event lacking `ratificationVoteRef` FAILS the
 * gate, a `demotion` does not.
 */
export const TierTransitionKindSchema = z.enum(['promotion', 'demotion']);
export type TierTransitionKind = z.infer<typeof TierTransitionKindSchema>;

/**
 * The authority tier vocabulary, mirrored from
 * `orchestration/strategy-manifest.ts` `AuthorityTierSchema`. Declared here so
 * the audit module has no dependency on the orchestration layer (the audit log
 * is the lower layer). A drift between the two enums is caught by the audit
 * tier-transition tests, which round-trip every tier through the emitter.
 */
export const TierTransitionTierSchema = z.enum(['observe', 'suggest', 'advisory', 'enforce']);
export type TierTransitionTier = z.infer<typeof TierTransitionTierSchema>;

/**
 * The structured payload of a tier-transition audit event (ADR-0017,
 * §"All transitions are audit events"). Carried in the event's `metadata` under
 * the `tierTransition` key so the existing hash-chain (which hashes the stable
 * head fields) is unchanged, and recovered by the ratification gate.
 *
 * `ratificationVoteRef` is OPTIONAL on the schema (a demotion legitimately has
 * none), but REQUIRED for a `promotion` by the gate, not the schema — this keeps
 * the event-shape uniform and locates the invariant in one place (the gate).
 */
export const TierTransitionPayloadSchema = z
  .object({
    /** Whether the loop moved up (`promotion`) or down (`demotion`) the ladder. */
    kind: TierTransitionKindSchema,
    /** The loop/strategy whose tier changed (manifest `id` or loop identifier). */
    subject: z.string().min(1),
    /** Tier before the transition. */
    fromTier: TierTransitionTierSchema,
    /** Tier after the transition. */
    toTier: TierTransitionTierSchema,
    /** Ref to the promotion-evidence record this transition was earned against. */
    evidenceRef: z.string().min(1),
    /**
     * Ref to the recorded `consensus_vote` that ratified a PROMOTION. Required
     * by the ratification gate for `kind: 'promotion'`; legitimately absent for
     * `kind: 'demotion'` (automatic, ADR-0017 §"Demotion is automatic").
     */
    ratificationVoteRef: z.string().min(1).optional(),
  })
  .strict();
export type TierTransitionPayload = z.infer<typeof TierTransitionPayloadSchema>;

/** The `metadata` key under which a tier-transition event carries its payload. */
export const TIER_TRANSITION_METADATA_KEY = 'tierTransition' as const;

// The committed ratification-vote ledger (governance/ratification-votes.yaml) and
// its RatificationVote{,Ledger}Schema were removed in #4010: #4005 re-anchored the
// promotion gate to the authentic, tamper-evident governance/vote-records.jsonl
// (resolved via vote-record.ts verifyVoteRecordSet), making the hand-committable
// YAML ledger and its schemas dead. See scripts/vote-record-ratification.ts.

/**
 * Options for {@link IAuditLogger.logTierTransition}. The `actor` defaults to the
 * system actor at the emission site when omitted (a tier change recorded by the
 * evidence ledger is a system event).
 */
export interface TierTransitionAuditOpts {
  kind: TierTransitionKind;
  subject: string;
  fromTier: TierTransitionTier;
  toTier: TierTransitionTier;
  evidenceRef: string;
  ratificationVoteRef?: string | undefined;
  actor?: AuditActor | undefined;
  requestId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

// ============================================================================
// Audit Severity Levels
// ============================================================================

export const AuditSeveritySchema = z.enum([
  'info', // Normal operations
  'warning', // Potential issues, policy warnings
  'critical', // Security violations, failures
]);
export type AuditSeverity = z.infer<typeof AuditSeveritySchema>;

// ============================================================================
// Audit Outcome
// ============================================================================

export const AuditOutcomeSchema = z.enum([
  'success', // Operation completed successfully
  'failure', // Operation failed
  'denied', // Operation denied by policy
  'error', // Unexpected error occurred
]);
export type AuditOutcome = z.infer<typeof AuditOutcomeSchema>;

// ============================================================================
// Actor Information
// ============================================================================

export const AuditActorSchema = z.object({
  type: z.enum(['user', 'agent', 'system', 'external']),
  id: z.string().min(1),
  name: z.string().optional(),
  ip: z.string().optional(),
  userAgent: z.string().optional(),
});
export type AuditActor = z.infer<typeof AuditActorSchema>;

// ============================================================================
// Resource Information
// ============================================================================

export const AuditResourceSchema = z.object({
  type: z.string().min(1), // e.g., 'file', 'tool', 'config', 'agent'
  id: z.string().min(1),
  name: z.string().optional(),
  path: z.string().optional(),
});
export type AuditResource = z.infer<typeof AuditResourceSchema>;

// ============================================================================
// Core Audit Event Schema
// ============================================================================

export const AuditEventSchema = z.object({
  // Identity
  id: z.string().min(1), // Unique event ID
  version: z.literal('1.0'), // Schema version for migrations

  // Timing
  timestamp: z.string(), // ISO 8601 format
  timestampMs: z.number(), // Unix epoch milliseconds

  // Classification
  category: AuditCategorySchema,
  severity: AuditSeveritySchema,
  outcome: AuditOutcomeSchema,

  // Event details
  action: z.string().min(1), // e.g., 'tool.invoke', 'policy.evaluate'
  description: z.string().optional(),

  // Actors and resources
  actor: AuditActorSchema,
  resource: AuditResourceSchema.optional(),

  // Correlation
  requestId: z.string().optional(), // Request correlation ID
  traceId: z.string().optional(), // Distributed trace ID
  sessionId: z.string().optional(), // Session correlation ID

  // Context
  toolName: z.string().optional(),
  durationMs: z.number().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),

  // Policy and security
  policyName: z.string().optional(),
  policyDecision: z.string().optional(),
  violationType: z.string().optional(),

  // Integrity (for tamper-evidence)
  previousHash: z.string().optional(), // Hash of previous event (chain)
  hash: z.string().optional(), // Hash of this event
  /**
   * Hash-projection version (#3921). ABSENT/`1` = the legacy projection
   * ({id,timestamp,category,action,outcome,actor,previousHash}); `2` =
   * the legacy projection PLUS the canonicalized `metadata.tierTransition`
   * payload, so a tier-transition's integrity-critical payload is hash-covered.
   * Versioned so pre-existing v1 chains keep verifying under their own
   * projection (see {@link AUDIT_HASH_VERSION_TIER_TRANSITION}).
   */
  hashVersion: z.number().int().positive().optional(),
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;

/**
 * Hash-projection version that covers the tier-transition payload (#3921). A
 * tier-transition event is written with `hashVersion: 2`, which makes
 * `computeEventHash` fold the canonicalized {@link TierTransitionPayload}
 * ({subject, fromTier, toTier, evidenceRef, ratificationVoteRef}) into the
 * hashed projection — so flipping `toTier`/`ratificationVoteRef` post-write
 * breaks the chain. Legacy (`undefined`/`1`) events keep the original
 * head-fields-only projection, so pre-existing chains verify unchanged.
 */
export const AUDIT_HASH_VERSION_TIER_TRANSITION = 2 as const;

// ============================================================================
// Audit Event Creation Input (minimal required fields)
// ============================================================================

export const AuditEventInputSchema = z.object({
  category: AuditCategorySchema,
  severity: AuditSeveritySchema.optional().default('info'),
  outcome: AuditOutcomeSchema,
  action: z.string().min(1),
  description: z.string().optional(),
  actor: AuditActorSchema,
  resource: AuditResourceSchema.optional(),
  requestId: z.string().optional(),
  traceId: z.string().optional(),
  sessionId: z.string().optional(),
  toolName: z.string().optional(),
  durationMs: z.number().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  policyName: z.string().optional(),
  policyDecision: z.string().optional(),
  violationType: z.string().optional(),
});
export type AuditEventInput = z.infer<typeof AuditEventInputSchema>;

// ============================================================================
// Audit Log Configuration
// ============================================================================

export const AuditLogConfigSchema = z.object({
  // Storage
  logDir: z.string().min(1),
  filePrefix: z.string().optional().default('audit'),
  maxFileSizeBytes: z
    .number()
    .positive()
    .optional()
    .default(10 * 1024 * 1024), // 10MB
  maxFiles: z.number().positive().optional().default(10),

  // Features
  enableHashChain: z.boolean().optional().default(true),
  enableCompression: z.boolean().optional().default(false),
  flushIntervalMs: z.number().positive().optional().default(1000),

  /**
   * Maximum in-memory event queue depth before drop-oldest backpressure
   * engages. Bounds memory under load when storage.write is slow or the flush
   * timer is overlapping; see #2979.
   */
  maxQueueDepth: z.number().positive().optional().default(10_000),

  // Filtering
  minSeverity: AuditSeveritySchema.optional().default('info'),
  categories: z.array(AuditCategorySchema).optional(),
});
export type AuditLogConfig = z.infer<typeof AuditLogConfigSchema>;

// ============================================================================
// Audit Storage Interface
// ============================================================================

export interface IAuditStorage {
  /** Write an audit event to storage */
  write(event: AuditEvent): Promise<void>;

  /** Flush pending writes */
  flush(): Promise<void>;

  /** Close the storage */
  close(): Promise<void>;

  /** Query events by criteria */
  query(criteria: AuditQueryCriteria): Promise<AuditEvent[]>;
}

// ============================================================================
// Audit Query Criteria
// ============================================================================

export const AuditQueryCriteriaSchema = z.object({
  startTime: z.date().optional(),
  endTime: z.date().optional(),
  categories: z.array(AuditCategorySchema).optional(),
  severities: z.array(AuditSeveritySchema).optional(),
  outcomes: z.array(AuditOutcomeSchema).optional(),
  actorId: z.string().optional(),
  resourceId: z.string().optional(),
  requestId: z.string().optional(),
  traceId: z.string().optional(),
  limit: z.number().positive().optional().default(100),
  offset: z.number().nonnegative().optional().default(0),
});
export type AuditQueryCriteria = z.infer<typeof AuditQueryCriteriaSchema>;

// ============================================================================
// Audit Logger Interface
// ============================================================================

export interface IAuditLogger {
  /** Log an audit event */
  log(input: AuditEventInput): void;

  /** Log a tool invocation */
  logToolInvocation(opts: ToolInvocationAuditOpts): void;

  /** Log a policy decision */
  logPolicyDecision(opts: PolicyDecisionAuditOpts): void;

  /** Log a security event */
  logSecurityEvent(opts: SecurityEventAuditOpts): void;

  /** Log a rate limit violation */
  logRateLimitViolation(opts: RateLimitAuditOpts): void;

  /** Log an authority-tier transition (promotion/demotion) — Epic D, #3842. */
  logTierTransition(opts: TierTransitionAuditOpts): void;

  /** Flush pending events */
  flush(): Promise<void>;

  /** Close the logger */
  close(): Promise<void>;
}

// ============================================================================
// Convenience Logging Options
// ============================================================================

export interface ToolInvocationAuditOpts {
  toolName: string;
  outcome: AuditOutcome;
  actor: AuditActor;
  requestId?: string | undefined;
  durationMs?: number | undefined;
  errorMessage?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

/**
 * The verdict a policy evaluation reached.
 *
 * `would_deny` (#4991) is warn mode: a rule fired, but the firewall allowed the
 * call anyway. It is deliberately NOT `deny` — recording it as a denial would
 * assert an enforcement that never happened — and NOT `allow`, which would
 * erase the only signal the warn-mode soak produces. `#4988`'s enforce decision
 * is read from these records, so the instrument has to be able to say
 * "a rule would have stopped this" without lying in either direction.
 *
 * BREAKING for implementors of {@link IAuditLogger} (ratified 5/6, #4991):
 * TypeScript's method-parameter bivariance means an out-of-tree implementor
 * typed against the old two-value union still COMPILES and then receives
 * `would_deny` at runtime, falling through whatever its `=== 'deny'` branch
 * does. The major version bump is the only thing that makes those implementors
 * look.
 */
export type PolicyAuditDecision = 'allow' | 'deny' | 'would_deny';

export interface PolicyDecisionAuditOpts {
  policyName: string;
  decision: PolicyAuditDecision;
  reason: string;
  toolName: string;
  actor: AuditActor;
  requestId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface SecurityEventAuditOpts {
  eventType: string; // e.g., 'path_traversal_blocked', 'invalid_input'
  severity: AuditSeverity;
  actor: AuditActor;
  description: string;
  requestId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface RateLimitAuditOpts {
  toolName: string;
  actor: AuditActor;
  currentRate: number;
  limitRate: number;
  requestId?: string | undefined;
}
