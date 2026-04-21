/**
 * Tests for BaseAgent Memory Accessor Helpers
 *
 * @module agents/base-agent-memory-accessors.test
 */

import { describe, it, expect, vi } from 'vitest';
import {
  getMemoryStateCopy,
  getRelevantMemoriesCopy,
  createMemoryOpContext,
  findResolution,
  getTaskLearningsByType,
  getTopPatterns,
} from './base-agent-memory-accessors.js';
import type { MemoryAccessorContext } from './base-agent-memory-accessors.js';
import type { AgentMemoryState } from './base-agent-memory-init.js';
import type { TypedMemoryEntry } from '../context/memory-types.js';

// ============================================================================
// Helpers
// ============================================================================

function makeMemoryState(): AgentMemoryState {
  return {
    agentId: 'test-agent',
    role: 'executor' as AgentMemoryState['role'],
    persistedAt: new Date(),
    taskLearnings: [
      {
        id: 'l1',
        taskType: 'code',
        insight: 'Use mocks',
        learnedAt: new Date(),
        confidence: 0.9,
      },
    ],
    executionPatterns: [
      {
        id: 'p1',
        pattern: 'unit-test',
        successRate: 0.95,
        occurrences: 10,
        lastSeen: new Date(),
      },
    ],
    errorResolutions: [
      {
        errorPattern: 'enoent',
        resolution: 'Check file path',
        successful: true,
        resolvedAt: new Date(),
      },
    ],
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeAccessorContext(overrides: Partial<MemoryAccessorContext> = {}) {
  return {
    memoryEnabled: true,
    memoryBackend: undefined,
    memoryState: makeMemoryState(),
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    ...overrides,
  } as unknown as MemoryAccessorContext;
}

// ============================================================================
// getMemoryStateCopy
// ============================================================================

describe('getMemoryStateCopy', () => {
  it('returns null for null state', () => {
    expect(getMemoryStateCopy(null)).toBeNull();
  });

  it('returns a copy of the state', () => {
    const state = makeMemoryState();
    const copy = getMemoryStateCopy(state);

    expect(copy).not.toBeNull();
    expect(copy).toBeDefined();
  });
});

// ============================================================================
// getRelevantMemoriesCopy
// ============================================================================

describe('getRelevantMemoriesCopy', () => {
  it('returns the input memories as-is', () => {
    const memories: TypedMemoryEntry[] = [];
    expect(getRelevantMemoriesCopy(memories)).toBe(memories);
  });

  it('handles non-empty arrays', () => {
    const memories = [{ key: 'test' }] as unknown as TypedMemoryEntry[];
    expect(getRelevantMemoriesCopy(memories)).toHaveLength(1);
  });
});

// ============================================================================
// createMemoryOpContext
// ============================================================================

describe('createMemoryOpContext', () => {
  it('creates operation context from accessor context', () => {
    const ctx = makeAccessorContext();
    const opCtx = createMemoryOpContext(ctx);

    expect(opCtx.memoryEnabled).toBe(true);
    expect(opCtx.memoryState).toBe(ctx.memoryState);
  });

  it('propagates disabled state', () => {
    const ctx = makeAccessorContext({ memoryEnabled: false });
    const opCtx = createMemoryOpContext(ctx);

    expect(opCtx.memoryEnabled).toBe(false);
  });
});

// ============================================================================
// findResolution
// ============================================================================

describe('findResolution', () => {
  it('returns undefined when memory disabled', () => {
    const opCtx = { memoryEnabled: false, memoryState: null };
    expect(findResolution(opCtx, 'ENOENT')).toBeUndefined();
  });

  it('returns undefined when no state', () => {
    const opCtx = { memoryEnabled: true, memoryState: null };
    expect(findResolution(opCtx, 'ENOENT')).toBeUndefined();
  });

  it('finds matching error resolution', () => {
    const state = makeMemoryState();
    const opCtx = { memoryEnabled: true, memoryState: state };
    const resolution = findResolution(opCtx, 'ENOENT');

    expect(resolution).toBeDefined();
    expect(resolution!.resolution).toBe('Check file path');
  });

  it('returns undefined for unknown error', () => {
    const state = makeMemoryState();
    const opCtx = { memoryEnabled: true, memoryState: state };
    expect(findResolution(opCtx, 'UNKNOWN_ERROR')).toBeUndefined();
  });
});

// ============================================================================
// getTaskLearningsByType
// ============================================================================

describe('getTaskLearningsByType', () => {
  it('returns empty when disabled', () => {
    const opCtx = { memoryEnabled: false, memoryState: null };
    expect(getTaskLearningsByType(opCtx, 'code')).toEqual([]);
  });

  it('returns learnings for matching type', () => {
    const state = makeMemoryState();
    const opCtx = { memoryEnabled: true, memoryState: state };
    const learnings = getTaskLearningsByType(opCtx, 'code');

    expect(learnings.length).toBe(1);
    expect(learnings[0]!.insight).toBe('Use mocks');
  });

  it('returns empty for unmatched type', () => {
    const state = makeMemoryState();
    const opCtx = { memoryEnabled: true, memoryState: state };
    expect(getTaskLearningsByType(opCtx, 'unknown-type')).toEqual([]);
  });
});

// ============================================================================
// getTopPatterns
// ============================================================================

describe('getTopPatterns', () => {
  it('returns empty when disabled', () => {
    const opCtx = { memoryEnabled: false, memoryState: null };
    expect(getTopPatterns(opCtx, 5)).toEqual([]);
  });

  it('returns patterns up to limit', () => {
    const state = makeMemoryState();
    const opCtx = { memoryEnabled: true, memoryState: state };
    const patterns = getTopPatterns(opCtx, 5);

    expect(patterns.length).toBe(1);
    expect(patterns[0]!.pattern).toBe('unit-test');
  });
});
