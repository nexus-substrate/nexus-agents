/**
 * Tests for BaseAgent Task Execution Helpers
 * @module agents/base-agent-task-helpers.test
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { AgentError } from '../core/index.js';
import {
  transformTaskError,
  checkAgentAvailability,
  executeWithTimeout,
} from './base-agent-task-helpers.js';
import { AgentStateMachine } from './state-machine.js';
import type { Task } from '../core/index.js';

// ============================================================================
// checkAgentAvailability
// ============================================================================

describe('checkAgentAvailability', () => {
  it('returns ok when agent is idle', () => {
    const sm = new AgentStateMachine();
    const result = checkAgentAvailability({
      agentId: 'a1',
      taskId: 't1',
      stateMachine: sm,
    });
    expect(result.ok).toBe(true);
  });

  it('returns error when agent is thinking', () => {
    const sm = new AgentStateMachine();
    sm.transition('task_assigned');
    const result = checkAgentAvailability({
      agentId: 'a1',
      taskId: 't1',
      stateMachine: sm,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('not idle');
      expect(result.error.message).toContain('thinking');
    }
  });

  it('returns error when agent is acting', () => {
    const sm = new AgentStateMachine();
    sm.transition('task_assigned');
    sm.transition('plan_completed');
    const result = checkAgentAvailability({
      agentId: 'a1',
      taskId: 't1',
      stateMachine: sm,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('acting');
    }
  });

  it('auto-recovers from error state and returns ok', () => {
    const sm = new AgentStateMachine();
    sm.transition('task_assigned');
    sm.transition('failure');
    expect(sm.state).toBe('error');

    const result = checkAgentAvailability({
      agentId: 'a1',
      taskId: 't1',
      stateMachine: sm,
    });
    expect(result.ok).toBe(true);
    expect(sm.state).toBe('idle');
  });

  it('auto-recovers from error state even when maxErrorCount exceeded', () => {
    const sm = new AgentStateMachine({ maxErrorCount: 1 });
    // Error 1
    sm.transition('task_assigned');
    sm.transition('failure');
    expect(sm.errors).toBe(1);
    expect(sm.state).toBe('error');
    // recover() would fail here due to maxErrorCount, but reset() should work
    const recoverResult = sm.recover();
    expect(recoverResult.ok).toBe(false);

    // checkAgentAvailability should still auto-recover via reset()
    const result = checkAgentAvailability({
      agentId: 'a1',
      taskId: 't1',
      stateMachine: sm,
    });
    expect(result.ok).toBe(true);
    expect(sm.state).toBe('idle');
    expect(sm.errors).toBe(0);
  });

  it('resets error count after auto-recovery', () => {
    const sm = new AgentStateMachine();
    // Accumulate 2 errors
    sm.transition('task_assigned');
    sm.transition('failure');
    sm.recover();
    sm.transition('task_assigned');
    sm.transition('failure');
    expect(sm.errors).toBe(2);

    const result = checkAgentAvailability({
      agentId: 'a1',
      taskId: 't1',
      stateMachine: sm,
    });
    expect(result.ok).toBe(true);
    expect(sm.errors).toBe(0);
  });
});

// ============================================================================
// transformTaskError
// ============================================================================

describe('transformTaskError', () => {
  it('returns AgentError as-is', () => {
    const error = new AgentError('agent failed', { context: { taskId: 't1' } });
    const result = transformTaskError(error, 'agent-1', 'task-1');
    expect(result).toBe(error);
  });

  it('wraps regular Error', () => {
    const error = new Error('something broke');
    const result = transformTaskError(error, 'agent-1', 'task-1');
    expect(result).toBeInstanceOf(AgentError);
    expect(result.message).toContain('something broke');
    expect(result.cause).toBe(error);
  });

  it('wraps string error', () => {
    const result = transformTaskError('string error', 'agent-1', 'task-1');
    expect(result).toBeInstanceOf(AgentError);
    expect(result.message).toContain('string error');
  });

  it('wraps undefined error', () => {
    const result = transformTaskError(undefined, 'agent-1', 'task-1');
    expect(result).toBeInstanceOf(AgentError);
    expect(result.message).toContain('Unknown error');
  });

  it('includes agentId and taskId in context', () => {
    const result = transformTaskError(new Error('fail'), 'agent-42', 'task-99');
    expect(result.context).toEqual({ agentId: 'agent-42', taskId: 'task-99' });
  });

  it('wraps number error', () => {
    const result = transformTaskError(404, 'agent-1', 'task-1');
    expect(result).toBeInstanceOf(AgentError);
    expect(result.message).toContain('404');
  });

  it('does not set cause for non-Error values', () => {
    const result = transformTaskError('just a string', 'agent-1', 'task-1');
    expect(result.cause).toBeUndefined();
  });
});

// ============================================================================
// executeWithTimeout — AbortSignal support (Issue #1088 Phase 2)
// ============================================================================

describe('executeWithTimeout', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  const makeTask = (id = 'task-1') => ({ id, description: 'test', priority: 'medium' }) as Task;

  it('resolves with task result on success', async () => {
    const result = await executeWithTimeout({
      task: makeTask(),
      maxDurationMs: 5000,
      executeTask: () =>
        Promise.resolve({
          ok: true as const,
          value: { output: 'done', metadata: { tokensUsed: 10 } },
        }),
      transformError: (e, tid) => new AgentError(String(e), { context: { taskId: tid } }),
    });
    expect(result.ok).toBe(true);
  });

  it('resolves with timeout error when exceeded', async () => {
    vi.useFakeTimers();
    const promise = executeWithTimeout({
      task: makeTask(),
      maxDurationMs: 100,
      executeTask: () => new Promise(() => {}), // Never resolves
      transformError: (e, tid) => new AgentError(String(e), { context: { taskId: tid } }),
    });
    vi.advanceTimersByTime(200);
    const result = await promise;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('timed out');
    }
  });

  it('resolves with cancellation error when signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await executeWithTimeout({
      task: makeTask(),
      maxDurationMs: 5000,
      executeTask: () =>
        Promise.resolve({ ok: true as const, value: { output: '', metadata: { tokensUsed: 0 } } }),
      transformError: (e, tid) => new AgentError(String(e), { context: { taskId: tid } }),
      signal: controller.signal,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('cancelled');
    }
  });

  it('resolves with cancellation error when signal fires during execution', async () => {
    const controller = new AbortController();
    const promise = executeWithTimeout({
      task: makeTask(),
      maxDurationMs: 60_000,
      executeTask: () => new Promise(() => {}), // Never resolves
      transformError: (e, tid) => new AgentError(String(e), { context: { taskId: tid } }),
      signal: controller.signal,
    });
    // Abort after a microtask
    setTimeout(() => {
      controller.abort();
    }, 10);
    const result = await promise;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('cancelled');
      expect(result.error.context).toHaveProperty('reason', 'abort_signal');
    }
  });

  it('does not double-resolve when task completes before abort', async () => {
    const controller = new AbortController();
    const result = await executeWithTimeout({
      task: makeTask(),
      maxDurationMs: 5000,
      executeTask: () =>
        Promise.resolve({
          ok: true as const,
          value: { output: 'fast', metadata: { tokensUsed: 5 } },
        }),
      transformError: (e, tid) => new AgentError(String(e), { context: { taskId: tid } }),
      signal: controller.signal,
    });
    // Abort after already resolved — should be a no-op
    controller.abort();
    expect(result.ok).toBe(true);
  });

  it('handles task execution error with signal present', async () => {
    const controller = new AbortController();
    const result = await executeWithTimeout({
      task: makeTask(),
      maxDurationMs: 5000,
      executeTask: () => Promise.reject(new Error('boom')),
      transformError: (e, tid) => new AgentError(String(e), { context: { taskId: tid } }),
      signal: controller.signal,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('boom');
    }
  });
});
