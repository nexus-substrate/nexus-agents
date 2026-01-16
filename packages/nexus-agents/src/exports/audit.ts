/**
 * Audit exports - Structured audit logging (Issue #193)
 * Split from index.ts for file size compliance (Issue #285)
 */

export {
  // Error
  AuditError,
  // Schemas
  AuditCategorySchema,
  AuditSeveritySchema,
  AuditOutcomeSchema,
  AuditActorSchema,
  AuditResourceSchema,
  AuditEventSchema,
  AuditEventInputSchema,
  AuditLogConfigSchema,
  AuditQueryCriteriaSchema,
  // Types
  type AuditCategory,
  type AuditSeverity,
  type AuditOutcome,
  type AuditActor,
  type AuditResource,
  type AuditEvent,
  type AuditEventInput,
  type AuditLogConfig,
  type AuditQueryCriteria,
  type IAuditStorage,
  type IAuditLogger,
  type ToolInvocationAuditOpts,
  type PolicyDecisionAuditOpts,
  type SecurityEventAuditOpts,
  type RateLimitAuditOpts,
  // Logger
  AuditLogger,
  createAuditLogger,
  // Storage
  FileAuditStorage,
  InMemoryAuditStorage,
  // Integration helpers
  actorFromContext,
  resultToOutcome,
  logToolInvocationAudit,
  logPolicyAudit,
  logRateLimitAudit,
  type AuditHandlerConfig,
  type LogToolInvocationOpts,
  type LogPolicyAuditOpts,
  type LogRateLimitAuditOpts,
} from '../audit/index.js';
