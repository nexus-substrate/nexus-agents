/**
 * Validation Statistics Helpers
 *
 * Pure helper functions for statistical calculations.
 * Extracted from validation-stats.ts for maintainability.
 *
 * @module learning/validation-stats-helpers
 * (Source: Issue #273 - Learning Validation Dashboard)
 */

import type { ConfidenceInterval } from './validation-stats-types.js';

/**
 * Z-scores for common confidence levels.
 */
export const Z_SCORES: Record<number, number> = {
  0.9: 1.645,
  0.95: 1.96,
  0.99: 2.576,
};

/**
 * Get z-score for a confidence level.
 * Uses lookup table for common values, Hastings approximation for others.
 */
export function getZScore(confidence: number): number {
  const knownScore = Z_SCORES[confidence];
  if (knownScore !== undefined) {
    return knownScore;
  }
  // Approximate using inverse normal CDF (Hastings approximation)
  const p = 1 - (1 - confidence) / 2;
  const t = Math.sqrt(-2 * Math.log(1 - p));
  return (
    t -
    (2.515517 + 0.802853 * t + 0.010328 * t * t) /
      (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t)
  );
}

/**
 * Normal cumulative distribution function (approximation).
 * Uses Abramowitz and Stegun approximation (equation 7.1.26).
 */
export function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1 / (1 + p * absX);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);

  return 0.5 * (1 + sign * y);
}

/** Options for z-statistic calculation. */
export interface ZStatParams {
  readonly p1: number;
  readonly p2: number;
  readonly successes1: number;
  readonly successes2: number;
  readonly total1: number;
  readonly total2: number;
  readonly useContinuityCorrection: boolean;
}

/**
 * Calculate z-statistic for proportion comparison.
 * Uses pooled proportion and optional continuity correction.
 */
export function calculateZStatistic(params: ZStatParams): number {
  const { p1, p2, successes1, successes2, total1, total2, useContinuityCorrection } = params;
  const difference = p1 - p2;
  const pooledP = (successes1 + successes2) / (total1 + total2 || 1);
  const se = Math.sqrt(pooledP * (1 - pooledP) * (1 / (total1 || 1) + 1 / (total2 || 1)));

  let correction = 0;
  if (useContinuityCorrection && total1 > 0 && total2 > 0) {
    correction = 0.5 * (1 / total1 + 1 / total2);
  }
  return se > 0 ? (Math.abs(difference) - correction) / se : 0;
}

/**
 * Calculate confidence interval for difference in proportions.
 */
export function calculateDifferenceCI(
  p1: number,
  p2: number,
  total1: number,
  total2: number,
  confidence: number
): ConfidenceInterval {
  const difference = p1 - p2;
  const seDiff = Math.sqrt((p1 * (1 - p1)) / (total1 || 1) + (p2 * (1 - p2)) / (total2 || 1));
  const z = getZScore(confidence);
  return {
    lower: difference - z * seDiff,
    upper: difference + z * seDiff,
    estimate: difference,
    confidence,
    n: total1 + total2,
    standardError: seDiff,
  };
}
