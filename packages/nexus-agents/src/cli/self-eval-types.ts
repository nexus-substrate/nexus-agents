/**
 * Self-Evaluation Types and Constants
 *
 * Type definitions for the evaluate command.
 *
 * @module cli/self-eval-types
 * (Source: Issue #140, Self-Evaluation MVP)
 */

import type { AggregatedResult } from '../self-eval/aggregation-logic.js';
import { INTERNAL_TIMEOUTS } from '../config/timeouts.js';

// ============================================================================
// CLI Options
// ============================================================================

/**
 * CLI options for the evaluate command.
 */
export interface EvaluateOptions {
  /** Target directory to evaluate */
  readonly target: string;
  /** Show verbose output */
  readonly verbose: boolean;
  /** Output as JSON */
  readonly json: boolean;
  /** Timeout in milliseconds */
  readonly timeout: number;
}

// ============================================================================
// Result Types
// ============================================================================

/**
 * Complete evaluation result with metadata.
 */
export interface EvaluateCommandResult {
  /** Aggregated results for all components */
  readonly results: readonly AggregatedResult[];
  /** Total components scanned */
  readonly componentsScanned: number;
  /** Total lines of code */
  readonly totalLines: number;
  /** Evaluation duration in milliseconds */
  readonly durationMs: number;
  /** Whether evaluation completed within timeout */
  readonly completedWithinTimeout: boolean;
  /** Summary statistics */
  readonly summary: EvaluationSummary;
  /** Timestamp */
  readonly timestamp: Date;
}

/**
 * Summary statistics for evaluation.
 */
export interface EvaluationSummary {
  /** Count of each recommendation type */
  readonly retain: number;
  readonly review: number;
  readonly refactor: number;
  readonly deprecate: number;
  /** Average confidence */
  readonly averageConfidence: number;
  /** Average evidence quality */
  readonly averageEvidenceQuality: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Default overall self-eval wall budget. Centralized to the canonical
 * self-eval timeout in the central authority (#3736); same 120s value. */
export const DEFAULT_TIMEOUT_MS = INTERNAL_TIMEOUTS.selfEvalMs;

/** Default target directory */
export const DEFAULT_TARGET = 'src/adapters/';

/** Max output bytes for non-verbose mode (10KB) */
export const MAX_OUTPUT_BYTES = 10_240;

// Re-export ANSI utilities for convenience
export { colors, symbols } from './ansi-output.js';
