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
});

// ============================================================================
// getZScore
// ============================================================================

describe('getZScore', () => {
  it('returns known z-score for 0.95', () => {
    expect(getZScore(0.95)).toBe(1.96);
  });

  it('returns known z-score for 0.99', () => {
    expect(getZScore(0.99)).toBe(2.576);
  });

  it('approximates z-score for non-standard confidence', () => {
    const z = getZScore(0.975);
    // z for 0.975 should be around 2.24
    expect(z).toBeGreaterThan(2.0);
    expect(z).toBeLessThan(2.6);
  });

  it('returns positive value for reasonable confidence levels', () => {
    expect(getZScore(0.8)).toBeGreaterThan(0);
    expect(getZScore(0.85)).toBeGreaterThan(0);
  });
});

// ============================================================================
// normalCDF
// ============================================================================

describe('normalCDF', () => {
  it('returns 0.5 for x=0', () => {
    expect(normalCDF(0)).toBeCloseTo(0.5, 4);
  });

  it('returns value > 0.5 for x=1', () => {
    // Abramowitz & Stegun approximation may differ from exact CDF
    expect(normalCDF(1)).toBeGreaterThan(0.8);
    expect(normalCDF(1)).toBeLessThan(1);
  });

  it('returns value < 0.5 for x=-1', () => {
    expect(normalCDF(-1)).toBeGreaterThan(0);
    expect(normalCDF(-1)).toBeLessThan(0.2);
  });

  it('returns value > 0.97 for x=2', () => {
    expect(normalCDF(2)).toBeGreaterThan(0.97);
    expect(normalCDF(2)).toBeLessThan(1);
  });

  it('returns value near 1 for large x', () => {
    expect(normalCDF(4)).toBeGreaterThan(0.99);
  });

  it('returns value near 0 for large negative x', () => {
    expect(normalCDF(-4)).toBeLessThan(0.01);
  });

  it('is monotonically increasing', () => {
    expect(normalCDF(-2)).toBeLessThan(normalCDF(-1));
    expect(normalCDF(-1)).toBeLessThan(normalCDF(0));
    expect(normalCDF(0)).toBeLessThan(normalCDF(1));
    expect(normalCDF(1)).toBeLessThan(normalCDF(2));
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

  it('handles continuity correction', () => {
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
    // Continuity correction reduces the z-statistic
    expect(withCC).toBeLessThan(withoutCC);
  });

  it('returns 0 when se is 0', () => {
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
});

// ============================================================================
// calculateDifferenceCI
// ============================================================================

describe('calculateDifferenceCI', () => {
  it('calculates CI for equal proportions', () => {
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

  it('includes n in result', () => {
    const ci = calculateDifferenceCI(0.5, 0.5, 50, 60, 0.95);
    expect(ci.n).toBe(110);
  });

  it('includes standard error', () => {
    const ci = calculateDifferenceCI(0.5, 0.5, 100, 100, 0.95);
    expect(ci.standardError).toBeGreaterThan(0);
  });
});
