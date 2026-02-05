/**
 * Tests for Result Comparator Helpers
 * @module testing/storage/result-comparator-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { TaskTestResult } from '../schemas.js';
import type { Regression, Improvement } from './result-comparator.js';
import {
  calculatePercentChange,
  determineSeverity,
  determineOverallTrend,
  buildTaskMap,
  createRegression,
  createImprovement,
} from './result-comparator-helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeTask(overrides: Partial<TaskTestResult> = {}): TaskTestResult {
  return {
    taskId: 'task-1',
    taskName: 'Test Task',
    ...overrides,
  } as TaskTestResult;
}

function makeRegression(overrides: Partial<Regression> = {}): Regression {
  return {
    taskId: 'task-1',
    taskName: 'Test Task',
    metric: 'qualityScore',
    previousValue: 90,
    currentValue: 70,
    degradation: 22,
    severity: 'critical',
    ...overrides,
  };
}

function makeImprovement(overrides: Partial<Improvement> = {}): Improvement {
  return {
    taskId: 'task-1',
    taskName: 'Test Task',
    metric: 'qualityScore',
    previousValue: 70,
    currentValue: 90,
    improvement: 28,
    ...overrides,
  };
}

// ============================================================================
// calculatePercentChange
// ============================================================================

describe('calculatePercentChange', () => {
  it('calculates positive change', () => {
    expect(calculatePercentChange(110, 100)).toBeCloseTo(10);
  });

  it('calculates negative change', () => {
    expect(calculatePercentChange(90, 100)).toBeCloseTo(-10);
  });

  it('returns 0 for equal values', () => {
    expect(calculatePercentChange(100, 100)).toBe(0);
  });

  it('returns 100 when previous is 0 and current is positive', () => {
    expect(calculatePercentChange(50, 0)).toBe(100);
  });

  it('returns 0 when both are 0', () => {
    expect(calculatePercentChange(0, 0)).toBe(0);
  });
});

// ============================================================================
// determineSeverity
// ============================================================================

describe('determineSeverity', () => {
  it('returns critical for qualityScore >= 20', () => {
    expect(determineSeverity(25, 'qualityScore')).toBe('critical');
  });

  it('returns warning for qualityScore >= 10', () => {
    expect(determineSeverity(15, 'qualityScore')).toBe('warning');
  });

  it('returns minor for qualityScore < 10', () => {
    expect(determineSeverity(5, 'qualityScore')).toBe('minor');
  });

  it('uses custom thresholds for latencyMs', () => {
    expect(determineSeverity(100, 'latencyMs')).toBe('critical');
    expect(determineSeverity(60, 'latencyMs')).toBe('warning');
    expect(determineSeverity(30, 'latencyMs')).toBe('minor');
  });

  it('uses default thresholds for unknown metrics', () => {
    // Default critical: 25, warning: 15
    expect(determineSeverity(30, 'unknownMetric')).toBe('critical');
    expect(determineSeverity(20, 'unknownMetric')).toBe('warning');
    expect(determineSeverity(5, 'unknownMetric')).toBe('minor');
  });
});

// ============================================================================
// determineOverallTrend
// ============================================================================

describe('determineOverallTrend', () => {
  it('returns stable when no regressions or improvements', () => {
    expect(determineOverallTrend([], [])).toBe('stable');
  });

  it('returns improved when improvements outweigh regressions', () => {
    expect(
      determineOverallTrend(
        [makeRegression({ severity: 'minor' })],
        [makeImprovement(), makeImprovement()]
      )
    ).toBe('improved');
  });

  it('returns regressed when regressions outweigh improvements', () => {
    expect(
      determineOverallTrend(
        [makeRegression({ severity: 'warning' }), makeRegression({ severity: 'warning' })],
        [makeImprovement()]
      )
    ).toBe('regressed');
  });

  it('returns regressed when any critical regression exists', () => {
    expect(
      determineOverallTrend(
        [makeRegression({ severity: 'critical' })],
        [makeImprovement(), makeImprovement(), makeImprovement(), makeImprovement()]
      )
    ).toBe('regressed');
  });

  it('returns stable when scores are equal', () => {
    // 1 minor regression (score 1) vs 1 improvement (score 1) = 0
    expect(
      determineOverallTrend([makeRegression({ severity: 'minor' })], [makeImprovement()])
    ).toBe('stable');
  });
});

// ============================================================================
// buildTaskMap
// ============================================================================

describe('buildTaskMap', () => {
  it('builds map from task array', () => {
    const tasks = [makeTask({ taskId: 'a' }), makeTask({ taskId: 'b' })];
    const map = buildTaskMap(tasks);
    expect(map.size).toBe(2);
    expect(map.get('a')?.taskId).toBe('a');
    expect(map.get('b')?.taskId).toBe('b');
  });

  it('returns empty map for empty array', () => {
    expect(buildTaskMap([]).size).toBe(0);
  });
});

// ============================================================================
// createRegression
// ============================================================================

describe('createRegression', () => {
  it('creates regression with computed severity', () => {
    const task = makeTask({ taskId: 't1', taskName: 'Task 1' });
    const regression = createRegression(task, 'qualityScore', 90, 65, 28);
    expect(regression.taskId).toBe('t1');
    expect(regression.taskName).toBe('Task 1');
    expect(regression.metric).toBe('qualityScore');
    expect(regression.previousValue).toBe(90);
    expect(regression.currentValue).toBe(65);
    expect(regression.degradation).toBe(28);
    expect(regression.severity).toBe('critical'); // 28 >= 20 for qualityScore
  });

  it('assigns minor severity for small degradation', () => {
    const task = makeTask();
    const regression = createRegression(task, 'qualityScore', 90, 88, 2);
    expect(regression.severity).toBe('minor');
  });
});

// ============================================================================
// createImprovement
// ============================================================================

describe('createImprovement', () => {
  it('creates improvement object', () => {
    const task = makeTask({ taskId: 't2', taskName: 'Task 2' });
    const improvement = createImprovement(task, 'qualityScore', 70, 90, 28);
    expect(improvement.taskId).toBe('t2');
    expect(improvement.taskName).toBe('Task 2');
    expect(improvement.metric).toBe('qualityScore');
    expect(improvement.previousValue).toBe(70);
    expect(improvement.currentValue).toBe(90);
    expect(improvement.improvement).toBe(28);
  });
});
