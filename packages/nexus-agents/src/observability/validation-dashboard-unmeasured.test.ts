/**
 * Every dashboard metric must report `unmeasured` over an empty input (#5255).
 *
 * The dashboard rendered `Optimal Decision Rate: 100.0%`, `Cumulative Regret:
 * 0.00`, `Exploration Rate: 0.0%`, `Convergence Score: 0%` and
 * `✗ Healthy Exploration` on every run, because nothing writes its three ingest
 * fields — so every metric was computed over an empty collection and returned
 * its empty-case default as if it were a measurement.
 *
 * **One test per metric, keyed on the collection that metric actually
 * consumes.** That is not stylistic. #4714 fixed the aggregate health score
 * this way and the guard did not generalize: it keys on `outcomes.length >=
 * 100` while the broken metrics read a *different*, always-empty collection, so
 * on a system with 412 outcomes the guard passes and the fabricated values flow
 * through. A single aggregate test here would reproduce that exactly.
 *
 * Scope, stated plainly: these are unit tests over pure functions. The
 * populated path cannot be exercised end to end until the recorders have a
 * producer (#5259), so this file does NOT demonstrate that the dashboard works
 * — only that it no longer fabricates.
 */

import { describe, it, expect } from 'vitest';

import { calculateRegret } from '../learning/validation-stats.js';
import {
  calculateLearningProgress,
  calculateConvergenceScore,
} from './validation-dashboard-calc.js';

describe('each metric reports unmeasured over its own empty input (#5255)', () => {
  it('optimalRate is null when no decision was comparable, not 1', () => {
    // The headline defect: `optimalRate: 1` rendered as "100.0%" with a full
    // progress bar — a perfect routing record asserted over nothing.
    const analysis = calculateRegret([]);
    expect(analysis.optimalRate).toBeNull();
  });

  it('cumulativeRegret is null when no decision was comparable, not 0', () => {
    // Zero regret reads as ideal. Absence is not ideal.
    const analysis = calculateRegret([]);
    expect(analysis.cumulativeRegret).toBeNull();
  });

  it('still reports a real optimalRate of 1 when decisions WERE comparable', () => {
    // The control that keeps the nulls above from being satisfiable by a stub
    // that returns null unconditionally. A genuinely optimal run must still
    // read 1, and must not be swallowed by the unmeasured case.
    const analysis = calculateRegret([{ chosenModel: 'a', actualReward: 1, rewards: { a: 1, b: 0.5 } }]);
    expect(analysis.optimalRate).toBe(1);
    expect(analysis.cumulativeRegret).toBe(0);
  });

  it('reports a real non-perfect rate when a suboptimal choice was made', () => {
    // The other half of the control: the field must be able to take a value
    // other than 1 and null, or "optimalRate" is still not a measurement.
    const analysis = calculateRegret([{ chosenModel: 'b', actualReward: 0.5, rewards: { a: 1, b: 0.5 } }]);
    expect(analysis.optimalRate).toBe(0);
    expect(analysis.cumulativeRegret).toBeCloseTo(0.5, 10);
  });

  it('explorationRate is null when no exploration was recorded, not 0', () => {
    // 0.0% is a legitimate measurement — a fully greedy policy — so absence is
    // indistinguishable from a real reading without this.
    const progress = calculateLearningProgress([], [], {});
    expect(progress.explorationRate).toBeNull();
  });

  it('convergenceScore is null when no feature weights were recorded, not 0', () => {
    // Worse than the others: `Math.exp(-variance)` only APPROACHES 0, so a
    // literal 0% reads as worst-possible convergence rather than "no data".
    expect(calculateConvergenceScore({})).toBeNull();
  });

  it('still reports a real convergenceScore when weights WERE recorded', () => {
    // Control for the same reason as above.
    expect(calculateConvergenceScore({ f: [1, 1, 1] })).not.toBeNull();
  });
});
