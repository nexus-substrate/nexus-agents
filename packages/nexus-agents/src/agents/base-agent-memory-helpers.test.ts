/**
 * Tests for BaseAgent Memory Helpers
 * @module agents/base-agent-memory-helpers.test
 */

import { describe, it, expect, vi } from 'vitest';
import type {
  AgentMemoryState,
  ErrorResolution,
  TaskLearning,
} from './memory-state-types.js';
import {
  recordTaskFailureInMemory,
  getErrorResolution,
  getTaskLearningsByType,
} from './base-agent-memory-helpers.js';

vi.mock('../core/index.js', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    getTimeProvider: () => ({ now: () => 1700000000000 }),
  };
});

vi.mock('./base-agent-memory-init.js', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    persistMemoryState: vi.fn(() => Promise.resolve({ ok: true, value: undefined })),
    recordExecutionPattern: vi.fn((state: AgentMemoryState) => state),
    recordErrorResolution: vi.fn(
      (state: AgentMemoryState, resolution: Omit<ErrorResolution, 'resolvedAt'>) => ({
        ...state,
        errorResolutions: [
          ...state.errorResolutions,
          { ...resolution, resolvedAt: new Date(1700000000000) },
        ],
      })
    ),
    findErrorResolution: vi.fn((state: AgentMemoryState, errorMessage: string) =>
      state.errorResolutions.find(
        (r: ErrorResolution) =>
          r.successful && errorMessage.toLowerCase().includes(r.errorPattern.toLowerCase())
      )
    ),
    getLearningsByType: vi.fn((state: AgentMemoryState, taskType: string) =>
      state.taskLearnings
        .filter((l: TaskLearning) => l.taskType === taskType)
        .sort((a: TaskLearning, b: TaskLearning) => b.confidence - a.confidence)
    ),
    categorizeTaskByKeywords: vi.fn(() => 'general'),
  };
});

// ============================================================================
// Test Helpers
// ============================================================================

function makeMemoryState(overrides: Partial<AgentMemoryState> = {}): AgentMemoryState {
  return {
    agentId: 'agent-1',
    role: 'code_expert',
    persistedAt: new Date(1700000000000),
    taskLearnings: [],
    executionPatterns: [],
    errorResolutions: [],
    ...overrides,
  };
}

// ============================================================================
// recordTaskFailureInMemory
// ============================================================================

describe('recordTaskFailureInMemory', () => {
  it('records error string in memory', () => {
    const state = makeMemoryState();
    const result = recordTaskFailureInMemory(state, new Error('Something broke'));
    expect(result.errorResolutions).toHaveLength(1);
    expect(result.errorResolutions[0]!.errorPattern).toContain('Something broke');
  });

  it('truncates long error messages to 200 chars', () => {
    const state = makeMemoryState();
    const longError = 'x'.repeat(500);
    const result = recordTaskFailureInMemory(state, longError);
    expect(result.errorResolutions[0]!.errorPattern.length).toBeLessThanOrEqual(200);
  });

  it('marks resolution as unsuccessful', () => {
    const state = makeMemoryState();
    const result = recordTaskFailureInMemory(state, 'err');
    expect(result.errorResolutions[0]!.successful).toBe(false);
  });
});

// ============================================================================
// getErrorResolution
// ============================================================================

describe('getErrorResolution', () => {
  it('returns undefined for null state', () => {
    expect(getErrorResolution(null, 'some error')).toBeUndefined();
  });

  it('returns matching resolution', () => {
    const resolution: ErrorResolution = {
      errorPattern: 'timeout',
      resolution: 'increase timeout',
      successful: true,
      resolvedAt: new Date(),
    };
    const state = makeMemoryState({ errorResolutions: [resolution] });
    const result = getErrorResolution(state, 'Connection timeout occurred');
    expect(result).toBeDefined();
    expect(result!.resolution).toBe('increase timeout');
  });

  it('returns undefined when no match', () => {
    const state = makeMemoryState({ errorResolutions: [] });
    expect(getErrorResolution(state, 'unknown error')).toBeUndefined();
  });
});

// ============================================================================
// getTaskLearningsByType
// ============================================================================

describe('getTaskLearningsByType', () => {
  it('returns empty array for null state', () => {
    expect(getTaskLearningsByType(null, 'coding')).toEqual([]);
  });

  it('returns learnings sorted by confidence', () => {
    const learnings: TaskLearning[] = [
      { id: '1', taskType: 'coding', insight: 'low', confidence: 0.3, learnedAt: new Date() },
      { id: '2', taskType: 'coding', insight: 'high', confidence: 0.9, learnedAt: new Date() },
    ];
    const state = makeMemoryState({ taskLearnings: learnings });
    const result = getTaskLearningsByType(state, 'coding');
    expect(result[0]!.insight).toBe('high');
  });

  it('filters by task type', () => {
    const learnings: TaskLearning[] = [
      { id: '1', taskType: 'coding', insight: 'a', confidence: 0.5, learnedAt: new Date() },
      { id: '2', taskType: 'research', insight: 'b', confidence: 0.5, learnedAt: new Date() },
    ];
    const state = makeMemoryState({ taskLearnings: learnings });
    const result = getTaskLearningsByType(state, 'coding');
    expect(result).toHaveLength(1);
    expect(result[0]!.taskType).toBe('coding');
  });
});

// ============================================================================
// getTopExecutionPatterns
// ============================================================================

