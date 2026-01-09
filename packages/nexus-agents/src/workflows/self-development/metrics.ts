/**
 * Workflow Metrics Calculation
 *
 * Helper functions for calculating workflow metrics.
 *
 * @module workflows/self-development/metrics
 */

import type { SelfDevWorkflowResult, SelfDevWorkflowMetrics, WorkflowPhase } from './types.js';

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
