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

import type { SWEBenchVariant, SWEBenchPrediction } from './types.js';

// ============================================================================
// Evaluation Configuration
// ============================================================================

/**
 * Cache level for Docker image management.
 * Controls how aggressively to cache intermediate build layers.
 */
export type EvaluationCacheLevel = 'none' | 'base' | 'env' | 'instance';

/**
 * Evaluation execution mode.
 */
export type EvaluationMode = 'local' | 'docker' | 'modal';

/**
 * Configuration for running SWE-bench evaluation harness.
 */
export interface EvaluationHarnessConfig {
  /** Dataset variant to evaluate against. */
  readonly datasetName: SWEBenchVariant;
  /** Path to predictions JSONL file. */
  readonly predictionsPath: string;
  /** Number of parallel workers (recommended: 8-12). */
  readonly maxWorkers: number;
  /** Unique identifier for this evaluation run. */
  readonly runId: string;
  /** Docker image cache level. */
  readonly cacheLevel: EvaluationCacheLevel;
  /** Execution mode. */
  readonly mode: EvaluationMode;
  /** Optional: specific instance IDs to evaluate. */
  readonly instanceIds?: readonly string[];
  /** Timeout per instance in seconds. */
  readonly timeoutSeconds: number;
  /** Directory for logs and results. */
  readonly outputDir: string;
  /** Namespace for Docker images (empty for local build). */
  readonly dockerNamespace?: string;
  /** Whether to use Modal cloud execution. */
  readonly useModal: boolean;
}

/**
 * Default evaluation configuration.
 */
export const DEFAULT_EVALUATION_CONFIG: EvaluationHarnessConfig = {
  datasetName: 'lite',
  predictionsPath: './predictions.jsonl',
  maxWorkers: 8,
  runId: `eval-${String(Date.now())}`,
  cacheLevel: 'env',
  mode: 'docker',
  timeoutSeconds: 1800, // 30 minutes per instance
  outputDir: './logs/run_evaluation',
  useModal: false,
};

// ============================================================================
// Per-Instance Evaluation Results
// ============================================================================

/**
 * Test execution status for a single test case.
 */
export type TestStatus = 'passed' | 'failed' | 'error' | 'skipped' | 'timeout';

/**
 * Result of a single test case execution.
 */
export interface TestCaseResult {
  /** Test name/identifier. */
  readonly testName: string;
  /** Test status. */
  readonly status: TestStatus;
  /** Duration in milliseconds. */
  readonly durationMs: number;
  /** Error message if failed/error. */
  readonly errorMessage?: string;
  /** Stack trace if available. */
  readonly stackTrace?: string;
}

/**
 * Resolution status for an instance.
 */
export type ResolutionStatus = 'resolved' | 'unresolved' | 'error' | 'timeout';

/**
 * Detailed evaluation result for a single instance.
 */
export interface InstanceEvaluationResult {
  /** Instance ID being evaluated. */
  readonly instanceId: string;
  /** Model that generated the prediction. */
  readonly modelNameOrPath: string;
  /** Whether the issue was resolved. */
  readonly resolved: boolean;
  /** Resolution status category. */
  readonly status: ResolutionStatus;
  /** Individual test results. */
  readonly testResults: readonly TestCaseResult[];
  /** Number of tests that passed. */
  readonly testsPassed: number;
  /** Number of tests that failed. */
  readonly testsFailed: number;
  /** Total number of tests. */
  readonly testsTotal: number;
  /** Whether the patch applied cleanly. */
  readonly patchApplied: boolean;
  /** Patch application error if any. */
  readonly patchError?: string;
  /** Total evaluation duration in milliseconds. */
  readonly durationMs: number;
  /** Docker container ID used. */
  readonly containerId?: string;
  /** Log file path for this instance. */
  readonly logPath?: string;
}

// ============================================================================
// Aggregate Results
// ============================================================================

/**
 * Aggregate metrics for an evaluation run.
 */
export interface EvaluationMetrics {
  /** Total instances in dataset. */
  readonly totalInstances: number;
  /** Instances with predictions. */
  readonly predictedInstances: number;
  /** Instances successfully resolved. */
  readonly resolvedInstances: number;
  /** Resolution rate (resolved / predicted). */
  readonly resolutionRate: number;
  /** Instances where patch applied cleanly. */
  readonly patchesApplied: number;
  /** Patch application rate. */
  readonly patchApplicationRate: number;
  /** Instances that timed out. */
  readonly timeouts: number;
  /** Instances with evaluation errors. */
  readonly errors: number;
  /** Average evaluation time per instance (ms). */
  readonly avgDurationMs: number;
  /** Total evaluation time (ms). */
  readonly totalDurationMs: number;
}

/**
 * Per-repository breakdown of results.
 */
export interface RepositoryMetrics {
  /** Repository name (e.g., "django/django"). */
  readonly repository: string;
  /** Total instances from this repo. */
  readonly totalInstances: number;
  /** Resolved instances. */
  readonly resolvedInstances: number;
  /** Resolution rate for this repo. */
  readonly resolutionRate: number;
}

/**
 * Complete evaluation run result.
 */
export interface EvaluationRunResult {
  /** Run identifier. */
  readonly runId: string;
  /** Dataset variant evaluated. */
  readonly datasetName: SWEBenchVariant;
  /** Model being evaluated. */
  readonly modelNameOrPath: string;
  /** Evaluation start timestamp (ISO 8601). */
  readonly startedAt: string;
  /** Evaluation completion timestamp (ISO 8601). */
  readonly completedAt: string;
  /** Aggregate metrics. */
  readonly metrics: EvaluationMetrics;
  /** Per-repository breakdown. */
  readonly repositoryMetrics: readonly RepositoryMetrics[];
  /** Per-instance results. */
  readonly instanceResults: readonly InstanceEvaluationResult[];
  /** Configuration used. */
  readonly config: EvaluationHarnessConfig;
  /** Harness version used. */
  readonly harnessVersion?: string;
}

// ============================================================================
// Comparison Types (for competitor analysis)
// ============================================================================

/**
 * Known competitor systems for comparison.
 */
export type CompetitorSystem =
  | 'devin'
  | 'aider'
  | 'claude-code'
  | 'cursor'
  | 'codex'
  | 'gpt-engineer'
  | 'auto-gpt'
  | 'other';

/**
 * Comparison data point for a competitor.
 */
export interface CompetitorResult {
  /** Competitor system name. */
  readonly system: CompetitorSystem;
  /** Display name. */
  readonly displayName: string;
  /** SWE-bench variant evaluated. */
  readonly variant: SWEBenchVariant;
  /** Resolution rate achieved. */
  readonly resolutionRate: number;
  /** Number of instances resolved. */
  readonly resolvedInstances: number;
  /** Total instances evaluated. */
  readonly totalInstances: number;
  /** Average tokens per instance (if available). */
  readonly avgTokensPerInstance?: number;
  /** Average cost per instance (if available). */
  readonly avgCostPerInstance?: number;
  /** Data source URL. */
  readonly sourceUrl?: string;
  /** Date of the result. */
  readonly resultDate: string;
}

/**
 * Comparison report between nexus-agents and competitors.
 */
export interface ComparisonReport {
  /** nexus-agents result. */
  readonly nexusResult: EvaluationRunResult;
  /** Competitor results for comparison. */
  readonly competitors: readonly CompetitorResult[];
  /** Ranking among competitors. */
  readonly ranking: number;
  /** Total systems compared. */
  readonly totalSystems: number;
  /** Report generation timestamp. */
  readonly generatedAt: string;
}

// ============================================================================
// Evaluation Harness Interface
// ============================================================================

/**
 * Progress callback for evaluation.
 */
export type EvaluationProgressCallback = (progress: EvaluationProgress) => void;

/**
 * Progress information during evaluation.
 */
export interface EvaluationProgress {
  /** Current instance being evaluated. */
  readonly currentInstanceId: string;
  /** Index of current instance (0-based). */
  readonly currentIndex: number;
  /** Total instances to evaluate. */
  readonly totalInstances: number;
  /** Instances completed so far. */
  readonly completedInstances: number;
  /** Instances resolved so far. */
  readonly resolvedSoFar: number;
  /** Current resolution rate. */
  readonly currentResolutionRate: number;
  /** Estimated time remaining in ms. */
  readonly estimatedRemainingMs: number;
  /** Current phase. */
  readonly phase: EvaluationPhase;
}

/**
 * Phases of evaluation.
 */
export type EvaluationPhase =
  | 'initializing'
  | 'loading_predictions'
  | 'building_containers'
  | 'evaluating'
  | 'aggregating'
  | 'complete';

/**
 * Evaluation harness error types.
 */
export class EvaluationHarnessError extends Error {
  override readonly cause?: unknown;
  readonly code: EvaluationErrorCode;

  constructor(message: string, code: EvaluationErrorCode, cause?: unknown) {
    super(message);
    this.name = 'EvaluationHarnessError';
    this.code = code;
    this.cause = cause;
  }
}

/**
 * Error codes for evaluation failures.
 */
export type EvaluationErrorCode =
  | 'DOCKER_NOT_AVAILABLE'
  | 'PREDICTIONS_NOT_FOUND'
  | 'INVALID_PREDICTIONS_FORMAT'
  | 'HARNESS_NOT_INSTALLED'
  | 'INSTANCE_TIMEOUT'
  | 'CONTAINER_FAILED'
  | 'NETWORK_ERROR'
  | 'INSUFFICIENT_RESOURCES'
  | 'UNKNOWN';

/**
 * Interface for evaluation harness implementations.
 */
export interface IEvaluationHarness {
  /**
   * Validates that the harness is ready to run.
   */
  validate(): Promise<EvaluationValidationResult>;

  /**
   * Runs evaluation on predictions.
   */
  evaluate(
    predictions: readonly SWEBenchPrediction[],
    config: EvaluationHarnessConfig,
    onProgress?: EvaluationProgressCallback
  ): Promise<EvaluationRunResult>;

  /**
   * Evaluates a single instance (for testing/debugging).
   */
  evaluateInstance(
    prediction: SWEBenchPrediction,
    config: EvaluationHarnessConfig
  ): Promise<InstanceEvaluationResult>;

  /**
   * Cancels an in-progress evaluation.
   */
  cancel(): Promise<void>;

  /**
   * Gets the version of the harness.
   */
  getVersion(): Promise<string>;
}

/**
 * Result of harness validation.
 */
export interface EvaluationValidationResult {
  /** Whether the harness is ready. */
  readonly ready: boolean;
  /** Docker availability. */
  readonly dockerAvailable: boolean;
  /** Docker version if available. */
  readonly dockerVersion?: string;
  /** Python/swebench availability. */
  readonly harnessInstalled: boolean;
  /** Harness version if installed. */
  readonly harnessVersion?: string;
  /** Available disk space in bytes. */
  readonly availableDiskSpace: number;
  /** Available memory in bytes. */
  readonly availableMemory: number;
  /** CPU cores available. */
  readonly cpuCores: number;
  /** Validation errors if not ready. */
  readonly errors: readonly string[];
  /** Warnings that don't prevent execution. */
  readonly warnings: readonly string[];
}

// ============================================================================
// Leaderboard Types
// ============================================================================

/**
 * Leaderboard entry for a model/system.
 */
export interface LeaderboardEntry {
  /** Rank on leaderboard. */
  readonly rank: number;
  /** System/model name. */
  readonly modelName: string;
  /** Organization/team. */
  readonly organization?: string;
  /** Resolution rate on SWE-bench Lite. */
  readonly liteResolutionRate?: number;
  /** Resolution rate on SWE-bench Verified. */
  readonly verifiedResolutionRate?: number;
  /** Resolution rate on full SWE-bench. */
  readonly fullResolutionRate?: number;
  /** Submission date. */
  readonly submissionDate: string;
  /** Whether this is an agent system vs. single-turn model. */
  readonly isAgentSystem: boolean;
  /** Source/paper URL. */
  readonly sourceUrl?: string;
}

/**
 * Snapshot of the SWE-bench leaderboard.
 */
export interface LeaderboardSnapshot {
  /** When this snapshot was taken. */
  readonly snapshotDate: string;
  /** Entries sorted by rank. */
  readonly entries: readonly LeaderboardEntry[];
  /** Source URL for the leaderboard. */
  readonly sourceUrl: string;
}
