/**
 * nexus-agents/swe-bench - SWE-Bench Runner Helpers
 *
 * Helper functions for run state management, progress calculation,
 * and configuration building.
 *
 * @module swe-bench/swe-bench-runner-helpers
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import type { DatasetLoadOptions } from './dataset-loader.js';
import { DEFAULT_SWE_BENCH_CONFIG } from './types.js';
import type {
  ProgressCallback,
  RunnerConfig,
  RunProgress,
  RunState,
} from './swe-bench-runner-types.js';

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default runner configuration values.
 */
export const DEFAULT_RUNNER_CONFIG: Partial<RunnerConfig> = {
  resume: false,
  modelName: 'nexus-agents',
};

// ============================================================================
// Run State Management
// ============================================================================

/**
 * Creates initial run state.
 */
export function createInitialState(): RunState {
  return {
    startTime: Date.now(),
    completed: 0,
    failed: 0,
    tokensUsed: 0,
    completedIds: new Set(),
    results: [],
  };
}

// ============================================================================
// Progress Calculation
// ============================================================================

/**
 * Calculates estimated remaining time.
 */
export function calculateEstimatedRemaining(state: RunState, remaining: number): number {
  const elapsed = Date.now() - state.startTime;
  const processed = state.completed + state.failed;
  if (processed === 0) return 0;
  const avgTimePerInstance = elapsed / processed;
  return Math.round(avgTimePerInstance * remaining);
}

/**
 * Creates progress object.
 */
export function createProgress(
  index: number,
  total: number,
  instanceId: string,
  state: RunState
): RunProgress {
  const elapsed = Date.now() - state.startTime;
  const processed = state.completed + state.failed;
  const remaining = total - processed;
  return {
    currentIndex: index,
    totalInstances: total,
    currentInstanceId: instanceId,
    completed: state.completed,
    failed: state.failed,
    tokensUsed: state.tokensUsed,
    elapsedMs: elapsed,
    estimatedRemainingMs: calculateEstimatedRemaining(state, remaining),
    resolutionRate: processed > 0 ? state.completed / processed : 0,
  };
}

// ============================================================================
// Configuration Builder
// ============================================================================

/**
 * Builds optional config properties only if defined.
 */
function buildOptionalConfigProps(config: Partial<RunnerConfig>): Partial<{
  loadOptions: DatasetLoadOptions;
  checkpointPath: string;
  onProgress: ProgressCallback;
  onMessage: (message: string) => void;
  signal: AbortSignal;
}> {
  return {
    ...(config.loadOptions !== undefined && { loadOptions: config.loadOptions }),
    ...(config.checkpointPath !== undefined && { checkpointPath: config.checkpointPath }),
    ...(config.onProgress !== undefined && { onProgress: config.onProgress }),
    ...(config.onMessage !== undefined && { onMessage: config.onMessage }),
    ...(config.signal !== undefined && { signal: config.signal }),
  };
}

/**
 * Builds full runner config from partial input.
 */
export function buildRunnerConfig(config: Partial<RunnerConfig>): RunnerConfig {
  const baseConfig = {
    benchConfig: config.benchConfig ?? DEFAULT_SWE_BENCH_CONFIG,
    modelName: config.modelName ?? DEFAULT_RUNNER_CONFIG.modelName ?? 'nexus-agents',
    resume: config.resume ?? DEFAULT_RUNNER_CONFIG.resume ?? false,
  };
  return { ...baseConfig, ...buildOptionalConfigProps(config) };
}
