/**
 * nexus-agents/swe-bench - Evaluation Configuration Types
 *
 * Configuration types for SWE-bench evaluation harness.
 *
 * @module swe-bench/evaluation-config-types
 * @see https://www.swebench.com/SWE-bench/guides/evaluation/
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import { getTimeProvider } from '../core/index.js';
import type { SWEBenchVariant } from './types.js';

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
  runId: `eval-${String(getTimeProvider().now())}`,
  cacheLevel: 'env',
  mode: 'docker',
  timeoutSeconds: 1800, // 30 minutes per instance
  outputDir: './logs/run_evaluation',
  useModal: false,
};
