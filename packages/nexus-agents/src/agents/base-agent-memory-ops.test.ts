/**
 * Tests for BaseAgent Memory Operation Helper Functions
 * @module agents/base-agent-memory-ops.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  AgentMemoryState,
  ExecutionPattern,
  ErrorResolution,
  TaskLearning,
} from './memory-state-types.js';

vi.mock('../core/index.js', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    getTimeProvider: () => ({ now: () => 1700000000000 }),
    getRandomProvider: () => ({ random: () => 0.123456 }),
  };
});

vi.mock('./base-agent-memory-init.js', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    persistMemoryState: vi.fn(() => Promise.resolve({ ok: true, value: undefined })),
    recordTaskLearning: vi.fn(
      (state: AgentMemoryState, learning: Omit<TaskLearning, 'id' | 'learnedAt'>) => ({
        ...state,
        taskLearnings: [
          ...state.taskLearnings,
          { ...learning, id: 'learn_1', learnedAt: new Date(1700000000000) },
        ],
      })
    ),
    recordExecutionPattern: vi.fn(
      (
        state: AgentMemoryState,
        pattern: Omit<ExecutionPattern, 'id' | 'lastSeen' | 'occurrences'>
      ) => ({
        ...state,
        executionPatterns: [
          ...state.executionPatterns,
          { ...pattern, id: 'pat_1', lastSeen: new Date(1700000000000), occurrences: 1 },
        ],
      })
    ),
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
      state.taskLearnings.filter((l: TaskLearning) => l.taskType === taskType)
    ),
  };
});

import {
  flushMemoryState,
  recordLearningToState,
  recordPatternToState,
  recordResolutionToState,
  findResolutionFromState,
  getLearningsFromState,
  copyMemoryState,
  doRecordLearning,
  doRecordPattern,
  doRecordResolution,
  doFindResolution,
  doGetLearnings,
} from './base-agent-memory-ops.js';
import { persistMemoryState } from './base-agent-memory-init.js';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeState(overrides: Partial<AgentMemoryState> = {}) {
  return {
    agentId: 'agent-1',
    role: 'code_expert' as const,
    persistedAt: new Date(1700000000000),
    taskLearnings: [],
    executionPatterns: [],
    errorResolutions: [],
    ...overrides,
  } satisfies AgentMemoryState;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
    setLevel: vi.fn(),
  };
}

const LEARNING = { taskType: 'coding', insight: 'use DI', confidence: 0.9 };
const PATTERN = { pattern: 'retry-on-timeout', successRate: 0.85 };
const RESOLUTION = { errorPattern: 'ECONNREFUSED', resolution: 'check server', successful: true };

// ============================================================================
// flushMemoryState
// ============================================================================

describe('flushMemoryState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns ok when memory is disabled', async () => {
    const result = await flushMemoryState({
      memoryEnabled: false,
      memoryBackend: undefined,
      memoryState: null,
      logger: makeLogger(),
    });
    expect(result.ok).toBe(true);
    expect(persistMemoryState).not.toHaveBeenCalled();
  });

  it('returns ok when backend is undefined', async () => {
    const result = await flushMemoryState({
      memoryEnabled: true,
      memoryBackend: undefined,
      memoryState: makeState(),
      logger: makeLogger(),
    });
    expect(result.ok).toBe(true);
  });

  it('returns ok when state is null', async () => {
    const backend = { store: vi.fn(), retrieve: vi.fn() };
    const result = await flushMemoryState({
      memoryEnabled: true,
      memoryBackend: backend as never,
      memoryState: null,
      logger: makeLogger(),
    });
    expect(result.ok).toBe(true);
  });

  it('delegates to persistMemoryState when enabled with backend and state', async () => {
    const backend = { store: vi.fn(), retrieve: vi.fn() };
    const state = makeState();
    const logger = makeLogger();
    await flushMemoryState({
      memoryEnabled: true,
      memoryBackend: backend as never,
      memoryState: state,
      logger,
    });
    expect(persistMemoryState).toHaveBeenCalledWith(backend, state, logger);
  });
});

// ============================================================================
// recordLearningToState
// ============================================================================

describe('recordLearningToState', () => {
  it('returns null when memory disabled', () => {
    const result = recordLearningToState({
      memoryEnabled: false,
      memoryState: null,
      learning: LEARNING,
    });
    expect(result).toBeNull();
  });

  it('returns null when state is null', () => {
    const result = recordLearningToState({
      memoryEnabled: true,
      memoryState: null,
      learning: LEARNING,
    });
    expect(result).toBeNull();
  });

  it('returns existing state when disabled but state exists', () => {
    const state = makeState();
    const result = recordLearningToState({
      memoryEnabled: false,
      memoryState: state,
      learning: LEARNING,
    });
    expect(result).toBe(state);
  });

  it('records learning when enabled with state', () => {
    const state = makeState();
    const result = recordLearningToState({
      memoryEnabled: true,
      memoryState: state,
      learning: LEARNING,
    });
    expect(result).not.toBeNull();
    expect(result!.taskLearnings).toHaveLength(1);
    expect(result!.taskLearnings[0]!.insight).toBe('use DI');
  });
});

// ============================================================================
// recordPatternToState
// ============================================================================

describe('recordPatternToState', () => {
  it('returns null when disabled and state null', () => {
    const result = recordPatternToState({
      memoryEnabled: false,
      memoryState: null,
      pattern: PATTERN,
    });
    expect(result).toBeNull();
  });

  it('records pattern when enabled', () => {
    const state = makeState();
    const result = recordPatternToState({
      memoryEnabled: true,
      memoryState: state,
      pattern: PATTERN,
    });
    expect(result).not.toBeNull();
    expect(result!.executionPatterns).toHaveLength(1);
  });
});

// ============================================================================
// recordResolutionToState
// ============================================================================

describe('recordResolutionToState', () => {
  it('returns null when disabled and state null', () => {
    const result = recordResolutionToState({
      memoryEnabled: false,
      memoryState: null,
      resolution: RESOLUTION,
    });
    expect(result).toBeNull();
  });

  it('records resolution when enabled', () => {
    const state = makeState();
    const result = recordResolutionToState({
      memoryEnabled: true,
      memoryState: state,
      resolution: RESOLUTION,
    });
    expect(result).not.toBeNull();
    expect(result!.errorResolutions).toHaveLength(1);
    expect(result!.errorResolutions[0]!.errorPattern).toBe('ECONNREFUSED');
  });
});

// ============================================================================
// findResolutionFromState
// ============================================================================

describe('findResolutionFromState', () => {
  it('returns undefined when disabled', () => {
    const result = findResolutionFromState({
      memoryEnabled: false,
      memoryState: null,
      errorMessage: 'err',
    });
    expect(result).toBeUndefined();
  });

  it('returns undefined when state is null', () => {
    const result = findResolutionFromState({
      memoryEnabled: true,
      memoryState: null,
      errorMessage: 'err',
    });
    expect(result).toBeUndefined();
  });

  it('finds matching resolution', () => {
    const res: ErrorResolution = {
      errorPattern: 'timeout',
      resolution: 'retry',
      successful: true,
      resolvedAt: new Date(),
    };
    const state = makeState({ errorResolutions: [res] });
    const result = findResolutionFromState({
      memoryEnabled: true,
      memoryState: state,
      errorMessage: 'connection timeout',
    });
    expect(result).toBeDefined();
    expect(result!.resolution).toBe('retry');
  });

  it('returns undefined when no match', () => {
    const state = makeState({ errorResolutions: [] });
    const result = findResolutionFromState({
      memoryEnabled: true,
      memoryState: state,
      errorMessage: 'unknown',
    });
    expect(result).toBeUndefined();
  });
});

// ============================================================================
// getLearningsFromState
// ============================================================================

describe('getLearningsFromState', () => {
  it('returns empty array when disabled', () => {
    expect(
      getLearningsFromState({ memoryEnabled: false, memoryState: null, taskType: 'x' })
    ).toEqual([]);
  });

  it('returns empty array when state null', () => {
    expect(
      getLearningsFromState({ memoryEnabled: true, memoryState: null, taskType: 'x' })
    ).toEqual([]);
  });

  it('filters by task type', () => {
    const learnings: TaskLearning[] = [
      { id: '1', taskType: 'coding', insight: 'a', confidence: 0.8, learnedAt: new Date() },
      { id: '2', taskType: 'review', insight: 'b', confidence: 0.5, learnedAt: new Date() },
    ];
    const state = makeState({ taskLearnings: learnings });
    const result = getLearningsFromState({
      memoryEnabled: true,
      memoryState: state,
      taskType: 'coding',
    });
    expect(result).toHaveLength(1);
  });
});

// ============================================================================
// getTopPatternsFromState
// ============================================================================


// ============================================================================
// copyMemoryState
// ============================================================================

describe('copyMemoryState', () => {
  it('returns null for null input', () => {
    expect(copyMemoryState(null)).toBeNull();
  });

  it('returns shallow copy of state', () => {
    const state = makeState({
      taskLearnings: [
        { id: '1', taskType: 't', insight: 'i', confidence: 1, learnedAt: new Date() },
      ],
    });
    const copy = copyMemoryState(state);
    expect(copy).not.toBe(state);
    expect(copy).toEqual(state);
  });

  it('shares inner references (shallow copy)', () => {
    const learnings: TaskLearning[] = [
      { id: '1', taskType: 't', insight: 'i', confidence: 1, learnedAt: new Date() },
    ];
    const state = makeState({ taskLearnings: learnings });
    const copy = copyMemoryState(state);
    expect(copy!.taskLearnings).toBe(state.taskLearnings);
  });
});

// ============================================================================
// do* convenience wrappers
// ============================================================================

describe('doRecordLearning', () => {
  it('delegates to recordLearningToState', () => {
    const state = makeState();
    const result = doRecordLearning({ memoryEnabled: true, memoryState: state }, LEARNING);
    expect(result).not.toBeNull();
    expect(result!.taskLearnings).toHaveLength(1);
  });

  it('returns null when disabled', () => {
    expect(doRecordLearning({ memoryEnabled: false, memoryState: null }, LEARNING)).toBeNull();
  });
});

describe('doRecordPattern', () => {
  it('delegates to recordPatternToState', () => {
    const state = makeState();
    const result = doRecordPattern({ memoryEnabled: true, memoryState: state }, PATTERN);
    expect(result!.executionPatterns).toHaveLength(1);
  });
});

describe('doRecordResolution', () => {
  it('delegates to recordResolutionToState', () => {
    const state = makeState();
    const result = doRecordResolution({ memoryEnabled: true, memoryState: state }, RESOLUTION);
    expect(result!.errorResolutions).toHaveLength(1);
  });
});

describe('doFindResolution', () => {
  it('returns undefined when disabled', () => {
    expect(doFindResolution({ memoryEnabled: false, memoryState: null }, 'err')).toBeUndefined();
  });

  it('finds resolution when enabled', () => {
    const res: ErrorResolution = {
      errorPattern: 'oom',
      resolution: 'increase mem',
      successful: true,
      resolvedAt: new Date(),
    };
    const state = makeState({ errorResolutions: [res] });
    expect(
      doFindResolution({ memoryEnabled: true, memoryState: state }, 'oom crash')!.resolution
    ).toBe('increase mem');
  });
});

describe('doGetLearnings', () => {
  it('returns empty when disabled', () => {
    expect(doGetLearnings({ memoryEnabled: false, memoryState: null }, 'x')).toEqual([]);
  });
});

