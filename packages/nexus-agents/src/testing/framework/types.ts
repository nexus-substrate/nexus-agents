/**
 * nexus-agents/testing/framework - Type Definitions
 *
 * Types and interfaces for the CLI evaluation testing framework.
 *
 * (Source: cli-project_plan.md v2.1.0, Phase 3)
 */

import type { CliName } from '../../cli-adapters/types.js';
import type { TaskTypeCategory as TaskType, TaskProfile } from '../../core/index.js';

/**
 * Task difficulty levels for evaluation.
 */
export type TaskDifficulty = 'easy' | 'medium' | 'hard' | 'expert';

/**
 * Task category for grouping evaluation tasks.
 */
export type TaskCategory =
  | 'code_generation'
  | 'code_review'
  | 'architecture'
  | 'debugging'
  | 'documentation'
  | 'refactoring'
  | 'testing'
  | 'large_context';

/**
 * Evaluation task definition.
 */
export interface EvaluationTask {
  /** Unique task identifier */
  readonly id: string;
  /** Human-readable task name */
  readonly name: string;
  /** Task description/prompt */
  readonly description: string;
  /** Task category */
  readonly category: TaskCategory;
  /** Task difficulty */
  readonly difficulty: TaskDifficulty;
  /** Expected task type classification */
  readonly expectedTaskType: TaskType;
  /** Context files (if any) */
  readonly contextFiles?: readonly string[];
  /** Expected output patterns for validation */
  readonly expectedPatterns?: readonly string[];
  /** Timeout override in milliseconds */
  readonly timeoutMs?: number;
  /** Tags for filtering */
  readonly tags?: readonly string[];
  /** Minimum acceptable score (0-1) */
  readonly minimumScore?: number;
  /** Preferred CLIs for this task (for ground truth) */
  readonly preferredClis?: readonly CliName[];
}

/**
 * Rubric criterion for scoring.
 */
export interface RubricCriterion {
  /** Criterion identifier */
  readonly id: string;
  /** Criterion description */
  readonly description: string;
  /** Weight (0-1, sum of all weights should be 1) */
  readonly weight: number;
  /** Scoring function name */
  readonly scoringFunction: 'pattern_match' | 'keyword_presence' | 'length_check' | 'custom';
  /** Configuration for scoring function */
  readonly config?: Record<string, unknown>;
}

/**
 * Evaluation rubric for task scoring.
 */
export interface EvaluationRubric {
  /** Rubric identifier */
  readonly id: string;
  /** Task categories this rubric applies to */
  readonly categories: readonly TaskCategory[];
  /** Scoring criteria */
  readonly criteria: readonly RubricCriterion[];
}

/**
 * Score for a single criterion.
 */
export interface CriterionScore {
  /** Criterion ID */
  readonly criterionId: string;
  /** Raw score (0-1) */
  readonly score: number;
  /** Weighted score (score * weight) */
  readonly weightedScore: number;
  /** Explanation for score */
  readonly explanation: string;
}

/**
 * Result from scoring a task response.
 */
export interface RubricScore {
  /** Overall score (0-1) */
  readonly overallScore: number;
  /** Individual criterion scores */
  readonly criterionScores: readonly CriterionScore[];
  /** Rubric used for scoring */
  readonly rubricId: string;
  /** Scoring timestamp (ISO 8601) */
  readonly timestamp: string;
}

/**
 * Routing decision details for analysis.
 */
export interface RoutingDecisionDetails {
  /** Selected CLI */
  readonly selectedCli: CliName;
  /** Confidence score (0-1) */
  readonly confidence: number;
  /** Reasoning for selection */
  readonly reason: string;
  /** Alternative CLIs considered */
  readonly alternatives: readonly CliName[];
  /** Time to make decision in ms */
  readonly decisionTimeMs: number;
  /** Task profile used for routing */
  readonly taskProfile: TaskProfile;
}

/**
 * Routing score for evaluating router accuracy.
 */
export interface RoutingScore {
  /** Whether routing matched preferred CLI */
  readonly matchedPreferred: boolean;
  /** Whether routing made reasonable choice */
  readonly reasonableChoice: boolean;
  /** Confidence calibration score (0-1) */
  readonly confidenceCalibration: number;
  /** Decision time score (0-1, faster is better) */
  readonly decisionTimeScore: number;
  /** Overall routing score (0-1) */
  readonly overallScore: number;
  /** Explanation */
  readonly explanation: string;
}

/**
 * Result from a single task test execution.
 */
export interface TaskTestResult {
  /** Task that was executed */
  readonly task: EvaluationTask;
  /** CLI that executed the task */
  readonly cli: CliName;
  /** Response content */
  readonly response: string;
  /** Execution duration in milliseconds */
  readonly durationMs: number;
  /** Token usage */
  readonly tokenUsage: {
    readonly inputTokens: number;
    readonly outputTokens: number;
  };
  /** Estimated cost in USD */
  readonly costUsd: number;
  /** Rubric score for the response */
  readonly rubricScore: RubricScore;
  /** Routing decision details */
  readonly routingDecision?: RoutingDecisionDetails;
  /** Routing score (if routing was evaluated) */
  readonly routingScore?: RoutingScore;
  /** Whether the task succeeded */
  readonly success: boolean;
  /** Error message if failed */
  readonly error?: string;
  /** Test execution timestamp (ISO 8601) */
  readonly timestamp: string;
}

/**
 * Aggregated metrics across all tests.
 */
export interface AggregatedMetrics {
  /** Total number of tasks executed */
  readonly totalTasks: number;
  /** Number of successful tasks */
  readonly successfulTasks: number;
  /** Number of failed tasks */
  readonly failedTasks: number;
  /** Success rate (0-1) */
  readonly successRate: number;
  /** Average rubric score */
  readonly averageScore: number;
  /** Score standard deviation */
  readonly scoreStdDev: number;
  /** Total duration in milliseconds */
  readonly totalDurationMs: number;
  /** Average duration per task in milliseconds */
  readonly averageDurationMs: number;
  /** Total tokens consumed */
  readonly totalTokens: number;
  /** Total estimated cost in USD */
  readonly totalCostUsd: number;
  /** Metrics by CLI */
  readonly byCliMetrics: ReadonlyMap<CliName, CliMetrics>;
  /** Metrics by category */
  readonly byCategoryMetrics: ReadonlyMap<TaskCategory, CategoryMetrics>;
  /** Metrics by difficulty */
  readonly byDifficultyMetrics: ReadonlyMap<TaskDifficulty, DifficultyMetrics>;
  /** Routing accuracy (if routing was evaluated) */
  readonly routingAccuracy?: number;
  /** Average routing confidence */
  readonly averageRoutingConfidence?: number;
}

/**
 * Metrics for a specific CLI.
 */
export interface CliMetrics {
  /** CLI name */
  readonly cli: CliName;
  /** Number of tasks executed */
  readonly taskCount: number;
  /** Success rate (0-1) */
  readonly successRate: number;
  /** Average score */
  readonly averageScore: number;
  /** Average duration in ms */
  readonly averageDurationMs: number;
  /** Total tokens used */
  readonly totalTokens: number;
  /** Total cost in USD */
  readonly totalCostUsd: number;
}

/**
 * Metrics for a task category.
 */
export interface CategoryMetrics {
  /** Category */
  readonly category: TaskCategory;
  /** Number of tasks */
  readonly taskCount: number;
  /** Success rate (0-1) */
  readonly successRate: number;
  /** Average score */
  readonly averageScore: number;
  /** Best performing CLI for this category */
  readonly bestCli: CliName;
}

/**
 * Metrics for a difficulty level.
 */
export interface DifficultyMetrics {
  /** Difficulty level */
  readonly difficulty: TaskDifficulty;
  /** Number of tasks */
  readonly taskCount: number;
  /** Success rate (0-1) */
  readonly successRate: number;
  /** Average score */
  readonly averageScore: number;
}

/**
 * Environment information for test metadata.
 */
export interface EnvironmentInfo {
  /** Node.js version */
  readonly nodeVersion: string;
  /** Operating system */
  readonly os: string;
  /** Architecture */
  readonly arch: string;
  /** Test framework version */
  readonly frameworkVersion: string;
  /** CLI versions */
  readonly cliVersions: ReadonlyMap<CliName, string>;
  /** Timestamp of environment capture (ISO 8601) */
  readonly capturedAt: string;
}

/**
 * Result from a complete test run.
 */
export interface TestRunResult {
  /** Unique run identifier */
  readonly runId: string;
  /** Run name/description */
  readonly runName: string;
  /** Individual task results */
  readonly taskResults: readonly TaskTestResult[];
  /** Aggregated metrics */
  readonly metrics: AggregatedMetrics;
  /** Environment information */
  readonly environment: EnvironmentInfo;
  /** Run start time (ISO 8601) */
  readonly startTime: string;
  /** Run end time (ISO 8601) */
  readonly endTime: string;
  /** Total run duration in milliseconds */
  readonly durationMs: number;
  /** Filter applied (if any) */
  readonly filter?: TaskFilter;
  /** Whether the run completed successfully */
  readonly success: boolean;
  /** Summary of failures (if any) */
  readonly failureSummary?: string;
}

/**
 * Filter for selecting tasks to run.
 */
export interface TaskFilter {
  /** Categories to include */
  readonly categories?: readonly TaskCategory[];
  /** Difficulties to include */
  readonly difficulties?: readonly TaskDifficulty[];
  /** Specific task IDs to include */
  readonly taskIds?: readonly string[];
  /** CLIs to test with */
  readonly clis?: readonly CliName[];
  /** Tags to include */
  readonly tags?: readonly string[];
}

/**
 * Progress callback data.
 */
export interface TestProgress {
  /** Number of completed tasks */
  readonly completed: number;
  /** Total number of tasks */
  readonly total: number;
  /** Current task being executed */
  readonly currentTask: string;
  /** Elapsed time in milliseconds */
  readonly elapsedMs: number;
  /** Estimated remaining time in milliseconds */
  readonly estimatedRemainingMs: number;
  /** Current success rate */
  readonly currentSuccessRate: number;
}

/**
 * Progress callback type.
 */
export type ProgressCallback = (progress: TestProgress) => void;

/**
 * Test runner configuration.
 */
export interface TestRunnerConfig {
  /** Maximum parallel task execution */
  readonly parallelism: number;
  /** Global timeout for entire run in milliseconds */
  readonly globalTimeout: number;
  /** Whether to stop on first failure */
  readonly stopOnFailure: boolean;
  /** Whether to retry failed tasks */
  readonly retryFailedTasks: boolean;
  /** Maximum retries per task */
  readonly maxRetries: number;
  /** Run name for identification */
  readonly runName?: string;
}

/**
 * Default test runner configuration.
 */
export const DEFAULT_TEST_RUNNER_CONFIG: TestRunnerConfig = {
  parallelism: 3,
  globalTimeout: 600_000, // 10 minutes
  stopOnFailure: false,
  retryFailedTasks: true,
  maxRetries: 2,
  runName: 'Evaluation Run',
};
