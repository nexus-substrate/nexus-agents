/**
 * nexus-agents/testing/storage - Result Comparator Helper Functions
 *
 * Pure helper functions for result comparison operations.
 * Extracted from result-comparator.ts to maintain file size limits.
 */

import type { TaskTestResult } from '../schemas.js';
import type { Regression, Improvement } from './result-comparator.js';

/**
 * Critical thresholds by metric for severity determination.
 */
const CRITICAL_THRESHOLDS: Record<string, number> = {
  qualityScore: 20,
  latencyMs: 100,
  routingAccuracy: 30,
  reliability: 15,
};

/**
 * Warning thresholds by metric for severity determination.
 */
const WARNING_THRESHOLDS: Record<string, number> = {
  qualityScore: 10,
  latencyMs: 50,
  routingAccuracy: 20,
  reliability: 10,
};

/**
 * Calculate percentage change between current and previous values.
 * Positive value means current is higher than previous.
 *
 * @param current - Current value
 * @param previous - Previous value (baseline)
 * @returns Percentage change (e.g., 10 means 10% increase)
 */
export function calculatePercentChange(current: number, previous: number): number {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }
  return ((current - previous) / previous) * 100;
}

/**
 * Determine severity based on degradation amount and metric type.
 *
 * @param degradation - The degradation percentage
 * @param metric - The metric name
 * @returns Severity level
 */
export function determineSeverity(
  degradation: number,
  metric: string
): 'critical' | 'warning' | 'minor' {
  const criticalThreshold = CRITICAL_THRESHOLDS[metric] ?? 25;
  const warningThreshold = WARNING_THRESHOLDS[metric] ?? 15;

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
 *
 * @param regressions - List of detected regressions
 * @param improvements - List of detected improvements
 * @returns Overall trend assessment
 */
export function determineOverallTrend(
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

/**
 * Build a map of task ID to task result for efficient lookup.
 *
 * @param tasks - Array of task test results
 * @returns Map from task ID to task result
 */
export function buildTaskMap(tasks: readonly TaskTestResult[]): Map<string, TaskTestResult> {
  const map = new Map<string, TaskTestResult>();
  for (const task of tasks) {
    map.set(task.taskId, task);
  }
  return map;
}

/**
 * Create a regression object from task and metric data.
 *
 * @param task - The task that regressed
 * @param metricName - Name of the metric
 * @param previousValue - Previous (baseline) value
 * @param currentValue - Current value
 * @param degradation - Degradation percentage
 * @returns Regression object
 */
export function createRegression(
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
    severity: determineSeverity(degradation, metricName),
  };
}

/**
 * Create an improvement object from task and metric data.
 *
 * @param task - The task that improved
 * @param metricName - Name of the metric
 * @param previousValue - Previous (baseline) value
 * @param currentValue - Current value
 * @param improvement - Improvement percentage
 * @returns Improvement object
 */
export function createImprovement(
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
