/**
 * Tests for Result Comparator
 *
 * Verifies regression detection, improvement identification,
 * threshold configuration, and overall trend determination.
 */

import { describe, it, expect } from 'vitest';
import {
  ResultComparator,
  createResultComparator,
  DEFAULT_THRESHOLDS,
} from './result-comparator.js';
import type { ComparisonThresholds, Regression, Improvement } from './result-comparator.js';
import type { TaskTestResult, ExtendedTestRunResult } from '../schemas.js';

/**
 * Helper to get first element with type assertion.
 */
function getFirst<T>(arr: readonly T[]): T {
  const first = arr[0];
  if (first === undefined) {
    throw new Error('Expected array to have at least one element');
  }
  return first;
}

/**
 * Helper to create a task test result with defaults.
 */
function createTaskResult(overrides: Partial<TaskTestResult> & { taskId: string }): TaskTestResult {
  return {
    taskName: `Task ${overrides.taskId}`,
    category: 'code_generation',
    status: 'passed',
    metrics: {
      qualityScore: 85,
      latencyMs: 1000,
      routingAccuracy: 90,
      reliability: 95,
    },
    cli: 'claude',
    retryCount: 0,
    ...overrides,
  };
}

/**
 * Helper to create an extended test run result.
 */
function createTestRun(id: string, taskResults: TaskTestResult[]): ExtendedTestRunResult {
  return {
    id,
    timestamp: new Date().toISOString(),
    timezone: 'America/New_York',
    suites: [],
    totalDurationMs: 5000,
    summary: {
      totalTests: taskResults.length,
      passed: taskResults.filter((t) => t.status === 'passed').length,
      failed: taskResults.filter((t) => t.status === 'failed').length,
      skipped: taskResults.filter((t) => t.status === 'skipped').length,
      errors: taskResults.filter((t) => t.status === 'error').length,
      passRate: 100,
    },
    environment: {
      nodeVersion: '22.0.0',
      platform: 'linux',
      arch: 'x64',
      nexusAgentsVersion: '2.0.0',
    },
    taskResults,
  };
}

/**
 * Helper to assert regression properties.
 */
function assertRegression(
  regression: Regression,
  expected: {
    metric: string;
    previousValue: number;
    currentValue: number;
    degradationApprox?: number;
  }
): void {
  expect(regression.metric).toBe(expected.metric);
  expect(regression.previousValue).toBe(expected.previousValue);
  expect(regression.currentValue).toBe(expected.currentValue);
  if (expected.degradationApprox !== undefined) {
    expect(regression.degradation).toBeCloseTo(expected.degradationApprox, 1);
  }
}

/**
 * Helper to assert improvement properties.
 */
function assertImprovement(
  improvement: Improvement,
  expected: {
    metric: string;
    previousValue: number;
    currentValue: number;
    improvementApprox?: number;
  }
): void {
  expect(improvement.metric).toBe(expected.metric);
  expect(improvement.previousValue).toBe(expected.previousValue);
  expect(improvement.currentValue).toBe(expected.currentValue);
  if (expected.improvementApprox !== undefined) {
    expect(improvement.improvement).toBeCloseTo(expected.improvementApprox, 1);
  }
}

describe('ResultComparator', () => {
  describe('constructor', () => {
    it('should use default thresholds when none provided', () => {
      const comparator = new ResultComparator();
      expect(comparator).toBeInstanceOf(ResultComparator);
    });

    it('should accept custom thresholds', () => {
      const customThresholds: ComparisonThresholds = {
        qualityDegradation: 10,
        latencyIncrease: 30,
        routingAccuracyDrop: 15,
        reliabilityDrop: 8,
      };

      const comparator = new ResultComparator(customThresholds);
      expect(comparator).toBeInstanceOf(ResultComparator);
    });
  });

  describe('compare()', () => {
    it('should return empty comparison for identical runs', () => {
      const comparator = new ResultComparator();
      const task = createTaskResult({ taskId: 'task-1' });
      const previousRun = createTestRun('run-1', [task]);
      const currentRun = createTestRun('run-2', [task]);

      const result = comparator.compare(currentRun, previousRun);

      expect(result.previousRunId).toBe('run-1');
      expect(result.currentRunId).toBe('run-2');
      expect(result.regressions).toHaveLength(0);
      expect(result.improvements).toHaveLength(0);
      expect(result.unchanged).toBe(1);
      expect(result.newTasks).toBe(0);
      expect(result.removedTasks).toBe(0);
      expect(result.overallTrend).toBe('stable');
    });

    it('should detect quality score regression', () => {
      const comparator = new ResultComparator();

      const previousTask = createTaskResult({
        taskId: 'task-1',
        metrics: {
          qualityScore: 90,
          latencyMs: 1000,
          routingAccuracy: 90,
          reliability: 95,
        },
      });

      const currentTask = createTaskResult({
        taskId: 'task-1',
        metrics: {
          qualityScore: 80, // 11% drop, above 5% threshold
          latencyMs: 1000,
          routingAccuracy: 90,
          reliability: 95,
        },
      });

      const previousRun = createTestRun('run-1', [previousTask]);
      const currentRun = createTestRun('run-2', [currentTask]);

      const result = comparator.compare(currentRun, previousRun);

      expect(result.regressions).toHaveLength(1);
      const regression = getFirst(result.regressions);
      assertRegression(regression, {
        metric: 'qualityScore',
        previousValue: 90,
        currentValue: 80,
        degradationApprox: 11.11,
      });
      expect(result.overallTrend).toBe('regressed');
    });

    it('should detect latency regression', () => {
      const comparator = new ResultComparator();

      const previousTask = createTaskResult({
        taskId: 'task-1',
        metrics: {
          qualityScore: 85,
          latencyMs: 1000,
          routingAccuracy: 90,
          reliability: 95,
        },
      });

      const currentTask = createTaskResult({
        taskId: 'task-1',
        metrics: {
          qualityScore: 85,
          latencyMs: 1500, // 50% increase, above 20% threshold
          routingAccuracy: 90,
          reliability: 95,
        },
      });

      const previousRun = createTestRun('run-1', [previousTask]);
      const currentRun = createTestRun('run-2', [currentTask]);

      const result = comparator.compare(currentRun, previousRun);

      expect(result.regressions).toHaveLength(1);
      const regression = getFirst(result.regressions);
      assertRegression(regression, {
        metric: 'latencyMs',
        previousValue: 1000,
        currentValue: 1500,
      });
      expect(regression.degradation).toBe(50);
    });

    it('should detect routing accuracy regression', () => {
      const comparator = new ResultComparator();

      const previousTask = createTaskResult({
        taskId: 'task-1',
        metrics: {
          qualityScore: 85,
          latencyMs: 1000,
          routingAccuracy: 90,
          reliability: 95,
        },
      });

      const currentTask = createTaskResult({
        taskId: 'task-1',
        metrics: {
          qualityScore: 85,
          latencyMs: 1000,
          routingAccuracy: 70, // 22% drop, above 10% threshold
          reliability: 95,
        },
      });

      const previousRun = createTestRun('run-1', [previousTask]);
      const currentRun = createTestRun('run-2', [currentTask]);

      const result = comparator.compare(currentRun, previousRun);

      expect(result.regressions).toHaveLength(1);
      const regression = getFirst(result.regressions);
      assertRegression(regression, {
        metric: 'routingAccuracy',
        previousValue: 90,
        currentValue: 70,
        degradationApprox: 22.22,
      });
    });

    it('should detect reliability regression', () => {
      const comparator = new ResultComparator();

      const previousTask = createTaskResult({
        taskId: 'task-1',
        metrics: {
          qualityScore: 85,
          latencyMs: 1000,
          routingAccuracy: 90,
          reliability: 95,
        },
      });

      const currentTask = createTaskResult({
        taskId: 'task-1',
        metrics: {
          qualityScore: 85,
          latencyMs: 1000,
          routingAccuracy: 90,
          reliability: 85, // 10.5% drop, above 5% threshold
        },
      });

      const previousRun = createTestRun('run-1', [previousTask]);
      const currentRun = createTestRun('run-2', [currentTask]);

      const result = comparator.compare(currentRun, previousRun);

      expect(result.regressions).toHaveLength(1);
      const regression = getFirst(result.regressions);
      assertRegression(regression, {
        metric: 'reliability',
        previousValue: 95,
        currentValue: 85,
        degradationApprox: 10.53,
      });
    });

    it('should detect quality score improvement', () => {
      const comparator = new ResultComparator();

      const previousTask = createTaskResult({
        taskId: 'task-1',
        metrics: {
          qualityScore: 80,
          latencyMs: 1000,
          routingAccuracy: 90,
          reliability: 95,
        },
      });

      const currentTask = createTaskResult({
        taskId: 'task-1',
        metrics: {
          qualityScore: 90, // 12.5% improvement, above 5% threshold
          latencyMs: 1000,
          routingAccuracy: 90,
          reliability: 95,
        },
      });

      const previousRun = createTestRun('run-1', [previousTask]);
      const currentRun = createTestRun('run-2', [currentTask]);

      const result = comparator.compare(currentRun, previousRun);

      expect(result.improvements).toHaveLength(1);
      const improvement = getFirst(result.improvements);
      assertImprovement(improvement, {
        metric: 'qualityScore',
        previousValue: 80,
        currentValue: 90,
      });
      expect(improvement.improvement).toBe(12.5);
      expect(result.overallTrend).toBe('improved');
    });

    it('should detect latency improvement', () => {
      const comparator = new ResultComparator();

      const previousTask = createTaskResult({
        taskId: 'task-1',
        metrics: {
          qualityScore: 85,
          latencyMs: 1500,
          routingAccuracy: 90,
          reliability: 95,
        },
      });

      const currentTask = createTaskResult({
        taskId: 'task-1',
        metrics: {
          qualityScore: 85,
          latencyMs: 1000, // 33% improvement (lower is better)
          routingAccuracy: 90,
          reliability: 95,
        },
      });

      const previousRun = createTestRun('run-1', [previousTask]);
      const currentRun = createTestRun('run-2', [currentTask]);

      const result = comparator.compare(currentRun, previousRun);

      expect(result.improvements).toHaveLength(1);
      const improvement = getFirst(result.improvements);
      assertImprovement(improvement, {
        metric: 'latencyMs',
        previousValue: 1500,
        currentValue: 1000,
        improvementApprox: 33.33,
      });
    });

    it('should handle new tasks gracefully', () => {
      const comparator = new ResultComparator();

      const existingTask = createTaskResult({ taskId: 'task-1' });
      const newTask = createTaskResult({ taskId: 'task-2' });

      const previousRun = createTestRun('run-1', [existingTask]);
      const currentRun = createTestRun('run-2', [existingTask, newTask]);

      const result = comparator.compare(currentRun, previousRun);

      expect(result.newTasks).toBe(1);
      expect(result.removedTasks).toBe(0);
      expect(result.unchanged).toBe(1);
    });

    it('should handle removed tasks gracefully', () => {
      const comparator = new ResultComparator();

      const existingTask = createTaskResult({ taskId: 'task-1' });
      const removedTask = createTaskResult({ taskId: 'task-2' });

      const previousRun = createTestRun('run-1', [existingTask, removedTask]);
      const currentRun = createTestRun('run-2', [existingTask]);

      const result = comparator.compare(currentRun, previousRun);

      expect(result.newTasks).toBe(0);
      expect(result.removedTasks).toBe(1);
      expect(result.unchanged).toBe(1);
    });

    it('should handle empty task results', () => {
      const comparator = new ResultComparator();

      const previousRun = createTestRun('run-1', []);
      const currentRun = createTestRun('run-2', []);

      const result = comparator.compare(currentRun, previousRun);

      expect(result.regressions).toHaveLength(0);
      expect(result.improvements).toHaveLength(0);
      expect(result.unchanged).toBe(0);
      expect(result.overallTrend).toBe('stable');
    });

    it('should detect multiple regressions in the same task', () => {
      const comparator = new ResultComparator();

      const previousTask = createTaskResult({
        taskId: 'task-1',
        metrics: {
          qualityScore: 90,
          latencyMs: 1000,
          routingAccuracy: 90,
          reliability: 95,
        },
      });

      const currentTask = createTaskResult({
        taskId: 'task-1',
        metrics: {
          qualityScore: 70, // Regression
          latencyMs: 2000, // Regression
          routingAccuracy: 60, // Regression
          reliability: 80, // Regression
        },
      });

      const previousRun = createTestRun('run-1', [previousTask]);
      const currentRun = createTestRun('run-2', [currentTask]);

      const result = comparator.compare(currentRun, previousRun);

      expect(result.regressions).toHaveLength(4);
      expect(result.regressions.map((r) => r.metric).sort()).toEqual([
        'latencyMs',
        'qualityScore',
        'reliability',
        'routingAccuracy',
      ]);
    });

    it('should ignore changes below threshold', () => {
      const comparator = new ResultComparator();

      const previousTask = createTaskResult({
        taskId: 'task-1',
        metrics: {
          qualityScore: 90,
          latencyMs: 1000,
          routingAccuracy: 90,
          reliability: 95,
        },
      });

      const currentTask = createTaskResult({
        taskId: 'task-1',
        metrics: {
          qualityScore: 88, // 2.2% drop, below 5% threshold
          latencyMs: 1100, // 10% increase, below 20% threshold
          routingAccuracy: 85, // 5.5% drop, below 10% threshold
          reliability: 93, // 2.1% drop, below 5% threshold
        },
      });

      const previousRun = createTestRun('run-1', [previousTask]);
      const currentRun = createTestRun('run-2', [currentTask]);

      const result = comparator.compare(currentRun, previousRun);

      expect(result.regressions).toHaveLength(0);
      expect(result.improvements).toHaveLength(0);
      expect(result.unchanged).toBe(1);
      expect(result.overallTrend).toBe('stable');
    });

    it('should compare multiple tasks', () => {
      const comparator = new ResultComparator();

      const previousTasks = [
        createTaskResult({
          taskId: 'task-1',
          metrics: {
            qualityScore: 90,
            latencyMs: 1000,
            routingAccuracy: 90,
            reliability: 95,
          },
        }),
        createTaskResult({
          taskId: 'task-2',
          metrics: {
            qualityScore: 80,
            latencyMs: 1500,
            routingAccuracy: 85,
            reliability: 90,
          },
        }),
      ];

      const currentTasks = [
        createTaskResult({
          taskId: 'task-1',
          metrics: {
            qualityScore: 80, // Regression
            latencyMs: 1000,
            routingAccuracy: 90,
            reliability: 95,
          },
        }),
        createTaskResult({
          taskId: 'task-2',
          metrics: {
            qualityScore: 90, // Improvement
            latencyMs: 1500,
            routingAccuracy: 85,
            reliability: 90,
          },
        }),
      ];

      const previousRun = createTestRun('run-1', previousTasks);
      const currentRun = createTestRun('run-2', currentTasks);

      const result = comparator.compare(currentRun, previousRun);

      expect(result.regressions).toHaveLength(1);
      expect(result.improvements).toHaveLength(1);
      expect(getFirst(result.regressions).taskId).toBe('task-1');
      expect(getFirst(result.improvements).taskId).toBe('task-2');
    });
  });

  describe('severity determination', () => {
    it('should assign critical severity for large quality degradation', () => {
      const comparator = new ResultComparator();

      const previousTask = createTaskResult({
        taskId: 'task-1',
        metrics: {
          qualityScore: 100,
          latencyMs: 1000,
          routingAccuracy: 90,
          reliability: 95,
        },
      });

      const currentTask = createTaskResult({
        taskId: 'task-1',
        metrics: {
          qualityScore: 70, // 30% drop - critical
          latencyMs: 1000,
          routingAccuracy: 90,
          reliability: 95,
        },
      });

      const previousRun = createTestRun('run-1', [previousTask]);
      const currentRun = createTestRun('run-2', [currentTask]);

      const result = comparator.compare(currentRun, previousRun);

      expect(result.regressions).toHaveLength(1);
      expect(getFirst(result.regressions).severity).toBe('critical');
    });

    it('should assign warning severity for moderate degradation', () => {
      const comparator = new ResultComparator();

      const previousTask = createTaskResult({
        taskId: 'task-1',
        metrics: {
          qualityScore: 100,
          latencyMs: 1000,
          routingAccuracy: 90,
          reliability: 95,
        },
      });

      const currentTask = createTaskResult({
        taskId: 'task-1',
        metrics: {
          qualityScore: 85, // 15% drop - warning
          latencyMs: 1000,
          routingAccuracy: 90,
          reliability: 95,
        },
      });

      const previousRun = createTestRun('run-1', [previousTask]);
      const currentRun = createTestRun('run-2', [currentTask]);

      const result = comparator.compare(currentRun, previousRun);

      expect(result.regressions).toHaveLength(1);
      expect(getFirst(result.regressions).severity).toBe('warning');
    });

    it('should assign minor severity for small degradation', () => {
      const comparator = new ResultComparator();

      const previousTask = createTaskResult({
        taskId: 'task-1',
        metrics: {
          qualityScore: 100,
          latencyMs: 1000,
          routingAccuracy: 90,
          reliability: 95,
        },
      });

      const currentTask = createTaskResult({
        taskId: 'task-1',
        metrics: {
          qualityScore: 93, // 7% drop - minor
          latencyMs: 1000,
          routingAccuracy: 90,
          reliability: 95,
        },
      });

      const previousRun = createTestRun('run-1', [previousTask]);
      const currentRun = createTestRun('run-2', [currentTask]);

      const result = comparator.compare(currentRun, previousRun);

      expect(result.regressions).toHaveLength(1);
      expect(getFirst(result.regressions).severity).toBe('minor');
    });

    it('should assign critical severity for large latency increase', () => {
      const comparator = new ResultComparator();

      const previousTask = createTaskResult({
        taskId: 'task-1',
        metrics: {
          qualityScore: 85,
          latencyMs: 1000,
          routingAccuracy: 90,
          reliability: 95,
        },
      });

      const currentTask = createTaskResult({
        taskId: 'task-1',
        metrics: {
          qualityScore: 85,
          latencyMs: 3000, // 200% increase - critical
          routingAccuracy: 90,
          reliability: 95,
        },
      });

      const previousRun = createTestRun('run-1', [previousTask]);
      const currentRun = createTestRun('run-2', [currentTask]);

      const result = comparator.compare(currentRun, previousRun);

      expect(result.regressions).toHaveLength(1);
      expect(getFirst(result.regressions).severity).toBe('critical');
    });
  });

  describe('overall trend determination', () => {
    it('should return regressed for critical regression', () => {
      const comparator = new ResultComparator();

      const previousTask = createTaskResult({
        taskId: 'task-1',
        metrics: {
          qualityScore: 100,
          latencyMs: 1000,
          routingAccuracy: 90,
          reliability: 95,
        },
      });

      const currentTask = createTaskResult({
        taskId: 'task-1',
        metrics: {
          qualityScore: 50, // Critical regression
          latencyMs: 1000,
          routingAccuracy: 90,
          reliability: 95,
        },
      });

      const previousRun = createTestRun('run-1', [previousTask]);
      const currentRun = createTestRun('run-2', [currentTask]);

      const result = comparator.compare(currentRun, previousRun);

      expect(result.overallTrend).toBe('regressed');
    });

    it('should return improved when improvements outweigh minor regressions', () => {
      const comparator = new ResultComparator();

      const previousTasks = [
        createTaskResult({
          taskId: 'task-1',
          metrics: {
            qualityScore: 80,
            latencyMs: 1000,
            routingAccuracy: 90,
            reliability: 95,
          },
        }),
        createTaskResult({
          taskId: 'task-2',
          metrics: {
            qualityScore: 80,
            latencyMs: 2000,
            routingAccuracy: 80,
            reliability: 85,
          },
        }),
      ];

      const currentTasks = [
        createTaskResult({
          taskId: 'task-1',
          metrics: {
            qualityScore: 95, // Big improvement
            latencyMs: 1000,
            routingAccuracy: 90,
            reliability: 95,
          },
        }),
        createTaskResult({
          taskId: 'task-2',
          metrics: {
            qualityScore: 95, // Big improvement
            latencyMs: 1000, // Big improvement
            routingAccuracy: 95, // Big improvement
            reliability: 95, // Big improvement
          },
        }),
      ];

      const previousRun = createTestRun('run-1', previousTasks);
      const currentRun = createTestRun('run-2', currentTasks);

      const result = comparator.compare(currentRun, previousRun);

      expect(result.overallTrend).toBe('improved');
    });

    it('should return stable when no significant changes', () => {
      const comparator = new ResultComparator();
      const task = createTaskResult({ taskId: 'task-1' });

      const previousRun = createTestRun('run-1', [task]);
      const currentRun = createTestRun('run-2', [task]);

      const result = comparator.compare(currentRun, previousRun);

      expect(result.overallTrend).toBe('stable');
    });
  });

  describe('custom thresholds', () => {
    it('should respect custom quality threshold', () => {
      const comparator = new ResultComparator({
        qualityDegradation: 20, // Higher threshold
        latencyIncrease: 20,
        routingAccuracyDrop: 10,
        reliabilityDrop: 5,
      });

      const previousTask = createTaskResult({
        taskId: 'task-1',
        metrics: {
          qualityScore: 90,
          latencyMs: 1000,
          routingAccuracy: 90,
          reliability: 95,
        },
      });

      const currentTask = createTaskResult({
        taskId: 'task-1',
        metrics: {
          qualityScore: 80, // 11% drop, below 20% threshold
          latencyMs: 1000,
          routingAccuracy: 90,
          reliability: 95,
        },
      });

      const previousRun = createTestRun('run-1', [previousTask]);
      const currentRun = createTestRun('run-2', [currentTask]);

      const result = comparator.compare(currentRun, previousRun);

      expect(result.regressions).toHaveLength(0);
      expect(result.overallTrend).toBe('stable');
    });

    it('should respect custom latency threshold', () => {
      const comparator = new ResultComparator({
        qualityDegradation: 5,
        latencyIncrease: 50, // Higher threshold
        routingAccuracyDrop: 10,
        reliabilityDrop: 5,
      });

      const previousTask = createTaskResult({
        taskId: 'task-1',
        metrics: {
          qualityScore: 85,
          latencyMs: 1000,
          routingAccuracy: 90,
          reliability: 95,
        },
      });

      const currentTask = createTaskResult({
        taskId: 'task-1',
        metrics: {
          qualityScore: 85,
          latencyMs: 1400, // 40% increase, below 50% threshold
          routingAccuracy: 90,
          reliability: 95,
        },
      });

      const previousRun = createTestRun('run-1', [previousTask]);
      const currentRun = createTestRun('run-2', [currentTask]);

      const result = comparator.compare(currentRun, previousRun);

      expect(result.regressions).toHaveLength(0);
      expect(result.overallTrend).toBe('stable');
    });
  });

  describe('edge cases', () => {
    it('should handle zero previous values gracefully', () => {
      const comparator = new ResultComparator();

      const previousTask = createTaskResult({
        taskId: 'task-1',
        metrics: {
          qualityScore: 0,
          latencyMs: 0,
          routingAccuracy: 0,
          reliability: 0,
        },
      });

      const currentTask = createTaskResult({
        taskId: 'task-1',
        metrics: {
          qualityScore: 50,
          latencyMs: 1000,
          routingAccuracy: 50,
          reliability: 50,
        },
      });

      const previousRun = createTestRun('run-1', [previousTask]);
      const currentRun = createTestRun('run-2', [currentTask]);

      // Should not throw
      const result = comparator.compare(currentRun, previousRun);

      // With zero previous values, comparisons are skipped
      expect(result.regressions).toHaveLength(0);
      expect(result.improvements).toHaveLength(0);
    });

    it('should handle same task with different names', () => {
      const comparator = new ResultComparator();

      const previousTask = createTaskResult({
        taskId: 'task-1',
        taskName: 'Original Name',
        metrics: {
          qualityScore: 90,
          latencyMs: 1000,
          routingAccuracy: 90,
          reliability: 95,
        },
      });

      const currentTask = createTaskResult({
        taskId: 'task-1',
        taskName: 'Updated Name',
        metrics: {
          qualityScore: 80, // Regression
          latencyMs: 1000,
          routingAccuracy: 90,
          reliability: 95,
        },
      });

      const previousRun = createTestRun('run-1', [previousTask]);
      const currentRun = createTestRun('run-2', [currentTask]);

      const result = comparator.compare(currentRun, previousRun);

      expect(result.regressions).toHaveLength(1);
      // Task name should be from current run
      expect(getFirst(result.regressions).taskName).toBe('Updated Name');
    });

    it('should handle large number of tasks', () => {
      const comparator = new ResultComparator();

      const previousTasks: TaskTestResult[] = [];
      const currentTasks: TaskTestResult[] = [];

      for (let i = 0; i < 100; i++) {
        previousTasks.push(
          createTaskResult({
            taskId: `task-${String(i)}`,
            metrics: {
              qualityScore: 85,
              latencyMs: 1000,
              routingAccuracy: 90,
              reliability: 95,
            },
          })
        );

        currentTasks.push(
          createTaskResult({
            taskId: `task-${String(i)}`,
            metrics: {
              qualityScore: i % 10 === 0 ? 70 : 85, // Every 10th task regresses
              latencyMs: 1000,
              routingAccuracy: 90,
              reliability: 95,
            },
          })
        );
      }

      const previousRun = createTestRun('run-1', previousTasks);
      const currentRun = createTestRun('run-2', currentTasks);

      const result = comparator.compare(currentRun, previousRun);

      expect(result.regressions).toHaveLength(10);
      expect(result.unchanged).toBe(90);
    });
  });
});

describe('createResultComparator', () => {
  it('should create comparator with default thresholds', () => {
    const comparator = createResultComparator();
    expect(comparator).toBeInstanceOf(ResultComparator);
  });

  it('should create comparator with custom thresholds', () => {
    const customThresholds: ComparisonThresholds = {
      qualityDegradation: 15,
      latencyIncrease: 40,
      routingAccuracyDrop: 20,
      reliabilityDrop: 10,
    };

    const comparator = createResultComparator(customThresholds);
    expect(comparator).toBeInstanceOf(ResultComparator);
  });
});

describe('DEFAULT_THRESHOLDS', () => {
  it('should have expected values', () => {
    expect(DEFAULT_THRESHOLDS.qualityDegradation).toBe(5);
    expect(DEFAULT_THRESHOLDS.latencyIncrease).toBe(20);
    expect(DEFAULT_THRESHOLDS.routingAccuracyDrop).toBe(10);
    expect(DEFAULT_THRESHOLDS.reliabilityDrop).toBe(5);
  });
});
