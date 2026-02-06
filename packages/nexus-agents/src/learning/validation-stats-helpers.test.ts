/**
 * Tests for Validation Statistics Helpers
 * @module learning/validation-stats-helpers.test
 */

import { describe, it, expect } from 'vitest';
import {
  Z_SCORES,
  getZScore,
  normalCDF,
  calculateZStatistic,
  calculateDifferenceCI,
} from './validation-stats-helpers.js';

// ============================================================================
// Z_SCORES constant
// ============================================================================

describe('Z_SCORES', () => {
  it('contains standard confidence level z-scores', () => {
    expect(Z_SCORES[0.9]).toBeCloseTo(1.645, 2);
    expect(Z_SCORES[0.95]).toBeCloseTo(1.96, 2);
    expect(Z_SCORES[0.99]).toBeCloseTo(2.576, 2);
  });

  it('has exactly three entries', () => {
    expect(Object.keys(Z_SCORES)).toHaveLength(3);
  });

  it('returns undefined for unlisted confidence levels', () => {
    expect(Z_SCORES[0.5]).toBeUndefined();
    expect(Z_SCORES[0.85]).toBeUndefined();
  });
});

// ============================================================================
// getZScore
// ============================================================================

describe('getZScore', () => {
  it('returns known z-score for 0.90', () => {
    expect(getZScore(0.9)).toBe(1.645);
  });

  it('returns known z-score for 0.95', () => {
    expect(getZScore(0.95)).toBe(1.96);
  });

  it('returns known z-score for 0.99', () => {
    expect(getZScore(0.99)).toBe(2.576);
  });

  it('approximates z-score for 0.975 confidence', () => {
    // z for 0.975 should be around 2.24
    const z = getZScore(0.975);
    expect(z).toBeGreaterThan(2.0);
    expect(z).toBeLessThan(2.6);
  });

  it('returns positive value for reasonable confidence levels', () => {
    expect(getZScore(0.8)).toBeGreaterThan(0);
    expect(getZScore(0.85)).toBeGreaterThan(0);
  });

  it('approximates z for 0.80 close to 1.28', () => {
    expect(getZScore(0.8)).toBeCloseTo(1.28, 1);
  });

  it('approximates z for 0.85 close to 1.44', () => {
    expect(getZScore(0.85)).toBeCloseTo(1.44, 1);
  });

  it('returns increasing z-scores for increasing confidence', () => {
    const z80 = getZScore(0.8);
    const z90 = getZScore(0.9);
    const z95 = getZScore(0.95);
    const z99 = getZScore(0.99);
    expect(z80).toBeLessThan(z90);
    expect(z90).toBeLessThan(z95);
    expect(z95).toBeLessThan(z99);
  });
});

// ============================================================================
// normalCDF
// ============================================================================

describe('normalCDF', () => {
  it('returns 0.5 for x=0', () => {
    expect(normalCDF(0)).toBeCloseTo(0.5, 4);
  });

  it('returns correct value for x=1 (Phi(1) ~ 0.8413)', () => {
    expect(normalCDF(1)).toBeCloseTo(0.8413, 3);
  });

  it('returns correct value for x=-1 (Phi(-1) ~ 0.1587)', () => {
    expect(normalCDF(-1)).toBeCloseTo(0.1587, 3);
  });

  it('returns correct value for x=2 (Phi(2) ~ 0.9772)', () => {
    expect(normalCDF(2)).toBeCloseTo(0.9772, 3);
  });

  it('returns correct value for x=-2 (Phi(-2) ~ 0.0228)', () => {
    expect(normalCDF(-2)).toBeCloseTo(0.0228, 3);
  });

  it('returns correct value for x=1.96 (Phi(1.96) ~ 0.975)', () => {
    expect(normalCDF(1.96)).toBeCloseTo(0.975, 2);
  });

  it('returns correct value for x=1.645 (Phi(1.645) ~ 0.95)', () => {
    expect(normalCDF(1.645)).toBeCloseTo(0.95, 2);
  });

  it('returns correct value for x=2.576 (Phi(2.576) ~ 0.995)', () => {
    expect(normalCDF(2.576)).toBeCloseTo(0.995, 2);
  });

  it('returns value near 1 for large positive x', () => {
    expect(normalCDF(4)).toBeGreaterThan(0.9999);
    expect(normalCDF(5)).toBeGreaterThan(0.99999);
  });

  it('returns value near 0 for large negative x', () => {
    expect(normalCDF(-4)).toBeLessThan(0.0001);
    expect(normalCDF(-5)).toBeLessThan(0.00001);
  });

  it('is monotonically increasing', () => {
    const values = [-3, -2, -1, 0, 1, 2, 3];
    for (let i = 0; i < values.length - 1; i++) {
      expect(normalCDF(values[i]!)).toBeLessThan(normalCDF(values[i + 1]!));
    }
  });

  it('satisfies symmetry: Phi(x) + Phi(-x) = 1', () => {
    const testValues = [0.5, 1, 1.5, 2, 2.5, 3];
    for (const x of testValues) {
      expect(normalCDF(x) + normalCDF(-x)).toBeCloseTo(1.0, 4);
    }
  });

  it('handles small positive values correctly', () => {
    // Phi(0.5) ~ 0.6915
    expect(normalCDF(0.5)).toBeCloseTo(0.6915, 3);
  });

  it('handles small negative values correctly', () => {
    // Phi(-0.5) ~ 0.3085
    expect(normalCDF(-0.5)).toBeCloseTo(0.3085, 3);
  });

  it('returns value in [0, 1] for any finite input', () => {
    const testValues = [-10, -5, -1, 0, 1, 5, 10];
    for (const x of testValues) {
      const result = normalCDF(x);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(1);
    }
  });
});

// ============================================================================
// calculateZStatistic
// ============================================================================

describe('calculateZStatistic', () => {
  it('returns 0 for identical proportions', () => {
    const z = calculateZStatistic({
      p1: 0.5,
      p2: 0.5,
      successes1: 50,
      successes2: 50,
      total1: 100,
      total2: 100,
      useContinuityCorrection: false,
    });
    expect(z).toBeCloseTo(0, 4);
  });

  it('returns positive value for different proportions', () => {
    const z = calculateZStatistic({
      p1: 0.7,
      p2: 0.5,
      successes1: 70,
      successes2: 50,
      total1: 100,
      total2: 100,
      useContinuityCorrection: false,
    });
    expect(z).toBeGreaterThan(0);
  });

  it('returns same z regardless of which proportion is larger (uses abs)', () => {
    const z1 = calculateZStatistic({
      p1: 0.7,
      p2: 0.5,
      successes1: 70,
      successes2: 50,
      total1: 100,
      total2: 100,
      useContinuityCorrection: false,
    });
    const z2 = calculateZStatistic({
      p1: 0.5,
      p2: 0.7,
      successes1: 50,
      successes2: 70,
      total1: 100,
      total2: 100,
      useContinuityCorrection: false,
    });
    expect(z1).toBeCloseTo(z2, 4);
  });

  it('continuity correction reduces the z-statistic', () => {
    const withoutCC = calculateZStatistic({
      p1: 0.6,
      p2: 0.4,
      successes1: 60,
      successes2: 40,
      total1: 100,
      total2: 100,
      useContinuityCorrection: false,
    });
    const withCC = calculateZStatistic({
      p1: 0.6,
      p2: 0.4,
      successes1: 60,
      successes2: 40,
      total1: 100,
      total2: 100,
      useContinuityCorrection: true,
    });
    expect(withCC).toBeLessThan(withoutCC);
  });

  it('continuity correction is not applied when totals are zero', () => {
    const z = calculateZStatistic({
      p1: 0.5,
      p2: 0.5,
      successes1: 0,
      successes2: 0,
      total1: 0,
      total2: 0,
      useContinuityCorrection: true,
    });
    expect(z).toBe(0);
  });

  it('returns 0 when se is 0 (all successes)', () => {
    const z = calculateZStatistic({
      p1: 1,
      p2: 1,
      successes1: 100,
      successes2: 100,
      total1: 100,
      total2: 100,
      useContinuityCorrection: false,
    });
    expect(z).toBe(0);
  });

  it('returns 0 when se is 0 (all failures)', () => {
    const z = calculateZStatistic({
      p1: 0,
      p2: 0,
      successes1: 0,
      successes2: 0,
      total1: 100,
      total2: 100,
      useContinuityCorrection: false,
    });
    expect(z).toBe(0);
  });

  it('handles zero totals gracefully', () => {
    const z = calculateZStatistic({
      p1: 0,
      p2: 0,
      successes1: 0,
      successes2: 0,
      total1: 0,
      total2: 0,
      useContinuityCorrection: false,
    });
    expect(z).toBe(0);
  });

  it('handles asymmetric sample sizes', () => {
    const z = calculateZStatistic({
      p1: 0.6,
      p2: 0.5,
      successes1: 60,
      successes2: 250,
      total1: 100,
      total2: 500,
      useContinuityCorrection: false,
    });
    expect(z).toBeGreaterThan(0);
    expect(Number.isFinite(z)).toBe(true);
  });

  it('produces larger z for larger differences', () => {
    const zSmall = calculateZStatistic({
      p1: 0.52,
      p2: 0.5,
      successes1: 52,
      successes2: 50,
      total1: 100,
      total2: 100,
      useContinuityCorrection: false,
    });
    const zLarge = calculateZStatistic({
      p1: 0.8,
      p2: 0.5,
      successes1: 80,
      successes2: 50,
      total1: 100,
      total2: 100,
      useContinuityCorrection: false,
    });
    expect(zLarge).toBeGreaterThan(zSmall);
  });

  it('produces known approximate value for 70/100 vs 50/100', () => {
    // pooledP = 120/200 = 0.6, se = sqrt(0.6*0.4*(1/100+1/100)) = sqrt(0.0048) ~ 0.0693
    // z = |0.7-0.5| / 0.0693 ~ 2.887
    const z = calculateZStatistic({
      p1: 0.7,
      p2: 0.5,
      successes1: 70,
      successes2: 50,
      total1: 100,
      total2: 100,
      useContinuityCorrection: false,
    });
    expect(z).toBeCloseTo(2.887, 1);
  });
});

// ============================================================================
// calculateDifferenceCI
// ============================================================================

describe('calculateDifferenceCI', () => {
  it('calculates CI for equal proportions centered at 0', () => {
    const ci = calculateDifferenceCI(0.5, 0.5, 100, 100, 0.95);
    expect(ci.estimate).toBeCloseTo(0, 4);
    expect(ci.lower).toBeLessThan(0);
    expect(ci.upper).toBeGreaterThan(0);
    expect(ci.confidence).toBe(0.95);
  });

  it('calculates CI for different proportions', () => {
    const ci = calculateDifferenceCI(0.7, 0.5, 100, 100, 0.95);
    expect(ci.estimate).toBeCloseTo(0.2, 4);
    expect(ci.lower).toBeGreaterThan(0);
    expect(ci.upper).toBeGreaterThan(ci.lower);
  });

  it('wider CI for smaller samples', () => {
    const largeSample = calculateDifferenceCI(0.6, 0.5, 1000, 1000, 0.95);
    const smallSample = calculateDifferenceCI(0.6, 0.5, 10, 10, 0.95);
    const largeWidth = largeSample.upper - largeSample.lower;
    const smallWidth = smallSample.upper - smallSample.lower;
    expect(smallWidth).toBeGreaterThan(largeWidth);
  });

  it('wider CI for higher confidence', () => {
    const ci95 = calculateDifferenceCI(0.6, 0.5, 100, 100, 0.95);
    const ci99 = calculateDifferenceCI(0.6, 0.5, 100, 100, 0.99);
    const width95 = ci95.upper - ci95.lower;
    const width99 = ci99.upper - ci99.lower;
    expect(width99).toBeGreaterThan(width95);
  });

  it('includes n as sum of both totals', () => {
    const ci = calculateDifferenceCI(0.5, 0.5, 50, 60, 0.95);
    expect(ci.n).toBe(110);
  });

  it('includes positive standard error for non-degenerate proportions', () => {
    const ci = calculateDifferenceCI(0.5, 0.5, 100, 100, 0.95);
    expect(ci.standardError).toBeGreaterThan(0);
  });

  it('negative estimate when p1 < p2', () => {
    const ci = calculateDifferenceCI(0.3, 0.7, 100, 100, 0.95);
    expect(ci.estimate).toBeCloseTo(-0.4, 4);
    expect(ci.upper).toBeLessThan(0);
  });

  it('standard error is 0 when both proportions are 0', () => {
    const ci = calculateDifferenceCI(0, 0, 100, 100, 0.95);
    expect(ci.standardError).toBe(0);
    expect(ci.lower).toBe(0);
    expect(ci.upper).toBe(0);
    expect(ci.estimate).toBe(0);
  });

  it('standard error is 0 when both proportions are 1', () => {
    const ci = calculateDifferenceCI(1, 1, 100, 100, 0.95);
    expect(ci.standardError).toBe(0);
    expect(ci.estimate).toBe(0);
  });

  it('handles zero totals by using fallback denominator of 1', () => {
    const ci = calculateDifferenceCI(0.5, 0.5, 0, 0, 0.95);
    expect(Number.isFinite(ci.lower)).toBe(true);
    expect(Number.isFinite(ci.upper)).toBe(true);
    expect(ci.n).toBe(0);
  });

  it('CI is symmetric around the estimate', () => {
    const ci = calculateDifferenceCI(0.6, 0.4, 200, 200, 0.95);
    const distLower = ci.estimate - ci.lower;
    const distUpper = ci.upper - ci.estimate;
    expect(distLower).toBeCloseTo(distUpper, 6);
  });

  it('uses 0.90 confidence level correctly (narrower than 0.95)', () => {
    const ci90 = calculateDifferenceCI(0.6, 0.5, 100, 100, 0.9);
    const ci95 = calculateDifferenceCI(0.6, 0.5, 100, 100, 0.95);
    const width90 = ci90.upper - ci90.lower;
    const width95 = ci95.upper - ci95.lower;
    expect(width90).toBeLessThan(width95);
  });

  it('returns correct confidence field in result', () => {
    const ci = calculateDifferenceCI(0.5, 0.5, 100, 100, 0.99);
    expect(ci.confidence).toBe(0.99);
  });
});
