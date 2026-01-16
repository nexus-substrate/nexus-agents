/**
 * nexus-agents/testing/scoring - Rubric Types
 *
 * Shared types for rubric scoring and validation.
 * Extracted to avoid circular dependencies.
 */

/**
 * Score for an individual criterion.
 */
export interface CriterionScore {
  readonly criterion: string;
  readonly criterionName: string;
  readonly score: number;
  readonly weight: number;
  readonly weightedScore: number;
  readonly maxWeightedScore: number;
  readonly feedback: string;
  readonly matchedTerms?: readonly string[];
  readonly missingTerms?: readonly string[];
  readonly violationTerms?: readonly string[];
}

/**
 * Complete quality evaluation result.
 */
export interface QualityResult {
  readonly score: number;
  readonly passed: boolean;
  readonly passingScore: number;
  readonly criteriaScores: readonly CriterionScore[];
  readonly evaluationMethod: 'rubric' | 'exact-match' | 'contains';
  readonly totalWeightedScore: number;
  readonly maxWeightedScore: number;
  readonly summary: string;
  readonly evaluatedAt: string;
}

/**
 * Scoring error details.
 */
export interface ScoringError {
  readonly code: ScoringErrorCode;
  readonly message: string;
  readonly criterion?: string;
  readonly details?: string;
}

/**
 * Scoring error codes.
 */
export const ScoringErrorCode = {
  INVALID_RUBRIC: 'INVALID_RUBRIC',
  INVALID_CRITERION: 'INVALID_CRITERION',
  INVALID_REGEX: 'INVALID_REGEX',
  EMPTY_RESPONSE: 'EMPTY_RESPONSE',
  CALCULATION_ERROR: 'CALCULATION_ERROR',
} as const;

export type ScoringErrorCode = (typeof ScoringErrorCode)[keyof typeof ScoringErrorCode];

/**
 * Configuration for the rubric scorer.
 */
export interface RubricScorerConfig {
  readonly caseSensitive: boolean;
  readonly trimWhitespace: boolean;
  readonly normalizeWhitespace: boolean;
  readonly semanticThreshold: number;
}
