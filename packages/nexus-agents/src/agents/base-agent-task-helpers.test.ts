/**
 * Tests for BaseAgent Task Execution Helpers
 * @module agents/base-agent-task-helpers.test
 */

import { describe, it, expect } from 'vitest';
import { AgentError } from '../core/index.js';
import { transformTaskError } from './base-agent-task-helpers.js';

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
