/**
 * nexus-agents/swe-bench - Evaluation Harness Types
 *
 * Types for invoking SWE-bench evaluation and parsing results.
 * Follows official SWE-bench harness format.
 *
 * @module swe-bench/evaluation-harness-types
 * @see https://www.swebench.com/SWE-bench/guides/evaluation/
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

// Re-export configuration types
export type {
  EvaluationCacheLevel,
  EvaluationMode,
  EvaluationHarnessConfig,
} from './evaluation-config-types.js';
export { DEFAULT_EVALUATION_CONFIG } from './evaluation-config-types.js';

// Re-export result types
export type {
  TestStatus,
  TestCaseResult,
  ResolutionStatus,
  InstanceEvaluationResult,
  EvaluationMetrics,
  RepositoryMetrics,
  EvaluationRunResult,
} from './evaluation-result-types.js';

// Re-export comparison types
export type {
  CompetitorSystem,
  CompetitorResult,
  ComparisonReport,
  LeaderboardEntry,
  LeaderboardSnapshot,
} from './evaluation-comparison-types.js';

// Re-export interface types
export type {
  EvaluationProgressCallback,
  EvaluationPhase,
  EvaluationProgress,
  EvaluationErrorCode,
  EvaluationValidationResult,
  IEvaluationHarness,
} from './evaluation-interface-types.js';
export { EvaluationHarnessError } from './evaluation-interface-types.js';
