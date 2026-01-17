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
