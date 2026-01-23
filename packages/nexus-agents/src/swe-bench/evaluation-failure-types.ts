/**
 * nexus-agents/swe-bench - Evaluation Failure Types
 *
 * Failure analysis types for evaluation reports.
 *
 * @module swe-bench/evaluation-failure-types
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

/**
 * Categories of failures for analysis.
 */
export type FailureCategory =
  | 'patch_not_applicable'
  | 'test_failure'
  | 'syntax_error'
  | 'runtime_error'
  | 'timeout'
  | 'missing_dependency'
  | 'wrong_file_modified'
  | 'incomplete_fix'
  | 'regression_introduced'
  | 'unknown';

/**
 * Failure analysis for an instance.
 */
export interface FailureAnalysis {
  /** Instance ID. */
  readonly instanceId: string;
  /** Primary failure category. */
  readonly category: FailureCategory;
  /** Detailed error message. */
  readonly errorMessage: string;
  /** Affected file(s). */
  readonly affectedFiles: readonly string[];
  /** Suggested fix approach (if determinable). */
  readonly suggestedApproach?: string;
  /** Similarity to other failures (for clustering). */
  readonly similarFailures?: readonly string[];
}

/**
 * A pattern of recurring failures.
 */
export interface FailurePattern {
  /** Pattern description. */
  readonly description: string;
  /** Number of occurrences. */
  readonly occurrences: number;
  /** Example instance IDs. */
  readonly examples: readonly string[];
  /** Potential root cause. */
  readonly potentialCause?: string;
}

/**
 * Aggregate failure statistics.
 */
export interface FailureStatistics {
  /** Breakdown by failure category. */
  readonly byCategory: Record<FailureCategory, number>;
  /** Most common failure patterns. */
  readonly commonPatterns: readonly FailurePattern[];
  /** Failures by repository. */
  readonly byRepository: Record<string, number>;
}
