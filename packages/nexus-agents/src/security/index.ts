/**
 * nexus-agents/security - Module Exports
 *
 * Security components including sandboxing, isolation, safety evaluation,
 * and untrusted input hardening (Epic #818).
 *
 * @module security
 */

// Sandbox module
export * from './sandbox/index.js';

// Safety-bench module (Issue #332, arXiv:2412.14470)
export * from './safety-bench/index.js';

// Untrusted input hardening — Phase 1 (Epic #818)
export * from './trust-types.js';
export { sanitizeInput } from './input-sanitizer.js';
export {
  classifyTrust,
  mapAuthorAssociation,
  canInfluenceDecisions,
  requiresCorroboration,
  getRequiredTrustTier,
} from './trust-classifier.js';
export type { ClassifyInput, ClassifyResult } from './trust-classifier.js';
export {
  AgentActionSchema,
  SourceCitationSchema,
  validateAgentAction,
  isReadOnlyAction,
  isMutatingAction,
  requiresCitation,
} from './action-schema.js';
export type {
  AgentAction,
  AgentActionType,
  SourceCitation,
  ActionValidationResult,
} from './action-schema.js';

// Untrusted input hardening — Phase 2 (Epic #818)
export { evaluatePolicy, canProceed } from './policy-gate.js';
export type { PolicyDecision, ActionContext, Violation } from './policy-gate.js';
export { ViolationSchema } from './policy-gate.js';
export { validateCorroboration, getCorroborationRules } from './corroboration-validator.js';
export type { CorroborationResult, CorroborationRule } from './corroboration-validator.js';

// Untrusted input hardening — Phase 3 (Epic #818)
export { assessReputation, ReputationCache, SuspiciousSignalSchema } from './reputation-model.js';
export type {
  ReputationAssessment,
  GitHubUserMetadata,
  SuspiciousSignal,
} from './reputation-model.js';

// Security audit trail (Issue #832)
export {
  AuditTrail,
  createAuditTrail,
  emitTrustEvent,
  emitPolicyEvent,
  emitCorroborationEvent,
  emitReputationEvent,
  emitSanitizationEvent,
  emitGraphExecutionEvent,
  createGraphAuditBridge,
} from './audit-trail.js';
export type {
  AuditEvent,
  AuditQuery,
  TrustClassificationEvent,
  PolicyGateEvent,
  CorroborationEvent,
  ReputationEvent,
  SanitizationEvent,
  GraphExecutionAuditEvent,
} from './audit-trail.js';

// Output sanitization — subprocess key redaction (Issue #1597)
export { sanitizeOutput, REDACTED_KEY_PLACEHOLDER } from './output-sanitizer.js';

// Hostile input firewall (Issue #826)
export * from './firewall/index.js';

// SARIF parser for security scanner output (#1682)
export { parseSarif } from './sarif-parser.js';
export type { SecurityFinding, SarifParseResult, FindingSeverity } from './sarif-types.js';
export {
  SecurityFindingSchema,
  FindingSeveritySchema,
  SARIF_LEVEL_MAP,
  SEVERITY_ORDER,
} from './sarif-types.js';

// Quality gate engine (#1684)
export { runQualityGate } from './quality-gate.js';
export type { GateCheckFn } from './quality-gate.js';
export type {
  PipelineStage,
  GateVerdict,
  GateCheckResult,
  QualityGateResult,
} from './quality-gate-types.js';
export {
  PipelineStageSchema,
  GateVerdictSchema,
  MAX_GATE_ITERATIONS,
} from './quality-gate-types.js';
