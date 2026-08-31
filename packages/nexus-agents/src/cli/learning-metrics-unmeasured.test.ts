/**
 * `learning-metrics` must not assert a convergence verdict over an unconsulted
 * bandit (#5267).
 *
 * `cli-commands-handlers.ts` calls `learningMetricsCommand(options)` with no
 * second `context` argument, and no production caller supplies one. So
 * `gatherLearningMetrics` always took its fallback —
 * `?? { totalPulls: 0, explorationRatio: 0, … }` — and `explorationRatio: 0`
 * is `< 0.3`, which produced `learningStatus: 'exploiting'`, rendered with a
 * **green ✓**.
 *
 * The CLI reported the bandit had converged past exploration into exploitation
 * — the strongest positive signal on the screen — when the bandit was never
 * consulted. That is worse than #5255's fabricated `100.0%`: a green checkmark
 * reads as an affirmative health verdict rather than a number a reader might
 * question.
 *
 * Driven through the exported entry point rather than the private
 * `computeSummary`, because exporting a function solely for a test is what the
 * producer/consumer ratchet rejects (see #5117's rewrite for the same reason).
 */

import { describe, it, expect } from 'vitest';

import { gatherLearningMetrics } from './learning-metrics-logic.js';
import type { LinUCBBandit } from '../cli-adapters/linucb-bandit.js';

const OPTIONS = { period: 24, format: 'ascii' as const, banditStats: false, showTrends: true };

/** A bandit whose stats are supplied directly — the measured path. */
function banditWith(totalPulls: number, explorationRatio: number): LinUCBBandit {
  return {
    getDetailedStats: () => [],
    getExplorationStats: () => ({ totalPulls, explorationRatio, armDistribution: [] }),
  } as unknown as LinUCBBandit;
}

describe('learning status over an unconsulted bandit (#5267)', () => {
  it('is unmeasured when no bandit is supplied at all', () => {
    // The production path today: the handler passes no context.
    const result = gatherLearningMetrics(undefined, undefined, undefined, OPTIONS);
    expect(result.summary.learningStatus).toBe('unmeasured');
  });

  it('is unmeasured when a bandit exists but has never been pulled', () => {
    // Keyed on the input the verdict actually depends on, not on whether the
    // object exists. A bandit with zero pulls has no exploration ratio to
    // report either, so both cases are the same fact.
    const result = gatherLearningMetrics(banditWith(0, 0), undefined, undefined, OPTIONS);
    expect(result.summary.learningStatus).toBe('unmeasured');
  });

  it('still reports exploiting when a real bandit has genuinely converged', () => {
    // The control. Without it, hardcoding 'unmeasured' would satisfy both tests
    // above and destroy the verdict this command exists to give.
    const result = gatherLearningMetrics(banditWith(500, 0.05), undefined, undefined, OPTIONS);
    expect(result.summary.learningStatus).toBe('exploiting');
  });

  it('still reports exploring when a real bandit is exploring', () => {
    const result = gatherLearningMetrics(banditWith(500, 0.8), undefined, undefined, OPTIONS);
    expect(result.summary.learningStatus).toBe('exploring');
  });

  it('still reports balanced in the middle band', () => {
    // The third control: the field must be able to take every value, or
    // "status" is not a measurement.
    const result = gatherLearningMetrics(banditWith(500, 0.45), undefined, undefined, OPTIONS);
    expect(result.summary.learningStatus).toBe('balanced');
  });
});
