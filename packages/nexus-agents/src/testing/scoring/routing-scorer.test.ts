/**
 * nexus-agents/testing - Routing Scorer Tests
 *
 * Tests for routing accuracy metrics calculation.
 */

import { describe, it, expect } from 'vitest';
import {
  RoutingScorer,
  evaluateRouting,
  calculateRoutingMetrics,
  getByCategory,
  getCliStats,
} from './routing-scorer.js';
import type { TaskTestResult, CliName } from '../types.js';
import { TaskCategory as TaskCategoryEnum } from '../types.js';

/**
 * Creates a test result with default values for testing.
 */
function createTestResult(overrides: Partial<TaskTestResult> = {}): TaskTestResult {
  const selectedCli = overrides.selectedCli ?? 'claude';
  const optimalCli = overrides.optimalCli ?? 'claude';
  const acceptableClis = overrides.acceptableClis ?? [optimalCli];
  const isOptimal = selectedCli === optimalCli;
  const isAcceptable = isOptimal || acceptableClis.includes(selectedCli);

  return {
    testId: 'test-1',
    taskDescription: 'Test task',
    category: TaskCategoryEnum.GENERAL,
    selectedCli,
    optimalCli,
    acceptableClis,
    routingReason: 'Test routing',
    isOptimal,
    isAcceptable,
    timestamp: '2026-01-05T12:00:00',
    ...overrides,
  };
}

describe('evaluateRouting', () => {
  it('should return isOptimal true when selected matches optimal', () => {
    const result = evaluateRouting('claude', 'claude', ['gemini'], 'Best for reasoning');

    expect(result.selectedCli).toBe('claude');
    expect(result.optimalCli).toBe('claude');
    expect(result.isOptimal).toBe(true);
    expect(result.isAcceptable).toBe(true);
    expect(result.routingReason).toBe('Best for reasoning');
  });

  it('should return isOptimal false when selected differs from optimal', () => {
    const result = evaluateRouting('gemini', 'claude', ['gemini'], 'Large context needed');

    expect(result.isOptimal).toBe(false);
    expect(result.isAcceptable).toBe(true);
  });

  it('should return isAcceptable false when selected is not in acceptable list', () => {
    const result = evaluateRouting('codex', 'claude', ['gemini'], 'Wrong routing');

    expect(result.isOptimal).toBe(false);
    expect(result.isAcceptable).toBe(false);
  });

  it('should handle empty acceptable list', () => {
    const result = evaluateRouting('gemini', 'claude', [], 'No alternatives');

    expect(result.isOptimal).toBe(false);
    expect(result.isAcceptable).toBe(false);
  });

  it('should treat optimal CLI as acceptable even if not in list', () => {
    const result = evaluateRouting('claude', 'claude', [], 'Optimal selection');

    expect(result.isOptimal).toBe(true);
    expect(result.isAcceptable).toBe(true);
  });
});

describe('calculateRoutingMetrics', () => {
  it('should handle empty results array', () => {
    const metrics = calculateRoutingMetrics([]);

    expect(metrics.totalTasks).toBe(0);
    expect(metrics.optimalCount).toBe(0);
    expect(metrics.acceptableCount).toBe(0);
    expect(metrics.optimalRate).toBe(0);
    expect(metrics.acceptableRate).toBe(0);
    expect(metrics.byCategory[TaskCategoryEnum.GENERAL]).toBe(0);
    expect(metrics.byCli.claude.selected).toBe(0);
    expect(metrics.calculatedAt).toBeDefined();
  });

  it('should calculate correct metrics for all optimal routing', () => {
    const results: TaskTestResult[] = [
      createTestResult({ testId: '1', selectedCli: 'claude', optimalCli: 'claude' }),
      createTestResult({ testId: '2', selectedCli: 'gemini', optimalCli: 'gemini' }),
      createTestResult({ testId: '3', selectedCli: 'codex', optimalCli: 'codex' }),
    ];

    const metrics = calculateRoutingMetrics(results);

    expect(metrics.totalTasks).toBe(3);
    expect(metrics.optimalCount).toBe(3);
    expect(metrics.acceptableCount).toBe(3);
    expect(metrics.optimalRate).toBe(100);
    expect(metrics.acceptableRate).toBe(100);
  });

  it('should calculate correct metrics for mixed routing', () => {
    const results: TaskTestResult[] = [
      createTestResult({
        testId: '1',
        selectedCli: 'claude',
        optimalCli: 'claude',
        acceptableClis: ['claude'],
        isOptimal: true,
        isAcceptable: true,
      }),
      createTestResult({
        testId: '2',
        selectedCli: 'gemini',
        optimalCli: 'claude',
        acceptableClis: ['gemini'],
        isOptimal: false,
        isAcceptable: true,
      }),
      createTestResult({
        testId: '3',
        selectedCli: 'codex',
        optimalCli: 'claude',
        acceptableClis: [],
        isOptimal: false,
        isAcceptable: false,
      }),
    ];

    const metrics = calculateRoutingMetrics(results);

    expect(metrics.totalTasks).toBe(3);
    expect(metrics.optimalCount).toBe(1);
    expect(metrics.acceptableCount).toBe(2);
    expect(metrics.optimalRate).toBe(33.33);
    expect(metrics.acceptableRate).toBe(66.67);
  });

  it('should track CLI selection statistics correctly', () => {
    const results: TaskTestResult[] = [
      createTestResult({
        selectedCli: 'claude',
        optimalCli: 'claude',
        isOptimal: true,
        isAcceptable: true,
      }),
      createTestResult({
        selectedCli: 'claude',
        optimalCli: 'gemini',
        isOptimal: false,
        isAcceptable: true,
      }),
      createTestResult({
        selectedCli: 'gemini',
        optimalCli: 'gemini',
        isOptimal: true,
        isAcceptable: true,
      }),
    ];

    const metrics = calculateRoutingMetrics(results);

    expect(metrics.byCli.claude.selected).toBe(2);
    expect(metrics.byCli.claude.optimal).toBe(1);
    expect(metrics.byCli.claude.acceptableWhenSelected).toBe(2);

    expect(metrics.byCli.gemini.selected).toBe(1);
    expect(metrics.byCli.gemini.optimal).toBe(2);
    expect(metrics.byCli.gemini.acceptableWhenSelected).toBe(1);

    expect(metrics.byCli.codex.selected).toBe(0);
    expect(metrics.byCli.codex.optimal).toBe(0);
    expect(metrics.byCli.codex.acceptableWhenSelected).toBe(0);
  });

  it('should calculate per-category accuracy', () => {
    const results: TaskTestResult[] = [
      createTestResult({
        category: TaskCategoryEnum.REASONING,
        selectedCli: 'claude',
        optimalCli: 'claude',
        isOptimal: true,
      }),
      createTestResult({
        category: TaskCategoryEnum.REASONING,
        selectedCli: 'gemini',
        optimalCli: 'claude',
        isOptimal: false,
      }),
      createTestResult({
        category: TaskCategoryEnum.CODE_GENERATION,
        selectedCli: 'codex',
        optimalCli: 'codex',
        isOptimal: true,
      }),
    ];

    const metrics = calculateRoutingMetrics(results);

    expect(metrics.byCategory[TaskCategoryEnum.REASONING]).toBe(50);
    expect(metrics.byCategory[TaskCategoryEnum.CODE_GENERATION]).toBe(100);
    expect(metrics.byCategory[TaskCategoryEnum.GENERAL]).toBe(0);
  });
});

describe('getByCategory', () => {
  it('should return zero for all categories with empty results', () => {
    const byCategory = getByCategory([]);

    expect(byCategory[TaskCategoryEnum.REASONING]).toBe(0);
    expect(byCategory[TaskCategoryEnum.CODE_GENERATION]).toBe(0);
    expect(byCategory[TaskCategoryEnum.LARGE_CONTEXT]).toBe(0);
    expect(byCategory[TaskCategoryEnum.QUICK_TASK]).toBe(0);
    expect(byCategory[TaskCategoryEnum.TESTING]).toBe(0);
    expect(byCategory[TaskCategoryEnum.BULK_OPERATION]).toBe(0);
    expect(byCategory[TaskCategoryEnum.GENERAL]).toBe(0);
  });

  it('should calculate accuracy per category independently', () => {
    const results: TaskTestResult[] = [
      createTestResult({ category: TaskCategoryEnum.REASONING, isOptimal: true }),
      createTestResult({ category: TaskCategoryEnum.REASONING, isOptimal: true }),
      createTestResult({ category: TaskCategoryEnum.CODE_GENERATION, isOptimal: false }),
      createTestResult({ category: TaskCategoryEnum.LARGE_CONTEXT, isOptimal: true }),
      createTestResult({ category: TaskCategoryEnum.LARGE_CONTEXT, isOptimal: true }),
      createTestResult({ category: TaskCategoryEnum.LARGE_CONTEXT, isOptimal: false }),
    ];

    const byCategory = getByCategory(results);

    expect(byCategory[TaskCategoryEnum.REASONING]).toBe(100);
    expect(byCategory[TaskCategoryEnum.CODE_GENERATION]).toBe(0);
    expect(byCategory[TaskCategoryEnum.LARGE_CONTEXT]).toBe(66.67);
  });

  it('should handle single result per category', () => {
    const results: TaskTestResult[] = [
      createTestResult({ category: TaskCategoryEnum.QUICK_TASK, isOptimal: true }),
    ];

    const byCategory = getByCategory(results);

    expect(byCategory[TaskCategoryEnum.QUICK_TASK]).toBe(100);
  });
});

describe('getCliStats', () => {
  it('should return zero stats for all CLIs with empty results', () => {
    const stats = getCliStats([]);

    expect(stats.claude.selected).toBe(0);
    expect(stats.claude.optimal).toBe(0);
    expect(stats.claude.acceptableWhenSelected).toBe(0);

    expect(stats.gemini.selected).toBe(0);
    expect(stats.codex.selected).toBe(0);
  });

  it('should track selections correctly', () => {
    const results: TaskTestResult[] = [
      createTestResult({ selectedCli: 'claude', optimalCli: 'claude', isAcceptable: true }),
      createTestResult({ selectedCli: 'claude', optimalCli: 'gemini', isAcceptable: true }),
      createTestResult({ selectedCli: 'claude', optimalCli: 'gemini', isAcceptable: false }),
      createTestResult({ selectedCli: 'gemini', optimalCli: 'claude', isAcceptable: true }),
    ];

    const stats = getCliStats(results);

    // Claude was selected 3 times, optimal 2 times (rows 1 and 4)
    expect(stats.claude.selected).toBe(3);
    expect(stats.claude.optimal).toBe(2);
    expect(stats.claude.acceptableWhenSelected).toBe(2);

    // Gemini was selected 1 time, optimal 2 times (rows 2 and 3)
    expect(stats.gemini.selected).toBe(1);
    expect(stats.gemini.optimal).toBe(2);
    expect(stats.gemini.acceptableWhenSelected).toBe(1);

    expect(stats.codex.selected).toBe(0);
    expect(stats.codex.optimal).toBe(0);
    expect(stats.codex.acceptableWhenSelected).toBe(0);
  });

  it('should handle all results going to one CLI', () => {
    const results: TaskTestResult[] = [
      createTestResult({ selectedCli: 'gemini', optimalCli: 'gemini', isAcceptable: true }),
      createTestResult({ selectedCli: 'gemini', optimalCli: 'claude', isAcceptable: false }),
      createTestResult({ selectedCli: 'gemini', optimalCli: 'codex', isAcceptable: true }),
    ];

    const stats = getCliStats(results);

    expect(stats.gemini.selected).toBe(3);
    expect(stats.gemini.optimal).toBe(1);
    expect(stats.gemini.acceptableWhenSelected).toBe(2);

    expect(stats.claude.selected).toBe(0);
    expect(stats.claude.optimal).toBe(1);

    expect(stats.codex.selected).toBe(0);
    expect(stats.codex.optimal).toBe(1);
  });
});

describe('RoutingScorer class', () => {
  const scorer = new RoutingScorer();

  describe('evaluateRouting', () => {
    it('should delegate to standalone function', () => {
      const result = scorer.evaluateRouting('claude', 'claude', ['gemini'], 'Test');

      expect(result.isOptimal).toBe(true);
      expect(result.isAcceptable).toBe(true);
    });
  });

  describe('calculateRoutingMetrics', () => {
    it('should delegate to standalone function', () => {
      const results: TaskTestResult[] = [
        createTestResult({ isOptimal: true }),
        createTestResult({ isOptimal: false }),
      ];

      const metrics = scorer.calculateRoutingMetrics(results);

      expect(metrics.totalTasks).toBe(2);
      expect(metrics.optimalRate).toBe(50);
    });
  });

  describe('getByCategory', () => {
    it('should delegate to standalone function', () => {
      const results: TaskTestResult[] = [
        createTestResult({ category: TaskCategoryEnum.TESTING, isOptimal: true }),
      ];

      const byCategory = scorer.getByCategory(results);

      expect(byCategory[TaskCategoryEnum.TESTING]).toBe(100);
    });
  });

  describe('getCliStats', () => {
    it('should delegate to standalone function', () => {
      const results: TaskTestResult[] = [
        createTestResult({ selectedCli: 'codex', optimalCli: 'codex', isAcceptable: true }),
      ];

      const stats = scorer.getCliStats(results);

      expect(stats.codex.selected).toBe(1);
      expect(stats.codex.optimal).toBe(1);
    });
  });
});

describe('edge cases', () => {
  it('should handle percentage rounding correctly', () => {
    const results: TaskTestResult[] = [
      createTestResult({ isOptimal: true }),
      createTestResult({ isOptimal: true }),
      createTestResult({ isOptimal: false }),
    ];

    const metrics = calculateRoutingMetrics(results);

    // 2/3 = 66.666... should round to 66.67
    expect(metrics.optimalRate).toBe(66.67);
  });

  it('should handle all same category results', () => {
    const results: TaskTestResult[] = Array.from({ length: 10 }, (_, i) =>
      createTestResult({
        testId: `test-${String(i)}`,
        category: TaskCategoryEnum.BULK_OPERATION,
        isOptimal: i % 2 === 0,
      })
    );

    const byCategory = getByCategory(results);

    expect(byCategory[TaskCategoryEnum.BULK_OPERATION]).toBe(50);
    expect(byCategory[TaskCategoryEnum.REASONING]).toBe(0);
  });

  it('should handle large number of results', () => {
    const cliOptions: readonly CliName[] = ['claude', 'gemini', 'codex'] as const;
    const results: TaskTestResult[] = Array.from({ length: 1000 }, (_, i) => {
      const cliIndex = i % 3;
      const selectedCli = cliOptions[cliIndex] as CliName;
      return createTestResult({
        testId: `test-${String(i)}`,
        selectedCli,
        optimalCli: 'claude',
        isOptimal: cliIndex === 0,
        isAcceptable: cliIndex !== 2,
      });
    });

    const metrics = calculateRoutingMetrics(results);

    expect(metrics.totalTasks).toBe(1000);
    // 1/3 are optimal (i % 3 === 0)
    expect(metrics.optimalRate).toBe(33.4);
    // 2/3 are acceptable (i % 3 !== 2)
    expect(metrics.acceptableRate).toBe(66.7);
  });

  it('should correctly track optimal count when optimal differs from selected', () => {
    const results: TaskTestResult[] = [
      createTestResult({ selectedCli: 'gemini', optimalCli: 'claude', isOptimal: false }),
      createTestResult({ selectedCli: 'codex', optimalCli: 'claude', isOptimal: false }),
      createTestResult({ selectedCli: 'claude', optimalCli: 'gemini', isOptimal: false }),
    ];

    const stats = getCliStats(results);

    // Claude was optimal twice (as optimalCli)
    expect(stats.claude.optimal).toBe(2);
    expect(stats.claude.selected).toBe(1);

    // Gemini was optimal once
    expect(stats.gemini.optimal).toBe(1);
    expect(stats.gemini.selected).toBe(1);

    // Codex was never optimal
    expect(stats.codex.optimal).toBe(0);
    expect(stats.codex.selected).toBe(1);
  });
});
