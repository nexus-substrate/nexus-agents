/**
 * Dispatch insight analyzer for worker execution profiling (Issue #1505).
 *
 * Analyzes completed dispatch results to extract structured patterns:
 * - Success/error rate by role
 * - Duration outliers
 * - Error clustering by type
 * - Refinement effectiveness
 *
 * Inspired by Overstory's SessionInsightAnalyzer pattern.
 *
 * @module orchestration/aorchestra/dispatch-insights
 */

import type { WorkerResult, WorkerErrorType } from './worker-dispatcher.js';
import type { TriageAction } from './worker-triage.js';

// ============================================================================
// Types
// ============================================================================

/** Per-role performance summary. */
export interface RoleProfile {
  readonly role: string;
  readonly total: number;
  readonly successes: number;
  readonly errors: number;
  readonly successRate: number;
  readonly avgDurationMs: number;
}

/** Error cluster: groups errors by type with count and sample message. */
export interface ErrorCluster {
  readonly errorType: WorkerErrorType;
  readonly count: number;
  readonly sample: string;
}

/** Duration outlier: a worker that took significantly longer than the median. */
export interface DurationOutlier {
  readonly role: string;
  readonly durationMs: number;
  readonly medianMs: number;
  readonly ratio: number;
}

/** Triage summary for a dispatch execution (#1506). */
export interface TriageSummary {
  /** Number of workers that were retried via triage. */
  readonly retriedCount: number;
  /** Number of retried workers that succeeded. */
  readonly retrySuccesses: number;
  /** Breakdown by triage action. */
  readonly actionCounts: ReadonlyMap<TriageAction, number>;
}

/** Structured insights from a dispatch execution. */
export interface DispatchInsights {
  readonly roleProfiles: readonly RoleProfile[];
  readonly errorClusters: readonly ErrorCluster[];
  readonly durationOutliers: readonly DurationOutlier[];
  readonly overallSuccessRate: number;
  readonly totalWorkers: number;
  readonly dominantErrorType: WorkerErrorType | undefined;
  /** Triage statistics for this dispatch (#1506). */
  readonly triage: TriageSummary;
}

// ============================================================================
// Constants
// ============================================================================

/** Duration outlier threshold: workers taking >2x median are flagged. */
export const OUTLIER_RATIO_THRESHOLD = 2.0;

// ============================================================================
// Analysis Functions
// ============================================================================

/** Compute per-role performance profiles. */
function buildRoleProfiles(results: readonly WorkerResult[]): RoleProfile[] {
  const byRole = new Map<string, WorkerResult[]>();
  for (const r of results) {
    const list = byRole.get(r.role) ?? [];
    list.push(r);
    byRole.set(r.role, list);
  }

  return [...byRole.entries()].map(([role, items]) => {
    const successes = items.filter((r) => r.status === 'success').length;
    const errors = items.filter((r) => r.status === 'error').length;
    const totalDuration = items.reduce((sum, r) => sum + r.durationMs, 0);
    return {
      role,
      total: items.length,
      successes,
      errors,
      successRate: items.length > 0 ? successes / items.length : 0,
      avgDurationMs: items.length > 0 ? totalDuration / items.length : 0,
    };
  });
}

/** Group errors by type with sample messages. */
function buildErrorClusters(results: readonly WorkerResult[]): ErrorCluster[] {
  const clusters = new Map<WorkerErrorType, { count: number; sample: string }>();
  for (const r of results) {
    if (r.status !== 'error' || r.errorType === undefined) continue;
    const existing = clusters.get(r.errorType);
    if (existing !== undefined) {
      existing.count++;
    } else {
      clusters.set(r.errorType, { count: 1, sample: (r.error ?? '').slice(0, 200) });
    }
  }
  return [...clusters.entries()]
    .map(([errorType, data]) => ({ errorType, count: data.count, sample: data.sample }))
    .sort((a, b) => b.count - a.count);
}

/** Compute median of a numeric array. */
function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  }
  return sorted[mid] ?? 0;
}

/** Find workers with duration significantly above the median. */
function findDurationOutliers(results: readonly WorkerResult[]): DurationOutlier[] {
  const durations = results.filter((r) => r.status === 'success').map((r) => r.durationMs);
  const med = median(durations);
  if (med <= 0) return [];

  return results
    .filter((r) => r.status === 'success' && r.durationMs > med * OUTLIER_RATIO_THRESHOLD)
    .map((r) => ({
      role: r.role,
      durationMs: r.durationMs,
      medianMs: med,
      ratio: r.durationMs / med,
    }))
    .sort((a, b) => b.ratio - a.ratio);
}

// ============================================================================
// Public API
// ============================================================================

/** Build triage summary from worker results (#1506). */
function buildTriageSummary(results: readonly WorkerResult[]): TriageSummary {
  const actionCounts = new Map<TriageAction, number>();
  let retriedCount = 0;
  let retrySuccesses = 0;

  for (const r of results) {
    if (r.triageAction !== undefined) {
      const current = actionCounts.get(r.triageAction) ?? 0;
      actionCounts.set(r.triageAction, current + 1);
    }
    if (r.wasRetried === true) {
      retriedCount++;
      if (r.status === 'success') retrySuccesses++;
    }
  }

  return { retriedCount, retrySuccesses, actionCounts };
}

/**
 * Analyze dispatch results and produce structured insights.
 *
 * Pure function — no side effects, no I/O. Caller decides what to do
 * with the insights (log, store, feed to routing).
 */
export function analyzeDispatch(results: readonly WorkerResult[]): DispatchInsights {
  const nonSkipped = results.filter((r) => r.status !== 'skipped');
  const successCount = nonSkipped.filter((r) => r.status === 'success').length;
  const roleProfiles = buildRoleProfiles(nonSkipped);
  const errorClusters = buildErrorClusters(nonSkipped);
  const durationOutliers = findDurationOutliers(nonSkipped);
  const triage = buildTriageSummary(nonSkipped);

  return {
    roleProfiles,
    errorClusters,
    durationOutliers,
    overallSuccessRate: nonSkipped.length > 0 ? successCount / nonSkipped.length : 0,
    totalWorkers: nonSkipped.length,
    dominantErrorType: errorClusters.length > 0 ? errorClusters[0]?.errorType : undefined,
    triage,
  };
}
