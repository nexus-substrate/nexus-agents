/**
 * The statistics must stay inside their own ranges (#5760).
 *
 * These are numbers other loops act on: `pValue` decides whether a routing
 * experiment has signal, and `recommendedSampleSize` tells an experiment how
 * much traffic to collect. Both were computable outside their valid range, and
 * the existing tests only asserted "below 0.05" or "above 0.05", so a p-value
 * of 1.35 satisfied them.
 */
import { describe, it, expect } from 'vitest';

import { compareProportions, calculateMinSampleSize } from './validation-stats.js';

describe('pValue stays a probability (#5760)', () => {
  it('reports 1, not more than 1, for identical proportions', () => {
    // The continuity correction is subtracted from |difference| before the
    // division, so a difference smaller than the correction drove z negative
    // and doubling the upper tail of a negative z exceeded 1.
    const result = compareProportions(5, 10, 5, 10);

    expect(result.pValue).toBeLessThanOrEqual(1);
    // 6 digits, not more: normalCDF is an approximation and returns
    // 0.999999999 at z=0, which is the right answer to the precision it has.
    expect(result.pValue).toBeCloseTo(1, 6);
    expect(result.significant).toBe(false);
  });

  it('stays within [0, 1] across the near-null region', () => {
    // Exactly where an experiment sits before it has signal.
    for (const [a, na, b, nb] of [
      [5, 10, 5, 10],
      [50, 100, 50, 100],
      [500, 1000, 500, 1000],
      [50, 100, 51, 100],
      [0, 10, 0, 10],
    ] as const) {
      const { pValue } = compareProportions(a, na, b, nb);
      expect(pValue).toBeGreaterThanOrEqual(0);
      expect(pValue).toBeLessThanOrEqual(1);
    }
  });

  it('still detects a real difference', () => {
    // The clamp must not blunt the test it protects.
    const result = compareProportions(90, 100, 50, 100);
    expect(result.pValue).toBeLessThan(0.05);
    expect(result.significant).toBe(true);
  });
});

describe('recommendedSampleSize matches the stated power (#5760)', () => {
  it('returns the textbook n for a 10-point lift at 80% power', () => {
    // n = 2 * (z_{alpha/2} + z_beta)^2 * pbar(1-pbar) / d^2 with
    // z_{alpha/2}=1.96, z_beta=0.8416, pbar=0.55, d=0.1 -> 391.
    // `getZScore` already applies the two-tail transform internally, so
    // passing `1 - alpha/2` double-applied it and passing `power` treated a
    // one-tailed quantile as a confidence level: the result was 613.
    const n = calculateMinSampleSize(0.5, 0.1);

    expect(n).toBeGreaterThanOrEqual(380);
    expect(n).toBeLessThanOrEqual(400);
  });

  it('returns the textbook n for a 5-point lift on a 0.2 baseline', () => {
    const n = calculateMinSampleSize(0.2, 0.05);

    expect(n).toBeGreaterThanOrEqual(1050);
    expect(n).toBeLessThanOrEqual(1150);
  });

  it('needs more samples for a smaller effect', () => {
    expect(calculateMinSampleSize(0.5, 0.05)).toBeGreaterThan(calculateMinSampleSize(0.5, 0.1));
  });
});
