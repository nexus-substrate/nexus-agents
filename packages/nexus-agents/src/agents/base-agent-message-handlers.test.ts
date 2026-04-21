/**
 * Tests for BaseAgent Message Handlers
 *
 * @module agents/base-agent-message-handlers.test
 */

import { describe, it, expect, vi } from 'vitest';
import {
  handleTaskMessage,
  handleQueryMessage,
  handleFeedbackMessage,
  handleStatusMessage,
  handleResultMessage,
} from './base-agent-message-handlers.js';
import type { MessageHandlerContext } from './base-agent-message-handlers.js';
import type { AgentMessage } from '../core/index.js';

// ============================================================================
// Helpers
// ============================================================================

function makeMessage(overrides: Partial<AgentMessage> = {}): AgentMessage {
  return {
    id: 'msg-1',
    from: 'sender',
    to: 'receiver',
    type: 'query',
    payload: {},
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeCtx(overrides: Partial<MessageHandlerContext> = {}) {
  return {
    id: 'agent-1',
    role: 'executor',
    state: 'idle',
    capabilities: ['code_generation', 'reasoning'],
    initialized: true,
    historyLength: 7,
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    ...overrides,
  } as unknown as MessageHandlerContext;
}

// ============================================================================
// handleTaskMessage
// ============================================================================

describe('handleTaskMessage', () => {
  it('executes task and returns completed', async () => {
    const msg = makeMessage({
      type: 'task',
      payload: { id: 'task-1', description: 'Test task' },
    });
    const executor = vi
      .fn()
      .mockImplementation(() => Promise.resolve({ ok: true, value: { output: 'result' } }));

    const result = await handleTaskMessage(msg, executor);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.messageId).toBe('msg-1');
      expect(result.value.status).toBe('completed');
      expect(result.value.data).toEqual({ output: 'result' });
    }
  });

  it('returns rejected for missing task id', async () => {
    const msg = makeMessage({
      type: 'task',
      payload: { description: 'No id' },
    });

    const result = await handleTaskMessage(msg, vi.fn());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('rejected');
      expect(result.value.error).toContain('missing id');
    }
  });

  it('returns rejected for missing description', async () => {
    const msg = makeMessage({
      type: 'task',
      payload: { id: 'task-1' },
    });

    const result = await handleTaskMessage(msg, vi.fn());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('rejected');
      expect(result.value.error).toContain('missing id or description');
    }
  });

  it('returns failed when executor fails', async () => {
    const msg = makeMessage({
      type: 'task',
      payload: { id: 'task-1', description: 'Fail' },
    });
    const executor = vi
      .fn()
      .mockImplementation(() => Promise.resolve({ ok: false, error: new Error('Boom') }));

    const result = await handleTaskMessage(msg, executor);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('failed');
      expect(result.value.error).toBe('Boom');
    }
  });

  it('passes constraints and priority to executor', async () => {
    const msg = makeMessage({
      type: 'task',
      payload: {
        id: 'task-1',
        description: 'With constraints',
        constraints: { maxTokens: 1000 },
        priority: 5,
      },
    });
    const executor = vi.fn().mockImplementation(() => Promise.resolve({ ok: true, value: {} }));

    await handleTaskMessage(msg, executor);

    const calledTask = executor.mock.calls[0]![0] as { constraints?: unknown; priority?: unknown };
    expect(calledTask.constraints).toEqual({ maxTokens: 1000 });
    expect(calledTask.priority).toBe(5);
  });
});

// ============================================================================
// handleQueryMessage
// ============================================================================

describe('handleQueryMessage', () => {
  it('returns agent info', async () => {
    const msg = makeMessage({ type: 'query' });
    const ctx = makeCtx();

    const result = await handleQueryMessage(msg, ctx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.messageId).toBe('msg-1');
      expect(result.value.status).toBe('completed');
      expect(result.value.data).toEqual({
        agentId: 'agent-1',
        role: 'executor',
        state: 'idle',
        capabilities: ['code_generation', 'reasoning'],
      });
    }
  });
});

// ============================================================================
// handleFeedbackMessage
// ============================================================================

describe('handleFeedbackMessage', () => {
  it('acknowledges feedback and logs', async () => {
    const ctx = makeCtx();
    const msg = makeMessage({ type: 'feedback', payload: { rating: 5 } });

    const result = await handleFeedbackMessage(msg, ctx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('accepted');
    }
    expect((ctx.logger as unknown as { info: ReturnType<typeof vi.fn> }).info).toHaveBeenCalledWith(
      'Received feedback',
      expect.objectContaining({ from: 'sender' })
    );
  });
});

// ============================================================================
// handleStatusMessage
// ============================================================================

describe('handleStatusMessage', () => {
  it('returns agent status', async () => {
    const ctx = makeCtx();
    const msg = makeMessage({ type: 'status' });

    const result = await handleStatusMessage(msg, ctx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.data).toEqual({
        agentId: 'agent-1',
        state: 'idle',
        initialized: true,
        historyLength: 7,
      });
    }
  });

  it('reflects uninitialized state', async () => {
    const ctx = makeCtx({ initialized: false, historyLength: 0 });
    const msg = makeMessage({ type: 'status' });

    const result = await handleStatusMessage(msg, ctx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.data).toHaveProperty('initialized', false);
      expect(result.value.data).toHaveProperty('historyLength', 0);
    }
  });
});

// ============================================================================
// handleResultMessage
// ============================================================================

describe('handleResultMessage', () => {
  it('acknowledges result and logs debug', async () => {
    const ctx = makeCtx();
    const msg = makeMessage({ type: 'result', payload: { data: 'output' } });

    const result = await handleResultMessage(msg, ctx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('accepted');
    }
    expect(
      (ctx.logger as unknown as { debug: ReturnType<typeof vi.fn> }).debug
    ).toHaveBeenCalledWith('Received result', expect.objectContaining({ from: 'sender' }));
  });
});
