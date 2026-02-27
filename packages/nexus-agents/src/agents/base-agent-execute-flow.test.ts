/**
 * Tests for BaseAgent Execute Flow Helpers
 *
 * @module agents/base-agent-execute-flow.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  setupExecute,
  addToHistory,
  getHistoryCopy,
  runTaskWithTimeout,
} from './base-agent-execute-flow.js';
import type { ExecuteFlowContext } from './base-agent-execute-flow.js';
import type { Task, TaskResult, Message, Result } from '../core/index.js';
import { AgentError } from '../core/index.js';
import { resetHeartbeatMonitor, getHeartbeatMonitor } from './heartbeat-monitor.js';

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
      hasError: vi.fn().mockReturnValue(false),
      reset: vi.fn(),
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

// ============================================================================
// runTaskWithTimeout — Heartbeat integration (Issue #1088 Phase 2)
// ============================================================================

describe('runTaskWithTimeout', () => {
  beforeEach(() => {
    resetHeartbeatMonitor();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves with task result on success', async () => {
    const task = makeTask();
    const executeTask = vi.fn().mockResolvedValue({
      ok: true,
      value: {
        taskId: 'task-1',
        output: 'done',
        metadata: { tokensUsed: 10, durationMs: 0, toolsUsed: [], model: '' },
      },
    } satisfies Result<TaskResult, AgentError>);

    const promise = runTaskWithTimeout(task, 'agent-1', executeTask);
    // Let the microtask queue flush
    await vi.advanceTimersByTimeAsync(0);
    const result = await promise;

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.output).toBe('done');
    }
  });

  it('starts and ends heartbeat session', async () => {
    const monitor = getHeartbeatMonitor();
    const task = makeTask();
    const executeTask = vi.fn().mockResolvedValue({
      ok: true,
      value: { output: 'done', metadata: { tokensUsed: 0 } },
    });

    expect(monitor.activeCount).toBe(0);
    const promise = runTaskWithTimeout(task, 'agent-hb', executeTask);
    // During execution, session is active
    expect(monitor.activeCount).toBe(1);

    await vi.advanceTimersByTimeAsync(0);
    await promise;
    // After completion, session is cleaned up
    expect(monitor.activeCount).toBe(0);
  });

  it('cleans up session on task failure', async () => {
    const monitor = getHeartbeatMonitor();
    const task = makeTask();
    const executeTask = vi.fn().mockRejectedValue(new Error('boom'));

    const promise = runTaskWithTimeout(task, 'agent-fail', executeTask);
    await vi.advanceTimersByTimeAsync(0);
    const result = await promise;

    expect(result.ok).toBe(false);
    expect(monitor.activeCount).toBe(0);
  });

  it('cancels via abort when session expires', async () => {
    const task = makeTask();
    // Task that never resolves — will be cancelled by heartbeat monitor
    const executeTask = vi.fn().mockReturnValue(new Promise(() => {}));

    const promise = runTaskWithTimeout(task, 'agent-expire', executeTask);

    // Advance past absoluteMaxMs (900s) in heartbeat interval steps
    await vi.advanceTimersByTimeAsync(910_000);
    const result = await promise;

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('cancelled');
    }
  });

  it('uses task constraints maxDuration when provided', async () => {
    const task = makeTask({ constraints: { maxDuration: 1000 } });
    const executeTask = vi.fn().mockReturnValue(new Promise(() => {}));

    const promise = runTaskWithTimeout(task, 'agent-short', executeTask);
    await vi.advanceTimersByTimeAsync(1100);
    const result = await promise;

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('timed out');
    }
  });
});
