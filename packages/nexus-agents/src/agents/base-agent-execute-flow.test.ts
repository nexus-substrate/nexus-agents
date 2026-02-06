/**
 * Tests for BaseAgent Execute Flow Helpers
 *
 * @module agents/base-agent-execute-flow.test
 */

import { describe, it, expect, vi } from 'vitest';
import { setupExecute, addToHistory, getHistoryCopy } from './base-agent-execute-flow.js';
import type { ExecuteFlowContext } from './base-agent-execute-flow.js';
import type { Task, Message } from '../core/index.js';

// ============================================================================
// Helpers
// ============================================================================

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    description: 'Test task',
    context: {},
    ...overrides,
  } as Task;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeContext(overrides: Partial<ExecuteFlowContext> = {}) {
  return {
    agentId: 'agent-1',
    stateMachine: {
      isAvailable: vi.fn().mockReturnValue(true),
      startTask: vi.fn(),
      forceError: vi.fn(),
    },
    budgetTracker: {
      startTask: vi.fn(),
      endTask: vi.fn(),
      predictNextTokens: vi.fn().mockReturnValue(100),
      checkBudget: vi.fn().mockReturnValue({ allowed: true }),
      recordUsage: vi.fn(),
    },
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    memoryEnabled: false,
    memoryState: null,
    ...overrides,
  } as unknown as ExecuteFlowContext;
}

function makeMessage(role: 'user' | 'assistant', content: string): Message {
  return { role, content } as Message;
}

// ============================================================================
// setupExecute
// ============================================================================

describe('setupExecute', () => {
  it('returns valid setup for valid task and available agent', () => {
    const ctx = makeContext();
    const task = makeTask();

    const result = setupExecute(ctx, task);

    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.startTime).toBeGreaterThan(0);
  });

  it('returns invalid when task validation fails', () => {
    const ctx = makeContext();
    // Empty description triggers validation error
    const task = makeTask({ id: '', description: '' });

    const result = setupExecute(ctx, task);

    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.startTime).toBe(0);
  });

  it('returns invalid when agent is unavailable', () => {
    const ctx = makeContext();
    (ctx.stateMachine.isAvailable as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const task = makeTask();

    const result = setupExecute(ctx, task);

    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// ============================================================================
// addToHistory
// ============================================================================

describe('addToHistory', () => {
  it('appends message to history', () => {
    const history: Message[] = [makeMessage('user', 'Hello')];
    const result = addToHistory(history, makeMessage('assistant', 'Hi'));

    expect(result).toHaveLength(2);
    expect((result[1] as Message).content).toBe('Hi');
  });

  it('does not mutate original array', () => {
    const history: Message[] = [makeMessage('user', 'Hello')];
    addToHistory(history, makeMessage('assistant', 'Hi'));

    expect(history).toHaveLength(1);
  });

  it('caps history at 100 items', () => {
    const history: Message[] = Array.from({ length: 100 }, (_, i) =>
      makeMessage('user', `msg-${String(i)}`)
    );
    const result = addToHistory(history, makeMessage('user', 'overflow'));

    expect(result).toHaveLength(100);
    // First item should be msg-1 (msg-0 was dropped)
    expect((result[0] as Message).content).toBe('msg-1');
    // Last item should be the new message
    expect((result[99] as Message).content).toBe('overflow');
  });

  it('allows up to 100 items without trimming', () => {
    const history: Message[] = Array.from({ length: 99 }, (_, i) =>
      makeMessage('user', `msg-${String(i)}`)
    );
    const result = addToHistory(history, makeMessage('user', 'last'));

    expect(result).toHaveLength(100);
    expect((result[0] as Message).content).toBe('msg-0');
  });
});

// ============================================================================
// getHistoryCopy
// ============================================================================

describe('getHistoryCopy', () => {
  it('returns a copy of the history array', () => {
    const history: Message[] = [makeMessage('user', 'Hello')];
    const copy = getHistoryCopy(history);

    expect(copy).toEqual(history);
    expect(copy).not.toBe(history);
  });

  it('returns empty array for empty history', () => {
    const copy = getHistoryCopy([]);
    expect(copy).toEqual([]);
  });
});
