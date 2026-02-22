/**
 * nexus-agents/testing - Task Definition Types
 *
 * Types for defining evaluation tasks, expected outcomes, and scoring rubrics.
 * Used by the test runner to execute and evaluate CLI responses.
 */

import type { CliName, TaskCategory } from './types.js';

/**
 * Task difficulty levels.
 */
export const TaskDifficulty = {
  SIMPLE: 'simple',
  MODERATE: 'moderate',
  COMPLEX: 'complex',
} as const;

export type TaskDifficulty = (typeof TaskDifficulty)[keyof typeof TaskDifficulty];

/**
 * Expected output type.
 */
export const ExpectedOutputType = {
  CODE: 'code',
  TEXT: 'text',
  JSON: 'json',
  MARKDOWN: 'markdown',
  MIXED: 'mixed',
} as const;

export type ExpectedOutputType = (typeof ExpectedOutputType)[keyof typeof ExpectedOutputType];

/**
 * Criterion scoring type.
 */
export const CriterionScoringType = {
  /** 0 or maxPoints */
  BINARY: 'binary',
  /** 0 to maxPoints */
  SCALE: 'scale',
  /** 0% to 100% of maxPoints */
  PERCENTAGE: 'percentage',
  /** Determined by automated check */
  AUTOMATED: 'automated',
} as const;

export type CriterionScoringType = (typeof CriterionScoringType)[keyof typeof CriterionScoringType];

/**
 * Types of automated checks.
 */
export const AutomatedCheckType = {
  /** Regex pattern matching */
  PATTERN_MATCH: 'pattern_match',
  /** JSON schema validation */
  JSON_SCHEMA: 'json_schema',
  /** Code compilation check */
  CODE_COMPILE: 'code_compile',
  /** Code linting check */
  CODE_LINT: 'code_lint',
  /** Length constraints */
  LENGTH_CHECK: 'length_check',
  /** Required keywords */
  KEYWORD_PRESENCE: 'keyword_presence',
  /** Custom validation function */
  CUSTOM: 'custom',
} as const;

export type AutomatedCheckType = (typeof AutomatedCheckType)[keyof typeof AutomatedCheckType];

/**
 * Pre-defined rubric templates.
 */
export const RubricTemplate = {
  /** Code generation rubric */
  CODE_GENERATION: 'code_generation',
  /** Complex reasoning rubric */
  COMPLEX_REASONING: 'complex_reasoning',
  /** Documentation rubric */
  DOCUMENTATION: 'documentation',
  /** Error handling rubric */
  ERROR_HANDLING: 'error_handling',
  /** General quality rubric */
  GENERAL_QUALITY: 'general_quality',
} as const;

export type RubricTemplate = (typeof RubricTemplate)[keyof typeof RubricTemplate];

/**
 * Evaluation task definition.
 * Each task represents a standardized test case for CLI evaluation.
 */
export interface EvaluationTask {
  /** Unique task identifier */
  readonly id: string;
  /** Human-readable task name */
  readonly name: string;
  /** Task description */
  readonly description: string;
  /** Task category for routing evaluation */
  readonly category: TaskCategory;
  /** Task difficulty level */
  readonly difficulty: TaskDifficulty;
  /** The prompt to send to the CLI */
  readonly prompt: string;
  /** System prompt override (if any) */
  readonly systemPrompt?: string;
  /** Context files to include */
  readonly contextFiles?: readonly string[];
  /** Expected context size in tokens (approximate) */
  readonly expectedContextTokens: number;
  /** Maximum tokens for response */
  readonly maxResponseTokens: number;
  /** Expected outcome for evaluation */
  readonly expectedOutcome: ExpectedOutcome;
  /** Scoring rubric for quality evaluation */
  readonly rubric: ScoringRubric;
  /** Optimal CLI for this task */
  readonly optimalCli: CliName;
  /** Acceptable CLIs (including optimal) */
  readonly acceptableClis: readonly CliName[];
  /** Tags for filtering */
  readonly tags: readonly string[];
  /** Timeout override in milliseconds */
  readonly timeoutMs?: number;
}

/**
 * Expected outcome for task evaluation.
 * Defines what a correct response should contain.
 */
export interface ExpectedOutcome {
  /** Required patterns that must appear in output (regex strings) */
  readonly requiredPatterns?: readonly string[];
  /** Forbidden patterns that must not appear (regex strings) */
  readonly forbiddenPatterns?: readonly string[];
  /** Expected output type */
  readonly outputType: ExpectedOutputType;
  /** Expected language (for code tasks) */
  readonly language?: string;
  /** Golden output for exact comparison (optional) */
  readonly goldenOutput?: string;
  /** Minimum response length in characters */
  readonly minLength?: number;
  /** Maximum response length in characters */
  readonly maxLength?: number;
  /** Custom validation function name */
  readonly customValidator?: string;
}

/**
 * Scoring rubric for quality evaluation.
 * Uses a weighted multi-criterion approach.
 */
export interface ScoringRubric {
  /** Rubric identifier */
  readonly id: string;
  /** Rubric name */
  readonly name: string;
  /** Total possible points (sum of criterion maxPoints) */
  readonly totalPoints: number;
  /** Minimum score to pass (0-100) */
  readonly passingScore: number;
  /** Individual scoring criteria */
  readonly criteria: readonly RubricCriterion[];
}

/**
 * Individual criterion within a scoring rubric.
 */
export interface RubricCriterion {
  /** Criterion identifier */
  readonly id: string;
  /** Criterion name */
  readonly name: string;
  /** Criterion description */
  readonly description: string;
  /** Maximum points for this criterion */
  readonly maxPoints: number;
  /** Weight multiplier (default 1.0) */
  readonly weight: number;
  /** Scoring type */
  readonly scoringType: CriterionScoringType;
  /** Scoring levels for manual/automated evaluation */
  readonly levels?: readonly ScoringLevel[];
  /** Automated check configuration */
  readonly automatedCheck?: AutomatedCheck;
}

/**
 * Scoring level for scale-based criteria.
 */
export interface ScoringLevel {
  /** Points awarded at this level */
  readonly points: number;
  /** Level description */
  readonly description: string;
  /** Examples of this level */
  readonly examples?: readonly string[];
}

/**
 * Automated check configuration.
 */
export interface AutomatedCheck {
  /** Check type */
  readonly type: AutomatedCheckType;
  /** Configuration for the check */
  readonly config: Readonly<Record<string, unknown>>;
}

/**
 * Task execution context.
 */
export interface TaskExecutionContext {
  /** Test run identifier */
  readonly runId: string;
  /** Task being executed */
  readonly task: EvaluationTask;
  /** CLI executing the task */
  readonly cli: CliName;
  /** Attempt number (1-indexed) */
  readonly attempt: number;
  /** Maximum attempts allowed */
  readonly maxAttempts: number;
  /** Start timestamp (ISO 8601) */
  readonly startedAt: string;
  /** Timeout in milliseconds */
  readonly timeoutMs: number;
}

/**
 * Task registry configuration.
 */
export interface TaskRegistryConfig {
  /** Path to task definition files */
  readonly taskPath: string;
  /** Categories to include (empty = all) */
  readonly includeCategories?: readonly TaskCategory[];
  /** Categories to exclude */
  readonly excludeCategories?: readonly TaskCategory[];
  /** Difficulties to include (empty = all) */
  readonly includeDifficulties?: readonly TaskDifficulty[];
  /** Tags to filter by */
  readonly filterTags?: readonly string[];
  /** Maximum number of tasks to load */
  readonly maxTasks?: number;
}

/**
 * Category to optimal CLI mapping.
 * Based on capability profiles and empirical testing.
 */
export const CategoryCliMapping: Readonly<Record<TaskCategory, CliName>> = {
  reasoning: 'claude',
  code_generation: 'codex',
  large_context: 'gemini',
  quick_task: 'codex',
  testing: 'codex',
  bulk_operation: 'gemini',
  general: 'claude',
} as const;

/**
 * Category to acceptable CLIs mapping.
 */
export const CategoryAcceptableClis: Readonly<Record<TaskCategory, readonly CliName[]>> = {
  reasoning: ['claude', 'gemini'],
  code_generation: ['codex', 'claude', 'gemini'],
  large_context: ['gemini', 'claude'],
  quick_task: ['codex', 'gemini'],
  testing: ['codex', 'claude', 'gemini'],
  bulk_operation: ['gemini', 'codex'],
  general: ['claude', 'gemini', 'codex', 'opencode'],
} as const;
