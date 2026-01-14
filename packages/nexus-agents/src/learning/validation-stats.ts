/**
 * Validation Statistics Module
 *
 * Statistical utilities for the learning validation dashboard.
 * Provides confidence intervals, hypothesis testing, and distribution analysis.
 *
 * @module learning/validation-stats
 * (Source: Issue #273 - Learning Validation Dashboard)
 */

import type {
  ConfidenceInterval,
  ComparisonResult,
  DistributionStats,
  RegretAnalysis,
  WinLossAnalysis,
  StatisticalOptions,
} from './validation-stats-types.js';
import { DEFAULT_STATISTICAL_OPTIONS } from './validation-stats-types.js';

/**
 * Z-scores for common confidence levels.
 */
const Z_SCORES: Record<number, number> = {
  0.9: 1.645,
  0.95: 1.96,
  0.99: 2.576,
};

/**
 * Get z-score for a confidence level.
 */
function getZScore(confidence: number): number {
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
 * Calculate confidence interval for a proportion (success rate).
 * Uses Wilson score interval for better coverage at extreme proportions.
 */
export function proportionConfidenceInterval(
  successes: number,
  total: number,
  options: StatisticalOptions = {}
): ConfidenceInterval {
  const opts = { ...DEFAULT_STATISTICAL_OPTIONS, ...options };
  const n = total;
  const p = n > 0 ? successes / n : 0;

  if (n === 0) {
    return {
      lower: 0,
      upper: 1,
      estimate: 0,
      confidence: opts.confidence,
      n: 0,
      standardError: 0,
    };
  }

  const z = getZScore(opts.confidence);
  const z2 = z * z;

  // Wilson score interval
  const denominator = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denominator;
  const margin = (z / denominator) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));

  const lower = Math.max(0, center - margin);
  const upper = Math.min(1, center + margin);
  const standardError = Math.sqrt((p * (1 - p)) / n);

  return {
    lower,
    upper,
    estimate: p,
    confidence: opts.confidence,
    n,
    standardError,
  };
}

/**
 * Calculate confidence interval for a mean.
 */
export function meanConfidenceInterval(
  values: readonly number[],
  options: StatisticalOptions = {}
): ConfidenceInterval {
  const opts = { ...DEFAULT_STATISTICAL_OPTIONS, ...options };
  const n = values.length;

  if (n === 0) {
    return {
      lower: 0,
      upper: 0,
      estimate: 0,
      confidence: opts.confidence,
      n: 0,
      standardError: 0,
    };
  }

  const mean = values.reduce((sum, v) => sum + v, 0) / n;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1 || 1);
  const stdDev = Math.sqrt(variance);
  const standardError = stdDev / Math.sqrt(n);
  const z = getZScore(opts.confidence);
  const margin = z * standardError;

  return {
    lower: mean - margin,
    upper: mean + margin,
    estimate: mean,
    confidence: opts.confidence,
    n,
    standardError,
  };
}

/** Options for z-statistic calculation. */
interface ZStatParams {
  readonly p1: number;
  readonly p2: number;
  readonly successes1: number;
  readonly successes2: number;
  readonly total1: number;
  readonly total2: number;
  readonly useContinuityCorrection: boolean;
}

/** Calculate z-statistic for proportion comparison. */
function calculateZStatistic(params: ZStatParams): number {
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

/** Calculate confidence interval for difference in proportions. */
function calculateDifferenceCI(
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

/**
 * Compare two proportions using two-proportion z-test.
 */
export function compareProportions(
  successes1: number,
  total1: number,
  successes2: number,
  total2: number,
  options: StatisticalOptions = {}
): ComparisonResult {
  const opts = { ...DEFAULT_STATISTICAL_OPTIONS, ...options };

  const p1 = total1 > 0 ? successes1 / total1 : 0;
  const p2 = total2 > 0 ? successes2 / total2 : 0;
  const difference = p1 - p2;

  const zStat = calculateZStatistic({
    p1,
    p2,
    successes1,
    successes2,
    total1,
    total2,
    useContinuityCorrection: opts.useContinuityCorrection,
  });
  const pValue = 2 * (1 - normalCDF(zStat));
  const differenceCI = calculateDifferenceCI(p1, p2, total1, total2, opts.confidence);

  // Cohen's h effect size for proportions
  const phi1 = 2 * Math.asin(Math.sqrt(p1));
  const phi2 = 2 * Math.asin(Math.sqrt(p2));
  const effectSize = Math.abs(phi1 - phi2);

  return {
    pValue,
    significant: pValue < opts.alpha,
    alpha: opts.alpha,
    difference,
    differenceCI,
    effectSize,
    n1: total1,
    n2: total2,
  };
}

/**
 * Normal cumulative distribution function (approximation).
 */
function normalCDF(x: number): number {
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

/**
 * Calculate descriptive statistics for a distribution.
 */
export function calculateDistributionStats(values: readonly number[]): DistributionStats {
  const n = values.length;

  if (n === 0) {
    return {
      mean: 0,
      median: 0,
      stdDev: 0,
      variance: 0,
      min: 0,
      max: 0,
      n: 0,
      percentiles: { p5: 0, p25: 0, p50: 0, p75: 0, p95: 0 },
    };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((sum, v) => sum + v, 0) / n;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1 || 1);

  const getPercentile = (p: number): number => {
    const index = (p / 100) * (n - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const lowerVal = sorted[lower] ?? 0;
    const upperVal = sorted[upper] ?? lowerVal;
    if (lower === upper) return lowerVal;
    return lowerVal + (upperVal - lowerVal) * (index - lower);
  };

  // Safe access since n > 0 is verified above
  const minVal = sorted[0] ?? 0;
  const maxVal = sorted[n - 1] ?? 0;

  return {
    mean,
    median: getPercentile(50),
    stdDev: Math.sqrt(variance),
    variance,
    min: minVal,
    max: maxVal,
    n,
    percentiles: {
      p5: getPercentile(5),
      p25: getPercentile(25),
      p50: getPercentile(50),
      p75: getPercentile(75),
      p95: getPercentile(95),
    },
  };
}

/**
 * Calculate regret analysis comparing actual decisions vs oracle (best possible).
 */
export function calculateRegret(
  decisions: readonly {
    readonly chosenModel: string;
    readonly actualReward: number;
    readonly rewards: Record<string, number>;
  }[]
): RegretAnalysis {
  if (decisions.length === 0) {
    return {
      cumulativeRegret: 0,
      avgRegret: 0,
      totalDecisions: 0,
      suboptimalDecisions: 0,
      optimalRate: 1,
      regretPerModel: {},
    };
  }

  let cumulativeRegret = 0;
  let suboptimalDecisions = 0;
  const modelRegrets: Record<string, number[]> = {};

  for (const decision of decisions) {
    const maxReward = Math.max(...Object.values(decision.rewards));
    const regret = maxReward - decision.actualReward;
    cumulativeRegret += regret;

    if (regret > 0.001) {
      suboptimalDecisions++;
    }

    // Track regret per model
    for (const [model, reward] of Object.entries(decision.rewards)) {
      const existing = modelRegrets[model];
      if (existing === undefined) {
        modelRegrets[model] = [maxReward - reward];
      } else {
        existing.push(maxReward - reward);
      }
    }
  }

  const regretPerModel: Record<string, number> = {};
  for (const [model, regrets] of Object.entries(modelRegrets)) {
    regretPerModel[model] = regrets.reduce((sum, r) => sum + r, 0) / regrets.length;
  }

  return {
    cumulativeRegret,
    avgRegret: cumulativeRegret / decisions.length,
    totalDecisions: decisions.length,
    suboptimalDecisions,
    optimalRate: (decisions.length - suboptimalDecisions) / decisions.length,
    regretPerModel,
  };
}

/**
 * Calculate win/loss analysis for a model.
 */
export function calculateWinLoss(
  model: string,
  decisions: readonly {
    readonly chosenModel: string;
    readonly actualReward: number;
    readonly rewards: Record<string, number>;
  }[],
  options: StatisticalOptions = {}
): WinLossAnalysis {
  let wins = 0;
  let losses = 0;
  let ties = 0;

  for (const decision of decisions) {
    const modelReward = decision.rewards[model];
    if (modelReward === undefined) continue;

    const maxReward = Math.max(...Object.values(decision.rewards));
    const minReward = Math.min(...Object.values(decision.rewards));

    if (Math.abs(modelReward - maxReward) < 0.001) {
      // Model tied for best
      const numAtMax = Object.values(decision.rewards).filter(
        (r) => Math.abs(r - maxReward) < 0.001
      ).length;
      if (numAtMax === 1) {
        wins++;
      } else {
        ties++;
      }
    } else if (Math.abs(modelReward - minReward) < 0.001) {
      losses++;
    } else {
      // Middle performer
      ties++;
    }
  }

  const total = wins + losses + ties;
  const winRate = total > 0 ? wins / total : 0;
  const winRateCI = proportionConfidenceInterval(wins, total, options);

  return {
    model,
    wins,
    losses,
    ties,
    winRate,
    winRateCI,
  };
}

/**
 * Calculate minimum sample size for detecting a difference in proportions.
 * Uses formula for two-proportion z-test power analysis.
 */
export function calculateMinSampleSize(
  baselineRate: number,
  minimumDetectableEffect: number,
  options: { power?: number; alpha?: number } = {}
): number {
  const power = options.power ?? 0.8;
  const alpha = options.alpha ?? 0.05;

  const p1 = baselineRate;
  const p2 = baselineRate + minimumDetectableEffect;
  const pBar = (p1 + p2) / 2;

  const zAlpha = getZScore(1 - alpha / 2);
  const zBeta = getZScore(power);

  const numerator =
    (zAlpha * Math.sqrt(2 * pBar * (1 - pBar)) +
      zBeta * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) **
    2;
  const denominator = (p1 - p2) ** 2;

  return Math.ceil(numerator / denominator);
}
