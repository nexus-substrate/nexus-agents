/**
 * EventBus Bridge Tests
 *
 * Tests for the EventBus to MCP Server Bridge.
 * Covers initialization, event handling, SwarmObserver integration,
 * and configuration options.
 *
 * @module mcp/eventbus-bridge.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ILogger } from '../core/index.js';
import type { EventBusConfig } from '../config/index.js';
import { initializeEventBusBridge, getEventBusStats } from './eventbus-bridge.js';
import { SwarmObserver, createSwarmObserver } from '../observability/index.js';
import {
  type EventBus,
  getGlobalEventBus,
  resetGlobalEventBus,
  EventTopics,
  type DomainEvent,
} from '../agents/collaboration/index.js';

/**
 * Creates a mock logger for testing.
 */
function createMockLogger(): ILogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
    setLevel: vi.fn(),
  };
}

/**
 * Creates a test domain event.
 */
function createTestEvent(overrides: Partial<DomainEvent> = {}): DomainEvent {
  return {
    eventId: 'test-event-1',
    timestamp: new Date().toISOString(),
    topic: 'session.created',
    payload: { sessionId: 'session-1', agentId: 'agent-1' },
    sessionId: 'session-1',
    correlationId: 'corr-1',
    ...overrides,
  };
}

/**
 * Creates a mock SwarmObserver for testing.
 */
function createMockObserver(): SwarmObserver {
  const observer = createSwarmObserver({ maxEvents: 1000 }) as SwarmObserver;
  vi.spyOn(observer, 'recordEvent');
  vi.spyOn(observer, 'recordInteraction');
  return observer;
}

describe('EventBusBridge', () => {
  let mockLogger: ILogger;
  let mockObserver: SwarmObserver;

  beforeEach(() => {
    resetGlobalEventBus();
    mockLogger = createMockLogger();
    mockObserver = createMockObserver();
  });

  afterEach(() => {
    resetGlobalEventBus();
    vi.clearAllMocks();
  });

  describe('initializeEventBusBridge', () => {
    it('should initialize bridge with default config', () => {
      const result = initializeEventBusBridge(mockObserver, mockLogger);

      expect(result.initialized).toBe(true);
      expect(result.subscriptionCount).toBeGreaterThan(0);
      expect(typeof result.cleanup).toBe('function');
    });

    it('should log initialization message', () => {
      initializeEventBusBridge(mockObserver, mockLogger);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Initializing EventBus bridge for MCP server',
        expect.objectContaining({
          maxHistorySize: 1000,
          subscriptions: expect.any(Object),
        })
      );
    });

    it('should return disabled result when config.enabled is false', () => {
      const config: Partial<EventBusConfig> = { enabled: false };
      const result = initializeEventBusBridge(mockObserver, mockLogger, config);

      expect(result.initialized).toBe(false);
      expect(result.subscriptionCount).toBe(0);
    });

    it('should log disabled message when bridge is disabled', () => {
      const config: Partial<EventBusConfig> = { enabled: false };
      initializeEventBusBridge(mockObserver, mockLogger, config);

      expect(mockLogger.debug).toHaveBeenCalledWith('EventBus bridge disabled by configuration');
    });

    it('should create subscriptions for enabled event patterns', () => {
      const config: Partial<EventBusConfig> = {
        subscriptions: {
          consensus: true,
          agent: true,
          protocol: false,
          session: false,
          message: false,
          byzantine: false,
        },
      };

      const result = initializeEventBusBridge(mockObserver, mockLogger, config);

      // Should have 2 subscriptions (consensus and agent)
      expect(result.subscriptionCount).toBe(2);
    });

    it('should use custom maxHistorySize', () => {
      const config: Partial<EventBusConfig> = { maxHistorySize: 500 };
      initializeEventBusBridge(mockObserver, mockLogger, config);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Initializing EventBus bridge for MCP server',
        expect.objectContaining({
          maxHistorySize: 500,
        })
      );
    });

    it('should log completion with subscription count', () => {
      initializeEventBusBridge(mockObserver, mockLogger);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'EventBus bridge initialized',
        expect.objectContaining({
          subscriptionCount: expect.any(Number),
          eventBusStats: expect.any(Object),
        })
      );
    });
  });

  describe('event handling', () => {
    it('should log important events at info level', () => {
      initializeEventBusBridge(mockObserver, mockLogger);

      // Emit an important event (consensus.reached is in IMPORTANT_TOPICS)
      const event = createTestEvent({
        topic: EventTopics.CONSENSUS_REACHED,
        payload: { agentId: 'agent-1', decision: 'approve' },
      });

      // Get the global bus and emit
      const globalBus = getGlobalBus();
      globalBus.emit(event);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('EventBus:'),
        expect.objectContaining({
          topic: EventTopics.CONSENSUS_REACHED,
        })
      );
    });

    it('should log frequent events at debug level', () => {
      initializeEventBusBridge(mockObserver, mockLogger);

      // Emit a non-important event
      const event = createTestEvent({
        topic: 'agent.task_delegated',
        payload: { agentId: 'agent-1', taskId: 'task-1' },
      });

      const globalBus = getGlobalBus();
      globalBus.emit(event);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('EventBus:'),
        expect.objectContaining({
          topic: 'agent.task_delegated',
        })
      );
    });

    it('should record events to SwarmObserver', () => {
      initializeEventBusBridge(mockObserver, mockLogger);

      const event = createTestEvent({
        topic: EventTopics.SESSION_CREATED,
        payload: { agentId: 'agent-1', sessionId: 'session-1' },
      });

      const globalBus = getGlobalBus();
      globalBus.emit(event);

      expect(mockObserver.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: event.eventId,
          agentId: 'agent-1',
          traceId: expect.any(String),
          spanId: expect.any(String),
        })
      );
    });

    it('should not record event without agent ID', () => {
      initializeEventBusBridge(mockObserver, mockLogger);

      // Event without agentId in payload
      const event = createTestEvent({
        topic: EventTopics.SESSION_CREATED,
        payload: { sessionId: 'session-1' },
      });

      const globalBus = getGlobalBus();
      globalBus.emit(event);

      expect(mockObserver.recordEvent).not.toHaveBeenCalled();
    });

    it('should record interactions for message events', () => {
      initializeEventBusBridge(mockObserver, mockLogger, {
        subscriptions: { message: true },
      } as Partial<EventBusConfig>);

      const event = createTestEvent({
        topic: 'message.sent',
        payload: {
          agentId: 'agent-1',
          toAgentId: 'agent-2',
          content: 'test message',
        },
      });

      const globalBus = getGlobalBus();
      globalBus.emit(event);

      expect(mockObserver.recordInteraction).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'agent-1',
          to: 'agent-2',
          interactionType: 'message',
          outcome: 'success',
        })
      );
    });

    it('should not record interaction when source equals target', () => {
      initializeEventBusBridge(mockObserver, mockLogger, {
        subscriptions: { message: true },
      } as Partial<EventBusConfig>);

      const event = createTestEvent({
        topic: 'message.sent',
        payload: {
          agentId: 'agent-1',
          toAgentId: 'agent-1', // Same as source
        },
      });

      const globalBus = getGlobalBus();
      globalBus.emit(event);

      expect(mockObserver.recordInteraction).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should unsubscribe all subscriptions on cleanup', () => {
      const result = initializeEventBusBridge(mockObserver, mockLogger);

      result.cleanup();

      expect(mockLogger.debug).toHaveBeenCalledWith('Cleaning up EventBus bridge subscriptions');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'EventBus bridge cleanup complete',
        expect.objectContaining({
          unsubscribedCount: result.subscriptionCount,
        })
      );
    });

    it('should be safe to call cleanup multiple times', () => {
      const result = initializeEventBusBridge(mockObserver, mockLogger);

      expect(() => {
        result.cleanup();
        result.cleanup();
      }).not.toThrow();
    });
  });

  describe('getEventBusStats', () => {
    it('should return event bus statistics', () => {
      initializeEventBusBridge(mockObserver, mockLogger);

      const stats = getEventBusStats();

      expect(stats).toEqual(
        expect.objectContaining({
          eventsEmitted: expect.any(Number),
          activeSubscriptions: expect.any(Number),
          historySize: expect.any(Number),
          errorCount: expect.any(Number),
        })
      );
    });

    it('should reflect emitted events in stats', () => {
      initializeEventBusBridge(mockObserver, mockLogger);

      const globalBus = getGlobalBus();
      globalBus.emit(
        createTestEvent({
          topic: EventTopics.SESSION_CREATED,
          payload: { agentId: 'agent-1' },
        })
      );

      const stats = getEventBusStats();
      expect(stats.eventsEmitted).toBeGreaterThan(0);
    });
  });

  describe('configuration merging', () => {
    it('should use default config when undefined', () => {
      const result = initializeEventBusBridge(mockObserver, mockLogger, undefined);

      expect(result.initialized).toBe(true);
      // Default has 5 subscriptions (consensus, agent, protocol, session, byzantine)
      expect(result.subscriptionCount).toBe(5);
    });

    it('should merge partial subscriptions config', () => {
      const config = {
        subscriptions: {
          consensus: false,
        },
      } as Partial<EventBusConfig>;

      const result = initializeEventBusBridge(mockObserver, mockLogger, config);

      // Should have 4 subscriptions (agent, protocol, session, byzantine)
      expect(result.subscriptionCount).toBe(4);
    });

    it('should merge partial logging config', () => {
      const config = {
        logging: {
          frequentEventLevel: 'info',
        },
      } as Partial<EventBusConfig>;

      initializeEventBusBridge(mockObserver, mockLogger, config);

      // Emit a frequent event
      const event = createTestEvent({
        topic: 'agent.task_delegated',
        payload: { agentId: 'agent-1' },
      });

      const globalBus = getGlobalBus();
      globalBus.emit(event);

      // With frequentEventLevel set to 'info', should log at info level
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('EventBus:'),
        expect.any(Object)
      );
    });
  });

  describe('event type mapping', () => {
    it('should handle session events', () => {
      initializeEventBusBridge(mockObserver, mockLogger);

      const sessionEvents = [
        { topic: EventTopics.SESSION_CREATED, expected: 'task_started' },
        { topic: EventTopics.SESSION_FINALIZED, expected: 'task_completed' },
      ];

      for (const { topic } of sessionEvents) {
        const event = createTestEvent({
          topic,
          payload: { agentId: 'agent-1', sessionId: 'session-1' },
        });

        const globalBus = getGlobalBus();
        globalBus.emit(event);
      }

      expect(mockObserver.recordEvent).toHaveBeenCalled();
    });

    it('should handle consensus events', () => {
      initializeEventBusBridge(mockObserver, mockLogger);

      const event = createTestEvent({
        topic: EventTopics.CONSENSUS_REACHED,
        payload: { agentId: 'leader-1', decision: 'approve' },
      });

      const globalBus = getGlobalBus();
      globalBus.emit(event);

      expect(mockObserver.recordEvent).toHaveBeenCalled();
    });

    it('should handle protocol events', () => {
      initializeEventBusBridge(mockObserver, mockLogger);

      const event = createTestEvent({
        topic: EventTopics.PROTOCOL_STARTED,
        payload: { agentId: 'agent-1', protocolType: 'self-refine' },
      });

      const globalBus = getGlobalBus();
      globalBus.emit(event);

      expect(mockObserver.recordEvent).toHaveBeenCalled();
    });

    it('should handle byzantine events', () => {
      initializeEventBusBridge(mockObserver, mockLogger);

      const event = createTestEvent({
        topic: EventTopics.BYZANTINE_PATTERN_DETECTED,
        payload: { agentId: 'agent-1', pattern: 'flip-flopping' },
      });

      const globalBus = getGlobalBus();
      globalBus.emit(event);

      // Byzantine events are important and should be logged at info level
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('EventBus:'),
        expect.objectContaining({
          topic: EventTopics.BYZANTINE_PATTERN_DETECTED,
        })
      );
    });
  });

  describe('agent ID extraction', () => {
    it('should extract agentId from payload', () => {
      initializeEventBusBridge(mockObserver, mockLogger);

      const event = createTestEvent({
        topic: EventTopics.SESSION_CREATED,
        payload: { agentId: 'test-agent' },
      });

      const globalBus = getGlobalBus();
      globalBus.emit(event);

      expect(mockObserver.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'test-agent',
        })
      );
    });

    it('should extract fromAgentId from payload', () => {
      initializeEventBusBridge(mockObserver, mockLogger);

      const event = createTestEvent({
        topic: EventTopics.SESSION_CREATED,
        payload: { fromAgentId: 'sender-agent' },
      });

      const globalBus = getGlobalBus();
      globalBus.emit(event);

      expect(mockObserver.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'sender-agent',
        })
      );
    });

    it('should extract voterId from payload', () => {
      initializeEventBusBridge(mockObserver, mockLogger);

      const event = createTestEvent({
        topic: EventTopics.CONSENSUS_VOTE_CAST,
        payload: { voterId: 'voter-agent', decision: 'approve' },
      });

      const globalBus = getGlobalBus();
      globalBus.emit(event);

      expect(mockObserver.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'voter-agent',
        })
      );
    });

    it('should extract leaderId from payload', () => {
      initializeEventBusBridge(mockObserver, mockLogger);

      const event = createTestEvent({
        topic: EventTopics.CONSENSUS_REACHED,
        payload: { leaderId: 'leader-agent', decision: 'approve' },
      });

      const globalBus = getGlobalBus();
      globalBus.emit(event);

      expect(mockObserver.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'leader-agent',
        })
      );
    });
  });

  describe('correlation ID handling', () => {
    it('should use correlationId from event as traceId', () => {
      initializeEventBusBridge(mockObserver, mockLogger);

      const event = createTestEvent({
        topic: EventTopics.SESSION_CREATED,
        payload: { agentId: 'agent-1' },
        correlationId: 'custom-correlation-id',
      });

      const globalBus = getGlobalBus();
      globalBus.emit(event);

      expect(mockObserver.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          traceId: 'custom-correlation-id',
        })
      );
    });

    it('should generate traceId when correlationId is undefined', () => {
      initializeEventBusBridge(mockObserver, mockLogger);

      // Create event without correlationId to test trace ID generation
      const event: DomainEvent = {
        eventId: 'test-event-1',
        timestamp: new Date().toISOString(),
        topic: EventTopics.SESSION_CREATED,
        payload: { agentId: 'agent-1' },
      };

      const globalBus = getGlobalBus();
      globalBus.emit(event);

      expect(mockObserver.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          traceId: expect.any(String),
        })
      );
    });
  });

  describe('subscription patterns', () => {
    it('should subscribe to consensus.* pattern', () => {
      const result = initializeEventBusBridge(mockObserver, mockLogger, {
        subscriptions: {
          consensus: true,
          agent: false,
          protocol: false,
          session: false,
          message: false,
          byzantine: false,
        },
      });

      expect(result.subscriptionCount).toBe(1);

      // Emit a consensus event
      const event = createTestEvent({
        topic: EventTopics.CONSENSUS_VOTE_CAST,
        payload: { voterId: 'voter-1', decision: 'approve' },
      });

      const globalBus = getGlobalBus();
      globalBus.emit(event);

      expect(mockObserver.recordEvent).toHaveBeenCalled();
    });

    it('should not receive events for disabled patterns', () => {
      initializeEventBusBridge(mockObserver, mockLogger, {
        subscriptions: {
          consensus: false,
          agent: false,
          protocol: false,
          session: true,
          message: false,
          byzantine: false,
        },
      });

      // Emit a consensus event (disabled)
      const consensusEvent = createTestEvent({
        topic: EventTopics.CONSENSUS_VOTE_CAST,
        payload: { voterId: 'voter-1' },
      });

      const globalBus = getGlobalBus();
      globalBus.emit(consensusEvent);

      // Should not record the consensus event
      expect(mockObserver.recordEvent).not.toHaveBeenCalled();
    });
  });

  describe('interaction recording', () => {
    it('should record interaction for agent.task_delegated', () => {
      initializeEventBusBridge(mockObserver, mockLogger);

      const event = createTestEvent({
        topic: 'agent.task_delegated',
        payload: {
          agentId: 'lead-agent',
          targetAgentId: 'worker-agent',
          taskId: 'task-1',
        },
      });

      const globalBus = getGlobalBus();
      globalBus.emit(event);

      expect(mockObserver.recordInteraction).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'lead-agent',
          to: 'worker-agent',
          interactionType: 'delegation',
        })
      );
    });

    it('should record vote interaction type', () => {
      initializeEventBusBridge(mockObserver, mockLogger);

      // Use a topic with 'vote' but not 'message' to test vote interaction type
      const event = createTestEvent({
        topic: 'agent.vote_cast',
        payload: {
          agentId: 'voter-1',
          targetAgentId: 'coordinator',
          decision: 'approve',
        },
      });

      const globalBus = getGlobalBus();
      globalBus.emit(event);

      expect(mockObserver.recordInteraction).toHaveBeenCalledWith(
        expect.objectContaining({
          interactionType: 'vote',
        })
      );
    });

    it('should record broadcast interaction type', () => {
      initializeEventBusBridge(mockObserver, mockLogger);

      const event = createTestEvent({
        topic: 'agent.broadcast',
        payload: {
          agentId: 'broadcaster',
          targetAgentId: 'receiver',
          content: 'announcement',
        },
      });

      const globalBus = getGlobalBus();
      globalBus.emit(event);

      expect(mockObserver.recordInteraction).toHaveBeenCalledWith(
        expect.objectContaining({
          interactionType: 'broadcast',
        })
      );
    });
  });
});

/**
 * Helper to get the global event bus.
 */
function getGlobalBus(): EventBus {
  return getGlobalEventBus();
}
