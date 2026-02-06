/**
 * Tests for task-executor.ts
 *
 * Covers pure factory functions: createAgentTask, createCliTask,
 * createFailedRubricScore, checkSuccess, selectCli, buildTaskResult,
 * createErrorResult.
 */

import { describe, it, expect } from 'vitest';
import {
  createAgentTask,
  createCliTask,
  createFailedRubricScore,
  checkSuccess,
  selectCli,
  buildTaskResult,
  createErrorResult,
} from './task-executor.js';
import type { EvaluationTask, RubricScore } from './types.js';
import type { ICliAdapter } from '../../cli-adapters/types.js';

// ============================================================================
// Fixtures
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeEvalTask(overrides: Partial<EvaluationTask> = {}) {
  return {
    id: 'eval-1',
    name: 'Test Task',
    description: 'Do something',
    category: 'code_generation',
    difficulty: 'easy',
    expectedTaskType: 'code_implementation',
    ...overrides,
  } as EvaluationTask;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeRubricScore(overrides: Partial<RubricScore> = {}) {
  return {
    overallScore: 0.8,
    criterionScores: [],
    rubricId: 'test',
    timestamp: '2026-01-01T00:00:00-05:00',
    ...overrides,
  } as RubricScore;
}

// ============================================================================
// createAgentTask
// ============================================================================

describe('createAgentTask', () => {
  it('creates task with id and description', () => {
    const task = createAgentTask(makeEvalTask());
    expect(task.id).toBe('eval-1');
    expect(task.description).toBe('Do something');
  });

  it('includes context files when present', () => {
    const task = createAgentTask(makeEvalTask({ contextFiles: ['a.ts', 'b.ts'] }));
    expect((task.context as Record<string, unknown>)['files']).toEqual(['a.ts', 'b.ts']);
  });

  it('omits files when contextFiles is empty', () => {
    const task = createAgentTask(makeEvalTask({ contextFiles: [] }));
    expect((task.context as Record<string, unknown>)['files']).toBeUndefined();
  });

  it('omits files when contextFiles is undefined', () => {
    const task = createAgentTask(makeEvalTask());
    expect((task.context as Record<string, unknown>)['files']).toBeUndefined();
  });
});

// ============================================================================
// createCliTask
// ============================================================================

describe('createCliTask', () => {
  it('creates task with content', () => {
    const task = createCliTask(makeEvalTask({ description: 'Review this code' }));
    expect(task.content).toBe('Review this code');
  });

  it('includes timeoutMs when specified', () => {
    const task = createCliTask(makeEvalTask({ timeoutMs: 5000 }));
    expect(task.timeoutMs).toBe(5000);
  });

  it('omits timeoutMs when not specified', () => {
    const task = createCliTask(makeEvalTask());
    expect('timeoutMs' in task).toBe(false);
  });
});

// ============================================================================
// createFailedRubricScore
// ============================================================================

describe('createFailedRubricScore', () => {
  it('returns score of 0', () => {
    const score = createFailedRubricScore();
    expect(score.overallScore).toBe(0);
  });

  it('has empty criterion scores', () => {
    const score = createFailedRubricScore();
    expect(score.criterionScores).toEqual([]);
  });

  it('has "failed" rubric ID', () => {
    const score = createFailedRubricScore();
    expect(score.rubricId).toBe('failed');
  });

  it('has a timestamp', () => {
    const score = createFailedRubricScore();
    expect(score.timestamp).toBeDefined();
  });
});

// ============================================================================
// checkSuccess
// ============================================================================

describe('checkSuccess', () => {
  it('returns true when score meets minimum', () => {
    const task = makeEvalTask({ minimumScore: 0.5 });
    const score = makeRubricScore({ overallScore: 0.7 });
    expect(checkSuccess(task, score)).toBe(true);
  });

  it('returns false when score is below minimum', () => {
    const task = makeEvalTask({ minimumScore: 0.5 });
    const score = makeRubricScore({ overallScore: 0.3 });
    expect(checkSuccess(task, score)).toBe(false);
  });

  it('uses 0.5 as default minimum', () => {
    const task = makeEvalTask();
    expect(checkSuccess(task, makeRubricScore({ overallScore: 0.5 }))).toBe(true);
    expect(checkSuccess(task, makeRubricScore({ overallScore: 0.49 }))).toBe(false);
  });

  it('returns true when score equals minimum', () => {
    const task = makeEvalTask({ minimumScore: 0.6 });
    const score = makeRubricScore({ overallScore: 0.6 });
    expect(checkSuccess(task, score)).toBe(true);
  });
});

// ============================================================================
// selectCli
// ============================================================================

describe('selectCli', () => {
  const adapters = new Map<string, ICliAdapter>([
    ['claude', {} as ICliAdapter],
    ['gemini', {} as ICliAdapter],
  ]);

  it('returns first specified CLI', () => {
    const task = makeEvalTask();
    expect(selectCli(task, adapters as never, ['gemini'])).toBe('gemini');
  });

  it('prefers task preferred CLI when in specified list', () => {
    const task = makeEvalTask({ preferredClis: ['gemini'] as never });
    expect(selectCli(task, adapters as never, ['claude', 'gemini'])).toBe('gemini');
  });

  it('uses task preferred CLI when no specific CLIs requested', () => {
    const task = makeEvalTask({ preferredClis: ['gemini'] as never });
    expect(selectCli(task, adapters as never)).toBe('gemini');
  });

  it('falls back to first adapter key', () => {
    const task = makeEvalTask();
    const result = selectCli(task, adapters as never);
    expect(['claude', 'gemini']).toContain(result);
  });

  it('falls back to "claude" for empty adapters', () => {
    const task = makeEvalTask();
    const empty = new Map();
    expect(selectCli(task, empty as never)).toBe('claude');
  });
});

// ============================================================================
// buildTaskResult
// ============================================================================

describe('buildTaskResult', () => {
  it('builds result with required fields', () => {
    const result = buildTaskResult({
      task: makeEvalTask(),
      cli: 'claude',
      response: 'code output',
      durationMs: 1000,
      tokenUsage: { inputTokens: 100, outputTokens: 50 },
      costUsd: 0.01,
      rubricScore: makeRubricScore(),
      success: true,
    });
    expect(result.cli).toBe('claude');
    expect(result.success).toBe(true);
    expect(result.response).toBe('code output');
  });

  it('includes routing decision when provided', () => {
    const result = buildTaskResult({
      task: makeEvalTask(),
      cli: 'claude',
      response: '',
      durationMs: 0,
      tokenUsage: { inputTokens: 0, outputTokens: 0 },
      costUsd: 0,
      rubricScore: makeRubricScore(),
      success: true,
      routingDecision: {
        selectedCli: 'claude',
        confidence: 0.9,
        reason: 'best match',
        alternatives: [],
        decisionTimeMs: 5,
        taskProfile: {} as never,
      },
    });
    expect(result.routingDecision).toBeDefined();
    expect(result.routingDecision?.confidence).toBe(0.9);
  });

  it('includes error when provided', () => {
    const result = buildTaskResult({
      task: makeEvalTask(),
      cli: 'claude',
      response: '',
      durationMs: 0,
      tokenUsage: { inputTokens: 0, outputTokens: 0 },
      costUsd: 0,
      rubricScore: makeRubricScore({ overallScore: 0 }),
      success: false,
      error: 'timeout',
    });
    expect(result.error).toBe('timeout');
  });
});

// ============================================================================
// createErrorResult
// ============================================================================

describe('createErrorResult', () => {
  it('creates failed result from Error', () => {
    const result = createErrorResult(makeEvalTask(), 'claude', new Error('boom'));
    expect(result.success).toBe(false);
    expect(result.error).toBe('boom');
    expect(result.rubricScore.overallScore).toBe(0);
  });

  it('creates failed result from string', () => {
    const result = createErrorResult(makeEvalTask(), 'claude', 'string error');
    expect(result.error).toBe('string error');
  });

  it('has zero duration and cost', () => {
    const result = createErrorResult(makeEvalTask(), 'claude', new Error('x'));
    expect(result.durationMs).toBe(0);
    expect(result.costUsd).toBe(0);
  });

  it('has empty response', () => {
    const result = createErrorResult(makeEvalTask(), 'claude', new Error('x'));
    expect(result.response).toBe('');
  });
});
