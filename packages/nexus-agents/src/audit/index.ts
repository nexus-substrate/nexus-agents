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

// Authentic vote record (#3897, model revised #3927) — committable,
// tamper-evident record SET + monotonic sequence (merge-safe; not a chain).
export {
  VoteRecordSchema,
  VoterSummarySchema,
  VoteRecordCountsSchema,
  VoteRecordDecisionSchema,
  computeVoteRecordHash,
  hashProposal,
  verifyVoteRecordSet,
} from './vote-record.js';
export type {
  VoteRecord,
  VoterSummary,
  VoteRecordCounts,
  VoteRecordDecision,
  VoteRecordVerification,
} from './vote-record.js';
export {
  VOTE_RECORDS_REL_PATH,
  buildVoteRecord,
  persistVoteRecord,
  resolveVoteRecordsPath,
  readVoteRecords,
} from './vote-record-store.js';
export type { BuildVoteRecordInput, PersistVoteRecordOptions } from './vote-record-store.js';

// PR-review audit record (#3831, Epic B) — committable, tamper-evident,
// SHA-BOUND record SET + monotonic sequence (mirrors the #3927 vote-record
// model). Read by the warn-first governor-review gate.
export {
  PrReviewRecordSchema,
  PrReviewVerdictSchema,
  PrReviewVoteCountsSchema,
  computePrReviewRecordHash,
  verifyPrReviewRecordSet,
} from './pr-review-record.js';
export type {
  PrReviewRecord,
  PrReviewVerdict,
  PrReviewVoteCounts,
  PrReviewRecordVerification,
} from './pr-review-record.js';
export {
  PR_REVIEW_RECORDS_REL_PATH,
  PR_REVIEW_RECORDS_PATH_ENV,
  buildPrReviewRecord,
  resolvePrReviewRecordsPath,
  readPrReviewRecords,
} from './pr-review-record-store.js';
export type { BuildPrReviewRecordInput } from './pr-review-record-store.js';

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
