/**
 * Type definitions for the Failure Analyzer module.
 *
 * Analyzes execution results to detect failure patterns
 * and produce improvement suggestions.
 *
 * @module orchestration/failure-analyzer-types
 * (Source: Issue #852 — Phase 4 of AI Software Factory Epic #843)
 */

/**
 * Type of failure detected for an unmet criterion.
 */
export type FailureType = 'missing_implementation' | 'partial_match' | 'no_output';

/**
 * A specific failure for one unmet criterion.
 */
export interface CriterionFailure {
  /** The unmet acceptance criterion */
  readonly criterion: string;
  /** What type of failure occurred */
  readonly type: FailureType;
  /** Human-readable explanation */
  readonly explanation: string;
}

/**
 * A suggested improvement to address failures.
 */
export interface ImprovementSuggestion {
  /** What action to take */
  readonly action: string;
  /** Which criterion this addresses */
  readonly targetCriterion: string;
  /** Priority: 1 (highest) to 3 (lowest) */
  readonly priority: 1 | 2 | 3;
}

/**
 * Complete failure analysis result.
 */
export interface FailureAnalysis {
  /** Overall pass/fail */
  readonly passed: boolean;
  /** Satisfaction score from validation (0-1) */
  readonly satisfaction: number;
  /** Individual criterion failures */
  readonly failures: readonly CriterionFailure[];
  /** Suggested improvements */
  readonly suggestions: readonly ImprovementSuggestion[];
}

/**
 * Error from failure analysis.
 */
export interface AnalysisError {
  readonly message: string;
}
