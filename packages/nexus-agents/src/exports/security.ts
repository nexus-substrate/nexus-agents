/**
 * Security exports - Sandboxing, safety evaluation, and security components
 * Split from index.ts for file size compliance (Issue #285)
 */

// Sandbox module
export {
  // Sandbox types
  type SandboxMode,
  type SecurityCapability,
  type ResourceLimits,
  type PathAccessRule,
  type SandboxPolicy,
  type PolicyEvaluation,
  type PolicyViolation,
  type SandboxResult,
  type ResourceUsage,
  type ISandboxExecutor,
  type SandboxExecutionOptions,
  type SandboxConfig,
  // Constants
  DEFAULT_RESOURCE_LIMITS,
  // Factory
  createSandboxExecutor,
  // Policies
  DEFAULT_POLICIES,
  getPolicy,
  // Command allowlist
  ALLOWED_COMMANDS,
  validateCommand,
} from '../security/sandbox/index.js';

// Safety-bench module (Issue #332, arXiv:2412.14470)
export {
  // Risk levels
  RiskLevel,
  RiskLevelSchema,
  type RiskLevelType,
  // Category identifiers
  SafetyCategoryId,
  SafetyCategoryIdSchema,
  type SafetyCategoryIdType,
  // Criterion types
  CriterionType,
  CriterionTypeSchema,
  type CriterionTypeType,
  // Expected outcomes
  ExpectedOutcome,
  ExpectedOutcomeSchema,
  type ExpectedOutcomeType,
  // Schemas
  EvaluationCriterionSchema,
  SafetyTestCaseSchema,
  SafetyCategorySchema,
  // Types
  type EvaluationCriterion,
  type SafetyTestCase,
  type SafetyCategory,
  type SafetyTaxonomySummary,
  // Category definitions
  HARM_PHYSICAL_CATEGORY,
  HARM_EMOTIONAL_CATEGORY,
  HARM_FINANCIAL_CATEGORY,
  DECEPTION_CATEGORY,
  BIAS_CATEGORY,
  PRIVACY_CATEGORY,
  MANIPULATION_CATEGORY,
  INSTRUCTION_SAFETY_CATEGORY,
  ROBUSTNESS_CATEGORY,
  RISK_AWARENESS_CATEGORY,
  // Registry
  SAFETY_CATEGORIES,
  SAFETY_CATEGORY_MAP,
  // Utility functions
  getSafetyCategory,
  getCategoriesByMinRiskLevel,
  getAllTestCases,
  getTestCasesByTags,
  // Validation functions
  validateSafetyCategory,
  validateTestCase,
  validateEvaluationCriterion,
  // Summary
  getSafetyTaxonomySummary,
} from '../security/safety-bench/index.js';

// Untrusted input hardening — Phase 1 (Epic #818)
export { sanitizeInput } from '../security/input-sanitizer.js';
export {
  classifyTrust,
  mapAuthorAssociation,
  canInfluenceDecisions,
  requiresCorroboration,
  getRequiredTrustTier,
} from '../security/trust-classifier.js';
export type { ClassifyInput, ClassifyResult } from '../security/trust-classifier.js';
export {
  AgentActionSchema,
  SourceCitationSchema,
  validateAgentAction,
  isReadOnlyAction,
  isMutatingAction,
  requiresCitation,
} from '../security/action-schema.js';
export type {
  AgentAction,
  AgentActionType,
  SourceCitation,
  ActionValidationResult,
} from '../security/action-schema.js';
export * from '../security/trust-types.js';

// Untrusted input hardening — Phase 2 (Epic #818)
export { evaluatePolicy as evaluateSecurityPolicy, canProceed } from '../security/policy-gate.js';
export type {
  PolicyDecision as SecurityPolicyDecision,
  ActionContext,
  Violation,
} from '../security/policy-gate.js';
export { ViolationSchema } from '../security/policy-gate.js';
export {
  validateCorroboration,
  getCorroborationRules,
} from '../security/corroboration-validator.js';
export type {
  CorroborationResult,
  CorroborationRule,
} from '../security/corroboration-validator.js';

// Untrusted input hardening — Phase 3 (Epic #818)
export {
  assessReputation,
  ReputationCache,
  SuspiciousSignalSchema,
} from '../security/reputation-model.js';
export type {
  ReputationAssessment,
  GitHubUserMetadata,
  SuspiciousSignal,
} from '../security/reputation-model.js';

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
} from '../security/audit-trail.js';
export type {
  AuditEvent as SecurityAuditEvent,
  AuditQuery as SecurityAuditQuery,
  TrustClassificationEvent,
  PolicyGateEvent,
  CorroborationEvent,
  ReputationEvent,
  SanitizationEvent,
  GraphExecutionAuditEvent,
} from '../security/audit-trail.js';

// Hostile input firewall (Issue #826)
export { HostileInputFirewall } from '../security/firewall/firewall-pipeline.js';
export type { FirewallResult } from '../security/firewall/firewall-pipeline.js';
export { generateATL, parseATL } from '../security/firewall/agent-trust-labels.js';
export { createGitHubAdapter } from '../security/firewall/github-adapter.js';
export type { GitHubInput } from '../security/firewall/github-adapter.js';
