/**
 * Tests for Test Runner Helpers
 * @module testing/framework/test-runner-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { EvaluationTask, TestRunResult, TaskTestResult } from './types.js';
import type {} from '../../cli-adapters/types.js';
import { filterTasksByCli, createRunCompleteLog } from './test-runner-helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeTask(overrides: Partial<EvaluationTask> = {}): EvaluationTask {
  return {
    id: 'task-1',
    name: 'Test Task',
    description: 'A test task',
    category: 'general',
    difficulty: 'medium',
    rubric: { criteria: [], minScore: 0.5 },
    ...overrides,
  } as EvaluationTask;
}

function makeTaskResult(overrides: Partial<TaskTestResult> = {}): TaskTestResult {
  return {
    task: makeTask(),
    success: true,
    durationMs: 100,
    cli: 'claude',
    response: 'output',
    rubricScore: {
      overallScore: 0.8,
      criterionScores: [],
      rubricId: 'rubric-1',
      timestamp: '2026-01-01T00:00:00Z',
    },
    tokenUsage: { inputTokens: 100, outputTokens: 50 },
    costUsd: 0.01,
    timestamp: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ============================================================================
// filterTasksByCli
// ============================================================================

describe('filterTasksByCli', () => {
  it('includes tasks with no preferred CLIs', () => {
    const tasks = [makeTask({ id: 't1' })];
    const result = filterTasksByCli(tasks, ['claude']);
    expect(result).toHaveLength(1);
  });

  it('includes tasks with matching preferred CLI', () => {
    const tasks = [makeTask({ id: 't1', preferredClis: ['claude'] })];
    const result = filterTasksByCli(tasks, ['claude']);
    expect(result).toHaveLength(1);
  });

  it('excludes tasks with non-matching preferred CLI', () => {
    const tasks = [makeTask({ id: 't1', preferredClis: ['gemini'] })];
    const result = filterTasksByCli(tasks, ['claude']);
    expect(result).toHaveLength(0);
  });

  it('includes tasks with empty preferredClis array', () => {
    const tasks = [makeTask({ id: 't1', preferredClis: [] })];
    const result = filterTasksByCli(tasks, ['claude']);
    expect(result).toHaveLength(1);
  });

  it('handles multiple CLIs', () => {
    const tasks = [
      makeTask({ id: 't1', preferredClis: ['claude'] }),
      makeTask({ id: 't2', preferredClis: ['gemini'] }),
      makeTask({ id: 't3', preferredClis: ['codex'] }),
    ];
    const result = filterTasksByCli(tasks, ['claude', 'gemini']);
    expect(result).toHaveLength(2);
  });
});

// ============================================================================
// createRunCompleteLog
// ============================================================================

describe('createRunCompleteLog', () => {
  it('creates log with correct counts', () => {
    const result = {
      runId: 'run-1',
      success: true,
      taskResults: [
        makeTaskResult({ success: true }),
        makeTaskResult({ task: makeTask({ id: 't2' }), success: true }),
        makeTaskResult({ task: makeTask({ id: 't3' }), success: false }),
      ],
      durationMs: 5000,
      summary: {
        totalTasks: 3,
        successCount: 2,
        failureCount: 1,
        averageScore: 0.7,
      },
    } as unknown as TestRunResult;
    const log = createRunCompleteLog('run-1', result);
    expect(log.runId).toBe('run-1');
    expect(log.success).toBe(true);
    expect(log.totalTasks).toBe(3);
    expect(log.successCount).toBe(2);
    expect(log.failureCount).toBe(1);
    expect(log.durationMs).toBe(5000);
  });

  it('handles empty results', () => {
    const result = {
      runId: 'run-2',
      success: false,
      taskResults: [],
      durationMs: 0,
      summary: { totalTasks: 0, successCount: 0, failureCount: 0, averageScore: 0 },
    } as unknown as TestRunResult;
    const log = createRunCompleteLog('run-2', result);
    expect(log.totalTasks).toBe(0);
    expect(log.successCount).toBe(0);
    expect(log.failureCount).toBe(0);
  });
});
