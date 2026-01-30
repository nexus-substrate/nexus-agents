/**
 * nexus-agents/swe-bench - Harness Executor Types
 *
 * Type definitions and constants for SWE-bench harness execution.
 *
 * @module swe-bench/harness-executor-types
 * @see https://www.swebench.com/SWE-bench/guides/evaluation/
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import { getTimeProvider } from '../core/index.js';
import type { SWEBenchVariant } from './types.js';
import type {
  InstanceEvaluationResult,
  TestStatus,
  ResolutionStatus,
} from './evaluation-harness-types.js';

// ============================================================================
// Constants
// ============================================================================

/** Default timeout for harness execution in milliseconds. */
export const DEFAULT_HARNESS_TIMEOUT_MS = 1800_000; // 30 minutes

/** Maximum output buffer size for subprocess execution. */
export const MAX_OUTPUT_BUFFER_BYTES = 10 * 1024 * 1024; // 10MB

/** Command timeout for quick operations (version checks, etc). */
export const QUICK_COMMAND_TIMEOUT_MS = 30_000; // 30 seconds

/** Python command used to run swebench. */
export const PYTHON_COMMAND = 'python3';

/** SWE-bench harness script entry point. */
export const HARNESS_SCRIPT = '-m swebench.harness.run_evaluation';

// ============================================================================
// Execution Configuration
// ============================================================================

/**
 * Configuration for a single harness execution.
 */
export interface HarnessExecutionConfig {
  /** Path to predictions JSONL file. */
  readonly predictionsPath: string;
  /** SWE-bench dataset name/variant. */
  readonly datasetName: SWEBenchVariant;
  /** Maximum number of parallel workers. */
  readonly maxWorkers: number;
  /** Unique run identifier. */
  readonly runId: string;
  /** Timeout per instance in seconds. */
  readonly timeoutSeconds: number;
  /** Output directory for logs and results. */
  readonly outputDir: string;
  /** Optional specific instance IDs to evaluate. */
  readonly instanceIds?: readonly string[];
  /** Whether to use Docker-based execution. */
  readonly useDocker: boolean;
  /** Docker cache level. */
  readonly cacheLevel: 'none' | 'base' | 'env' | 'instance';
}

/**
 * Default harness execution configuration.
 */
export const DEFAULT_HARNESS_EXECUTION_CONFIG: HarnessExecutionConfig = {
  predictionsPath: './predictions.jsonl',
  datasetName: 'lite',
  maxWorkers: 8,
  runId: `run-${String(getTimeProvider().now())}`,
  timeoutSeconds: 1800,
  outputDir: './logs/run_evaluation',
  useDocker: true,
  cacheLevel: 'env',
};

// ============================================================================
// Raw Output Types
// ============================================================================

/**
 * Raw test result from harness output.
 */
export interface RawTestResult {
  readonly test_name: string;
  readonly status: 'PASSED' | 'FAILED' | 'ERROR' | 'SKIPPED' | 'TIMEOUT';
  readonly duration_ms?: number;
  readonly error_message?: string;
  readonly stack_trace?: string;
}

/**
 * Raw instance result from harness output.
 */
export interface RawInstanceResult {
  readonly instance_id: string;
  readonly model_name_or_path: string;
  readonly resolved: boolean;
  readonly patch_applied: boolean;
  readonly patch_error?: string;
  readonly tests_passed: number;
  readonly tests_failed: number;
  readonly tests_total: number;
  readonly test_results?: readonly RawTestResult[];
  readonly duration_ms: number;
  readonly log_path?: string;
  readonly container_id?: string;
}

/**
 * Raw harness execution output.
 */
export interface RawHarnessOutput {
  readonly run_id: string;
  readonly dataset_name: string;
  readonly model_name_or_path: string;
  readonly started_at: string;
  readonly completed_at: string;
  readonly total_instances: number;
  readonly predicted_instances: number;
  readonly resolved_instances: number;
  readonly instance_results: readonly RawInstanceResult[];
  readonly harness_version?: string;
  readonly errors?: readonly string[];
}

// ============================================================================
// Execution State
// ============================================================================

/**
 * Harness execution state.
 */
export type HarnessExecutionState =
  | 'idle'
  | 'starting'
  | 'running'
  | 'parsing'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Progress information during harness execution.
 */
export interface HarnessExecutionProgress {
  /** Current execution state. */
  readonly state: HarnessExecutionState;
  /** Current instance being evaluated (if known). */
  readonly currentInstanceId?: string;
  /** Number of instances completed. */
  readonly completedCount: number;
  /** Total instances to evaluate. */
  readonly totalCount: number;
  /** Number resolved so far. */
  readonly resolvedCount: number;
  /** Elapsed time in milliseconds. */
  readonly elapsedMs: number;
  /** Estimated remaining time in milliseconds. */
  readonly estimatedRemainingMs?: number;
  /** Latest log line from harness. */
  readonly latestLog?: string;
}

/**
 * Callback for progress updates during execution.
 */
export type HarnessProgressCallback = (progress: HarnessExecutionProgress) => void;

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error codes for harness execution failures.
 */
export type HarnessErrorCode =
  | 'HARNESS_NOT_FOUND'
  | 'PREDICTIONS_NOT_FOUND'
  | 'INVALID_PREDICTIONS'
  | 'EXECUTION_TIMEOUT'
  | 'EXECUTION_FAILED'
  | 'PARSE_ERROR'
  | 'DOCKER_ERROR'
  | 'CANCELLED'
  | 'UNKNOWN';

/**
 * Error thrown during harness execution.
 */
export class HarnessExecutorError extends Error {
  override readonly cause?: unknown;
  readonly code: HarnessErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(message: string, code: HarnessErrorCode, cause?: unknown) {
    super(message);
    this.name = 'HarnessExecutorError';
    this.code = code;
    this.cause = cause;
  }
}

// ============================================================================
// Executor Interface
// ============================================================================

/**
 * Interface for harness executor implementations.
 */
export interface IHarnessExecutor {
  /**
   * Validates that the harness is ready to execute.
   */
  validate(): Promise<HarnessValidationResult>;

  /**
   * Executes the SWE-bench harness on predictions.
   */
  execute(
    config: HarnessExecutionConfig,
    onProgress?: HarnessProgressCallback
  ): Promise<HarnessExecutionResult>;

  /**
   * Executes evaluation for a single instance (for testing/debugging).
   */
  executeInstance(
    instanceId: string,
    config: HarnessExecutionConfig
  ): Promise<InstanceEvaluationResult>;

  /**
   * Cancels an in-progress execution.
   */
  cancel(): Promise<void>;

  /**
   * Gets the harness version.
   */
  getVersion(): Promise<string>;
}

/**
 * Result of harness validation.
 */
export interface HarnessValidationResult {
  /** Whether the harness is ready. */
  readonly ready: boolean;
  /** Python available. */
  readonly pythonAvailable: boolean;
  /** Python version. */
  readonly pythonVersion?: string;
  /** swebench package installed. */
  readonly swebenchInstalled: boolean;
  /** swebench version. */
  readonly swebenchVersion?: string;
  /** Docker available (if required). */
  readonly dockerAvailable: boolean;
  /** Docker version. */
  readonly dockerVersion?: string;
  /** Validation errors. */
  readonly errors: readonly string[];
}

/**
 * Result of harness execution.
 */
export interface HarnessExecutionResult {
  /** Whether execution completed successfully. */
  readonly success: boolean;
  /** Run identifier. */
  readonly runId: string;
  /** Dataset variant evaluated. */
  readonly datasetName: SWEBenchVariant;
  /** Model name. */
  readonly modelNameOrPath: string;
  /** Execution start time (ISO 8601). */
  readonly startedAt: string;
  /** Execution end time (ISO 8601). */
  readonly completedAt: string;
  /** Total instances in predictions. */
  readonly totalInstances: number;
  /** Instances successfully resolved. */
  readonly resolvedInstances: number;
  /** Resolution rate. */
  readonly resolutionRate: number;
  /** Per-instance results. */
  readonly instanceResults: readonly InstanceEvaluationResult[];
  /** Harness version used. */
  readonly harnessVersion?: string;
  /** Error message if failed. */
  readonly error?: string;
  /** Path to output logs. */
  readonly logPath?: string;
}

// ============================================================================
// Type Conversion Helpers
// ============================================================================

/**
 * Maps raw test status to typed TestStatus.
 */
export function mapTestStatus(raw: string): TestStatus {
  const statusMap: Record<string, TestStatus> = {
    PASSED: 'passed',
    FAILED: 'failed',
    ERROR: 'error',
    SKIPPED: 'skipped',
    TIMEOUT: 'timeout',
  };
  return statusMap[raw] ?? 'error';
}

/**
 * Determines resolution status from raw result.
 */
export function mapResolutionStatus(raw: RawInstanceResult): ResolutionStatus {
  if (raw.resolved) return 'resolved';
  if (raw.patch_error !== undefined && raw.patch_error !== '') return 'error';
  return 'unresolved';
}
