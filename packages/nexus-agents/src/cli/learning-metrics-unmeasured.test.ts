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

/**
 * The same defect one section down the same screen (#5267 residual).
 *
 * `computeTopFeatures` filled an empty result with five entries from
 * `FEATURE_NAMES` at `importance: 0, direction: 'positive'`, so
 * `--bandit-stats` rendered five green `↑` arrows over a bandit that had
 * recorded nothing. It also made `formatFeatureImportance`'s
 * `features.length === 0` branch — "No feature data available" — unreachable:
 * a display path that could never run, guarding a case the producer had
 * already fabricated away.
 */
describe('feature importances over an unconsulted bandit (#5267)', () => {
  it('reports no features rather than five zero-importance placeholders', () => {
    const result = gatherLearningMetrics(undefined, undefined, undefined, OPTIONS);
    expect(result.banditProgress.topFeatures).toEqual([]);
  });

  it('does not invent a positive direction for an unobserved feature', () => {
    const result = gatherLearningMetrics(undefined, undefined, undefined, OPTIONS);
    // A green ↑ is an affirmative claim about which way a feature pushes.
    // Over zero observations there is no such claim to make.
    for (const f of result.banditProgress.topFeatures) {
      expect(f.importance).not.toBe(0);
    }
  });

  it('still reports real features when the bandit has stats', () => {
    const bandit = {
      getDetailedStats: () => [
        {
          armName: 'claude',
          pulls: 10,
          featureImportance: [
            { feature: 'taskComplexity', importance: 0.8, direction: 'positive' as const },
            { feature: 'contextSize', importance: -0.4, direction: 'negative' as const },
          ],
        },
      ],
      getExplorationStats: () => ({ totalPulls: 10, explorationRatio: 0.2, armDistribution: [] }),
    } as unknown as LinUCBBandit;

    const result = gatherLearningMetrics(bandit, undefined, undefined, OPTIONS);

    // The empty case must not be reached by hard-coding it: with real theta
    // values the list is populated and ordered by absolute importance.
    expect(result.banditProgress.topFeatures.length).toBeGreaterThan(0);
    expect(result.banditProgress.topFeatures[0]?.importance).not.toBe(0);
  });
});
