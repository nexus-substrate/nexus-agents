/**
 * nexus-agents/testing/framework - Test Metrics
 *
 * Metrics computation utilities for test results.
 *
 * (Source: cli-project_plan.md v2.1.0, Phase 3)
 */

import type { CliName } from '../../cli-adapters/types.js';
import { DEFAULT_CLI } from '../../config/model-capabilities-types.js';
import type {
  TaskTestResult,
  AggregatedMetrics,
  CliMetrics,
  CategoryMetrics,
  DifficultyMetrics,
  TaskCategory,
  TaskDifficulty,
} from './types.js';

/**
 * Groups items by a key extractor function.
 */
export function groupBy<T, K>(items: readonly T[], keyFn: (item: T) => K): Map<K, T[]> {
  const grouped = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const group = grouped.get(key);
    if (group !== undefined) {
      group.push(item);
    } else {
      grouped.set(key, [item]);
    }
  }
  return grouped;
}

/**
 * Calculates the mean of an array of numbers.
 */
export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((acc, val) => acc + val, 0);
  return sum / values.length;
}

/**
 * Calculates the standard deviation of an array of numbers.
 */
export function stdDev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const squaredDiffs = values.map((v) => (v - avg) ** 2);
  return Math.sqrt(mean(squaredDiffs));
}

/**
 * Creates empty aggregated metrics.
 */
export function createEmptyMetrics(): AggregatedMetrics {
  return {
    totalTasks: 0,
    successfulTasks: 0,
    failedTasks: 0,
    successRate: 0,
    averageScore: 0,
    scoreStdDev: 0,
    totalDurationMs: 0,
    averageDurationMs: 0,
    totalTokens: 0,
    totalCostUsd: 0,
    byCliMetrics: new Map(),
    byCategoryMetrics: new Map(),
    byDifficultyMetrics: new Map(),
  };
}

/**
 * Computes per-CLI metrics from test results.
 */
export function computeCliMetrics(results: readonly TaskTestResult[]): Map<CliName, CliMetrics> {
  const byCli = groupBy(results, (r) => r.cli);
  const metrics = new Map<CliName, CliMetrics>();

  for (const [cli, cliResults] of byCli) {
    const taskCount = cliResults.length;
    const successCount = cliResults.filter((r) => r.success).length;
    const successRate = taskCount > 0 ? successCount / taskCount : 0;

    const scores = cliResults.filter((r) => r.success).map((r) => r.rubricScore.overallScore);
    const averageScore = scores.length > 0 ? mean(scores) : 0;

    const totalDuration = cliResults.reduce((sum, r) => sum + r.durationMs, 0);
    const averageDurationMs = taskCount > 0 ? totalDuration / taskCount : 0;

    const totalTokens = cliResults.reduce(
      (sum, r) => sum + r.tokenUsage.inputTokens + r.tokenUsage.outputTokens,
      0
    );
    const totalCostUsd = cliResults.reduce((sum, r) => sum + r.costUsd, 0);

    metrics.set(cli, {
      cli,
      taskCount,
      successRate,
      averageScore,
      averageDurationMs,
      totalTokens,
      totalCostUsd,
    });
  }

  return metrics;
}

/**
 * Computes per-category metrics from test results.
 */
export function computeCategoryMetrics(
  results: readonly TaskTestResult[]
): Map<TaskCategory, CategoryMetrics> {
  const byCategory = groupBy(results, (r) => r.task.category);
  const metrics = new Map<TaskCategory, CategoryMetrics>();

  for (const [category, catResults] of byCategory) {
    const taskCount = catResults.length;
    const successCount = catResults.filter((r) => r.success).length;
    const successRate = taskCount > 0 ? successCount / taskCount : 0;

    const scores = catResults.filter((r) => r.success).map((r) => r.rubricScore.overallScore);
    const averageScore = scores.length > 0 ? mean(scores) : 0;

    // Determine best CLI for this category
    const cliScores = new Map<CliName, number[]>();
    for (const r of catResults) {
      const existing = cliScores.get(r.cli);
      if (existing !== undefined) {
        existing.push(r.rubricScore.overallScore);
      } else {
        cliScores.set(r.cli, [r.rubricScore.overallScore]);
      }
    }

    let bestCli: CliName = DEFAULT_CLI;
    let bestAvg = -1;
    for (const [cli, cliResultScores] of cliScores) {
      const avg = mean(cliResultScores);
      if (avg > bestAvg) {
        bestAvg = avg;
        bestCli = cli;
      }
    }

    metrics.set(category, {
      category,
      taskCount,
      successRate,
      averageScore,
      bestCli,
    });
  }

  return metrics;
}

/**
 * Computes per-difficulty metrics from test results.
 */
export function computeDifficultyMetrics(
  results: readonly TaskTestResult[]
): Map<TaskDifficulty, DifficultyMetrics> {
  const byDifficulty = groupBy(results, (r) => r.task.difficulty);
  const metrics = new Map<TaskDifficulty, DifficultyMetrics>();

  for (const [difficulty, diffResults] of byDifficulty) {
    const taskCount = diffResults.length;
    const successCount = diffResults.filter((r) => r.success).length;
    const successRate = taskCount > 0 ? successCount / taskCount : 0;

    const scores = diffResults.filter((r) => r.success).map((r) => r.rubricScore.overallScore);
    const averageScore = scores.length > 0 ? mean(scores) : 0;

    metrics.set(difficulty, {
      difficulty,
      taskCount,
      successRate,
      averageScore,
    });
  }

  return metrics;
}

/**
 * Computes routing metrics from test results.
 */
export function computeRoutingMetrics(results: readonly TaskTestResult[]): {
  accuracy?: number;
  confidence?: number;
} {
  const withRouting = results.filter((r) => r.routingScore !== undefined);
  if (withRouting.length === 0) {
    return {};
  }

  const matchedPreferred = withRouting.filter(
    (r) => r.routingScore?.matchedPreferred === true
  ).length;
  const accuracy = matchedPreferred / withRouting.length;

  const confidences = withRouting
    .map((r) => r.routingScore?.confidenceCalibration)
    .filter((c): c is number => c !== undefined);

  // Build result conditionally to satisfy exactOptionalPropertyTypes
  const result: { accuracy?: number; confidence?: number } = { accuracy };
  if (confidences.length > 0) {
    result.confidence = mean(confidences);
  }
  return result;
}

/**
 * Estimates cost for token usage.
 */
export function estimateCost(
  cli: CliName,
  usage: { inputTokens: number; outputTokens: number }
): number {
  // Cost per 1M tokens (approximate)
  const costs: Record<CliName, { input: number; output: number }> = {
    claude: { input: 3.0, output: 15.0 },
    gemini: { input: 0.075, output: 0.3 },
    codex: { input: 2.0, output: 8.0 },
  };

  const rate = costs[cli];
  const inputCost = (usage.inputTokens / 1_000_000) * rate.input;
  const outputCost = (usage.outputTokens / 1_000_000) * rate.output;

  return inputCost + outputCost;
}

/** Core metrics computed from test results. */
interface CoreMetrics {
  readonly totalTasks: number;
  readonly successfulTasks: number;
  readonly failedTasks: number;
  readonly successRate: number;
  readonly averageScore: number;
  readonly scoreStdDev: number;
  readonly totalDurationMs: number;
  readonly averageDurationMs: number;
  readonly totalTokens: number;
  readonly totalCostUsd: number;
}

/**
 * Computes core metrics (counts, rates, durations, costs) from results.
 */
function computeCoreMetrics(results: readonly TaskTestResult[]): CoreMetrics {
  const totalTasks = results.length;
  const successfulTasks = results.filter((r) => r.success).length;
  const scores = results.filter((r) => r.success).map((r) => r.rubricScore.overallScore);
  const totalDurationMs = results.reduce((sum, r) => sum + r.durationMs, 0);
  const totalTokens = results.reduce(
    (sum, r) => sum + r.tokenUsage.inputTokens + r.tokenUsage.outputTokens,
    0
  );

  return {
    totalTasks,
    successfulTasks,
    failedTasks: totalTasks - successfulTasks,
    successRate: successfulTasks / totalTasks,
    averageScore: scores.length > 0 ? mean(scores) : 0,
    scoreStdDev: scores.length > 1 ? stdDev(scores) : 0,
    totalDurationMs,
    averageDurationMs: totalDurationMs / totalTasks,
    totalTokens,
    totalCostUsd: results.reduce((sum, r) => sum + r.costUsd, 0),
  };
}

/**
 * Assembles final metrics with optional routing data.
 */
function assembleAggregatedMetrics(
  core: CoreMetrics,
  byCliMetrics: Map<CliName, CliMetrics>,
  byCategoryMetrics: Map<TaskCategory, CategoryMetrics>,
  byDifficultyMetrics: Map<TaskDifficulty, DifficultyMetrics>,
  routingMetrics: { accuracy?: number; confidence?: number }
): AggregatedMetrics {
  const baseMetrics: AggregatedMetrics = {
    ...core,
    byCliMetrics,
    byCategoryMetrics,
    byDifficultyMetrics,
  };

  if (routingMetrics.accuracy !== undefined) {
    return {
      ...baseMetrics,
      routingAccuracy: routingMetrics.accuracy,
      ...(routingMetrics.confidence !== undefined && {
        averageRoutingConfidence: routingMetrics.confidence,
      }),
    };
  }

  return baseMetrics;
}

/**
 * Computes aggregated metrics from test results.
 */
export function computeAggregatedMetrics(results: readonly TaskTestResult[]): AggregatedMetrics {
  if (results.length === 0) {
    return createEmptyMetrics();
  }

  const core = computeCoreMetrics(results);
  return assembleAggregatedMetrics(
    core,
    computeCliMetrics(results),
    computeCategoryMetrics(results),
    computeDifficultyMetrics(results),
    computeRoutingMetrics(results)
  );
}
