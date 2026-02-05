/**
 * Tests for Agent Runner Helpers
 * @module swe-bench/agent-runner-helpers.test
 */

import { describe, it, expect } from 'vitest';
import { AgentRunnerError } from './agent-runner-helpers.js';

// ============================================================================
// AgentRunnerError
// ============================================================================

describe('AgentRunnerError', () => {
  it('creates error with message', () => {
    const err = new AgentRunnerError('test error');
    expect(err.message).toBe('test error');
    expect(err.name).toBe('AgentRunnerError');
    expect(err.cause).toBeUndefined();
  });

  it('creates error with cause', () => {
    const cause = new Error('original');
    const err = new AgentRunnerError('wrapped', cause);
    expect(err.message).toBe('wrapped');
    expect(err.cause).toBe(cause);
  });

  it('is instance of Error', () => {
    const err = new AgentRunnerError('test');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AgentRunnerError);
  });
});
