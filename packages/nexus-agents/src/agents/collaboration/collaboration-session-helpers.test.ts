/**
 * Tests for Collaboration Session Helpers
 * @module agents/collaboration/collaboration-session-helpers.test
 */

import { describe, it, expect, vi } from 'vitest';
import type { ILogger } from '../../core/index.js';
import {
  MAX_EVENT_LISTENERS,
  emitEventToListeners,
  dispatchTaskAssignments,
  type SessionEvent,
  type TaskAssignmentDispatchInput,
} from './collaboration-session-helpers.js';
import type { CollaborationConfig, ExpertParticipation } from './collaboration-types.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeMockLogger(): ILogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as ILogger;
}

// ============================================================================
// MAX_EVENT_LISTENERS constant
// ============================================================================

describe('MAX_EVENT_LISTENERS', () => {
  it('is 50', () => {
    expect(MAX_EVENT_LISTENERS).toBe(50);
  });
});

// ============================================================================
// emitEventToListeners
// ============================================================================

describe('emitEventToListeners', () => {
  it('calls all listeners with the event', () => {
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    const event: SessionEvent = { type: 'status_change', status: 'in_progress' };
    const logger = makeMockLogger();

    emitEventToListeners([listener1, listener2], event, logger);
    expect(listener1).toHaveBeenCalledWith(event);
    expect(listener2).toHaveBeenCalledWith(event);
  });

  it('handles empty listeners array', () => {
    const event: SessionEvent = { type: 'status_change', status: 'completed' };
    const logger = makeMockLogger();
    expect(() => {
      emitEventToListeners([], event, logger);
    }).not.toThrow();
  });

  it('continues and logs error when listener throws', () => {
    const error = new Error('listener failed');
    const listener1 = vi.fn(() => {
      throw error;
    });
    const listener2 = vi.fn();
    const event: SessionEvent = { type: 'expert_joined', expertId: 'e1' };
    const logger = makeMockLogger();

    emitEventToListeners([listener1, listener2], event, logger);
    expect(listener1).toHaveBeenCalled();
    expect(listener2).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith('Event listener error', error, {
      eventType: 'expert_joined',
    });
  });

  it('wraps non-Error throws into Error', () => {
    const listener = vi.fn(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error, no-throw-literal
      throw 'string error';
    });
    const event: SessionEvent = { type: 'status_change', status: 'in_progress' };
    const logger = makeMockLogger();

    emitEventToListeners([listener], event, logger);
    expect(logger.error).toHaveBeenCalledWith(
      'Event listener error',
      expect.any(Error),
      expect.objectContaining({ eventType: 'status_change' })
    );
  });
});

// ============================================================================
// dispatchTaskAssignments
// ============================================================================

describe('dispatchTaskAssignments', () => {
  const baseInput: TaskAssignmentDispatchInput = {
    pattern: 'parallel',
    config: {
      sessionId: 's1',
      task: 'test',
      pattern: 'parallel',
    } as unknown as CollaborationConfig,
    participants: [{ expertId: 'e1', role: 'code_expert' }] as ExpertParticipation[],
    results: new Map(),
  };

  it('returns empty array for unknown pattern', () => {
    const result = dispatchTaskAssignments({
      ...baseInput,
      pattern: 'unknown' as 'parallel',
    });
    expect(result).toEqual([]);
  });

  it('dispatches parallel pattern', () => {
    const result = dispatchTaskAssignments({ ...baseInput, pattern: 'parallel' });
    expect(Array.isArray(result)).toBe(true);
  });

  it('dispatches sequential pattern', () => {
    const result = dispatchTaskAssignments({ ...baseInput, pattern: 'sequential' });
    expect(Array.isArray(result)).toBe(true);
  });

  it('dispatches consensus pattern', () => {
    const result = dispatchTaskAssignments({ ...baseInput, pattern: 'consensus' });
    expect(Array.isArray(result)).toBe(true);
  });
});
