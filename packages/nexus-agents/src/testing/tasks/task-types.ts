/**
 * nexus-agents/testing/tasks - Task Type Definitions
 *
 * Types for evaluation tasks used in CLI testing and benchmarking.
 * Each task is designed to test specific capabilities across
 * Claude CLI, Gemini CLI, and Codex CLI.
 */

import type { CliName } from '../types.js';

/**
 * Task category for grouping evaluation tasks.
 */
export type TaskCategory =
  | 'code_generation'
  | 'algorithm_design'
  | 'codebase_analysis'
  | 'test_generation'
  | 'architecture'
  | 'refactoring'
  | 'debugging'
  | 'documentation';

/**
 * Task difficulty level.
 */
export type TaskDifficulty = 'easy' | 'medium' | 'hard' | 'expert';

/**
 * Expected outcome validation rules.
 */
export interface ExpectedOutcome {
  /** Strings that must appear in the response */
  readonly mustContain: readonly string[];
  /** Strings that must not appear in the response */
  readonly mustNotContain: readonly string[];
  /** Regex patterns that must match */
  readonly mustMatch?: readonly string[];
  /** Regex patterns that must not match */
  readonly mustNotMatch?: readonly string[];
  /** Minimum response length in characters */
  readonly minLength?: number;
  /** Maximum response length in characters */
  readonly maxLength?: number;
  /** Whether the response should contain valid code */
  readonly shouldContainCode?: boolean;
  /** Expected programming language for code responses */
  readonly expectedLanguage?: string;
}

/**
 * Individual criterion in a scoring rubric.
 */
export interface ScoringCriterion {
  /** Criterion identifier */
  readonly id: string;
  /** Description of what is being evaluated */
  readonly description: string;
  /** Weight of this criterion (0.0 - 1.0) */
  readonly weight: number;
  /** Maximum score for this criterion */
  readonly maxScore: number;
  /** Keywords or patterns that indicate criterion fulfillment */
  readonly indicators?: readonly string[];
}

/**
 * Scoring rubric for evaluating task responses.
 */
export interface ScoringRubric {
  /** Scoring criteria with weights */
  readonly criteria: readonly ScoringCriterion[];
  /** Maximum possible score (sum of all maxScore * weight) */
  readonly maxTotalScore: number;
  /** Minimum passing score */
  readonly passingScore: number;
  /** Notes on scoring methodology */
  readonly notes?: string;
}

/**
 * Evaluation task definition.
 * Each task tests specific capabilities of the CLIs.
 */
export interface EvaluationTask {
  /** Unique task identifier (format: task-XXX) */
  readonly id: string;
  /** Human-readable task name */
  readonly name: string;
  /** Task category for grouping */
  readonly category: TaskCategory;
  /** Task difficulty level */
  readonly difficulty: TaskDifficulty;
  /** Detailed task description */
  readonly description: string;
  /** The prompt to send to the CLI */
  readonly prompt: string;
  /** Optional system prompt override */
  readonly systemPrompt?: string;
  /** Expected outcome validation */
  readonly expectedOutcome: ExpectedOutcome;
  /** Scoring rubric for evaluation */
  readonly scoringRubric: ScoringRubric;
  /** Timeout for task execution in milliseconds */
  readonly timeoutMs: number;
  /** Optimal CLI for this task type */
  readonly optimalCli: CliName;
  /** Acceptable CLIs (including optimal) */
  readonly acceptableClis: readonly CliName[];
  /** Tags for filtering and grouping */
  readonly tags: readonly string[];
  /** Context files to include (paths relative to project root) */
  readonly contextFiles?: readonly string[];
  /** Additional metadata */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Result of evaluating a task response against the expected outcome.
 */
export interface TaskEvaluationResult {
  /** Task that was evaluated */
  readonly taskId: string;
  /** CLI that executed the task */
  readonly cli: CliName;
  /** Whether the task passed validation */
  readonly passed: boolean;
  /** Total score achieved */
  readonly score: number;
  /** Maximum possible score */
  readonly maxScore: number;
  /** Score as a percentage (0-100) */
  readonly percentage: number;
  /** Individual criterion scores */
  readonly criterionScores: readonly CriterionScore[];
  /** Validation errors if any */
  readonly validationErrors: readonly string[];
  /** Execution time in milliseconds */
  readonly executionTimeMs: number;
  /** Evaluation timestamp (ISO 8601) */
  readonly evaluatedAt: string;
}

/**
 * Score for a single criterion.
 */
export interface CriterionScore {
  /** Criterion identifier */
  readonly criterionId: string;
  /** Score achieved */
  readonly score: number;
  /** Maximum possible score */
  readonly maxScore: number;
  /** Feedback or notes on scoring */
  readonly feedback?: string;
}

/**
 * Summary of evaluation results across multiple tasks.
 */
export interface EvaluationSummary {
  /** CLI being evaluated */
  readonly cli: CliName;
  /** Total tasks evaluated */
  readonly totalTasks: number;
  /** Tasks passed */
  readonly tasksPassed: number;
  /** Tasks failed */
  readonly tasksFailed: number;
  /** Average score percentage */
  readonly averageScore: number;
  /** Breakdown by category */
  readonly categoryBreakdown: ReadonlyMap<TaskCategory, CategoryStats>;
  /** Breakdown by difficulty */
  readonly difficultyBreakdown: ReadonlyMap<TaskDifficulty, DifficultyStats>;
  /** Total execution time in milliseconds */
  readonly totalExecutionTimeMs: number;
  /** Summary timestamp (ISO 8601) */
  readonly summarizedAt: string;
}

/**
 * Statistics for a task category.
 */
export interface CategoryStats {
  /** Category name */
  readonly category: TaskCategory;
  /** Number of tasks in this category */
  readonly taskCount: number;
  /** Average score for this category */
  readonly averageScore: number;
  /** Pass rate for this category */
  readonly passRate: number;
}

/**
 * Statistics for a difficulty level.
 */
export interface DifficultyStats {
  /** Difficulty level */
  readonly difficulty: TaskDifficulty;
  /** Number of tasks at this difficulty */
  readonly taskCount: number;
  /** Average score for this difficulty */
  readonly averageScore: number;
  /** Pass rate for this difficulty */
  readonly passRate: number;
}
