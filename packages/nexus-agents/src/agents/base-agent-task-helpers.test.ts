/**
 * Tests for BaseAgent Task Execution Helpers
 * @module agents/base-agent-task-helpers.test
 */

import { describe, it, expect } from 'vitest';
import { AgentError } from '../core/index.js';
import { transformTaskError, checkAgentAvailability } from './base-agent-task-helpers.js';
import { AgentStateMachine } from './state-machine.js';

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
