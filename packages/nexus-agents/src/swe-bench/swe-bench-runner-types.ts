/**
 * nexus-agents/swe-bench - SWE-Bench Runner Types
 *
 * Type definitions for the SWE-bench runner module.
 * Includes error types, progress tracking, and configuration interfaces.
 *
 * @module swe-bench/swe-bench-runner-types
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import type { SWEBenchConfig, SWEBenchRunResult } from './types.js';
import type { DatasetLoadOptions } from './dataset-loader.js';

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error codes for runner failures.
 */
export type RunnerErrorCode =
  | 'DATASET_LOAD_FAILED'
  | 'EXECUTOR_NOT_SET'
  | 'RUN_ABORTED'
  | 'CHECKPOINT_ERROR'
  | 'IO_ERROR'
  | 'UNKNOWN';

/**
 * Error for runner operations.
 */
export class SWEBenchRunnerError extends Error {
  override readonly cause?: unknown;
  readonly code: RunnerErrorCode;

  constructor(message: string, code: RunnerErrorCode, cause?: unknown) {
    super(message);
    this.name = 'SWEBenchRunnerError';
    this.code = code;
    this.cause = cause;
  }
}

// ============================================================================
// Progress Tracking
// ============================================================================

/**
 * Progress information during a run.
 */
export interface RunProgress {
  /** Current instance index (0-based). */
  readonly currentIndex: number;
  /** Total instances to process. */
  readonly totalInstances: number;
  /** Current instance ID. */
  readonly currentInstanceId: string;
  /** Number of completed instances. */
  readonly completed: number;
  /** Number of failed instances. */
  readonly failed: number;
  /** Total tokens used so far. */
  readonly tokensUsed: number;
  /** Elapsed time in milliseconds. */
  readonly elapsedMs: number;
  /** Estimated remaining time in milliseconds. */
  readonly estimatedRemainingMs: number;
  /** Current resolution rate. */
  readonly resolutionRate: number;
}

/**
 * Progress callback type.
 */
export type ProgressCallback = (progress: RunProgress) => void;

// ============================================================================
// Runner Configuration
// ============================================================================

/**
 * Configuration for the runner.
 */
export interface RunnerConfig {
  /** SWE-bench configuration. */
  readonly benchConfig: SWEBenchConfig;
  /** Dataset load options. */
  readonly loadOptions?: DatasetLoadOptions;
  /** Model name for predictions. */
  readonly modelName: string;
  /** Whether to resume from checkpoint. */
  readonly resume: boolean;
  /** Checkpoint file path (if resuming). */
  readonly checkpointPath?: string;
  /** Progress callback. */
  readonly onProgress?: ProgressCallback;
  /** Message callback. */
  readonly onMessage?: (message: string) => void;
  /** Abort signal. */
  readonly signal?: AbortSignal;
}

// ============================================================================
// Run State
// ============================================================================

/**
 * Internal state during a run.
 */
export interface RunState {
  startTime: number;
  completed: number;
  failed: number;
  tokensUsed: number;
  completedIds: Set<string>;
  results: SWEBenchRunResult[];
}
