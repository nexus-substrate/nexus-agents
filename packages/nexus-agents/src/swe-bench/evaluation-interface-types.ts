/**
 * nexus-agents/swe-bench - Evaluation Interface Types
 *
 * Interface and progress types for evaluation harness.
 *
 * @module swe-bench/evaluation-interface-types
 * @see https://www.swebench.com/SWE-bench/guides/evaluation/
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import type { SWEBenchPrediction } from './types.js';
import type { EvaluationHarnessConfig } from './evaluation-config-types.js';
import type { InstanceEvaluationResult, EvaluationRunResult } from './evaluation-result-types.js';

/**
 * Progress callback for evaluation.
 */
export type EvaluationProgressCallback = (progress: EvaluationProgress) => void;

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
