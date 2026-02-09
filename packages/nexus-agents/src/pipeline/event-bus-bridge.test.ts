/**
 * EventBus Bridge tests (Issue #922, Phase C)
 *
 * Tests V2 pipeline → V1 agent event forwarding.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { EventBus } from './event-bus.js';
import { createEventBusBridge } from './event-bus-bridge.js';
import type { PipelineEvent } from './event-types.js';

// ============================================================================
// Mock V1 EventBus
// ============================================================================

const mockEmit = vi.fn();
vi.mock('../agents/collaboration/index.js', () => ({
  getGlobalEventBus: () => ({ emit: mockEmit }),
  createEvent: (topic: string, payload: unknown, opts?: { correlationId?: string }) => ({
    eventId: 'mock-id',
    timestamp: new Date().toISOString(),
    topic,
    payload,
    correlationId: opts?.correlationId,
  }),
}));

/** Safely get the first call's first arg. */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function firstCallArg() {
  const calls = mockEmit.mock.calls;
  expect(calls.length).toBeGreaterThanOrEqual(1);
  return calls[0]![0] as Record<string, unknown>;
}

// ============================================================================
// Tests
// ============================================================================

describe('createEventBusBridge', () => {
  let v2Bus: EventBus;

  beforeEach(() => {
    v2Bus = new EventBus();
    mockEmit.mockClear();
  });

  it('forwards V2 events to V1 bus', () => {
    createEventBusBridge({ source: v2Bus });
    const event: PipelineEvent = {
      type: 'task.created',
      timestamp: Date.now(),
      taskId: 'task-1',
    };
    v2Bus.emit(event);
    expect(mockEmit).toHaveBeenCalledOnce();
    expect(firstCallArg()['topic']).toBe('pipeline.task.created');
  });

  it('uses custom topic prefix', () => {
    createEventBusBridge({ source: v2Bus, topicPrefix: 'v2' });
    const event: PipelineEvent = {
      type: 'stage.started',
      timestamp: Date.now(),
      executionId: 'exec-1',
      stageId: 's1',
      pluginId: 'p1',
    };
    v2Bus.emit(event);
    expect(firstCallArg()['topic']).toBe('v2.stage.started');
  });

  it('extracts executionId as correlationId', () => {
    createEventBusBridge({ source: v2Bus });
    const event: PipelineEvent = {
      type: 'pipeline.started',
      timestamp: Date.now(),
      taskId: 'task-1',
      executionId: 'exec-abc',
    };
    v2Bus.emit(event);
    expect(firstCallArg()['correlationId']).toBe('exec-abc');
  });

  it('falls back to taskId when no executionId', () => {
    createEventBusBridge({ source: v2Bus });
    const event: PipelineEvent = {
      type: 'task.created',
      timestamp: Date.now(),
      taskId: 'task-42',
    };
    v2Bus.emit(event);
    expect(firstCallArg()['correlationId']).toBe('task-42');
  });

  it('strips type and timestamp from payload', () => {
    createEventBusBridge({ source: v2Bus });
    const event: PipelineEvent = {
      type: 'task.completed',
      timestamp: Date.now(),
      taskId: 'task-1',
      success: true,
    };
    v2Bus.emit(event);
    const payload = firstCallArg()['payload'] as Record<string, unknown>;
    expect(payload['taskId']).toBe('task-1');
    expect(payload['success']).toBe(true);
    expect(payload['type']).toBeUndefined();
    expect(payload['timestamp']).toBeUndefined();
  });

  it('tracks forwarded count', () => {
    const bridge = createEventBusBridge({ source: v2Bus });
    expect(bridge.forwarded()).toBe(0);
    v2Bus.emit({ type: 'task.created', timestamp: Date.now(), taskId: 'a' });
    v2Bus.emit({ type: 'task.created', timestamp: Date.now(), taskId: 'b' });
    expect(bridge.forwarded()).toBe(2);
  });

  it('stops forwarding after dispose', () => {
    const bridge = createEventBusBridge({ source: v2Bus });
    v2Bus.emit({ type: 'task.created', timestamp: Date.now(), taskId: 'a' });
    expect(bridge.forwarded()).toBe(1);
    bridge.dispose();
    v2Bus.emit({ type: 'task.created', timestamp: Date.now(), taskId: 'b' });
    expect(bridge.forwarded()).toBe(1);
    expect(mockEmit).toHaveBeenCalledTimes(1);
  });

  it('survives handler errors without crashing', () => {
    mockEmit.mockImplementationOnce(() => {
      throw new Error('V1 bus error');
    });
    createEventBusBridge({ source: v2Bus });
    expect(() => {
      v2Bus.emit({ type: 'task.created', timestamp: Date.now(), taskId: 'a' });
    }).not.toThrow();
  });

  it('forwards multiple event types', () => {
    createEventBusBridge({ source: v2Bus });
    const events: PipelineEvent[] = [
      { type: 'task.created', timestamp: Date.now(), taskId: 'a' },
      {
        type: 'stage.started',
        timestamp: Date.now(),
        executionId: 'e1',
        stageId: 's1',
        pluginId: 'p1',
      },
      {
        type: 'policy.evaluated',
        timestamp: Date.now(),
        executionId: 'e1',
        gateId: 'g1',
        decision: 'allow',
      },
    ];
    for (const e of events) v2Bus.emit(e);
    expect(mockEmit).toHaveBeenCalledTimes(3);
    const topics = mockEmit.mock.calls.map((c) => (c[0] as Record<string, unknown>)['topic']);
    expect(topics).toEqual([
      'pipeline.task.created',
      'pipeline.stage.started',
      'pipeline.policy.evaluated',
    ]);
  });
});
