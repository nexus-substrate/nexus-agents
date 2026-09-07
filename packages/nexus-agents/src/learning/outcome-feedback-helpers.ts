/**
 * nexus-agents/learning - Outcome Feedback Helpers
 *
 * Helper functions for outcome feedback calculations and statistics.
 *
 * @module learning/outcome-feedback-helpers
 */

import { randomUUID } from 'node:crypto';
import { getTimeProvider } from '../core/index.js';
import type {
  RoutingDecision,
  TaskOutcome,
  OutcomeClass,
  RouterType,
} from './outcome-feedback-types.js';

/**
 * Count outcomes by class.
 */
export function countOutcomesByClass(
  outcomes: readonly TaskOutcome[]
): Record<OutcomeClass, number> {
  const counts: Record<OutcomeClass, number> = {
    success: 0,
    partial: 0,
    failure: 0,
    timeout: 0,
    error: 0,
  };

  for (const outcome of outcomes) {
    counts[outcome.outcomeClass]++;
  }

  return counts;
}

/**
 * Was this decision's `routerType` actually measured?
 *
 * An absent `routerTypeMeasured` means the row predates #5812, and a legacy row
 * carries exactly as much evidence as the fallback does — so absence reads as
 * UNMEASURED. Defaulting it to `true` would re-create the defect for every row
 * already on disk.
 */
export function isRouterTypeMeasured(decision: RoutingDecision): boolean {
  return decision.routerTypeMeasured === true;
}

/**
 * Count decisions by router type, excluding those whose router could not be
 * identified (#5812).
 *
 * `getDecisiveRouterType` labels an unattributable decision `'topsis'`, because
 * `RouterType` has no member for "no stage explains this". Counting those in
 * the `topsis` bucket inflated the exact number this function exists to report.
 * They are returned separately as `unattributed` instead — a decision belongs
 * to one or the other, never both, so the two always sum to `decisions.length`.
 */
export function countDecisionsByRouter(decisions: readonly RoutingDecision[]): {
  byRouter: Record<RouterType, number>;
  unattributed: number;
} {
  const byRouter: Record<RouterType, number> = {
    linucb: 0,
    preference: 0,
    quality: 0,
    cascade: 0,
    topsis: 0,
  };
  let unattributed = 0;

  for (const decision of decisions) {
    if (isRouterTypeMeasured(decision)) {
      byRouter[decision.routerType]++;
    } else {
      unattributed++;
    }
  }

  return { byRouter, unattributed };
}

/**
 * Calculate average quality score from outcomes.
 */
export function calculateAverageQuality(outcomes: readonly TaskOutcome[]): number {
  if (outcomes.length === 0) return 0;
  const sum = outcomes.reduce((acc, o) => acc + o.qualityScore, 0);
  return sum / outcomes.length;
}

/**
 * Generate human-readable reward explanation.
 */
export function generateRewardExplanation(outcome: TaskOutcome, reward: number): string {
  const parts: string[] = [];

  if (outcome.success) {
    parts.push('Task succeeded');
  } else if (outcome.outcomeClass === 'partial') {
    parts.push(
      `Partial completion (${(outcome.qualitySignals.completionRatio * 100).toFixed(0)}%)`
    );
  } else {
    parts.push(`Task ${outcome.outcomeClass}`);
  }

  parts.push(`quality=${outcome.qualityScore.toFixed(2)}`);
  parts.push(`duration=${String(outcome.durationMs)}ms`);

  if (outcome.qualitySignals.retryCount > 0) {
    parts.push(`retries=${String(outcome.qualitySignals.retryCount)}`);
  }

  parts.push(`reward=${reward.toFixed(3)}`);

  return parts.join(', ');
}

/**
 * Create a routing decision record.
 */
export function createRoutingDecision(
  params: Omit<RoutingDecision, 'id' | 'timestamp'>
): RoutingDecision {
  return {
    id: randomUUID(),
    timestamp: getTimeProvider().nowIso(),
    ...params,
  };
}

/**
 * Create a task outcome record.
 */
export function createTaskOutcome(params: Omit<TaskOutcome, 'timestamp'>): TaskOutcome {
  return {
    timestamp: getTimeProvider().nowIso(),
    ...params,
  };
}
