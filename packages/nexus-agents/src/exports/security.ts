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
  // #4463: the correct predicate for "does this need a human?". isMutatingAction
  // stays exported for the untrusted-input influence block, but it is broader and
  // no longer implies approval.
  requiresHumanApproval,
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
// #5381: `FirewallResult.reputationGate` is part of the published surface, so a
// consumer needs the type that names its fields — same reason as
// `FirewallPolicyMode` and `ActionValidation` below. `ReputationGatingMode` comes
// with it because `reputationGate.mode` is one of its values, and
// `resolveReputationGatingMode` because an embedder configuring the firewall
// per-instance needs to read the same env var the default path reads.
export type { ReputationGateDecision, ReputationGatingMode } from '../security/reputation-model.js';
export { resolveReputationGatingMode } from '../security/reputation-model.js';

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
// #4992: the per-call argument to `process()` — a consumer cannot pass an
// allowlist or an access posture per call without the type that names them.
export type { FirewallProcessOptions } from '../security/firewall/firewall-types.js';
// #5382: the return type of `validateAction`. Exported for the same reason as
// FirewallPolicyMode below — a consumer cannot narrow a value it is handed
// without the type that names its discriminant.
export type { ActionValidation } from '../security/firewall/firewall-pipeline.js';
// #5382: the rollout gate for firewall behaviour changes. Exported because
// `FirewallResult.policyMode` is part of the published surface — a consumer
// cannot read the field it is handed without the type that names its values.
export {
  DEFAULT_FIREWALL_POLICY_MODE,
  FIREWALL_POLICY_ENV_VAR,
  FirewallPolicyModeSchema,
  resolveFirewallPolicyMode,
} from '../security/firewall/firewall-policy-mode.js';
export type { FirewallPolicyMode } from '../security/firewall/firewall-policy-mode.js';
export { generateATL, parseATL } from '../security/firewall/agent-trust-labels.js';
export { createGitHubAdapter } from '../security/firewall/github-adapter.js';
export type { GitHubInput } from '../security/firewall/github-adapter.js';

// Polyglot (Python/Go) ast-grep QA/security rules — read-only (#4249 child C)
export {
  ensurePolyglotLangs,
  loadRules,
  getBuiltInAstRulesPath,
  collectAstQaFindings,
  runAstQaRules,
  AST_RULE_LANGUAGES,
  AST_RULE_SEVERITIES,
  DEFAULT_AST_QA_LIMIT,
  MAX_AST_QA_LIMIT,
  MAX_FILES_SCANNED,
} from '../security/ast-rule-runner.js';
export type {
  AstRuleLanguage,
  AstRuleSeverity,
  AstQaRuleFile,
  AstRuleFinding,
  RunAstQaRulesOptions,
  AstQaCollectResult,
} from '../security/ast-rule-runner.js';
