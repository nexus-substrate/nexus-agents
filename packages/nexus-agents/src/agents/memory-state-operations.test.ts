/**
 * Tests for Memory State Operations
 *
 * @module agents/memory-state-operations.test
 */

import { describe, it, expect } from 'vitest';
import {
  recordTaskLearning,
  recordExecutionPattern,
  recordErrorResolution,
  findErrorResolution,
  getLearningsByType,
} from './memory-state-operations.js';
import type { AgentMemoryState } from './memory-state-types.js';
import { createInitialMemoryState } from './memory-state-types.js';

// ============================================================================
// Helpers
// ============================================================================

function makeState(): AgentMemoryState {
  return createInitialMemoryState('agent-1', 'code_expert');
}

// ============================================================================
// recordTaskLearning
// ============================================================================

describe('recordTaskLearning', () => {
  it('adds a learning to empty state', () => {
    const state = makeState();
    const updated = recordTaskLearning(state, {
      taskType: 'code_review',
      insight: 'Always check edge cases',
      confidence: 0.9,
    });

    expect(updated.taskLearnings).toHaveLength(1);
    expect(updated.taskLearnings[0]?.insight).toBe('Always check edge cases');
    expect(updated.taskLearnings[0]?.taskType).toBe('code_review');
    expect(updated.taskLearnings[0]?.confidence).toBe(0.9);
  });

  it('generates unique ID', () => {
    const state = makeState();
    const updated = recordTaskLearning(state, {
      taskType: 'test',
      insight: 'insight',
      confidence: 0.5,
    });

    expect(updated.taskLearnings[0]?.id).toMatch(/^learn_/);
  });

  it('sets learnedAt timestamp', () => {
    const state = makeState();
    const updated = recordTaskLearning(state, {
      taskType: 'test',
      insight: 'insight',
      confidence: 0.5,
    });

    expect(updated.taskLearnings[0]?.learnedAt).toBeInstanceOf(Date);
  });

  it('preserves existing learnings', () => {
    let state = makeState();
    state = recordTaskLearning(state, {
      taskType: 'first',
      insight: 'first insight',
      confidence: 0.8,
    });
    state = recordTaskLearning(state, {
      taskType: 'second',
      insight: 'second insight',
      confidence: 0.7,
    });

    expect(state.taskLearnings).toHaveLength(2);
    expect(state.taskLearnings[0]?.insight).toBe('first insight');
    expect(state.taskLearnings[1]?.insight).toBe('second insight');
  });

  it('does not mutate original state', () => {
    const state = makeState();
    const updated = recordTaskLearning(state, {
      taskType: 'test',
      insight: 'insight',
      confidence: 0.5,
    });

    expect(state.taskLearnings).toHaveLength(0);
    expect(updated.taskLearnings).toHaveLength(1);
  });
});

// ============================================================================
// recordExecutionPattern
// ============================================================================

describe('recordExecutionPattern', () => {
  it('creates new pattern when none exists', () => {
    const state = makeState();
    const updated = recordExecutionPattern(state, {
      pattern: 'decompose-then-synthesize',
    });

    expect(updated.executionPatterns).toHaveLength(1);
    expect(updated.executionPatterns[0]?.pattern).toBe('decompose-then-synthesize');
    expect(updated.executionPatterns[0]?.occurrences).toBe(1);
  });

  it('updates existing pattern with running average', () => {
    const state = makeState();
    const first = recordExecutionPattern(state, {
      pattern: 'test-pattern',
    });

    // Occurrence 1: rate=0.8
    // Adding occurrence 2: rate=(0.8*1 + 0.6) / 2 = 0.7
    const second = recordExecutionPattern(first, {
      pattern: 'test-pattern',
    });

    expect(second.executionPatterns).toHaveLength(1);
    // Was also asserting `successRate` blended to 0.7. The field is gone
    // (#5261): both writers hardcoded 1.0, so the blend could never move.
    // `occurrences` is the count that was always real.
    expect(second.executionPatterns[0]?.occurrences).toBe(2);
  });

  it('generates unique ID for new patterns', () => {
    const state = makeState();
    const updated = recordExecutionPattern(state, {
      pattern: 'new-pattern',
    });

    expect(updated.executionPatterns[0]?.id).toMatch(/^pattern_/);
  });

  it('uses provided occurrences for new pattern', () => {
    const state = makeState();
    const updated = recordExecutionPattern(state, {
      pattern: 'pre-existing',
      occurrences: 5,
    });

    expect(updated.executionPatterns[0]?.occurrences).toBe(5);
  });

  it('does not mutate original state', () => {
    const state = makeState();
    recordExecutionPattern(state, {
      pattern: 'test',
    });

    expect(state.executionPatterns).toHaveLength(0);
  });
});

// ============================================================================
// recordErrorResolution
// ============================================================================

describe('recordErrorResolution', () => {
  it('adds new error resolution', () => {
    const state = makeState();
    const updated = recordErrorResolution(state, {
      errorPattern: 'ECONNREFUSED',
      resolution: 'Retry with backoff',
      successful: true,
    });

    expect(updated.errorResolutions).toHaveLength(1);
    expect(updated.errorResolutions[0]?.errorPattern).toBe('ECONNREFUSED');
    expect(updated.errorResolutions[0]?.resolution).toBe('Retry with backoff');
  });

  it('replaces existing resolution for same error pattern', () => {
    const state = makeState();
    const first = recordErrorResolution(state, {
      errorPattern: 'ECONNREFUSED',
      resolution: 'Original fix',
      successful: false,
    });
    const second = recordErrorResolution(first, {
      errorPattern: 'ECONNREFUSED',
      resolution: 'Better fix',
      successful: true,
    });

    expect(second.errorResolutions).toHaveLength(1);
    expect(second.errorResolutions[0]?.resolution).toBe('Better fix');
    expect(second.errorResolutions[0]?.successful).toBe(true);
  });

  it('sets resolvedAt timestamp', () => {
    const state = makeState();
    const updated = recordErrorResolution(state, {
      errorPattern: 'test',
      resolution: 'fix',
      successful: true,
    });

    expect(updated.errorResolutions[0]?.resolvedAt).toBeInstanceOf(Date);
  });

  it('preserves other resolutions when replacing', () => {
    let state = makeState();
    state = recordErrorResolution(state, {
      errorPattern: 'error-A',
      resolution: 'fix-A',
      successful: true,
    });
    state = recordErrorResolution(state, {
      errorPattern: 'error-B',
      resolution: 'fix-B',
      successful: true,
    });
    // Replace error-A
    state = recordErrorResolution(state, {
      errorPattern: 'error-A',
      resolution: 'fix-A-v2',
      successful: true,
    });

    expect(state.errorResolutions).toHaveLength(2);
    expect(state.errorResolutions[0]?.resolution).toBe('fix-A-v2');
    expect(state.errorResolutions[1]?.resolution).toBe('fix-B');
  });
});

// ============================================================================
// findErrorResolution
// ============================================================================

describe('findErrorResolution', () => {
  it('finds resolution by substring match', () => {
    let state = makeState();
    state = recordErrorResolution(state, {
      errorPattern: 'ECONNREFUSED',
      resolution: 'Retry with backoff',
      successful: true,
    });

    const found = findErrorResolution(state, 'Connection error: ECONNREFUSED on port 3000');
    expect(found).toBeDefined();
    expect(found?.resolution).toBe('Retry with backoff');
  });

  it('returns undefined when no match', () => {
    const state = makeState();
    expect(findErrorResolution(state, 'Unknown error')).toBeUndefined();
  });

  it('only finds successful resolutions', () => {
    let state = makeState();
    state = recordErrorResolution(state, {
      errorPattern: 'timeout',
      resolution: 'Failed attempt',
      successful: false,
    });

    expect(findErrorResolution(state, 'Operation timeout')).toBeUndefined();
  });

  it('is case-insensitive', () => {
    let state = makeState();
    state = recordErrorResolution(state, {
      errorPattern: 'econnrefused',
      resolution: 'fix',
      successful: true,
    });

    const found = findErrorResolution(state, 'ECONNREFUSED error');
    expect(found).toBeDefined();
  });
});

// ============================================================================
// getLearningsByType
// ============================================================================

describe('getLearningsByType', () => {
  it('filters by task type', () => {
    let state = makeState();
    state = recordTaskLearning(state, {
      taskType: 'code_review',
      insight: 'Review insight',
      confidence: 0.9,
    });
    state = recordTaskLearning(state, {
      taskType: 'testing',
      insight: 'Test insight',
      confidence: 0.8,
    });
    state = recordTaskLearning(state, {
      taskType: 'code_review',
      insight: 'Another review insight',
      confidence: 0.7,
    });

    const reviews = getLearningsByType(state, 'code_review');
    expect(reviews).toHaveLength(2);
    expect(reviews[0]?.insight).toBe('Review insight');
  });

  it('sorts by confidence descending', () => {
    let state = makeState();
    state = recordTaskLearning(state, {
      taskType: 'test',
      insight: 'Low conf',
      confidence: 0.3,
    });
    state = recordTaskLearning(state, {
      taskType: 'test',
      insight: 'High conf',
      confidence: 0.9,
    });
    state = recordTaskLearning(state, {
      taskType: 'test',
      insight: 'Mid conf',
      confidence: 0.6,
    });

    const learnings = getLearningsByType(state, 'test');
    expect(learnings[0]?.confidence).toBe(0.9);
    expect(learnings[1]?.confidence).toBe(0.6);
    expect(learnings[2]?.confidence).toBe(0.3);
  });

  it('returns empty for unknown type', () => {
    const state = makeState();
    expect(getLearningsByType(state, 'nonexistent')).toEqual([]);
  });
});

// ============================================================================
// getTopPatterns
// ============================================================================

