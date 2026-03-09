/**
 * EventBus tests (Issue #912, Phase 4-2)
 *
 * Tests emit, subscribe, query, buffer bounds, and error handling.
 */
import { describe, it, expect, vi } from 'vitest';

import { EventBus } from './event-bus.js';
import type { PipelineEvent } from './event-types.js';

// ============================================================================
// Fixtures
// ============================================================================

function makeEvent(overrides: Partial<PipelineEvent> = {}): PipelineEvent {
  return {
    type: 'task.created',
    taskId: 'task-1',
    timestamp: Date.now(),
    ...overrides,
  } as PipelineEvent;
}

// ============================================================================
// Tests
// ============================================================================

describe('EventBus', () => {
  describe('emit', () => {
    it('increments totalEmitted', () => {
      const bus = new EventBus();
      bus.emit(makeEvent());
      expect(bus.totalEmitted).toBe(1);
    });

    it('stores event in buffer', () => {
      const bus = new EventBus();
      bus.emit(makeEvent());
      expect(bus.bufferSize).toBe(1);
    });

    it('fires matching subscribers', () => {
      const bus = new EventBus();
      const handler = vi.fn();
      bus.subscribe({}, handler);
      bus.emit(makeEvent());
      expect(handler).toHaveBeenCalledOnce();
    });
  });

  describe('subscribe', () => {
    it('filters by event type', () => {
      const bus = new EventBus();
      const handler = vi.fn();
      bus.subscribe({ type: 'task.failed' }, handler);
      bus.emit(makeEvent({ type: 'task.created' } as Partial<PipelineEvent>));
      expect(handler).not.toHaveBeenCalled();

      bus.emit(
        makeEvent({
          type: 'task.failed',
          taskId: 'task-1',
          error: 'boom',
        } as Partial<PipelineEvent>)
      );
      expect(handler).toHaveBeenCalledOnce();
    });

    it('filters by multiple event types', () => {
      const bus = new EventBus();
      const handler = vi.fn();
      bus.subscribe({ type: ['task.created', 'task.failed'] }, handler);
      bus.emit(makeEvent());
      bus.emit(
        makeEvent({
          type: 'task.failed',
          taskId: 'x',
          error: 'e',
        } as Partial<PipelineEvent>)
      );
      bus.emit(
        makeEvent({
          type: 'stage.started',
          executionId: 'x',
          stageId: 's',
          pluginId: 'p',
        } as Partial<PipelineEvent>)
      );
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('filters by taskId', () => {
      const bus = new EventBus();
      const handler = vi.fn();
      bus.subscribe({ taskId: 'task-2' }, handler);
      bus.emit(makeEvent({ taskId: 'task-1' } as Partial<PipelineEvent>));
      bus.emit(makeEvent({ taskId: 'task-2' } as Partial<PipelineEvent>));
      expect(handler).toHaveBeenCalledOnce();
    });

    it('returns working unsubscribe function', () => {
      const bus = new EventBus();
      const handler = vi.fn();
      const unsub = bus.subscribe({}, handler);
      bus.emit(makeEvent());
      expect(handler).toHaveBeenCalledOnce();

      unsub();
      bus.emit(makeEvent());
      expect(handler).toHaveBeenCalledOnce();
    });

    it('catches handler errors without propagating', () => {
      const bus = new EventBus();
      const badHandler = vi.fn(() => {
        throw new Error('handler boom');
      });
      bus.subscribe({}, badHandler);
      expect(() => {
        bus.emit(makeEvent());
      }).not.toThrow();
      expect(badHandler).toHaveBeenCalledOnce();
    });
  });

  describe('query', () => {
    it('returns all events with empty filter', () => {
      const bus = new EventBus();
      bus.emit(makeEvent());
      bus.emit(makeEvent());
      expect(bus.query({})).toHaveLength(2);
    });

    it('filters by type', () => {
      const bus = new EventBus();
      bus.emit(makeEvent());
      bus.emit(
        makeEvent({
          type: 'task.failed',
          taskId: 'x',
          error: 'e',
        } as Partial<PipelineEvent>)
      );
      const result = bus.query({ type: 'task.created' });
      expect(result).toHaveLength(1);
    });

    it('filters by since timestamp', () => {
      const bus = new EventBus();
      bus.emit(makeEvent({ timestamp: 100 } as Partial<PipelineEvent>));
      bus.emit(makeEvent({ timestamp: 200 } as Partial<PipelineEvent>));
      bus.emit(makeEvent({ timestamp: 300 } as Partial<PipelineEvent>));
      const result = bus.query({ since: 200 });
      expect(result).toHaveLength(2);
    });

    it('respects limit parameter', () => {
      const bus = new EventBus();
      for (let i = 0; i < 10; i++) {
        bus.emit(makeEvent());
      }
      expect(bus.query({}, 3)).toHaveLength(3);
    });
  });

  describe('buffer bounds', () => {
    it('evicts oldest events when buffer full', () => {
      const bus = new EventBus({ maxBufferSize: 5 });
      for (let i = 0; i < 10; i++) {
        bus.emit(
          makeEvent({
            timestamp: i,
          } as Partial<PipelineEvent>)
        );
      }
      expect(bus.bufferSize).toBe(5);
      expect(bus.totalEmitted).toBe(10);

      const events = bus.query({});
      const firstEvent = events[0];
      if (firstEvent !== undefined) {
        expect(firstEvent.timestamp).toBe(5);
      }
    });
  });

  describe('unsubscribe compaction (#1473)', () => {
    it('compacts subscription array on unsubscribe', () => {
      const bus = new EventBus();
      const unsub = bus.subscribe({}, vi.fn());
      expect(bus.subscriptionCount).toBe(1);

      unsub();
      expect(bus.subscriptionCount).toBe(0);
    });

    it('maintains correct count after multiple subscribe/unsubscribe cycles', () => {
      const bus = new EventBus();
      const unsubs: (() => void)[] = [];

      // Subscribe 5
      for (let i = 0; i < 5; i++) {
        unsubs.push(bus.subscribe({}, vi.fn()));
      }
      expect(bus.subscriptionCount).toBe(5);

      // Unsubscribe first 3
      unsubs[0]?.();
      unsubs[1]?.();
      unsubs[2]?.();
      expect(bus.subscriptionCount).toBe(2);

      // Subscribe 2 more
      unsubs.push(bus.subscribe({}, vi.fn()));
      unsubs.push(bus.subscribe({}, vi.fn()));
      expect(bus.subscriptionCount).toBe(4);

      // Unsubscribe all remaining
      unsubs[3]?.();
      unsubs[4]?.();
      unsubs[5]?.();
      unsubs[6]?.();
      expect(bus.subscriptionCount).toBe(0);
    });

    it('emit still works correctly after unsubscribe compaction', () => {
      const bus = new EventBus();
      const handlerA = vi.fn();
      const handlerB = vi.fn();
      const handlerC = vi.fn();

      const unsubA = bus.subscribe({}, handlerA);
      bus.subscribe({}, handlerB);
      bus.subscribe({}, handlerC);

      // Remove middle-ish handler (A) to test compaction
      unsubA();
      expect(bus.subscriptionCount).toBe(2);

      bus.emit(makeEvent());
      expect(handlerA).not.toHaveBeenCalled();
      expect(handlerB).toHaveBeenCalledOnce();
      expect(handlerC).toHaveBeenCalledOnce();
    });
  });

  describe('subscriber snapshot safety (#1206)', () => {
    it('should handle unsubscribe during emission without skipping handlers', () => {
      const bus = new EventBus();
      const calls: string[] = [];
      const holder: { unsub?: () => void } = {};

      bus.subscribe({}, () => {
        calls.push('A');
        // Unsubscribe B during A's handler
        holder.unsub?.();
      });
      holder.unsub = bus.subscribe({}, () => {
        calls.push('B');
      });
      bus.subscribe({}, () => {
        calls.push('C');
      });

      const event: PipelineEvent = {
        type: 'pipeline.started',
        timestamp: Date.now(),
        taskId: 'task-snap',
        executionId: 'test-snap',
      };
      bus.emit(event);

      // All 3 handlers should fire because snapshot was taken before iteration
      expect(calls).toEqual(['A', 'B', 'C']);
    });
  });
});
