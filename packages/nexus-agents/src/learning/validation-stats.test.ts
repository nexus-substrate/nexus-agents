/**
 * Validation Statistics Tests
 *
 * @module learning/validation-stats.test
 */

import { describe, it, expect } from 'vitest';
import {
  proportionConfidenceInterval,
  meanConfidenceInterval,
  compareProportions,
  calculateDistributionStats,
  calculateRegret,
  calculateWinLoss,
  calculateMinSampleSize,
} from './validation-stats.js';

describe('validation-stats', () => {
  describe('proportionConfidenceInterval', () => {
    it('should calculate CI for 50% success rate', () => {
      const result = proportionConfidenceInterval(50, 100);

      expect(result.estimate).toBeCloseTo(0.5, 2);
      expect(result.lower).toBeGreaterThan(0.39);
      expect(result.upper).toBeLessThan(0.61);
      expect(result.confidence).toBe(0.95);
      expect(result.n).toBe(100);
    });

    it('should handle 0% success rate', () => {
      const result = proportionConfidenceInterval(0, 100);

      expect(result.estimate).toBe(0);
      expect(result.lower).toBe(0);
      expect(result.upper).toBeGreaterThan(0);
      expect(result.upper).toBeLessThan(0.05);
    });

    it('should handle 100% success rate', () => {
      const result = proportionConfidenceInterval(100, 100);

      expect(result.estimate).toBe(1);
      expect(result.upper).toBeCloseTo(1, 5); // Floating point tolerance
      expect(result.lower).toBeGreaterThan(0.95);
    });

    it('should handle empty sample', () => {
      const result = proportionConfidenceInterval(0, 0);

      expect(result.estimate).toBe(0);
      expect(result.lower).toBe(0);
      expect(result.upper).toBe(1);
      expect(result.n).toBe(0);
    });

    it('should respect custom confidence level', () => {
      const ci95 = proportionConfidenceInterval(50, 100, { confidence: 0.95 });
      const ci99 = proportionConfidenceInterval(50, 100, { confidence: 0.99 });

      // 99% CI should be wider
      expect(ci99.upper - ci99.lower).toBeGreaterThan(ci95.upper - ci95.lower);
    });

    it('should be narrower with larger sample', () => {
      const small = proportionConfidenceInterval(50, 100);
      const large = proportionConfidenceInterval(500, 1000);

      expect(large.upper - large.lower).toBeLessThan(small.upper - small.lower);
    });
  });

  describe('meanConfidenceInterval', () => {
    it('should calculate CI for normal-ish data', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const result = meanConfidenceInterval(values);

      expect(result.estimate).toBeCloseTo(5.5, 2);
      expect(result.lower).toBeLessThan(5.5);
      expect(result.upper).toBeGreaterThan(5.5);
      expect(result.n).toBe(10);
    });

    it('should handle empty array', () => {
      const result = meanConfidenceInterval([]);

      expect(result.estimate).toBe(0);
      expect(result.n).toBe(0);
    });

    it('should handle single value', () => {
      const result = meanConfidenceInterval([5]);

      expect(result.estimate).toBe(5);
      expect(result.n).toBe(1);
    });

    it('should be narrower with larger sample', () => {
      // Use similar distributions with different sample sizes
      const small = meanConfidenceInterval([3, 4, 5, 6, 7]);
      const large = meanConfidenceInterval([3, 4, 5, 6, 7, 3, 4, 5, 6, 7]);

      // CI width should be narrower with more samples (same variance)
      const smallWidth = small.upper - small.lower;
      const largeWidth = large.upper - large.lower;
      expect(largeWidth).toBeLessThan(smallWidth);
    });
  });

  describe('compareProportions', () => {
    it('should detect significant difference', () => {
      // 80% vs 50% with n=100 each should be significant
      const result = compareProportions(80, 100, 50, 100);

      expect(result.significant).toBe(true);
      expect(result.pValue).toBeLessThan(0.05);
      expect(result.difference).toBeCloseTo(0.3, 2);
    });

    it('should not detect difference when there is none', () => {
      // 50% vs 52% with n=100 each - not significant
      const result = compareProportions(50, 100, 52, 100);

      expect(result.significant).toBe(false);
      expect(result.pValue).toBeGreaterThan(0.05);
    });

    it('should calculate correct effect size', () => {
      const result = compareProportions(80, 100, 50, 100);

      // Cohen's h should be > 0.5 for large effect
      expect(result.effectSize).toBeGreaterThan(0.5);
    });

    it('should handle extreme proportions', () => {
      const result = compareProportions(100, 100, 0, 100);

      expect(result.difference).toBeCloseTo(1, 2);
      expect(result.significant).toBe(true);
    });

    it('should include confidence interval for difference', () => {
      const result = compareProportions(70, 100, 50, 100);

      expect(result.differenceCI.estimate).toBeCloseTo(0.2, 2);
      expect(result.differenceCI.lower).toBeGreaterThan(0);
      expect(result.differenceCI.upper).toBeLessThan(0.4);
    });

    it('should respect alpha level', () => {
      const result = compareProportions(55, 100, 50, 100, { alpha: 0.01 });

      // With stricter alpha, small difference is not significant
      expect(result.significant).toBe(false);
      expect(result.alpha).toBe(0.01);
    });
  });

  describe('calculateDistributionStats', () => {
    it('should calculate correct statistics', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const result = calculateDistributionStats(values);

      expect(result.mean).toBeCloseTo(5.5, 2);
      expect(result.median).toBeCloseTo(5.5, 2);
      expect(result.min).toBe(1);
      expect(result.max).toBe(10);
      expect(result.n).toBe(10);
      expect(result.stdDev).toBeGreaterThan(0);
    });

    it('should calculate percentiles correctly', () => {
      const values = Array.from({ length: 100 }, (_, i) => i + 1);
      const result = calculateDistributionStats(values);

      // Percentiles use linear interpolation, so allow ±1 tolerance
      expect(result.percentiles.p5).toBeCloseTo(6, 0);
      expect(result.percentiles.p25).toBeCloseTo(26, 0);
      expect(result.percentiles.p50).toBeCloseTo(50.5, 0);
      expect(result.percentiles.p75).toBeCloseTo(75, 0);
      expect(result.percentiles.p95).toBeCloseTo(95, 0);
    });

    it('should handle empty array', () => {
      const result = calculateDistributionStats([]);

      expect(result.mean).toBe(0);
      expect(result.median).toBe(0);
      expect(result.n).toBe(0);
    });

    it('should handle single value', () => {
      const result = calculateDistributionStats([5]);

      expect(result.mean).toBe(5);
      expect(result.median).toBe(5);
      expect(result.min).toBe(5);
      expect(result.max).toBe(5);
    });
  });

  describe('calculateRegret', () => {
    it('should calculate zero regret for optimal decisions', () => {
      const decisions = [
        { chosenModel: 'A', actualReward: 1.0, rewards: { A: 1.0, B: 0.8 } },
        { chosenModel: 'A', actualReward: 0.9, rewards: { A: 0.9, B: 0.7 } },
      ];

      const result = calculateRegret(decisions);

      expect(result.cumulativeRegret).toBeCloseTo(0, 2);
      expect(result.optimalRate).toBe(1);
      expect(result.suboptimalDecisions).toBe(0);
    });

    it('should calculate regret for suboptimal decisions', () => {
      const decisions = [
        { chosenModel: 'B', actualReward: 0.8, rewards: { A: 1.0, B: 0.8 } },
        { chosenModel: 'B', actualReward: 0.7, rewards: { A: 0.9, B: 0.7 } },
      ];

      const result = calculateRegret(decisions);

      expect(result.cumulativeRegret).toBeCloseTo(0.4, 2); // 0.2 + 0.2
      expect(result.avgRegret).toBeCloseTo(0.2, 2);
      expect(result.suboptimalDecisions).toBe(2);
      expect(result.optimalRate).toBe(0);
    });

    it('should track regret per model', () => {
      const decisions = [
        { chosenModel: 'A', actualReward: 1.0, rewards: { A: 1.0, B: 0.5, C: 0.3 } },
      ];

      const result = calculateRegret(decisions);

      expect(result.regretPerModel['A']).toBeCloseTo(0, 2);
      expect(result.regretPerModel['B']).toBeCloseTo(0.5, 2);
      expect(result.regretPerModel['C']).toBeCloseTo(0.7, 2);
    });

    it('should handle empty decisions', () => {
      const result = calculateRegret([]);

      expect(result.cumulativeRegret).toBe(0);
      expect(result.totalDecisions).toBe(0);
      expect(result.optimalRate).toBe(1);
    });
  });

  describe('calculateWinLoss', () => {
    it('should count wins correctly', () => {
      const decisions = [
        { chosenModel: 'A', actualReward: 1.0, rewards: { A: 1.0, B: 0.8 } },
        { chosenModel: 'A', actualReward: 0.9, rewards: { A: 0.9, B: 0.7 } },
        { chosenModel: 'B', actualReward: 1.0, rewards: { A: 0.5, B: 1.0 } },
      ];

      const resultA = calculateWinLoss('A', decisions);

      expect(resultA.wins).toBe(2);
      expect(resultA.losses).toBe(1);
      expect(resultA.winRate).toBeCloseTo(2 / 3, 2);
    });

    it('should count ties correctly', () => {
      const decisions = [{ chosenModel: 'A', actualReward: 1.0, rewards: { A: 1.0, B: 1.0 } }];

      const result = calculateWinLoss('A', decisions);

      expect(result.ties).toBe(1);
      expect(result.wins).toBe(0);
    });

    it('should include confidence interval for win rate', () => {
      const decisions = Array.from({ length: 50 }, () => ({
        chosenModel: 'A',
        actualReward: 1.0,
        rewards: { A: 1.0, B: 0.8 },
      }));

      const result = calculateWinLoss('A', decisions);

      expect(result.winRateCI.lower).toBeGreaterThan(0.8);
      expect(result.winRateCI.upper).toBeLessThanOrEqual(1);
    });

    it('should handle model not in decisions', () => {
      const decisions = [{ chosenModel: 'A', actualReward: 1.0, rewards: { A: 1.0, B: 0.8 } }];

      const result = calculateWinLoss('C', decisions);

      expect(result.wins).toBe(0);
      expect(result.losses).toBe(0);
      expect(result.ties).toBe(0);
    });
  });

  describe('calculateMinSampleSize', () => {
    it('should calculate sample size for moderate effect', () => {
      // Detect 10% improvement from 50% baseline
      const n = calculateMinSampleSize(0.5, 0.1);

      // Two-proportion z-test formula gives ~400-700 per group for 80% power
      expect(n).toBeGreaterThan(350);
      expect(n).toBeLessThan(700);
    });

    it('should require larger sample for smaller effect', () => {
      const small = calculateMinSampleSize(0.5, 0.05);
      const large = calculateMinSampleSize(0.5, 0.1);

      expect(small).toBeGreaterThan(large);
    });

    it('should require larger sample for higher power', () => {
      const power80 = calculateMinSampleSize(0.5, 0.1, { power: 0.8 });
      const power90 = calculateMinSampleSize(0.5, 0.1, { power: 0.9 });

      expect(power90).toBeGreaterThan(power80);
    });

    it('should require larger sample for lower alpha', () => {
      const alpha05 = calculateMinSampleSize(0.5, 0.1, { alpha: 0.05 });
      const alpha01 = calculateMinSampleSize(0.5, 0.1, { alpha: 0.01 });

      expect(alpha01).toBeGreaterThan(alpha05);
    });
  });
});
