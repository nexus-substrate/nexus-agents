/**
 * Workflow Metrics Calculation
 *
 * Helper functions for calculating, validating, and summarizing workflow metrics.
 *
 * @module workflows/self-development/metrics
 */

import type { Result } from '../../core/index.js';
import { ok, err } from '../../core/index.js';
import type { SelfDevWorkflowResult, SelfDevWorkflowMetrics, WorkflowPhase } from './types.js';

// =============================================================================
// Validation Types
// =============================================================================

/** Metrics validation result. */
export interface MetricsValidation {
  readonly valid: boolean;
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
}

/** Metrics summary for human-readable output. */
export interface MetricsSummary {
  readonly duration: string;
  readonly phases: string;
  readonly quality: string;
  readonly iterations: string;
  readonly vote: string;
  readonly humanReview: string;
}

// =============================================================================
// Validation Constants
// =============================================================================

/** Maximum expected duration for a phase (5 minutes). */
const MAX_PHASE_DURATION_MS = 5 * 60 * 1000;

/** Maximum expected total duration (30 minutes). */
const MAX_TOTAL_DURATION_MS = 30 * 60 * 1000;

/** Maximum expected iterations per protocol. */
const MAX_ITERATIONS = 10;

/** Minimum expected test coverage (80%). */
const MIN_TEST_COVERAGE = 80;

/** Minimum expected approval rate (80%). */
const MIN_APPROVAL_RATE = 0.8;

/**
 * Get duration from a phase output, defaulting to 0.
 */
function getDuration(phase: { durationMs: number } | undefined): number {
  return phase?.durationMs ?? 0;
}

/**
 * Calculate phase durations from outputs.
 */
function calculatePhaseDurations(
  outputs: SelfDevWorkflowResult['outputs']
): Record<WorkflowPhase, number> {
  return {
    analyze: getDuration(outputs.analyze),
    research: getDuration(outputs.research),
    plan: getDuration(outputs.plan),
    refine: getDuration(outputs.refine),
    vote: getDuration(outputs.vote),
    review: getDuration(outputs.review),
    implement: getDuration(outputs.implement),
    verify: getDuration(outputs.verify),
    commit: getDuration(outputs.commit),
  };
}

/**
 * Calculate iteration counts from outputs.
 */
function calculateIterationCounts(outputs: SelfDevWorkflowResult['outputs']): {
  trinity: number;
  reflexion: number;
  selfDebug: number;
  selfRefine: number;
} {
  return {
    trinity: outputs.plan?.iterations ?? 0,
    reflexion: outputs.refine?.iterations ?? 0,
    selfDebug: outputs.implement?.selfDebugIterations ?? 0,
    selfRefine: outputs.implement?.selfRefineIterations ?? 0,
  };
}

/**
 * Calculate approval rate from vote output.
 */
function calculateApprovalRate(outputs: SelfDevWorkflowResult['outputs']): number {
  const vote = outputs.vote;
  if (vote === undefined) return 0;

  const totalVotes = vote.approvalCount + vote.rejectCount;
  if (totalVotes === 0) return 0;

  return vote.approvalCount / totalVotes;
}

/**
 * Calculate workflow metrics from outputs.
 */
export function calculateMetrics(
  outputs: SelfDevWorkflowResult['outputs'],
  totalDurationMs: number,
  checkpointCount: number
): SelfDevWorkflowMetrics {
  const phaseDurations = calculatePhaseDurations(outputs);
  const iterations = calculateIterationCounts(outputs);

  return {
    totalDurationMs,
    phaseDurations,
    trinityIterations: iterations.trinity,
    reflexionIterations: iterations.reflexion,
    selfDebugIterations: iterations.selfDebug,
    selfRefineIterations: iterations.selfRefine,
    finalSeverity: outputs.refine?.finalSeverity ?? 0,
    testCoverage: outputs.verify?.coverage ?? 0,
    approvalRate: calculateApprovalRate(outputs),
    vetoCount: outputs.vote?.vetoExercised === true ? 1 : 0,
    humanReviewTime: outputs.review?.durationMs ?? 0,
    humanRevisions: checkpointCount,
  };
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Validate metrics are within expected ranges.
 */
export function validateMetrics(metrics: SelfDevWorkflowMetrics): MetricsValidation {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Check total duration
  if (metrics.totalDurationMs > MAX_TOTAL_DURATION_MS) {
    warnings.push(`Total duration ${formatDuration(metrics.totalDurationMs)} exceeds expected max`);
  }

  // Check phase durations
  for (const [phase, duration] of Object.entries(metrics.phaseDurations)) {
    if (duration > MAX_PHASE_DURATION_MS) {
      warnings.push(`Phase ${phase} took ${formatDuration(duration)} (max expected: 5min)`);
    }
  }

  // Check iterations
  const totalIterations =
    metrics.trinityIterations +
    metrics.reflexionIterations +
    metrics.selfDebugIterations +
    metrics.selfRefineIterations;

  if (totalIterations > MAX_ITERATIONS * 4) {
    warnings.push(`High iteration count: ${String(totalIterations)} total iterations`);
  }

  // Check test coverage
  if (metrics.testCoverage < MIN_TEST_COVERAGE) {
    errors.push(
      `Test coverage ${String(metrics.testCoverage)}% below minimum ${String(MIN_TEST_COVERAGE)}%`
    );
  }

  // Check approval rate
  if (metrics.approvalRate < MIN_APPROVAL_RATE && metrics.approvalRate > 0) {
    errors.push(`Approval rate ${(metrics.approvalRate * 100).toFixed(0)}% below threshold`);
  }

  // Check veto
  if (metrics.vetoCount > 0) {
    errors.push('Security veto was exercised');
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}

/**
 * Check if metrics pass all quality gates.
 */
export function metricsPassQualityGates(metrics: SelfDevWorkflowMetrics): Result<void, string> {
  const validation = validateMetrics(metrics);

  if (!validation.valid) {
    return err(validation.errors.join('; '));
  }

  return ok(undefined);
}

// =============================================================================
// Summary
// =============================================================================

/**
 * Format duration in human-readable format.
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${String(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

/**
 * Generate human-readable metrics summary.
 */
export function summarizeMetrics(metrics: SelfDevWorkflowMetrics): MetricsSummary {
  // Duration summary
  const duration = formatDuration(metrics.totalDurationMs);

  // Phase timing summary
  const phaseTimes = Object.entries(metrics.phaseDurations)
    .filter(([_, ms]) => ms > 0)
    .map(([phase, ms]) => `${phase}: ${formatDuration(ms)}`)
    .join(', ');
  const phases = phaseTimes.length > 0 ? phaseTimes : 'No phases completed';

  // Quality summary
  const coverageStr = `${String(metrics.testCoverage)}%`;
  const severityStr = metrics.finalSeverity.toFixed(2);
  const quality = `Coverage: ${coverageStr}, Severity: ${severityStr}`;

  // Iterations summary
  const iterParts: string[] = [];
  if (metrics.trinityIterations > 0)
    iterParts.push(`TRINITY: ${String(metrics.trinityIterations)}`);
  if (metrics.reflexionIterations > 0)
    iterParts.push(`Reflexion: ${String(metrics.reflexionIterations)}`);
  if (metrics.selfDebugIterations > 0)
    iterParts.push(`Self-Debug: ${String(metrics.selfDebugIterations)}`);
  if (metrics.selfRefineIterations > 0)
    iterParts.push(`Self-Refine: ${String(metrics.selfRefineIterations)}`);
  const iterations = iterParts.length > 0 ? iterParts.join(', ') : 'No iterations';

  // Vote summary
  const approvalPct = (metrics.approvalRate * 100).toFixed(0);
  const vetoStr = metrics.vetoCount > 0 ? ' (VETO)' : '';
  const vote = `${approvalPct}% approval${vetoStr}`;

  // Human review summary
  const reviewTime = formatDuration(metrics.humanReviewTime);
  const revisions =
    metrics.humanRevisions > 1 ? ` (${String(metrics.humanRevisions)} revisions)` : '';
  const humanReview = `${reviewTime}${revisions}`;

  return {
    duration,
    phases,
    quality,
    iterations,
    vote,
    humanReview,
  };
}

/**
 * Format metrics as a string for logging or display.
 */
export function formatMetricsReport(metrics: SelfDevWorkflowMetrics): string {
  const summary = summarizeMetrics(metrics);
  const validation = validateMetrics(metrics);

  const lines = [
    '=== Self-Development Workflow Metrics ===',
    '',
    `Duration: ${summary.duration}`,
    `Phases: ${summary.phases}`,
    `Quality: ${summary.quality}`,
    `Iterations: ${summary.iterations}`,
    `Vote: ${summary.vote}`,
    `Human Review: ${summary.humanReview}`,
  ];

  if (validation.warnings.length > 0) {
    lines.push('', 'Warnings:');
    for (const warning of validation.warnings) {
      lines.push(`  ⚠ ${warning}`);
    }
  }

  if (validation.errors.length > 0) {
    lines.push('', 'Errors:');
    for (const error of validation.errors) {
      lines.push(`  ✗ ${error}`);
    }
  }

  lines.push('', `Status: ${validation.valid ? '✓ PASSED' : '✗ FAILED'}`);

  return lines.join('\n');
}

// Re-export comparison functions
export {
  type BaselineSnapshot,
  type MetricsComparison,
  createEmptyBaseline,
  createBaselineFromChecks,
  compareMetrics,
  formatComparisonReport,
  comparisonPassesQualityGates,
} from './metrics-comparison.js';
