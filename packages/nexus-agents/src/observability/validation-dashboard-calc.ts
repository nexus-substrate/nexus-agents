/**
 * Validation Dashboard Calculation Helpers
 *
 * Statistical calculation functions for validation dashboard.
 *
 * @module observability/validation-dashboard-calc
 * (Source: Issue #273 - Learning Validation Dashboard)
 */

import type {
  LearningProgress,
  ModelPerformanceSummary,
  TaskTypePerformance,
  TimePeriod,
  DashboardOutcome,
} from './validation-dashboard-types.js';
import {
  proportionConfidenceInterval,
  calculateDistributionStats,
  calculateRegret,
  calculateWinLoss,
} from '../learning/validation-stats.js';

/** Get period time bounds. */
export function getPeriodBounds(period: TimePeriod): { start: number; end: number } {
  const now = Date.now();
  const end = now;
  let start: number;

  switch (period) {
    case '1h':
      start = now - 60 * 60 * 1000;
      break;
    case '24h':
      start = now - 24 * 60 * 60 * 1000;
      break;
    case '7d':
      start = now - 7 * 24 * 60 * 60 * 1000;
      break;
    case '30d':
      start = now - 30 * 24 * 60 * 60 * 1000;
      break;
    case 'all':
    default:
      start = 0;
      break;
  }

  return { start, end };
}

/** Get unique model names from outcomes. */
export function getUniqueModels(outcomes: readonly DashboardOutcome[]): readonly string[] {
  return [...new Set(outcomes.map((o) => o.model))].sort();
}

/** Get unique task types from outcomes. */
export function getUniqueTaskTypes(outcomes: readonly DashboardOutcome[]): readonly string[] {
  return [...new Set(outcomes.map((o) => o.taskType))].sort();
}

/** Calculate model performance metrics. */
export function calculateModelPerformance(
  model: string,
  outcomes: readonly DashboardOutcome[]
): ModelPerformanceSummary {
  const modelOutcomes = outcomes.filter((o) => o.model === model);
  const n = modelOutcomes.length;
  const successes = modelOutcomes.filter((o) => o.success).length;
  const rewards = modelOutcomes.map((o) => o.reward);
  const totalTokens = modelOutcomes.reduce((sum, o) => sum + o.tokensUsed, 0);

  const successRateCI = proportionConfidenceInterval(successes, n);
  const rewardStats = calculateDistributionStats(rewards);

  const comparableOutcomes = outcomes
    .filter((o) => o.allModelRewards !== undefined && model in o.allModelRewards)
    .map((o) => ({
      chosenModel: o.model,
      actualReward: o.reward,
      rewards: o.allModelRewards as Record<string, number>,
    }));
  const winLoss = calculateWinLoss(model, comparableOutcomes);

  const avgLatencyMs = n > 0 ? modelOutcomes.reduce((sum, o) => sum + o.latencyMs, 0) / n : 0;

  const costEfficiency = totalTokens > 0 ? rewardStats.mean / (totalTokens / 1000) : 0;

  return {
    model,
    n,
    successRate: successRateCI.estimate,
    successRateCI,
    avgReward: rewardStats.mean,
    rewardStats,
    avgLatencyMs,
    winRate: winLoss.winRate,
    winRateCI: winLoss.winRateCI,
    costEfficiency,
  };
}

/** Calculate task type performance metrics. */
export function calculateTaskTypePerformance(
  taskType: string,
  outcomes: readonly DashboardOutcome[],
  minSampleSize: number
): TaskTypePerformance {
  const taskOutcomes = outcomes.filter((o) => o.taskType === taskType);
  const models = getUniqueModels(taskOutcomes);

  const modelPerformance = models
    .map((model) => calculateModelPerformance(model, taskOutcomes))
    .filter((mp) => mp.n >= minSampleSize);

  const sorted = [...modelPerformance].sort((a, b) => b.successRate - a.successRate);

  return {
    taskType,
    modelPerformance,
    bestModel: sorted[0]?.model ?? '',
    worstModel: sorted[sorted.length - 1]?.model ?? '',
  };
}

/** Calculate learning progress metrics. */
export function calculateLearningProgress(
  outcomes: readonly DashboardOutcome[],
  explorationHistory: readonly { timestamp: number; rate: number }[],
  featureWeights: Record<string, number[]>
): LearningProgress {
  const recentExploration = explorationHistory.slice(-10);
  const explorationRate =
    recentExploration.length > 0
      ? recentExploration.reduce((sum, e) => sum + e.rate, 0) / recentExploration.length
      : 0;

  const olderExploration = explorationHistory.slice(-20, -10);
  const olderAvg =
    olderExploration.length > 0
      ? olderExploration.reduce((sum, e) => sum + e.rate, 0) / olderExploration.length
      : explorationRate;
  const explorationRateTrend = explorationRate - olderAvg;

  const comparableOutcomes = outcomes
    .filter((o) => o.allModelRewards !== undefined)
    .map((o) => ({
      chosenModel: o.model,
      actualReward: o.reward,
      rewards: o.allModelRewards as Record<string, number>,
    }));
  const regretAnalysis = calculateRegret(comparableOutcomes);

  const featureImportance = Object.entries(featureWeights)
    .map(([feature, weights]) => ({
      feature,
      importance: weights.reduce((sum, w) => sum + Math.abs(w), 0) / weights.length,
    }))
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 10);

  const convergenceScore = calculateConvergenceScore(featureWeights);

  return {
    explorationRate,
    explorationRateTrend,
    cumulativeRegret: regretAnalysis.cumulativeRegret,
    avgRegret: regretAnalysis.avgRegret,
    optimalRate: regretAnalysis.optimalRate,
    featureImportance,
    convergenceScore,
  };
}

/** Calculate convergence score from feature weight stability. */
export function calculateConvergenceScore(featureWeights: Record<string, number[]>): number {
  if (Object.keys(featureWeights).length === 0) {
    return 0;
  }

  const variances: number[] = [];
  for (const weights of Object.values(featureWeights)) {
    if (weights.length < 5) continue;
    const recent = weights.slice(-10);
    const mean = recent.reduce((s, w) => s + w, 0) / recent.length;
    const variance = recent.reduce((s, w) => s + (w - mean) ** 2, 0) / recent.length;
    variances.push(variance);
  }

  if (variances.length === 0) return 0;

  const avgVariance = variances.reduce((s, v) => s + v, 0) / variances.length;
  return Math.exp(-avgVariance);
}

/** Calculate average reward from outcomes. */
export function calculateAvgReward(outcomes: readonly DashboardOutcome[]): number {
  if (outcomes.length === 0) return 0;
  return outcomes.reduce((sum, o) => sum + o.reward, 0) / outcomes.length;
}

/** Compute overall health score from indicators. */
export function computeHealthScore(
  hasMinimumData: boolean,
  isLearning: boolean,
  healthyExploration: boolean,
  noUnderperformers: boolean
): number {
  const scores = [
    hasMinimumData ? 1 : 0.5,
    isLearning ? 1 : 0.5,
    healthyExploration ? 1 : 0.7,
    noUnderperformers ? 1 : 0.8,
  ];
  return scores.reduce((sum, s) => sum + s, 0) / 4;
}
