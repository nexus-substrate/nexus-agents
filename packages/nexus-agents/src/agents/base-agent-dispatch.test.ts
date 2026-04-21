/**
 * Tests for BaseAgent Message Dispatch Helper
 *
 * @module agents/base-agent-dispatch.test
 */

import { describe, it, expect, vi } from 'vitest';
import { validateMessage, dispatchMessage } from './base-agent-dispatch.js';
import type { AgentMessage } from '../core/index.js';
import type { MessageHandlerContext } from './base-agent-message-handlers.js';

// ============================================================================
// Helpers
// ============================================================================

function makeMessage(overrides: Partial<AgentMessage> = {}): AgentMessage {
  return {
    id: 'msg-1',
    from: 'agent-a',
    to: 'agent-b',
    type: 'query',
    payload: {},
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeHandlerContext() {
  return {
    id: 'agent-b',
    role: 'executor',
    state: 'idle',
    capabilities: ['code_generation'],
    initialized: true,
    historyLength: 3,
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  } as unknown as MessageHandlerContext;
}

// ============================================================================
// validateMessage
// ============================================================================

describe('validateMessage', () => {
  it('validates a correct message', () => {
    const result = validateMessage({ msg: makeMessage() });

    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('rejects message with empty id', () => {
    const result = validateMessage({ msg: makeMessage({ id: '' }) });

    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('rejects message with empty from', () => {
    const result = validateMessage({ msg: makeMessage({ from: '' }) });

    expect(result.valid).toBe(false);
  });

  it('rejects message with empty to', () => {
    const result = validateMessage({ msg: makeMessage({ to: '' }) });

    expect(result.valid).toBe(false);
  });

  it('rejects message with invalid type', () => {
    const result = validateMessage({
      msg: makeMessage({ type: 'invalid' as AgentMessage['type'] }),
    });

    expect(result.valid).toBe(false);
  });

  it('accepts all valid message types', () => {
    const types: AgentMessage['type'][] = ['task', 'result', 'query', 'feedback', 'status'];

    for (const type of types) {
      const result = validateMessage({ msg: makeMessage({ type }) });
      expect(result.valid).toBe(true);
    }
  });
});

// ============================================================================
// dispatchMessage
// ============================================================================

describe('dispatchMessage', () => {
  it('dispatches query message', async () => {
    const msg = makeMessage({ type: 'query' });
    const ctx = makeHandlerContext();

    const result = await dispatchMessage({
      msg,
      ctx,
      executeTask: vi.fn(),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('completed');
      expect(result.value.data).toHaveProperty('agentId', 'agent-b');
    }
  });

  it('dispatches feedback message', async () => {
    const msg = makeMessage({ type: 'feedback' });
    const ctx = makeHandlerContext();

    const result = await dispatchMessage({
      msg,
      ctx,
      executeTask: vi.fn(),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('accepted');
    }
  });

  it('dispatches status message', async () => {
    const msg = makeMessage({ type: 'status' });
    const ctx = makeHandlerContext();

    const result = await dispatchMessage({
      msg,
      ctx,
      executeTask: vi.fn(),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('completed');
      expect(result.value.data).toHaveProperty('state', 'idle');
    }
  });

  it('dispatches result message', async () => {
    const msg = makeMessage({ type: 'result' });
    const ctx = makeHandlerContext();

    const result = await dispatchMessage({
      msg,
      ctx,
      executeTask: vi.fn(),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('accepted');
    }
  });

  it('dispatches task message and calls executor', async () => {
    const msg = makeMessage({
      type: 'task',
      payload: { id: 'task-1', description: 'Do something', context: {} },
    });
    const executor = vi
      .fn()
      .mockImplementation(() => Promise.resolve({ ok: true, value: { output: 'done' } }));

    const result = await dispatchMessage({
      msg,
      ctx: makeHandlerContext(),
      executeTask: executor,
    });

    expect(executor).toHaveBeenCalled();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('completed');
    }
  });

  it('returns error for unknown message type', async () => {
    const msg = makeMessage({ type: 'unknown' as AgentMessage['type'] });

    const result = await dispatchMessage({
      msg,
      ctx: makeHandlerContext(),
      executeTask: vi.fn(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Unknown message type');
    }
  });

  it('handles task executor failure', async () => {
    const msg = makeMessage({
      type: 'task',
      payload: { id: 'task-1', description: 'Fail me' },
    });
    const executor = vi
      .fn()
      .mockImplementation(() => Promise.resolve({ ok: false, error: new Error('Task failed') }));

    const result = await dispatchMessage({
      msg,
      ctx: makeHandlerContext(),
      executeTask: executor,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('failed');
    }
  });

  it('rejects task with missing payload id', async () => {
    const msg = makeMessage({
      type: 'task',
      payload: { description: 'No id' },
    });

    const result = await dispatchMessage({
      msg,
      ctx: makeHandlerContext(),
      executeTask: vi.fn(),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('rejected');
    }
  });
});
