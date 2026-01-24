/**
 * nexus-agents/swe-bench - Evaluation Harness Helpers
 *
 * Helper functions for metrics calculation, progress transformation,
 * and system information gathering used by the evaluation harness.
 *
 * @module swe-bench/evaluation-harness-helpers
 * @see https://www.swebench.com/SWE-bench/guides/evaluation/
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import * as os from 'node:os';
import type { SWEBenchPrediction } from './types.js';
import type {
  InstanceEvaluationResult,
  EvaluationMetrics,
  RepositoryMetrics,
} from './evaluation-result-types.js';
import type { EvaluationProgress, EvaluationPhase } from './evaluation-interface-types.js';

// ============================================================================
// Metrics Calculation
// ============================================================================

/**
 * Calculates aggregate metrics from instance results.
 */
export function calculateMetrics(results: readonly InstanceEvaluationResult[]): EvaluationMetrics {
  const totalInstances = results.length;
  const predictedInstances = totalInstances;
  const resolvedInstances = results.filter((r) => r.resolved).length;
  const patchesApplied = results.filter((r) => r.patchApplied).length;
  const timeouts = results.filter((r) => r.status === 'timeout').length;
  const errors = results.filter((r) => r.status === 'error').length;

  const totalDurationMs = results.reduce((sum, r) => sum + r.durationMs, 0);
  const avgDurationMs = totalInstances > 0 ? Math.round(totalDurationMs / totalInstances) : 0;

  return {
    totalInstances,
    predictedInstances,
    resolvedInstances,
    resolutionRate: predictedInstances > 0 ? resolvedInstances / predictedInstances : 0,
    patchesApplied,
    patchApplicationRate: predictedInstances > 0 ? patchesApplied / predictedInstances : 0,
    timeouts,
    errors,
    avgDurationMs,
    totalDurationMs,
  };
}

/**
 * Calculates per-repository metrics.
 */
export function calculateRepositoryMetrics(
  results: readonly InstanceEvaluationResult[]
): readonly RepositoryMetrics[] {
  const repoMap = new Map<string, { total: number; resolved: number }>();

  for (const result of results) {
    const repo = extractRepoFromInstanceId(result.instanceId);
    const current = repoMap.get(repo) ?? { total: 0, resolved: 0 };
    current.total++;
    if (result.resolved) {
      current.resolved++;
    }
    repoMap.set(repo, current);
  }

  return Array.from(repoMap.entries()).map(([repository, stats]) => ({
    repository,
    totalInstances: stats.total,
    resolvedInstances: stats.resolved,
    resolutionRate: stats.total > 0 ? stats.resolved / stats.total : 0,
  }));
}

/**
 * Extracts repository name from instance ID.
 * Instance IDs follow format: "owner__repo-issue_number"
 * Handles hyphenated names like "scikit-learn__scikit-learn-9876"
 */
export function extractRepoFromInstanceId(instanceId: string): string {
  const doubleUnderscoreIdx = instanceId.indexOf('__');
  const lastDashIdx = instanceId.lastIndexOf('-');

  if (doubleUnderscoreIdx !== -1 && lastDashIdx > doubleUnderscoreIdx) {
    const owner = instanceId.slice(0, doubleUnderscoreIdx);
    const repoAndIssue = instanceId.slice(doubleUnderscoreIdx + 2);
    const repoName = repoAndIssue.slice(0, repoAndIssue.lastIndexOf('-'));
    return `${owner}/${repoName}`;
  }

  // Fallback for unexpected formats
  return 'unknown';
}

/**
 * Extracts model name from predictions.
 */
export function extractModelName(predictions: readonly SWEBenchPrediction[]): string {
  const first = predictions[0];
  return first?.model_name_or_path ?? 'unknown';
}

// ============================================================================
// Progress Transformation
// ============================================================================

/**
 * Raw harness progress data structure.
 */
export interface RawHarnessProgress {
  readonly currentInstanceId?: string;
  readonly completedCount: number;
  readonly totalCount: number;
  readonly resolvedCount: number;
  readonly elapsedMs: number;
  readonly estimatedRemainingMs?: number;
  readonly state: string;
}

/**
 * Maps harness state to evaluation phase.
 */
export function mapStateToPhase(state: string): EvaluationPhase {
  const phaseMap: Record<string, EvaluationPhase> = {
    idle: 'initializing',
    starting: 'loading_predictions',
    running: 'evaluating',
    parsing: 'aggregating',
    completed: 'complete',
    failed: 'complete',
    cancelled: 'complete',
  };
  return phaseMap[state] ?? 'evaluating';
}

/**
 * Transforms raw harness progress to evaluation progress.
 */
export function transformHarnessProgress(
  harnessProgress: RawHarnessProgress,
  totalPredictions: number
): EvaluationProgress {
  return {
    currentInstanceId: harnessProgress.currentInstanceId ?? '',
    currentIndex: harnessProgress.completedCount,
    totalInstances: harnessProgress.totalCount || totalPredictions,
    completedInstances: harnessProgress.completedCount,
    resolvedSoFar: harnessProgress.resolvedCount,
    currentResolutionRate:
      harnessProgress.completedCount > 0
        ? harnessProgress.resolvedCount / harnessProgress.completedCount
        : 0,
    estimatedRemainingMs: harnessProgress.estimatedRemainingMs ?? 0,
    phase: mapStateToPhase(harnessProgress.state),
  };
}

/**
 * Creates a progress adapter from harness progress to evaluation progress.
 */
export function createProgressAdapter(
  totalPredictions: number,
  onProgress?: (progress: EvaluationProgress) => void
): ((progress: unknown) => void) | undefined {
  if (onProgress === undefined) {
    return undefined;
  }

  return (harnessProgress: unknown) => {
    const hp = harnessProgress as RawHarnessProgress;
    const evaluationProgress = transformHarnessProgress(hp, totalPredictions);
    onProgress(evaluationProgress);
  };
}

// ============================================================================
// System Information
// ============================================================================

/**
 * Memory information result.
 */
export interface MemoryInfo {
  readonly total: number;
  readonly free: number;
}

/**
 * Gets memory information from the operating system.
 */
export function getMemoryInfo(): MemoryInfo {
  return {
    total: os.totalmem(),
    free: os.freemem(),
  };
}

/**
 * Gets CPU core count from the operating system.
 */
export function getCpuCores(): number {
  return os.cpus().length;
}
