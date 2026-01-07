/**
 * nexus-agents/testing - Routing Scorer
 *
 * Calculates routing accuracy metrics for CLI task delegation.
 * Evaluates how well the routing system selects optimal CLIs for tasks.
 */

import type {
  CliName,
  TaskTestResult,
  RoutingMetrics,
  RoutingResult,
  TaskCategory,
  CliRoutingStats,
} from '../types.js';
import { TaskCategory as TaskCategoryEnum } from '../types.js';

/**
 * All available CLI names for iteration.
 */
const ALL_CLIS: readonly CliName[] = ['claude', 'gemini', 'codex'] as const;

/**
 * All available task categories for iteration.
 */
const ALL_CATEGORIES: readonly TaskCategory[] = Object.values(TaskCategoryEnum) as TaskCategory[];

/**
 * Gets the current timestamp in America/New_York timezone as ISO 8601.
 */
function getCurrentTimestamp(): string {
  return new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/**
 * Calculates percentage with proper handling of zero totals.
 * @param count - Number of successes
 * @param total - Total number of items
 * @returns Percentage from 0-100, or 0 if total is 0
 */
function calculatePercentage(count: number, total: number): number {
  if (total === 0) {
    return 0;
  }
  return Math.round((count / total) * 10000) / 100;
}

/**
 * Evaluates a single routing decision.
 *
 * @param selectedCli - CLI that was selected by the router
 * @param optimalCli - Ground truth optimal CLI for the task
 * @param acceptableClis - List of acceptable CLIs for the task
 * @param routingReason - Reason the router gave for the selection
 * @returns Evaluation result with optimality and acceptability flags
 */
export function evaluateRouting(
  selectedCli: CliName,
  optimalCli: CliName,
  acceptableClis: readonly CliName[],
  routingReason: string
): RoutingResult {
  const isOptimal = selectedCli === optimalCli;
  const isAcceptable = isOptimal || acceptableClis.includes(selectedCli);

  return {
    selectedCli,
    optimalCli,
    isOptimal,
    isAcceptable,
    routingReason,
  };
}

/**
 * Initializes empty CLI stats for all CLIs.
 */
function createEmptyCliStats(): Record<CliName, CliRoutingStats> {
  const stats: Record<CliName, CliRoutingStats> = {} as Record<CliName, CliRoutingStats>;
  for (const cli of ALL_CLIS) {
    stats[cli] = {
      selected: 0,
      optimal: 0,
      acceptableWhenSelected: 0,
    };
  }
  return stats;
}

/**
 * Initializes empty category stats for all categories.
 */
function createEmptyCategoryStats(): Record<TaskCategory, number> {
  const stats: Record<TaskCategory, number> = {} as Record<TaskCategory, number>;
  for (const category of ALL_CATEGORIES) {
    stats[category] = 0;
  }
  return stats;
}

/**
 * Creates a mutable copy of CLI stats for aggregation.
 */
interface MutableCliStats {
  selected: number;
  optimal: number;
  acceptableWhenSelected: number;
}

/**
 * Groups test results by category.
 */
function groupByCategory(results: readonly TaskTestResult[]): Map<TaskCategory, TaskTestResult[]> {
  const grouped = new Map<TaskCategory, TaskTestResult[]>();

  for (const category of ALL_CATEGORIES) {
    grouped.set(category, []);
  }

  for (const result of results) {
    const categoryResults = grouped.get(result.category);
    if (categoryResults) {
      categoryResults.push(result);
    }
  }

  return grouped;
}

/**
 * Calculates accuracy rate for a set of test results.
 */
function calculateCategoryAccuracy(results: readonly TaskTestResult[]): number {
  if (results.length === 0) {
    return 0;
  }
  const optimalCount = results.filter((r) => r.isOptimal).length;
  return calculatePercentage(optimalCount, results.length);
}

/**
 * Creates empty routing metrics.
 */
function createEmptyMetrics(): RoutingMetrics {
  return {
    totalTasks: 0,
    optimalCount: 0,
    acceptableCount: 0,
    optimalRate: 0,
    acceptableRate: 0,
    byCategory: createEmptyCategoryStats(),
    byCli: createEmptyCliStats(),
    calculatedAt: getCurrentTimestamp(),
  };
}

/**
 * Aggregates CLI stats from results.
 */
function aggregateCliStats(results: readonly TaskTestResult[]): {
  cliStats: Record<CliName, MutableCliStats>;
  optimalCount: number;
  acceptableCount: number;
} {
  const cliStats: Record<CliName, MutableCliStats> = {} as Record<CliName, MutableCliStats>;
  for (const cli of ALL_CLIS) {
    cliStats[cli] = { selected: 0, optimal: 0, acceptableWhenSelected: 0 };
  }

  let optimalCount = 0;
  let acceptableCount = 0;

  for (const result of results) {
    if (result.isOptimal) optimalCount++;
    if (result.isAcceptable) acceptableCount++;

    const selectedStats = cliStats[result.selectedCli];
    selectedStats.selected++;
    if (result.isAcceptable) selectedStats.acceptableWhenSelected++;
    cliStats[result.optimalCli].optimal++;
  }

  return { cliStats, optimalCount, acceptableCount };
}

/**
 * Converts mutable CLI stats to readonly.
 */
function toReadonlyCliStats(
  mutableStats: Record<CliName, MutableCliStats>
): Record<CliName, CliRoutingStats> {
  const byCli: Record<CliName, CliRoutingStats> = {} as Record<CliName, CliRoutingStats>;
  for (const cli of ALL_CLIS) {
    byCli[cli] = { ...mutableStats[cli] };
  }
  return byCli;
}

/**
 * Calculates per-category accuracy.
 */
function calculateCategoryStats(results: readonly TaskTestResult[]): Record<TaskCategory, number> {
  const grouped = groupByCategory(results);
  const byCategory: Record<TaskCategory, number> = {} as Record<TaskCategory, number>;
  for (const category of ALL_CATEGORIES) {
    const categoryResults = grouped.get(category) ?? [];
    byCategory[category] = calculateCategoryAccuracy(categoryResults);
  }
  return byCategory;
}

/**
 * Calculates aggregate routing metrics from test results.
 *
 * @param results - Array of task test results to analyze
 * @returns Routing metrics including accuracy rates and per-CLI stats
 */
export function calculateRoutingMetrics(results: readonly TaskTestResult[]): RoutingMetrics {
  const totalTasks = results.length;
  if (totalTasks === 0) {
    return createEmptyMetrics();
  }

  const { cliStats, optimalCount, acceptableCount } = aggregateCliStats(results);

  return {
    totalTasks,
    optimalCount,
    acceptableCount,
    optimalRate: calculatePercentage(optimalCount, totalTasks),
    acceptableRate: calculatePercentage(acceptableCount, totalTasks),
    byCategory: calculateCategoryStats(results),
    byCli: toReadonlyCliStats(cliStats),
    calculatedAt: getCurrentTimestamp(),
  };
}

/**
 * Gets routing accuracy broken down by task category.
 *
 * @param results - Array of task test results
 * @returns Record mapping each category to its optimal routing percentage
 */
export function getByCategory(results: readonly TaskTestResult[]): Record<TaskCategory, number> {
  const grouped = groupByCategory(results);
  const byCategory: Record<TaskCategory, number> = {} as Record<TaskCategory, number>;

  for (const category of ALL_CATEGORIES) {
    const categoryResults = grouped.get(category) ?? [];
    byCategory[category] = calculateCategoryAccuracy(categoryResults);
  }

  return byCategory;
}

/**
 * Gets CLI selection statistics from test results.
 *
 * @param results - Array of task test results
 * @returns Record mapping each CLI to its selection statistics
 */
export function getCliStats(results: readonly TaskTestResult[]): Record<CliName, CliRoutingStats> {
  const stats: Record<CliName, MutableCliStats> = {} as Record<CliName, MutableCliStats>;

  for (const cli of ALL_CLIS) {
    stats[cli] = { selected: 0, optimal: 0, acceptableWhenSelected: 0 };
  }

  for (const result of results) {
    stats[result.selectedCli].selected++;
    stats[result.optimalCli].optimal++;
    if (result.isAcceptable) {
      stats[result.selectedCli].acceptableWhenSelected++;
    }
  }

  // Convert to readonly
  const result: Record<CliName, CliRoutingStats> = {} as Record<CliName, CliRoutingStats>;
  for (const cli of ALL_CLIS) {
    result[cli] = {
      selected: stats[cli].selected,
      optimal: stats[cli].optimal,
      acceptableWhenSelected: stats[cli].acceptableWhenSelected,
    };
  }

  return result;
}

/**
 * Routing scorer class for evaluating CLI task routing decisions.
 *
 * Provides methods to evaluate individual routing decisions and
 * calculate aggregate metrics from test results.
 */
export class RoutingScorer {
  /**
   * Evaluates a single routing decision.
   *
   * @param selectedCli - CLI that was selected by the router
   * @param optimalCli - Ground truth optimal CLI for the task
   * @param acceptableClis - List of acceptable CLIs for the task
   * @param routingReason - Reason the router gave for the selection
   * @returns Evaluation result with optimality and acceptability flags
   */
  evaluateRouting(
    selectedCli: CliName,
    optimalCli: CliName,
    acceptableClis: readonly CliName[],
    routingReason: string
  ): RoutingResult {
    return evaluateRouting(selectedCli, optimalCli, acceptableClis, routingReason);
  }

  /**
   * Calculates aggregate routing metrics from all test results.
   *
   * @param results - Array of task test results to analyze
   * @returns Routing metrics including accuracy rates and per-CLI stats
   */
  calculateRoutingMetrics(results: readonly TaskTestResult[]): RoutingMetrics {
    return calculateRoutingMetrics(results);
  }

  /**
   * Gets routing accuracy broken down by task category.
   *
   * @param results - Array of task test results
   * @returns Record mapping each category to its optimal routing percentage
   */
  getByCategory(results: readonly TaskTestResult[]): Record<TaskCategory, number> {
    return getByCategory(results);
  }

  /**
   * Gets CLI selection statistics from test results.
   *
   * @param results - Array of task test results
   * @returns Record mapping each CLI to its selection statistics
   */
  getCliStats(results: readonly TaskTestResult[]): Record<CliName, CliRoutingStats> {
    return getCliStats(results);
  }
}
