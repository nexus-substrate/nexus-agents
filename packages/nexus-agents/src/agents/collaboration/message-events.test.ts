/**
 * Tests for message-events.ts
 *
 * Covers message.sent, message.received, agent.task_delegated,
 * and agent.result_broadcast event emission through a mock event bus.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  emitMessageSent,
  emitMessageReceived,
  emitTaskDelegated,
  emitResultBroadcast,
} from './message-events.js';
import type { IEventBus } from './event-bus-types.js';
import type { AgentMessage, TaskResult } from '../../core/types/index.js';

// ============================================================================
// Mock event bus
// ============================================================================

function makeMockEventBus(): IEventBus & { emit: ReturnType<typeof vi.fn> } {
  return {
    emit: vi.fn(),
    emitAsync: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
    removeAllListeners: vi.fn(),
    listenerCount: vi.fn(),
  } as unknown as IEventBus & { emit: ReturnType<typeof vi.fn> };
}

function makeMessage(overrides: Partial<AgentMessage> = {}): AgentMessage {
  return {
    type: 'request',
    from: 'agent-a',
    to: 'agent-b',
    payload: { task: 'test' },
    timestamp: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as AgentMessage;
}

// ============================================================================
// emitMessageSent
// ============================================================================

describe('emitMessageSent', () => {
  it('emits event with correct topic', () => {
    const bus = makeMockEventBus();
    emitMessageSent(bus, { message: makeMessage(), from: 'agent-a' });
    expect(bus.emit).toHaveBeenCalledOnce();
    const event = bus.emit.mock.calls[0]![0];
    expect(event.topic).toBe('message.sent');
  });

  it('includes from in payload', () => {
    const bus = makeMockEventBus();
    emitMessageSent(bus, { message: makeMessage(), from: 'agent-a' });
    const event = bus.emit.mock.calls[0]![0];
    expect(event.payload.from).toBe('agent-a');
  });

  it('includes to when provided', () => {
    const bus = makeMockEventBus();
    emitMessageSent(bus, { message: makeMessage(), from: 'a', to: 'b' });
    const event = bus.emit.mock.calls[0]![0];
    expect(event.payload.to).toBe('b');
  });

  it('omits to when undefined', () => {
    const bus = makeMockEventBus();
    emitMessageSent(bus, { message: makeMessage(), from: 'a' });
    const event = bus.emit.mock.calls[0]![0];
    expect(event.payload.to).toBeUndefined();
  });

  it('includes sessionId when provided', () => {
    const bus = makeMockEventBus();
    emitMessageSent(bus, { message: makeMessage(), from: 'a', sessionId: 's1' });
    const event = bus.emit.mock.calls[0]![0];
    expect(event.sessionId).toBe('s1');
  });

  it('includes correlationId when provided', () => {
    const bus = makeMockEventBus();
    emitMessageSent(bus, { message: makeMessage(), from: 'a', correlationId: 'c1' });
    const event = bus.emit.mock.calls[0]![0];
    expect(event.correlationId).toBe('c1');
  });

  it('converts message to payload format', () => {
    const msg = makeMessage({ type: 'response', from: 'x', to: 'y' });
    const bus = makeMockEventBus();
    emitMessageSent(bus, { message: msg, from: 'x' });
    const event = bus.emit.mock.calls[0]![0];
    expect(event.payload.message).toBeDefined();
  });
});

// ============================================================================
// emitMessageReceived
// ============================================================================

describe('emitMessageReceived', () => {
  it('emits event with correct topic', () => {
    const bus = makeMockEventBus();
    emitMessageReceived(bus, { message: makeMessage(), by: 'agent-b' });
    expect(bus.emit).toHaveBeenCalledOnce();
    const event = bus.emit.mock.calls[0]![0];
    expect(event.topic).toBe('message.received');
  });

  it('includes by in payload', () => {
    const bus = makeMockEventBus();
    emitMessageReceived(bus, { message: makeMessage(), by: 'agent-b' });
    const event = bus.emit.mock.calls[0]![0];
    expect(event.payload.by).toBe('agent-b');
  });

  it('includes sessionId when provided', () => {
    const bus = makeMockEventBus();
    emitMessageReceived(bus, { message: makeMessage(), by: 'b', sessionId: 's2' });
    const event = bus.emit.mock.calls[0]![0];
    expect(event.sessionId).toBe('s2');
  });

  it('includes correlationId when provided', () => {
    const bus = makeMockEventBus();
    emitMessageReceived(bus, { message: makeMessage(), by: 'b', correlationId: 'c2' });
    const event = bus.emit.mock.calls[0]![0];
    expect(event.correlationId).toBe('c2');
  });
});

// ============================================================================
// emitTaskDelegated
// ============================================================================

describe('emitTaskDelegated', () => {
  it('emits event with correct topic', () => {
    const bus = makeMockEventBus();
    emitTaskDelegated(bus, {
      fromAgent: 'lead',
      toAgent: 'worker',
      taskDescription: 'Do work',
      priority: 'high',
    });
    expect(bus.emit).toHaveBeenCalledOnce();
    const event = bus.emit.mock.calls[0]![0];
    expect(event.topic).toBe('agent.task_delegated');
  });

  it('includes all delegation fields in payload', () => {
    const bus = makeMockEventBus();
    emitTaskDelegated(bus, {
      fromAgent: 'lead',
      toAgent: 'worker',
      taskDescription: 'Build feature',
      priority: 'critical',
    });
    const event = bus.emit.mock.calls[0]![0];
    expect(event.payload.fromAgent).toBe('lead');
    expect(event.payload.toAgent).toBe('worker');
    expect(event.payload.taskDescription).toBe('Build feature');
    expect(event.payload.priority).toBe('critical');
  });

  it('includes optional metadata', () => {
    const bus = makeMockEventBus();
    emitTaskDelegated(bus, {
      fromAgent: 'lead',
      toAgent: 'worker',
      taskDescription: 'Test',
      priority: 'low',
      sessionId: 's3',
      correlationId: 'c3',
    });
    const event = bus.emit.mock.calls[0]![0];
    expect(event.sessionId).toBe('s3');
    expect(event.correlationId).toBe('c3');
  });
});

// ============================================================================
// emitResultBroadcast
// ============================================================================

describe('emitResultBroadcast', () => {
  const mockResult: TaskResult = {
    taskId: 't1',
    success: true,
    output: 'done',
  } as TaskResult;

  it('emits event with correct topic', () => {
    const bus = makeMockEventBus();
    emitResultBroadcast(bus, {
      agentId: 'worker',
      result: mockResult,
      recipients: ['lead'],
    });
    expect(bus.emit).toHaveBeenCalledOnce();
    const event = bus.emit.mock.calls[0]![0];
    expect(event.topic).toBe('agent.result_broadcast');
  });

  it('includes result and recipients in payload', () => {
    const bus = makeMockEventBus();
    emitResultBroadcast(bus, {
      agentId: 'worker',
      result: mockResult,
      recipients: ['lead', 'reviewer'],
    });
    const event = bus.emit.mock.calls[0]![0];
    expect(event.payload.agentId).toBe('worker');
    expect(event.payload.result).toBe(mockResult);
    expect(event.payload.recipients).toEqual(['lead', 'reviewer']);
  });

  it('includes optional metadata', () => {
    const bus = makeMockEventBus();
    emitResultBroadcast(bus, {
      agentId: 'worker',
      result: mockResult,
      recipients: [],
      sessionId: 's4',
      correlationId: 'c4',
    });
    const event = bus.emit.mock.calls[0]![0];
    expect(event.sessionId).toBe('s4');
    expect(event.correlationId).toBe('c4');
  });
});
