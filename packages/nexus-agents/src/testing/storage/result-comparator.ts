/**
 * nexus-agents/testing/storage - Result Comparator
 *
 * Compares test runs to detect regressions and improvements.
 * Supports configurable thresholds for quality, latency, routing accuracy,
 * and reliability metrics.
 */

import type { TaskTestResult, ExtendedTestRunResult } from '../schemas.js';
import {
  calculatePercentChange,
  determineOverallTrend,
  buildTaskMap,
  createRegression,
  createImprovement,
} from './result-comparator-helpers.js';

/**
 * A detected regression between test runs.
 */
export interface Regression {
  readonly taskId: string;
  readonly taskName: string;
  readonly metric: string;
  readonly previousValue: number;
  readonly currentValue: number;
  /** Percentage degradation (positive value indicates worse performance) */
  readonly degradation: number;
  readonly severity: 'critical' | 'warning' | 'minor';
}

/**
 * A detected improvement between test runs.
 */
export interface Improvement {
  readonly taskId: string;
  readonly taskName: string;
  readonly metric: string;
  readonly previousValue: number;
  readonly currentValue: number;
  /** Percentage improvement (positive value indicates better performance) */
  readonly improvement: number;
}

/**
 * Complete comparison between two test runs.
 */
export interface RunComparison {
  readonly previousRunId: string;
  readonly currentRunId: string;
  readonly regressions: readonly Regression[];
  readonly improvements: readonly Improvement[];
  /** Number of tasks with no significant change */
  readonly unchanged: number;
  /** Number of tasks in current run not in previous */
  readonly newTasks: number;
  /** Number of tasks in previous run not in current */
  readonly removedTasks: number;
  readonly overallTrend: 'improved' | 'regressed' | 'stable';
}

/**
 * Thresholds for detecting regressions.
 * Values represent percentage change required to flag as regression.
 */
export interface ComparisonThresholds {
  /** Percentage drop in quality score to flag as regression */
  readonly qualityDegradation: number;
  /** Percentage increase in latency to flag as regression */
  readonly latencyIncrease: number;
  /** Percentage drop in routing accuracy to flag as regression */
  readonly routingAccuracyDrop: number;
  /** Percentage drop in reliability to flag as regression */
  readonly reliabilityDrop: number;
}

/**
 * Default thresholds for regression detection.
 * These values represent reasonable defaults for most use cases.
 */
export const DEFAULT_THRESHOLDS: ComparisonThresholds = {
  qualityDegradation: 5,
  latencyIncrease: 20,
  routingAccuracyDrop: 10,
  reliabilityDrop: 5,
};

/**
 * Metric definition for comparison.
 */
interface MetricDefinition {
  readonly name: string;
  readonly threshold: number;
  /** Whether higher is better (true) or lower is better (false) */
  readonly higherIsBetter: boolean;
  readonly getValue: (task: TaskTestResult) => number;
}

/**
 * Internal result from comparing a single task.
 */
interface TaskComparisonResult {
  readonly regressions: Regression[];
  readonly improvements: Improvement[];
}

/**
 * Compares test runs to detect regressions and improvements.
 *
 * @example
 * ```typescript
 * const comparator = new ResultComparator();
 * const comparison = comparator.compare(currentRun, previousRun);
 *
 * if (comparison.overallTrend === 'regressed') {
 *   console.log('Regressions detected:', comparison.regressions);
 * }
 * ```
 */
export class ResultComparator {
  private readonly thresholds: ComparisonThresholds;
  private readonly metricDefinitions: readonly MetricDefinition[];

  constructor(thresholds: ComparisonThresholds = DEFAULT_THRESHOLDS) {
    this.thresholds = thresholds;
    this.metricDefinitions = this.buildMetricDefinitions();
  }

  /**
   * Compare two test runs and identify regressions and improvements.
   *
   * @param current - The current (newer) test run
   * @param previous - The previous (older) test run for baseline
   * @returns Comparison results with regressions, improvements, and trend
   */
  compare(current: ExtendedTestRunResult, previous: ExtendedTestRunResult): RunComparison {
    const currentTasks = buildTaskMap(current.taskResults);
    const previousTasks = buildTaskMap(previous.taskResults);

    const { newTaskIds, removedTaskIds, commonTaskIds } = this.categorizeTaskIds(
      currentTasks,
      previousTasks
    );

    const { regressions, improvements, unchanged } = this.compareCommonTasks(
      commonTaskIds,
      currentTasks,
      previousTasks
    );

    return {
      previousRunId: previous.id,
      currentRunId: current.id,
      regressions,
      improvements,
      unchanged,
      newTasks: newTaskIds.length,
      removedTasks: removedTaskIds.length,
      overallTrend: determineOverallTrend(regressions, improvements),
    };
  }

  /**
   * Categorize task IDs into new, removed, and common sets.
   */
  private categorizeTaskIds(
    currentTasks: Map<string, TaskTestResult>,
    previousTasks: Map<string, TaskTestResult>
  ): { newTaskIds: string[]; removedTaskIds: string[]; commonTaskIds: string[] } {
    const currentTaskIds = new Set(currentTasks.keys());
    const previousTaskIds = new Set(previousTasks.keys());

    return {
      newTaskIds: [...currentTaskIds].filter((id) => !previousTaskIds.has(id)),
      removedTaskIds: [...previousTaskIds].filter((id) => !currentTaskIds.has(id)),
      commonTaskIds: [...currentTaskIds].filter((id) => previousTaskIds.has(id)),
    };
  }

  /**
   * Compare tasks that exist in both runs.
   */
  private compareCommonTasks(
    commonTaskIds: readonly string[],
    currentTasks: Map<string, TaskTestResult>,
    previousTasks: Map<string, TaskTestResult>
  ): { regressions: Regression[]; improvements: Improvement[]; unchanged: number } {
    const regressions: Regression[] = [];
    const improvements: Improvement[] = [];
    let unchanged = 0;

    for (const taskId of commonTaskIds) {
      const currentTask = currentTasks.get(taskId);
      const previousTask = previousTasks.get(taskId);
      if (currentTask === undefined || previousTask === undefined) continue;

      const comparison = this.compareTask(currentTask, previousTask);
      regressions.push(...comparison.regressions);
      improvements.push(...comparison.improvements);

      if (comparison.regressions.length === 0 && comparison.improvements.length === 0) {
        unchanged++;
      }
    }

    return { regressions, improvements, unchanged };
  }

  /**
   * Build metric definitions based on current thresholds.
   */
  private buildMetricDefinitions(): MetricDefinition[] {
    return [
      {
        name: 'qualityScore',
        threshold: this.thresholds.qualityDegradation,
        higherIsBetter: true,
        getValue: (task) => task.metrics.qualityScore,
      },
      {
        name: 'latencyMs',
        threshold: this.thresholds.latencyIncrease,
        higherIsBetter: false,
        getValue: (task) => task.metrics.latencyMs,
      },
      {
        name: 'routingAccuracy',
        threshold: this.thresholds.routingAccuracyDrop,
        higherIsBetter: true,
        getValue: (task) => task.metrics.routingAccuracy,
      },
      {
        name: 'reliability',
        threshold: this.thresholds.reliabilityDrop,
        higherIsBetter: true,
        getValue: (task) => task.metrics.reliability,
      },
    ];
  }

  /**
   * Compare individual task results.
   */
  private compareTask(current: TaskTestResult, previous: TaskTestResult): TaskComparisonResult {
    const regressions: Regression[] = [];
    const improvements: Improvement[] = [];

    for (const metric of this.metricDefinitions) {
      const currentValue = metric.getValue(current);
      const previousValue = metric.getValue(previous);

      // Skip comparison if previous value is 0 (avoid division by zero)
      if (previousValue === 0) {
        continue;
      }

      const percentChange = calculatePercentChange(currentValue, previousValue);
      const result = this.evaluateMetricChange(
        current,
        metric,
        previousValue,
        currentValue,
        percentChange
      );

      if (result.regression !== undefined) {
        regressions.push(result.regression);
      }
      if (result.improvement !== undefined) {
        improvements.push(result.improvement);
      }
    }

    return { regressions, improvements };
  }

  /**
   * Evaluate a single metric change and return regression/improvement if significant.
   */
  private evaluateMetricChange(
    task: TaskTestResult,
    metric: MetricDefinition,
    previousValue: number,
    currentValue: number,
    percentChange: number
  ): { regression?: Regression; improvement?: Improvement } {
    const isRegression = metric.higherIsBetter
      ? percentChange < -metric.threshold
      : percentChange > metric.threshold;

    const isImprovement = metric.higherIsBetter
      ? percentChange > metric.threshold
      : percentChange < -metric.threshold;

    if (isRegression) {
      const degradation = metric.higherIsBetter ? Math.abs(percentChange) : percentChange;
      return {
        regression: createRegression(task, metric.name, previousValue, currentValue, degradation),
      };
    }

    if (isImprovement) {
      const improvementPct = metric.higherIsBetter ? percentChange : Math.abs(percentChange);
      return {
        improvement: createImprovement(
          task,
          metric.name,
          previousValue,
          currentValue,
          improvementPct
        ),
      };
    }

    return {};
  }
}

/**
 * Creates a new ResultComparator with default thresholds.
 *
 * @returns A new ResultComparator instance
 */
export function createResultComparator(thresholds?: ComparisonThresholds): ResultComparator {
  return new ResultComparator(thresholds);
}
