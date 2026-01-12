/**
 * Agent Message Router Tests
 * (Source: Issue #217, Sprint #219)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentMessageRouter, createAgentMessageRouter } from './agent-message-router.js';
import { EventBus } from './event-bus.js';
import type {
  IAgent,
  AgentMessage,
  AgentResponse,
  AgentCapability,
} from '../../core/types/index.js';
import type { Result } from '../../core/result.js';
import { ok, err } from '../../core/result.js';
import { AgentError } from '../../core/errors.js';
import { AgentCapability as Cap } from '../../core/types/index.js';

// =============================================================================
// Test Fixtures
// =============================================================================

/** Creates a mock agent for testing. */
function createMockAgent(id: string, handler?: (msg: AgentMessage) => AgentResponse): IAgent {
  const defaultHandler = (_msg: AgentMessage): AgentResponse => ({
    messageId: _msg.id,
    status: 'completed',
    data: { handled: true },
  });

  return {
    id,
    role: 'code_expert',
    state: 'idle',
    capabilities: [Cap.TASK_EXECUTION] as readonly AgentCapability[],
    execute: vi.fn().mockResolvedValue(ok({ taskId: 'test', output: 'done', metadata: {} })),
    handleMessage: vi
      .fn()
      .mockImplementation((msg: AgentMessage): Promise<Result<AgentResponse, AgentError>> => {
        const response = handler ? handler(msg) : defaultHandler(msg);
        return Promise.resolve(ok(response));
      }),
    initialize: vi.fn().mockResolvedValue(ok(undefined)),
    cleanup: vi.fn().mockResolvedValue(undefined),
  };
}

/** Creates a test message. */
function createTestMessage(
  from: string,
  to: string,
  type: AgentMessage['type'] = 'query'
): AgentMessage {
  return {
    id: `msg-${String(Date.now())}`,
    from,
    to,
    type,
    payload: { test: true },
    timestamp: new Date().toISOString(),
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('AgentMessageRouter', () => {
  let router: AgentMessageRouter;
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus({ maxHistorySize: 100 });
    router = new AgentMessageRouter({ eventBus });
  });

  afterEach(() => {
    router.clear();
    eventBus.clearHistory();
  });

  describe('registration', () => {
    it('should register an agent', () => {
      const agent = createMockAgent('agent-1');
      router.register(agent);
      expect(router.isRegistered('agent-1')).toBe(true);
    });

    it('should unregister an agent', () => {
      const agent = createMockAgent('agent-1');
      router.register(agent);
      router.unregister('agent-1');
      expect(router.isRegistered('agent-1')).toBe(false);
    });

    it('should return registered agent IDs', () => {
      const agent1 = createMockAgent('agent-1');
      const agent2 = createMockAgent('agent-2');
      router.register(agent1);
      router.register(agent2);
      const registered = router.getRegisteredAgents();
      expect(registered).toContain('agent-1');
      expect(registered).toContain('agent-2');
      expect(registered).toHaveLength(2);
    });

    it('should replace existing agent on duplicate registration', () => {
      const agent1 = createMockAgent('agent-1');
      const agent2 = createMockAgent('agent-1'); // Same ID
      router.register(agent1);
      router.register(agent2);
      expect(router.getRegisteredAgents()).toHaveLength(1);
    });
  });

  describe('send', () => {
    it('should send message to target agent', async () => {
      const sender = createMockAgent('sender');
      const receiver = createMockAgent('receiver');
      router.register(sender);
      router.register(receiver);

      const message = createTestMessage('sender', 'receiver');
      const result = await router.send(message);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('completed');
      }
      expect(receiver.handleMessage).toHaveBeenCalledWith(message);
    });

    it('should return error for unknown target agent', async () => {
      const sender = createMockAgent('sender');
      router.register(sender);

      const message = createTestMessage('sender', 'unknown');
      const result = await router.send(message);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Target agent not found');
      }
    });

    it('should emit message.sent event', async () => {
      const sender = createMockAgent('sender');
      const receiver = createMockAgent('receiver');
      router.register(sender);
      router.register(receiver);

      const events: unknown[] = [];
      eventBus.subscribe('message.sent', (event) => {
        events.push(event);
      });

      const message = createTestMessage('sender', 'receiver');
      await router.send(message);

      expect(events).toHaveLength(1);
    });

    it('should emit message.received event on successful delivery', async () => {
      const sender = createMockAgent('sender');
      const receiver = createMockAgent('receiver');
      router.register(sender);
      router.register(receiver);

      const events: unknown[] = [];
      eventBus.subscribe('message.received', (event) => {
        events.push(event);
      });

      const message = createTestMessage('sender', 'receiver');
      await router.send(message);

      expect(events).toHaveLength(1);
    });

    it('should respect custom timeout', async () => {
      const slowAgent = createMockAgent('slow');
      slowAgent.handleMessage = vi.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(ok({ messageId: 'test', status: 'completed' }));
          }, 5000);
        });
      });
      router.register(slowAgent);

      const message = createTestMessage('sender', 'slow');
      const result = await router.send(message, { timeoutMs: 50, skipRetry: true });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('timeout');
      }
    });

    it('should skip retries when skipRetry is true', async () => {
      const failingAgent = createMockAgent('failing');
      failingAgent.handleMessage = vi.fn().mockResolvedValue(err(new AgentError('Failed')));
      router.register(failingAgent);

      const message = createTestMessage('sender', 'failing');
      await router.send(message, { skipRetry: true });

      expect(failingAgent.handleMessage).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure', async () => {
      let attempts = 0;
      const flakeyAgent = createMockAgent('flakey');
      flakeyAgent.handleMessage = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          return Promise.resolve(err(new AgentError('Temporary failure')));
        }
        return Promise.resolve(ok({ messageId: 'test', status: 'completed' }));
      });
      router.register(flakeyAgent);

      // Use a router with shorter retry delay for faster tests
      const fastRouter = new AgentMessageRouter({
        eventBus,
        config: { retryDelayMs: 10, maxRetries: 3 },
      });
      fastRouter.register(flakeyAgent);

      const message = createTestMessage('sender', 'flakey');
      const result = await fastRouter.send(message);

      expect(result.ok).toBe(true);
      expect(attempts).toBe(3);
    });
  });

  describe('broadcast', () => {
    it('should broadcast to all agents except sender', async () => {
      const sender = createMockAgent('sender');
      const receiver1 = createMockAgent('receiver1');
      const receiver2 = createMockAgent('receiver2');
      router.register(sender);
      router.register(receiver1);
      router.register(receiver2);

      const message = createTestMessage('sender', '');
      const result = await router.broadcast(message, { waitForCompletion: true });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.recipientCount).toBe(2);
        expect(result.value.successCount).toBe(2);
        expect(result.value.failureCount).toBe(0);
      }
      expect(receiver1.handleMessage).toHaveBeenCalled();
      expect(receiver2.handleMessage).toHaveBeenCalled();
      expect(sender.handleMessage).not.toHaveBeenCalled();
    });

    it('should return empty result when no other agents exist', async () => {
      const sender = createMockAgent('sender');
      router.register(sender);

      const message = createTestMessage('sender', '');
      const result = await router.broadcast(message);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.recipientCount).toBe(0);
      }
    });

    it('should track partial failures in broadcast', async () => {
      const sender = createMockAgent('sender');
      const successAgent = createMockAgent('success');
      const failingAgent = createMockAgent('failing');
      failingAgent.handleMessage = vi.fn().mockResolvedValue(err(new AgentError('Failed')));

      router.register(sender);
      router.register(successAgent);
      router.register(failingAgent);

      // Use router with no retries for consistent test
      const noRetryRouter = new AgentMessageRouter({
        eventBus,
        config: { maxRetries: 0 },
      });
      noRetryRouter.register(sender);
      noRetryRouter.register(successAgent);
      noRetryRouter.register(failingAgent);

      const message = createTestMessage('sender', '');
      const result = await noRetryRouter.broadcast(message, { waitForCompletion: true });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.recipientCount).toBe(2);
        expect(result.value.successCount).toBe(1);
        expect(result.value.failureCount).toBe(1);
      }
    });

    it('should emit message.sent for each recipient', async () => {
      const sender = createMockAgent('sender');
      const receiver1 = createMockAgent('receiver1');
      const receiver2 = createMockAgent('receiver2');
      router.register(sender);
      router.register(receiver1);
      router.register(receiver2);

      const events: unknown[] = [];
      eventBus.subscribe('message.sent', (event) => {
        events.push(event);
      });

      const message = createTestMessage('sender', '');
      await router.broadcast(message, { waitForCompletion: true });

      expect(events).toHaveLength(2);
    });
  });

  describe('stats', () => {
    it('should track messages sent', async () => {
      const agent1 = createMockAgent('agent1');
      const agent2 = createMockAgent('agent2');
      router.register(agent1);
      router.register(agent2);

      await router.send(createTestMessage('agent1', 'agent2'));
      await router.send(createTestMessage('agent2', 'agent1'));

      const stats = router.getStats();
      expect(stats.messagesSent).toBe(2);
      expect(stats.successfulDeliveries).toBe(2);
    });

    it('should track broadcasts performed', async () => {
      const sender = createMockAgent('sender');
      const receiver = createMockAgent('receiver');
      router.register(sender);
      router.register(receiver);

      await router.broadcast(createTestMessage('sender', ''));
      await router.broadcast(createTestMessage('sender', ''));

      const stats = router.getStats();
      expect(stats.broadcastsPerformed).toBe(2);
    });

    it('should track failed deliveries', async () => {
      const failingAgent = createMockAgent('failing');
      failingAgent.handleMessage = vi.fn().mockResolvedValue(err(new AgentError('Failed')));

      const noRetryRouter = new AgentMessageRouter({
        eventBus,
        config: { maxRetries: 0 },
      });
      noRetryRouter.register(failingAgent);

      await noRetryRouter.send(createTestMessage('sender', 'failing'));

      const stats = noRetryRouter.getStats();
      expect(stats.failedDeliveries).toBe(1);
    });

    it('should track retries attempted', async () => {
      const failingAgent = createMockAgent('failing');
      failingAgent.handleMessage = vi.fn().mockResolvedValue(err(new AgentError('Failed')));

      const retryRouter = new AgentMessageRouter({
        eventBus,
        config: { maxRetries: 2, retryDelayMs: 10 },
      });
      retryRouter.register(failingAgent);

      await retryRouter.send(createTestMessage('sender', 'failing'));

      const stats = retryRouter.getStats();
      expect(stats.retriesAttempted).toBe(2);
    });

    it('should track registered agents count', () => {
      router.register(createMockAgent('agent1'));
      router.register(createMockAgent('agent2'));
      router.register(createMockAgent('agent3'));

      const stats = router.getStats();
      expect(stats.registeredAgents).toBe(3);
    });
  });

  describe('clear', () => {
    it('should clear all agents and reset stats', async () => {
      const agent1 = createMockAgent('agent1');
      const agent2 = createMockAgent('agent2');
      router.register(agent1);
      router.register(agent2);
      await router.send(createTestMessage('agent1', 'agent2'));

      router.clear();

      expect(router.getRegisteredAgents()).toHaveLength(0);
      const stats = router.getStats();
      expect(stats.messagesSent).toBe(0);
      expect(stats.registeredAgents).toBe(0);
    });
  });

  describe('event emission control', () => {
    it('should not emit events when emitEvents is false', async () => {
      const noEventRouter = new AgentMessageRouter({
        eventBus,
        config: { emitEvents: false },
      });

      const sender = createMockAgent('sender');
      const receiver = createMockAgent('receiver');
      noEventRouter.register(sender);
      noEventRouter.register(receiver);

      const events: unknown[] = [];
      eventBus.subscribe('message.*', (event) => {
        events.push(event);
      });

      await noEventRouter.send(createTestMessage('sender', 'receiver'));

      expect(events).toHaveLength(0);
    });
  });

  describe('factory function', () => {
    it('should create router with createAgentMessageRouter', () => {
      const router = createAgentMessageRouter();
      expect(router).toBeInstanceOf(AgentMessageRouter);
    });

    it('should accept options', () => {
      const router = createAgentMessageRouter({ config: { timeoutMs: 5000 } });
      expect(router).toBeInstanceOf(AgentMessageRouter);
    });
  });
});
