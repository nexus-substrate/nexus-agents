/**
 * EventBus Bridge Helpers Tests
 *
 * Tests for the helper functions used by the EventBus bridge.
 * Covers agent ID extraction, event type mapping, and payload creation.
 *
 * @module mcp/eventbus-bridge-helpers.test
 */

import { describe, it, expect } from 'vitest';
import {
  extractAgentId,
  extractTargetAgentId,
  truncatePayload,
  mapEventType,
  mapInteractionType,
  createObserverPayload,
} from './eventbus-bridge-helpers.js';
import type { DomainEvent } from '../agents/collaboration/index.js';

/**
 * Creates a test domain event.
 */
function createTestEvent(overrides: Partial<DomainEvent> = {}): DomainEvent {
  return {
    eventId: 'test-event-1',
    timestamp: new Date().toISOString(),
    topic: 'session.created',
    payload: {},
    sessionId: 'session-1',
    correlationId: 'corr-1',
    ...overrides,
  };
}

describe('extractAgentId', () => {
  it('should extract agentId field', () => {
    const payload = { agentId: 'agent-1', other: 'data' };
    expect(extractAgentId(payload)).toBe('agent-1');
  });

  it('should extract fromAgentId field', () => {
    const payload = { fromAgentId: 'sender-agent', other: 'data' };
    expect(extractAgentId(payload)).toBe('sender-agent');
  });

  it('should extract voterId field', () => {
    const payload = { voterId: 'voter-agent', decision: 'approve' };
    expect(extractAgentId(payload)).toBe('voter-agent');
  });

  it('should extract leaderId field', () => {
    const payload = { leaderId: 'leader-agent', round: 1 };
    expect(extractAgentId(payload)).toBe('leader-agent');
  });

  it('should extract participantId field', () => {
    const payload = { participantId: 'participant-1', status: 'active' };
    expect(extractAgentId(payload)).toBe('participant-1');
  });

  it('should return undefined when no agent ID field exists', () => {
    const payload = { taskId: 'task-1', status: 'pending' };
    expect(extractAgentId(payload)).toBeUndefined();
  });

  it('should return undefined for empty string agent ID', () => {
    const payload = { agentId: '', other: 'data' };
    expect(extractAgentId(payload)).toBeUndefined();
  });

  it('should return undefined for non-string agent ID', () => {
    const payload = { agentId: 123, other: 'data' };
    expect(extractAgentId(payload as unknown as Record<string, unknown>)).toBeUndefined();
  });

  it('should prioritize agentId over other fields', () => {
    const payload = {
      agentId: 'primary-agent',
      fromAgentId: 'secondary-agent',
      voterId: 'tertiary-agent',
    };
    expect(extractAgentId(payload)).toBe('primary-agent');
  });
});

describe('extractTargetAgentId', () => {
  it('should extract toAgentId field', () => {
    const payload = { toAgentId: 'target-1', content: 'message' };
    expect(extractTargetAgentId(payload)).toBe('target-1');
  });

  it('should extract targetAgentId field', () => {
    const payload = { targetAgentId: 'target-2', taskId: 'task-1' };
    expect(extractTargetAgentId(payload)).toBe('target-2');
  });

  it('should extract recipientId field', () => {
    const payload = { recipientId: 'recipient-1', message: 'hello' };
    expect(extractTargetAgentId(payload)).toBe('recipient-1');
  });

  it('should return undefined when no target ID field exists', () => {
    const payload = { agentId: 'agent-1', content: 'data' };
    expect(extractTargetAgentId(payload)).toBeUndefined();
  });

  it('should return undefined for empty string target ID', () => {
    const payload = { toAgentId: '', content: 'message' };
    expect(extractTargetAgentId(payload)).toBeUndefined();
  });

  it('should return undefined for non-string target ID', () => {
    const payload = { toAgentId: null, content: 'message' };
    expect(extractTargetAgentId(payload as unknown as Record<string, unknown>)).toBeUndefined();
  });

  it('should prioritize toAgentId over other fields', () => {
    const payload = {
      toAgentId: 'primary-target',
      targetAgentId: 'secondary-target',
      recipientId: 'tertiary-target',
    };
    expect(extractTargetAgentId(payload)).toBe('primary-target');
  });
});

describe('truncatePayload', () => {
  it('should not truncate short payloads', () => {
    const payload = { key: 'value' };
    const result = truncatePayload(payload);
    expect(result).toBe('{"key":"value"}');
  });

  it('should truncate long payloads to 100 characters', () => {
    const payload = {
      longKey: 'a'.repeat(200),
    };
    const result = truncatePayload(payload);
    expect(result.length).toBe(100);
    expect(result.endsWith('...')).toBe(true);
  });

  it('should handle exactly 100 character payloads', () => {
    // Create a payload that serializes to exactly 100 characters
    const payload = { data: 'x'.repeat(88) }; // {"data":"xxx..."} = 100 chars
    const result = truncatePayload(payload);
    expect(result.length).toBeLessThanOrEqual(100);
  });

  it('should handle empty payloads', () => {
    const result = truncatePayload({});
    expect(result).toBe('{}');
  });

  it('should handle nested objects', () => {
    const payload = { outer: { inner: 'value' } };
    const result = truncatePayload(payload);
    expect(result).toBe('{"outer":{"inner":"value"}}');
  });

  it('should handle arrays in payload', () => {
    const payload = { items: [1, 2, 3] };
    const result = truncatePayload(payload);
    expect(result).toBe('{"items":[1,2,3]}');
  });
});

describe('mapEventType', () => {
  describe('task_started events', () => {
    it('should map topics with "started" keyword', () => {
      expect(mapEventType('protocol.started')).toBe('task_started');
      expect(mapEventType('session.started')).toBe('task_started');
    });

    it('should map topics with "created" keyword', () => {
      expect(mapEventType('session.created')).toBe('task_started');
      expect(mapEventType('task.created')).toBe('task_started');
    });
  });

  describe('task_completed events', () => {
    it('should map topics with "completed" keyword', () => {
      expect(mapEventType('protocol.completed')).toBe('task_completed');
      expect(mapEventType('task.completed')).toBe('task_completed');
    });

    it('should map topics with "finalized" keyword', () => {
      expect(mapEventType('session.finalized')).toBe('task_completed');
    });

    it('should map topics with "reached" keyword', () => {
      expect(mapEventType('consensus.reached')).toBe('task_completed');
    });
  });

  describe('message_sent events', () => {
    it('should map topics with "message" keyword', () => {
      expect(mapEventType('message.sent')).toBe('message_sent');
      expect(mapEventType('message.received')).toBe('message_sent');
    });

    it('should map topics with "sent" keyword', () => {
      expect(mapEventType('notification.sent')).toBe('message_sent');
    });

    it('should map topics with "broadcast" keyword', () => {
      expect(mapEventType('agent.broadcast')).toBe('message_sent');
    });
  });

  describe('error events', () => {
    it('should map topics with "error" keyword', () => {
      expect(mapEventType('system.error')).toBe('error');
      expect(mapEventType('validation.error')).toBe('error');
    });

    it('should map topics with "flagged" keyword', () => {
      expect(mapEventType('byzantine.agent_flagged')).toBe('error');
    });

    it('should map topics with "detected" keyword', () => {
      expect(mapEventType('byzantine.pattern_detected')).toBe('error');
    });
  });

  describe('state_change events', () => {
    it('should default to state_change for unknown topics', () => {
      expect(mapEventType('session.status_changed')).toBe('state_change');
      expect(mapEventType('agent.idle')).toBe('state_change');
      expect(mapEventType('unknown.topic')).toBe('state_change');
    });
  });
});

describe('mapInteractionType', () => {
  it('should map message topics to message type', () => {
    expect(mapInteractionType('message.sent')).toBe('message');
    expect(mapInteractionType('message.received')).toBe('message');
  });

  it('should map vote topics to vote type', () => {
    expect(mapInteractionType('consensus.vote_cast')).toBe('vote');
    expect(mapInteractionType('agent.vote')).toBe('vote');
  });

  it('should map delegate topics to delegation type', () => {
    expect(mapInteractionType('agent.task_delegated')).toBe('delegation');
    expect(mapInteractionType('delegate.task')).toBe('delegation');
  });

  it('should map broadcast topics to broadcast type', () => {
    expect(mapInteractionType('agent.broadcast')).toBe('broadcast');
    expect(mapInteractionType('broadcast.notification')).toBe('broadcast');
  });

  it('should default to communication for unknown topics', () => {
    expect(mapInteractionType('session.created')).toBe('communication');
    expect(mapInteractionType('protocol.started')).toBe('communication');
    expect(mapInteractionType('unknown.topic')).toBe('communication');
  });
});

describe('createObserverPayload', () => {
  describe('message payloads', () => {
    it('should create sent message payload', () => {
      const event = createTestEvent({ topic: 'message.sent' });
      const payload = {
        agentId: 'sender',
        toAgentId: 'receiver',
        content: 'hello',
      };

      const result = createObserverPayload(event, payload);

      expect(result.type).toBe('message');
      expect(result).toHaveProperty('direction', 'sent');
      expect(result).toHaveProperty('messageType', 'event_bus_message');
      expect(result).toHaveProperty('contentPreview');
    });

    it('should create received message payload', () => {
      const event = createTestEvent({ topic: 'message.received' });
      const payload = { agentId: 'sender', content: 'hello' };

      const result = createObserverPayload(event, payload);

      expect(result.type).toBe('message');
      expect(result).toHaveProperty('direction', 'received');
    });

    it('should include targetAgentId in sent message payload', () => {
      const event = createTestEvent({ topic: 'message.sent' });
      const payload = { toAgentId: 'target-agent' };

      const result = createObserverPayload(event, payload) as unknown as Record<string, unknown>;

      expect(result['targetAgentId']).toBe('target-agent');
    });

    it('should include sourceAgentId in received message payload', () => {
      const event = createTestEvent({ topic: 'message.received' });
      const payload = { agentId: 'source-agent' };

      const result = createObserverPayload(event, payload) as unknown as Record<string, unknown>;

      expect(result['sourceAgentId']).toBe('source-agent');
    });
  });

  describe('task payloads', () => {
    it('should create started task payload', () => {
      const event = createTestEvent({
        eventId: 'event-123',
        topic: 'session.created',
      });
      const payload = { taskId: 'task-456' };

      const result = createObserverPayload(event, payload);

      expect(result.type).toBe('task');
      expect(result).toHaveProperty('phase', 'started');
      expect(result).toHaveProperty('taskId', 'task-456');
    });

    it('should use eventId when taskId is missing', () => {
      const event = createTestEvent({
        eventId: 'event-789',
        topic: 'protocol.started',
      });
      const payload = {};

      const result = createObserverPayload(event, payload);

      expect(result).toHaveProperty('taskId', 'event-789');
    });

    it('should create completed task payload', () => {
      const event = createTestEvent({ topic: 'session.finalized' });
      const payload = { taskId: 'task-123', success: true };

      const result = createObserverPayload(event, payload);

      expect(result.type).toBe('task');
      expect(result).toHaveProperty('phase', 'completed');
      expect(result).toHaveProperty('success', true);
    });

    it('should default success to true when not specified', () => {
      const event = createTestEvent({ topic: 'consensus.reached' });
      const payload = { taskId: 'task-123' };

      const result = createObserverPayload(event, payload);

      expect(result).toHaveProperty('success', true);
    });

    it('should set success to false when explicitly false', () => {
      const event = createTestEvent({ topic: 'protocol.completed' });
      const payload = { taskId: 'task-123', success: false };

      const result = createObserverPayload(event, payload);

      expect(result).toHaveProperty('success', false);
    });
  });

  describe('error payloads', () => {
    it('should create error payload for error topics', () => {
      const event = createTestEvent({ topic: 'system.error' });
      const payload = { reason: 'Connection timeout' };

      const result = createObserverPayload(event, payload);

      expect(result.type).toBe('error');
      expect(result).toHaveProperty('errorCode', 'EVENT_BUS_ERROR');
      expect(result).toHaveProperty('errorMessage', 'Connection timeout');
      expect(result).toHaveProperty('recoverable', true);
    });

    it('should create error payload for flagged topics', () => {
      const event = createTestEvent({ topic: 'byzantine.agent_flagged' });
      const payload = { agentId: 'bad-agent' };

      const result = createObserverPayload(event, payload);

      expect(result.type).toBe('error');
    });

    it('should create error payload for detected topics', () => {
      const event = createTestEvent({ topic: 'byzantine.pattern_detected' });
      const payload = { pattern: 'flip-flopping' };

      const result = createObserverPayload(event, payload);

      expect(result.type).toBe('error');
    });

    it('should use topic as error message when reason is missing', () => {
      const event = createTestEvent({ topic: 'validation.error' });
      const payload = {};

      const result = createObserverPayload(event, payload);

      expect(result).toHaveProperty('errorMessage', 'validation.error');
    });
  });

  describe('default state_change payloads', () => {
    it('should create state_change payload for unknown topics', () => {
      const event = createTestEvent({ topic: 'session.status_changed' });
      const payload = { newStatus: 'active' };

      const result = createObserverPayload(event, payload);

      expect(result.type).toBe('state_change');
      expect(result).toHaveProperty('previousState', 'idle');
      expect(result).toHaveProperty('newState', 'executing');
      expect(result).toHaveProperty('reason');
    });

    it('should include topic in reason', () => {
      const event = createTestEvent({ topic: 'agent.idle' });
      const payload = {};

      const result = createObserverPayload(event, payload);

      expect(result).toHaveProperty('reason', 'EventBus: agent.idle');
    });
  });

  describe('edge cases', () => {
    it('should handle empty payload', () => {
      const event = createTestEvent({ topic: 'session.created' });
      const result = createObserverPayload(event, {});

      expect(result.type).toBe('task');
    });

    it('should handle payload with non-string values', () => {
      const event = createTestEvent({ topic: 'message.sent' });
      const payload = {
        count: 42,
        active: true,
        data: null,
        items: [1, 2, 3],
      };

      const result = createObserverPayload(event, payload);

      expect(result.type).toBe('message');
      expect(result).toHaveProperty('contentPreview');
    });

    it('should handle deeply nested payload', () => {
      const event = createTestEvent({ topic: 'session.created' });
      const payload = {
        level1: {
          level2: {
            level3: {
              value: 'deep',
            },
          },
        },
      };

      expect(() => createObserverPayload(event, payload)).not.toThrow();
    });
  });
});
