/**
 * nexus-agents/audit - Structured Audit Logging Module
 *
 * SIEM-compatible audit logging with file rotation and hash chain support.
 *
 * (Source: Issue #193 - Phase 3 structured audit logging)
 *
 * @module audit
 */

// Types
export {
  AuditError,
  AuditCategorySchema,
  AuditSeveritySchema,
  AuditOutcomeSchema,
  AuditActorSchema,
  AuditResourceSchema,
  AuditEventSchema,
  AuditEventInputSchema,
  AuditLogConfigSchema,
  AuditQueryCriteriaSchema,
  TierTransitionKindSchema,
  TierTransitionTierSchema,
  TierTransitionPayloadSchema,
  TIER_TRANSITION_METADATA_KEY,
} from './audit-types.js';
export type {
  AuditCategory,
  AuditSeverity,
  AuditOutcome,
  AuditActor,
  AuditResource,
  AuditEvent,
  AuditEventInput,
  AuditLogConfig,
  AuditQueryCriteria,
  IAuditStorage,
  IAuditLogger,
  ToolInvocationAuditOpts,
  PolicyDecisionAuditOpts,
  SecurityEventAuditOpts,
  RateLimitAuditOpts,
  TierTransitionKind,
  TierTransitionTier,
  TierTransitionPayload,
  TierTransitionAuditOpts,
} from './audit-types.js';

// Logger
export {
  AuditLogger,
  createAuditLogger,
  verifyChain,
  extractTierTransition,
} from './audit-logger.js';
export type { ChainVerification } from './audit-logger.js';

// Storage
export { FileAuditStorage, InMemoryAuditStorage } from './audit-storage.js';

// SecureHandler Integration
export {
  actorFromContext,
  resultToOutcome,
  logToolInvocationAudit,
  logPolicyAudit,
  logRateLimitAudit,
} from './secure-handler-audit.js';
export type {
  AuditHandlerConfig,
  LogToolInvocationOpts,
  LogPolicyAuditOpts,
  LogRateLimitAuditOpts,
} from './secure-handler-audit.js';
