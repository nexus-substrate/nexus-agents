/**
 * Event Bus Tests
 *
 * Comprehensive test suite for the event bus implementation.
 *
 * @module agents/collaboration/event-bus.test
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  CollaborationEventBus,
  getGlobalEventBus,
  resetGlobalEventBus,
  createEvent,
  generateCorrelationId,
  createChildCorrelationId,
} from './event-bus.js';
import type {
  DomainEvent,
  SessionCreatedEvent,
  ConsensusVoteCastEvent,
} from './event-bus-types.js';
import { EventTopics } from './event-bus-types.js';

describe('CollaborationEventBus', () => {
  let bus: CollaborationEventBus;

  beforeEach(() => {
    bus = new CollaborationEventBus();
    resetGlobalEventBus();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('emit and subscribe', () => {
    it('should deliver events to matching subscribers', () => {
      const listener = vi.fn();
      bus.subscribe('session.created', listener);

      const event = createEvent<SessionCreatedEvent>(
        'session.created',
        { sessionId: 'test-123', pattern: 'review', experts: ['arch', 'sec'] },
        { sessionId: 'test-123' }
      );

      bus.emit(event);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: 'session.created',
          payload: expect.objectContaining({ sessionId: 'test-123' }),
        })
      );
    });

    it('should not deliver events to non-matching subscribers', () => {
      const listener = vi.fn();
      bus.subscribe('session.completed', listener);

      const event = createEvent<SessionCreatedEvent>(
        'session.created',
        { sessionId: 'test-123', pattern: 'review', experts: [] },
        { sessionId: 'test-123' }
      );

      bus.emit(event);

      expect(listener).not.toHaveBeenCalled();
    });

    it('should deliver events to multiple matching subscribers', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      bus.subscribe('session.created', listener1);
      bus.subscribe('session.created', listener2);

      const event = createEvent<SessionCreatedEvent>(
        'session.created',
        { sessionId: 'test-123', pattern: 'review', experts: [] },
        { sessionId: 'test-123' }
      );

      bus.emit(event);

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });
  });

  describe('wildcard patterns', () => {
    it('should match single-segment wildcard pattern', () => {
      const listener = vi.fn();
      bus.subscribe('session.*', listener);

      bus.emit(
        createEvent<SessionCreatedEvent>('session.created', {
          sessionId: 'test',
          pattern: 'review',
          experts: [],
        })
      );
      bus.emit(createEvent<DomainEvent>('session.completed', { success: true }));

      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('should match global wildcard pattern', () => {
      const listener = vi.fn();
      bus.subscribe('*', listener);

      bus.emit(
        createEvent<SessionCreatedEvent>('session.created', {
          sessionId: 'test',
          pattern: 'review',
          experts: [],
        })
      );
      bus.emit(createEvent<DomainEvent>('message.sent', { content: 'hello' }));
      bus.emit(createEvent<DomainEvent>('agent.task_delegated', { task: 'review code' }));

      expect(listener).toHaveBeenCalledTimes(3);
    });

    it('should not match partial segments with wildcard', () => {
      const listener = vi.fn();
      bus.subscribe('session.*', listener);

      // This should NOT match because session.* matches session.X, not session.X.Y
      bus.emit(createEvent<DomainEvent>('session.status.changed', { status: 'active' }));

      expect(listener).not.toHaveBeenCalled();
    });

    it('should handle multiple wildcards in pattern', () => {
      const listener = vi.fn();
      // Note: Our implementation treats * as single segment
      bus.subscribe('consensus.*', listener);

      bus.emit(createEvent<DomainEvent>('consensus.vote_requested', { proposalId: '1' }));
      bus.emit(
        createEvent<ConsensusVoteCastEvent>('consensus.vote_cast', {
          proposalId: '1',
          voterId: 'agent-1',
          decision: 'approve',
          reasoning: 'Good',
        })
      );

      expect(listener).toHaveBeenCalledTimes(2);
    });
  });

  describe('emitAsync', () => {
    it('should wait for all async handlers to complete', async () => {
      const results: number[] = [];

      bus.subscribe('test.async', async () => {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 10);
        });
        results.push(1);
      });

      bus.subscribe('test.async', async () => {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 5);
        });
        results.push(2);
      });

      await bus.emitAsync(createEvent<DomainEvent>('test.async', {}));

      expect(results).toHaveLength(2);
      expect(results).toContain(1);
      expect(results).toContain(2);
    });

    it('should isolate errors in async handlers', async () => {
      const successListener = vi.fn();
      const errorListener = vi.fn().mockRejectedValue(new Error('Handler failed'));

      bus.subscribe('test.error', errorListener);
      bus.subscribe('test.error', successListener);

      // Should not throw, and should still call success listener
      await expect(
        bus.emitAsync(createEvent<DomainEvent>('test.error', {}))
      ).resolves.toBeUndefined();

      expect(errorListener).toHaveBeenCalled();
      expect(successListener).toHaveBeenCalled();
    });
  });

  describe('unsubscribe', () => {
    it('should stop receiving events after unsubscribe', () => {
      const listener = vi.fn();
      const sub = bus.subscribe('session.created', listener);

      bus.emit(
        createEvent<SessionCreatedEvent>('session.created', {
          sessionId: 'test-1',
          pattern: 'review',
          experts: [],
        })
      );

      expect(listener).toHaveBeenCalledTimes(1);

      sub.unsubscribe();

      bus.emit(
        createEvent<SessionCreatedEvent>('session.created', {
          sessionId: 'test-2',
          pattern: 'review',
          experts: [],
        })
      );

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should handle unsubscribe via subscription ID', () => {
      const listener = vi.fn();
      const sub = bus.subscribe('test.topic', listener);

      bus.unsubscribe(sub.id);

      bus.emit(createEvent<DomainEvent>('test.topic', {}));

      expect(listener).not.toHaveBeenCalled();
    });

    it('should handle unsubscribe for non-existent subscription gracefully', () => {
      expect(() => {
        bus.unsubscribe('non-existent-id');
      }).not.toThrow();
    });
  });

  describe('event history', () => {
    it('should store emitted events in history', () => {
      bus.emit(createEvent<DomainEvent>('event.1', { n: 1 }));
      bus.emit(createEvent<DomainEvent>('event.2', { n: 2 }));
      bus.emit(createEvent<DomainEvent>('event.3', { n: 3 }));

      const history = bus.getHistory();

      expect(history).toHaveLength(3);
      expect(history[0]?.topic).toBe('event.1');
      expect(history[2]?.topic).toBe('event.3');
    });

    it('should filter history by topic pattern', () => {
      bus.emit(createEvent<DomainEvent>('session.created', {}));
      bus.emit(createEvent<DomainEvent>('message.sent', {}));
      bus.emit(createEvent<DomainEvent>('session.completed', {}));

      const history = bus.getHistory({ topic: 'session.*' });

      expect(history).toHaveLength(2);
      expect(history.every((e) => e.topic.startsWith('session.'))).toBe(true);
    });

    it('should filter history by session ID', () => {
      bus.emit(createEvent<DomainEvent>('event.1', {}, { sessionId: 'session-a' }));
      bus.emit(createEvent<DomainEvent>('event.2', {}, { sessionId: 'session-b' }));
      bus.emit(createEvent<DomainEvent>('event.3', {}, { sessionId: 'session-a' }));

      const history = bus.getHistory({ sessionId: 'session-a' });

      expect(history).toHaveLength(2);
      expect(history.every((e) => e.sessionId === 'session-a')).toBe(true);
    });

    it('should filter history by correlation ID', () => {
      bus.emit(createEvent<DomainEvent>('event.1', {}, { correlationId: 'corr-1' }));
      bus.emit(createEvent<DomainEvent>('event.2', {}, { correlationId: 'corr-2' }));

      const history = bus.getHistory({ correlationId: 'corr-1' });

      expect(history).toHaveLength(1);
      expect(history[0]?.correlationId).toBe('corr-1');
    });

    it('should filter history by timestamp range', () => {
      const baseTime = new Date('2026-01-01T00:00:00Z');

      // Create events with specific timestamps
      const event1: DomainEvent = {
        eventId: 'e1',
        timestamp: new Date(baseTime.getTime()).toISOString(),
        topic: 'event.1',
        payload: {},
      };
      const event2: DomainEvent = {
        eventId: 'e2',
        timestamp: new Date(baseTime.getTime() + 1000).toISOString(),
        topic: 'event.2',
        payload: {},
      };
      const event3: DomainEvent = {
        eventId: 'e3',
        timestamp: new Date(baseTime.getTime() + 2000).toISOString(),
        topic: 'event.3',
        payload: {},
      };

      bus.emit(event1);
      bus.emit(event2);
      bus.emit(event3);

      const history = bus.getHistory({
        after: new Date(baseTime.getTime() + 500).toISOString(),
        before: new Date(baseTime.getTime() + 1500).toISOString(),
      });

      expect(history).toHaveLength(1);
      expect(history[0]?.topic).toBe('event.2');
    });

    it('should limit history results', () => {
      for (let i = 0; i < 10; i++) {
        bus.emit(createEvent<DomainEvent>(`event.${String(i)}`, { n: i }));
      }

      const history = bus.getHistory({ limit: 3 });

      expect(history).toHaveLength(3);
      // Should return last 3 events
      expect(history[0]?.topic).toBe('event.7');
      expect(history[2]?.topic).toBe('event.9');
    });

    it('should clear history', () => {
      bus.emit(createEvent<DomainEvent>('event.1', {}));
      bus.emit(createEvent<DomainEvent>('event.2', {}));

      expect(bus.getHistory()).toHaveLength(2);

      bus.clearHistory();

      expect(bus.getHistory()).toHaveLength(0);
    });

    it('should enforce max history size', () => {
      const smallBus = new CollaborationEventBus({ maxHistorySize: 5 });

      for (let i = 0; i < 10; i++) {
        smallBus.emit(createEvent<DomainEvent>(`event.${String(i)}`, { n: i }));
      }

      const history = smallBus.getHistory();

      expect(history).toHaveLength(5);
      // Should keep most recent events
      expect(history[0]?.topic).toBe('event.5');
      expect(history[4]?.topic).toBe('event.9');
    });
  });

  describe('statistics', () => {
    it('should track events emitted', () => {
      bus.emit(createEvent<DomainEvent>('event.1', {}));
      bus.emit(createEvent<DomainEvent>('event.2', {}));
      bus.emit(createEvent<DomainEvent>('event.3', {}));

      const stats = bus.getStats();

      expect(stats.eventsEmitted).toBe(3);
    });

    it('should track subscriptions created and active', () => {
      const sub1 = bus.subscribe('topic.1', vi.fn());
      bus.subscribe('topic.2', vi.fn());

      let stats = bus.getStats();
      expect(stats.subscriptionsCreated).toBe(2);
      expect(stats.activeSubscriptions).toBe(2);

      sub1.unsubscribe();

      stats = bus.getStats();
      expect(stats.subscriptionsCreated).toBe(2);
      expect(stats.activeSubscriptions).toBe(1);
    });

    it('should track history size', () => {
      bus.emit(createEvent<DomainEvent>('event.1', {}));
      bus.emit(createEvent<DomainEvent>('event.2', {}));

      let stats = bus.getStats();
      expect(stats.historySize).toBe(2);

      bus.clearHistory();

      stats = bus.getStats();
      expect(stats.historySize).toBe(0);
    });

    it('should track error count', () => {
      bus.subscribe('error.topic', () => {
        throw new Error('Listener error');
      });

      bus.emit(createEvent<DomainEvent>('error.topic', {}));

      const stats = bus.getStats();
      expect(stats.errorCount).toBe(1);
    });
  });

  describe('hasSubscribers', () => {
    it('should return true when matching subscribers exist', () => {
      bus.subscribe('session.created', vi.fn());

      expect(bus.hasSubscribers('session.created')).toBe(true);
      expect(bus.hasSubscribers('session.*')).toBe(true);
    });

    it('should return false when no matching subscribers', () => {
      bus.subscribe('session.created', vi.fn());

      expect(bus.hasSubscribers('message.sent')).toBe(false);
    });

    it('should handle wildcard subscribers correctly', () => {
      bus.subscribe('session.*', vi.fn());

      expect(bus.hasSubscribers('session.created')).toBe(true);
      expect(bus.hasSubscribers('session.completed')).toBe(true);
      expect(bus.hasSubscribers('message.sent')).toBe(false);
    });
  });

  describe('error isolation', () => {
    it('should continue delivering to other listeners after error', () => {
      const listener1 = vi.fn().mockImplementation(() => {
        throw new Error('First listener failed');
      });
      const listener2 = vi.fn();
      const listener3 = vi.fn();

      bus.subscribe('test.error', listener1);
      bus.subscribe('test.error', listener2);
      bus.subscribe('test.error', listener3);

      bus.emit(createEvent<DomainEvent>('test.error', {}));

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
      expect(listener3).toHaveBeenCalled();
    });

    it('should handle async errors with asyncHandling enabled', async () => {
      const asyncBus = new CollaborationEventBus({ asyncHandling: true });
      const errorListener = vi.fn().mockImplementation(async () => {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 5);
        });
        throw new Error('Async error');
      });
      const successListener = vi.fn();

      asyncBus.subscribe('test.async', errorListener);
      asyncBus.subscribe('test.async', successListener);

      // emit() with asyncHandling catches errors but doesn't wait
      asyncBus.emit(createEvent<DomainEvent>('test.async', {}));

      // Give async handlers time to complete
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 20);
      });

      expect(asyncBus.getStats().errorCount).toBe(1);
    });
  });

  describe('subscription limits', () => {
    it('should enforce maximum subscription limit', () => {
      const maxBus = new CollaborationEventBus();

      // Add 500 subscriptions (the limit)
      for (let i = 0; i < 500; i++) {
        maxBus.subscribe(`topic.${String(i)}`, vi.fn());
      }

      // 501st should throw
      expect(() => maxBus.subscribe('topic.overflow', vi.fn())).toThrow(
        /Maximum subscription limit reached/
      );
    });
  });

  describe('event enrichment', () => {
    it('should add eventId if missing', () => {
      const listener = vi.fn();
      bus.subscribe('test.event', listener);

      const event: DomainEvent = {
        eventId: '',
        timestamp: '',
        topic: 'test.event',
        payload: {},
      };

      bus.emit(event);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: expect.stringMatching(/^evt-/),
        })
      );
    });

    it('should add timestamp if missing', () => {
      const listener = vi.fn();
      bus.subscribe('test.event', listener);

      const event: DomainEvent = {
        eventId: '',
        timestamp: '',
        topic: 'test.event',
        payload: {},
      };

      bus.emit(event);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        })
      );
    });

    it('should preserve existing eventId and timestamp', () => {
      const listener = vi.fn();
      bus.subscribe('test.event', listener);

      const event: DomainEvent = {
        eventId: 'custom-id',
        timestamp: '2026-01-01T00:00:00Z',
        topic: 'test.event',
        payload: {},
      };

      bus.emit(event);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: 'custom-id',
          timestamp: '2026-01-01T00:00:00Z',
        })
      );
    });
  });

  describe('logging', () => {
    it('should log events when logger provided', () => {
      const logger = {
        debug: vi.fn(),
        error: vi.fn(),
      };

      const loggingBus = new CollaborationEventBus({ logger });

      loggingBus.subscribe('test.log', vi.fn());
      loggingBus.emit(createEvent<DomainEvent>('test.log', {}));

      expect(logger.debug).toHaveBeenCalledWith(
        'Event emitted',
        expect.objectContaining({ topic: 'test.log' })
      );
    });

    it('should log errors when listener fails', () => {
      const logger = {
        debug: vi.fn(),
        error: vi.fn(),
      };

      const loggingBus = new CollaborationEventBus({ logger });

      loggingBus.subscribe('test.error', () => {
        throw new Error('Test error');
      });
      loggingBus.emit(createEvent<DomainEvent>('test.error', {}));

      expect(logger.error).toHaveBeenCalledWith(
        'Event listener error',
        expect.any(Error),
        expect.objectContaining({ eventTopic: 'test.error' })
      );
    });
  });
});

describe('Global Event Bus', () => {
  beforeEach(() => {
    resetGlobalEventBus();
  });

  it('should return singleton instance', () => {
    const bus1 = getGlobalEventBus();
    const bus2 = getGlobalEventBus();

    expect(bus1).toBe(bus2);
  });

  it('should create new instance after reset', () => {
    const bus1 = getGlobalEventBus();
    resetGlobalEventBus();
    const bus2 = getGlobalEventBus();

    expect(bus1).not.toBe(bus2);
  });

  it('should apply options on first creation', () => {
    const bus = getGlobalEventBus({ maxHistorySize: 10 });

    for (let i = 0; i < 20; i++) {
      bus.emit(createEvent<DomainEvent>(`event.${String(i)}`, {}));
    }

    expect(bus.getHistory()).toHaveLength(10);
  });
});

describe('createEvent helper', () => {
  it('should create properly structured event', () => {
    const event = createEvent<SessionCreatedEvent>(
      'session.created',
      { sessionId: 'test-123', pattern: 'review', experts: ['arch'] },
      { sessionId: 'test-123', correlationId: 'corr-456' }
    );

    expect(event.eventId).toMatch(/^evt-/);
    expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(event.topic).toBe('session.created');
    expect(event.payload.sessionId).toBe('test-123');
    expect(event.sessionId).toBe('test-123');
    expect(event.correlationId).toBe('corr-456');
  });

  it('should work without options', () => {
    const event = createEvent<DomainEvent>('test.topic', { data: 'value' });

    expect(event.eventId).toBeDefined();
    expect(event.timestamp).toBeDefined();
    expect(event.sessionId).toBeUndefined();
    expect(event.correlationId).toBeUndefined();
  });
});

describe('EventTopics constants', () => {
  it('should have all session topics', () => {
    expect(EventTopics.SESSION_CREATED).toBe('session.created');
    expect(EventTopics.SESSION_STATUS_CHANGED).toBe('session.status_changed');
    expect(EventTopics.SESSION_PARTICIPANT_JOINED).toBe('session.participant_joined');
    expect(EventTopics.SESSION_RESULT_SUBMITTED).toBe('session.result_submitted');
    expect(EventTopics.SESSION_FINALIZED).toBe('session.finalized');
    expect(EventTopics.SESSION_ALL).toBe('session.*');
  });

  it('should have all message topics', () => {
    expect(EventTopics.MESSAGE_SENT).toBe('message.sent');
    expect(EventTopics.MESSAGE_RECEIVED).toBe('message.received');
    expect(EventTopics.MESSAGE_ALL).toBe('message.*');
  });

  it('should have all consensus topics', () => {
    expect(EventTopics.CONSENSUS_VOTE_REQUESTED).toBe('consensus.vote_requested');
    expect(EventTopics.CONSENSUS_VOTE_CAST).toBe('consensus.vote_cast');
    expect(EventTopics.CONSENSUS_REACHED).toBe('consensus.reached');
    expect(EventTopics.CONSENSUS_ALL).toBe('consensus.*');
  });

  it('should have wildcard pattern', () => {
    expect(EventTopics.ALL).toBe('*');
  });
});

// =============================================================================
// Correlation ID Tests (Issue #224)
// =============================================================================

describe('generateCorrelationId', () => {
  it('should generate correlation ID with cor_ prefix', () => {
    const correlationId = generateCorrelationId();

    expect(correlationId).toMatch(/^cor_[a-f0-9]{8}$/);
  });

  it('should generate unique correlation IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateCorrelationId());
    }

    expect(ids.size).toBe(100);
  });
});

describe('createChildCorrelationId', () => {
  it('should create child ID chained to parent', () => {
    const parentId = 'cor_a1b2c3d4';
    const childId = createChildCorrelationId(parentId);

    expect(childId).toMatch(/^cor_a1b2c3d4\.child_[a-f0-9]{8}$/);
    expect(childId.startsWith(parentId)).toBe(true);
  });

  it('should support multi-level chaining', () => {
    const grandparent = generateCorrelationId();
    const parent = createChildCorrelationId(grandparent);
    const child = createChildCorrelationId(parent);

    expect(child).toContain(grandparent);
    expect(child).toContain('.child_');
    // Should have two .child_ segments
    expect(child.split('.child_').length).toBe(3);
  });

  it('should generate unique child IDs for same parent', () => {
    const parentId = generateCorrelationId();
    const children = new Set<string>();

    for (let i = 0; i < 50; i++) {
      children.add(createChildCorrelationId(parentId));
    }

    expect(children.size).toBe(50);
  });
});

describe('CollaborationEventBus correlation ID tracing', () => {
  let bus: CollaborationEventBus;

  beforeEach(() => {
    bus = new CollaborationEventBus();
  });

  it('should trace events across correlation ID hierarchy', () => {
    const rootId = generateCorrelationId();
    const childId = createChildCorrelationId(rootId);
    const grandchildId = createChildCorrelationId(childId);

    // Emit events at different levels
    bus.emit(
      createEvent<DomainEvent>('task.started', { level: 'root' }, { correlationId: rootId })
    );
    bus.emit(
      createEvent<DomainEvent>('task.delegated', { level: 'child' }, { correlationId: childId })
    );
    bus.emit(
      createEvent<DomainEvent>(
        'task.completed',
        { level: 'grandchild' },
        { correlationId: grandchildId }
      )
    );

    // Query by root should only find root
    const rootEvents = bus.getHistory({ correlationId: rootId });
    expect(rootEvents).toHaveLength(1);
    expect(rootEvents[0]?.payload).toEqual({ level: 'root' });

    // Query by child should only find child
    const childEvents = bus.getHistory({ correlationId: childId });
    expect(childEvents).toHaveLength(1);
    expect(childEvents[0]?.payload).toEqual({ level: 'child' });
  });

  it('should filter combined by topic and correlationId', () => {
    const corrId = generateCorrelationId();

    bus.emit(createEvent<DomainEvent>('task.started', { data: 1 }, { correlationId: corrId }));
    bus.emit(createEvent<DomainEvent>('task.completed', { data: 2 }, { correlationId: corrId }));
    bus.emit(
      createEvent<DomainEvent>('task.started', { data: 3 }, { correlationId: 'other-corr' })
    );

    const filtered = bus.getHistory({ topic: 'task.started', correlationId: corrId });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.payload).toEqual({ data: 1 });
  });
});
