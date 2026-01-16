/**
 * nexus-agents/learning - Outcome Feedback Helpers
 *
 * Helper functions for outcome feedback calculations and statistics.
 *
 * @module learning/outcome-feedback-helpers
 */

import { randomUUID } from 'node:crypto';
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
 * Count decisions by router type.
 */
export function countDecisionsByRouter(
  decisions: readonly RoutingDecision[]
): Record<RouterType, number> {
  const counts: Record<RouterType, number> = {
    linucb: 0,
    preference: 0,
    quality: 0,
    cascade: 0,
    topsis: 0,
  };

  for (const decision of decisions) {
    counts[decision.routerType]++;
  }

  return counts;
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
    timestamp: new Date().toISOString(),
    ...params,
  };
}

/**
 * Create a task outcome record.
 */
export function createTaskOutcome(params: Omit<TaskOutcome, 'timestamp'>): TaskOutcome {
  return {
    timestamp: new Date().toISOString(),
    ...params,
  };
}
