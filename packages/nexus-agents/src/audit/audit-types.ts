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
]);
export type AuditCategory = z.infer<typeof AuditCategorySchema>;

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
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;

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

export interface PolicyDecisionAuditOpts {
  policyName: string;
  decision: 'allow' | 'deny';
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
