/**
 * nexus-agents/security/safety-bench - Safety Enums and Constants
 *
 * Enum definitions and constants for Agent-SafetyBench evaluation.
 *
 * @module security/safety-bench/safety-enums
 * (Source: Issue #332)
 */

// =============================================================================
// Risk Level Definitions
// =============================================================================

/**
 * Risk severity levels for safety categories.
 */
export const RiskLevel = {
  /** Low risk - minimal potential for harm. */
  LOW: 'low',
  /** Medium risk - moderate potential for harm. */
  MEDIUM: 'medium',
  /** High risk - significant potential for harm. */
  HIGH: 'high',
  /** Critical risk - severe potential for harm, requires immediate attention. */
  CRITICAL: 'critical',
} as const;

export type RiskLevelType = (typeof RiskLevel)[keyof typeof RiskLevel];

// =============================================================================
// Safety Category Identifiers
// =============================================================================

/**
 * Unique identifiers for safety categories.
 */
export const SafetyCategoryId = {
  /** Physical harm prevention category. */
  HARM_PHYSICAL: 'harm_physical',
  /** Emotional/psychological harm prevention category. */
  HARM_EMOTIONAL: 'harm_emotional',
  /** Financial harm prevention category. */
  HARM_FINANCIAL: 'harm_financial',
  /** Deception detection and prevention category. */
  DECEPTION: 'deception',
  /** Bias evaluation and mitigation category. */
  BIAS: 'bias',
  /** Privacy protection category. */
  PRIVACY: 'privacy',
  /** Manipulation resistance category. */
  MANIPULATION: 'manipulation',
  /** Instruction following safety category. */
  INSTRUCTION_SAFETY: 'instruction_safety',
  /** Robustness to adversarial inputs category. */
  ROBUSTNESS: 'robustness',
  /** Risk awareness and hazard recognition category. */
  RISK_AWARENESS: 'risk_awareness',
} as const;

export type SafetyCategoryIdType = (typeof SafetyCategoryId)[keyof typeof SafetyCategoryId];

// =============================================================================
// Evaluation Criteria Types
// =============================================================================

/**
 * Types of evaluation criteria for safety assessment.
 */
export const CriterionType = {
  /** Binary pass/fail criterion. */
  BINARY: 'binary',
  /** Scaled score criterion (0-100). */
  SCALED: 'scaled',
  /** Threshold-based criterion. */
  THRESHOLD: 'threshold',
  /** Categorical classification criterion. */
  CATEGORICAL: 'categorical',
} as const;

export type CriterionTypeType = (typeof CriterionType)[keyof typeof CriterionType];

// =============================================================================
// Expected Outcomes
// =============================================================================

/**
 * Expected outcome for a safety test case.
 */
export const ExpectedOutcome = {
  /** Agent should refuse the action. */
  REFUSE: 'refuse',
  /** Agent should proceed with caution/warning. */
  CAUTION: 'caution',
  /** Agent should request clarification. */
  CLARIFY: 'clarify',
  /** Agent should escalate to human. */
  ESCALATE: 'escalate',
  /** Agent should proceed normally. */
  PROCEED: 'proceed',
  /** Agent should detect and report the issue. */
  DETECT: 'detect',
} as const;

export type ExpectedOutcomeType = (typeof ExpectedOutcome)[keyof typeof ExpectedOutcome];
