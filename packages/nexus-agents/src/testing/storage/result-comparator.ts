/**
 * nexus-agents/testing/storage - Result Comparator
 *
 * Compares test runs to detect regressions and improvements.
 * Supports configurable thresholds for quality, latency, routing accuracy,
 * and reliability metrics.
 */

import type { TaskTestResult, ExtendedTestRunResult } from '../schemas.js';

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
    const currentTasks = this.buildTaskMap(current.taskResults);
    const previousTasks = this.buildTaskMap(previous.taskResults);

    const regressions: Regression[] = [];
    const improvements: Improvement[] = [];
    let unchanged = 0;

    // Find new and removed tasks
    const currentTaskIds = new Set(currentTasks.keys());
    const previousTaskIds = new Set(previousTasks.keys());

    const newTaskIds = [...currentTaskIds].filter((id) => !previousTaskIds.has(id));
    const removedTaskIds = [...previousTaskIds].filter((id) => !currentTaskIds.has(id));
    const commonTaskIds = [...currentTaskIds].filter((id) => previousTaskIds.has(id));

    // Compare common tasks
    for (const taskId of commonTaskIds) {
      const currentTask = currentTasks.get(taskId);
      const previousTask = previousTasks.get(taskId);

      if (currentTask === undefined || previousTask === undefined) {
        continue;
      }

      const comparison = this.compareTask(currentTask, previousTask);

      if (comparison.regressions.length > 0) {
        regressions.push(...comparison.regressions);
      }

      if (comparison.improvements.length > 0) {
        improvements.push(...comparison.improvements);
      }

      // Task is unchanged if no regressions or improvements detected
      if (comparison.regressions.length === 0 && comparison.improvements.length === 0) {
        unchanged++;
      }
    }

    const overallTrend = this.determineOverallTrend(regressions, improvements);

    return {
      previousRunId: previous.id,
      currentRunId: current.id,
      regressions,
      improvements,
      unchanged,
      newTasks: newTaskIds.length,
      removedTasks: removedTaskIds.length,
      overallTrend,
    };
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
   * Build a map of task ID to task result for efficient lookup.
   */
  private buildTaskMap(tasks: readonly TaskTestResult[]): Map<string, TaskTestResult> {
    const map = new Map<string, TaskTestResult>();
    for (const task of tasks) {
      map.set(task.taskId, task);
    }
    return map;
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

      const percentChange = this.calculatePercentChange(currentValue, previousValue);
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
        regression: this.createRegression(
          task,
          metric.name,
          previousValue,
          currentValue,
          degradation
        ),
      };
    }

    if (isImprovement) {
      const improvement = metric.higherIsBetter ? percentChange : Math.abs(percentChange);
      return {
        improvement: this.createImprovement(
          task,
          metric.name,
          previousValue,
          currentValue,
          improvement
        ),
      };
    }

    return {};
  }

  /**
   * Create a regression object.
   */
  private createRegression(
    task: TaskTestResult,
    metricName: string,
    previousValue: number,
    currentValue: number,
    degradation: number
  ): Regression {
    return {
      taskId: task.taskId,
      taskName: task.taskName,
      metric: metricName,
      previousValue,
      currentValue,
      degradation,
      severity: this.determineSeverity(degradation, metricName),
    };
  }

  /**
   * Create an improvement object.
   */
  private createImprovement(
    task: TaskTestResult,
    metricName: string,
    previousValue: number,
    currentValue: number,
    improvement: number
  ): Improvement {
    return {
      taskId: task.taskId,
      taskName: task.taskName,
      metric: metricName,
      previousValue,
      currentValue,
      improvement,
    };
  }

  /**
   * Calculate percentage change between current and previous values.
   * Positive value means current is higher than previous.
   *
   * @returns Percentage change (e.g., 10 means 10% increase)
   */
  private calculatePercentChange(current: number, previous: number): number {
    if (previous === 0) {
      return current > 0 ? 100 : 0;
    }
    return ((current - previous) / previous) * 100;
  }

  /**
   * Determine severity based on degradation amount and metric type.
   */
  private determineSeverity(degradation: number, metric: string): 'critical' | 'warning' | 'minor' {
    // Critical thresholds vary by metric
    const criticalThresholds: Record<string, number> = {
      qualityScore: 20,
      latencyMs: 100,
      routingAccuracy: 30,
      reliability: 15,
    };

    const warningThresholds: Record<string, number> = {
      qualityScore: 10,
      latencyMs: 50,
      routingAccuracy: 20,
      reliability: 10,
    };

    const criticalThreshold = criticalThresholds[metric] ?? 25;
    const warningThreshold = warningThresholds[metric] ?? 15;

    if (degradation >= criticalThreshold) {
      return 'critical';
    }

    if (degradation >= warningThreshold) {
      return 'warning';
    }

    return 'minor';
  }

  /**
   * Determine overall trend from regressions and improvements.
   * Uses a weighted scoring system where critical regressions count more.
   */
  private determineOverallTrend(
    regressions: readonly Regression[],
    improvements: readonly Improvement[]
  ): 'improved' | 'regressed' | 'stable' {
    // Calculate regression score with severity weighting
    let regressionScore = 0;
    for (const regression of regressions) {
      switch (regression.severity) {
        case 'critical':
          regressionScore += 3;
          break;
        case 'warning':
          regressionScore += 2;
          break;
        case 'minor':
          regressionScore += 1;
          break;
      }
    }

    // Calculate improvement score (each improvement counts as 1)
    const improvementScore = improvements.length;

    // Determine trend based on score difference
    const scoreDiff = improvementScore - regressionScore;

    // If there are any critical regressions, trend is regressed
    const hasCritical = regressions.some((r) => r.severity === 'critical');
    if (hasCritical) {
      return 'regressed';
    }

    // Use thresholds to determine trend
    if (scoreDiff > 0) {
      return 'improved';
    }

    if (scoreDiff < 0) {
      return 'regressed';
    }

    return 'stable';
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
