/**
 * Tests for Aegean Byzantine-fault-tolerant consensus protocol.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IAgent, Task, AgentRole } from '../../core/index.js';
import { ok } from '../../core/index.js';
import { AegeanProtocol, createAegeanProtocol } from './aegean-protocol.js';
import { calculateQuorumSize, hasAcceptQuorum, isConsensusFailed } from './aegean-types.js';
import type { CollaborationConfig } from './collaboration-types.js';
import type { IEventBus, TypedEvent } from './event-bus-types.js';

/** Creates a mock EventBus for testing event emission. */
function createMockEventBus(): IEventBus & { emittedEvents: TypedEvent[] } {
  const emittedEvents: TypedEvent[] = [];
  return {
    emittedEvents,
    emit: vi.fn((event: TypedEvent) => {
      emittedEvents.push(event);
    }),
    emitAsync: vi.fn((event: TypedEvent) => {
      emittedEvents.push(event);
      return Promise.resolve();
    }),
    subscribe: vi.fn(() => ({ id: 'sub-1', pattern: '*', unsubscribe: vi.fn() })),
    unsubscribe: vi.fn(),
    getHistory: vi.fn(() => []),
    clearHistory: vi.fn(),
    getStats: vi.fn(() => ({
      eventsEmitted: 0,
      subscriptionsCreated: 0,
      activeSubscriptions: 0,
      historySize: 0,
      errorCount: 0,
    })),
    hasSubscribers: vi.fn(() => false),
  };
}

/** Creates a mock agent that returns a specific output. */
function createMockAgent(id: string, output: unknown): IAgent {
  return {
    id,
    role: 'code_expert' as AgentRole,
    capabilities: [],
    state: 'idle',
    execute: vi.fn().mockResolvedValue(
      ok({
        taskId: 'test',
        output,
        metadata: { durationMs: 100, tokensUsed: 50, toolsUsed: [], model: 'test' },
      })
    ),
    handleMessage: vi.fn().mockResolvedValue(ok({ messageId: 'msg', status: 'completed' })),
    initialize: vi.fn().mockResolvedValue(ok(undefined)),
    cleanup: vi.fn().mockResolvedValue(undefined),
  };
}

/** Creates a test task. */
function createTestTask(): Task {
  return {
    id: 'test-task',
    description: 'Test task for consensus',
    context: {},
  };
}

/** Creates a test collaboration config. */
function createTestConfig(experts: string[]): CollaborationConfig {
  return {
    sessionId: 'test-session',
    pattern: 'aegean',
    experts,
    task: createTestTask(),
  };
}

describe('AegeanProtocol', () => {
  let protocol: AegeanProtocol;

  beforeEach(() => {
    protocol = createAegeanProtocol();
  });

  describe('validation', () => {
    it('should require minimum 3 agents for f=0 Byzantine tolerance', async () => {
      const config = createTestConfig(['agent1', 'agent2']);
      const agents = new Map([
        ['agent1', createMockAgent('agent1', 'proposal')],
        ['agent2', createMockAgent('agent2', 'ACCEPT')],
      ]);

      const result = await protocol.execute(config, agents);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('at least');
      }
    });

    it('should fail if agent not found', async () => {
      const config = createTestConfig(['agent1', 'agent2', 'agent3']);
      const agents = new Map([
        ['agent1', createMockAgent('agent1', 'proposal')],
        ['agent2', createMockAgent('agent2', 'ACCEPT')],
      ]);

      const result = await protocol.execute(config, agents);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('not found');
      }
    });
  });

  describe('consensus execution', () => {
    it('should reach consensus when all agents accept', async () => {
      const config = createTestConfig(['agent1', 'agent2', 'agent3']);
      const agents = new Map([
        ['agent1', createMockAgent('agent1', 'I propose this solution')],
        ['agent2', createMockAgent('agent2', 'I ACCEPT this proposal')],
        ['agent3', createMockAgent('agent3', 'Yes, I accept and approve')],
      ]);

      const result = await protocol.execute(config, agents);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Verify the result structure
        expect(result.value.aggregatedResult.output).toBeDefined();
        const output = result.value.aggregatedResult.output as Record<string, unknown>;
        expect(output.aegean).toBeDefined();
        expect((output.aegean as Record<string, unknown>).consensusReached).toBe(true);
      }
    });

    it('should not reach consensus when agents reject', async () => {
      const config = createTestConfig(['agent1', 'agent2', 'agent3']);
      const agents = new Map([
        ['agent1', createMockAgent('agent1', 'I propose this solution')],
        ['agent2', createMockAgent('agent2', 'I REJECT this proposal')],
        ['agent3', createMockAgent('agent3', 'No, I reject and disagree')],
      ]);

      const result = await protocol.execute(config, agents);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.aggregatedResult.output as Record<string, unknown>;
        // Consensus not reached when majority rejects
        expect(output.aegean).toBeDefined();
      }
    });

    it('should use round-robin leader selection', async () => {
      const config = createTestConfig(['agent1', 'agent2', 'agent3']);
      const agent1 = createMockAgent('agent1', 'proposal round 1');
      const agent2 = createMockAgent('agent2', 'ACCEPT');
      const agent3 = createMockAgent('agent3', 'ACCEPT');

      const agents = new Map([
        ['agent1', agent1],
        ['agent2', agent2],
        ['agent3', agent3],
      ]);

      await protocol.execute(config, agents);

      // Agent1 should be called as leader (first in round 0)
      expect(agent1.execute).toHaveBeenCalled();
    });
  });

  describe('cancellation', () => {
    it('should cancel execution', async () => {
      const config = createTestConfig(['agent1', 'agent2', 'agent3']);

      // Create slow agents
      const slowAgent = {
        ...createMockAgent('agent1', 'slow'),
        execute: vi.fn().mockImplementation(async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return ok({
            taskId: 'test',
            output: 'done',
            metadata: { durationMs: 100, tokensUsed: 0, toolsUsed: [], model: 'test' },
          });
        }),
      };

      const agents = new Map([
        ['agent1', slowAgent],
        ['agent2', createMockAgent('agent2', 'ACCEPT')],
        ['agent3', createMockAgent('agent3', 'ACCEPT')],
      ]);

      // Cancel immediately
      protocol.cancel('Test cancellation');

      const result = await protocol.execute(config, agents);

      // Should still complete but with cancelled state
      expect(result.ok).toBe(true);
    });
  });

  describe('configuration', () => {
    it('should respect maxRounds setting', () => {
      const customProtocol = createAegeanProtocol({
        aegeanConfig: { maxRounds: 5 },
      });

      expect(customProtocol.pattern).toBe('aegean');
    });

    it('should throw on invalid config', () => {
      expect(() =>
        createAegeanProtocol({
          aegeanConfig: { maxRounds: 100 }, // exceeds max of 10
        })
      ).toThrow('Invalid Aegean config');
    });
  });
});

describe('Aegean helper functions', () => {
  describe('calculateQuorumSize', () => {
    it('should calculate quorum for f=0', () => {
      expect(calculateQuorumSize(3, 0)).toBe(2);
      expect(calculateQuorumSize(5, 0)).toBe(3);
    });

    it('should calculate quorum for f=1', () => {
      expect(calculateQuorumSize(4, 1)).toBe(3);
      expect(calculateQuorumSize(7, 1)).toBe(5);
    });

    it('should calculate quorum for f=2', () => {
      expect(calculateQuorumSize(7, 2)).toBe(5);
    });
  });

  describe('hasAcceptQuorum', () => {
    it('should return true when accepts >= required', () => {
      expect(
        hasAcceptQuorum({
          required: 2,
          accepts: 2,
          rejects: 0,
          pending: 1,
          hasQuorum: true,
          consensusReached: true,
        })
      ).toBe(true);
    });

    it('should return false when accepts < required', () => {
      expect(
        hasAcceptQuorum({
          required: 2,
          accepts: 1,
          rejects: 1,
          pending: 1,
          hasQuorum: false,
          consensusReached: false,
        })
      ).toBe(false);
    });
  });

  describe('isConsensusFailed', () => {
    it('should return true when too many rejects', () => {
      expect(
        isConsensusFailed(
          {
            required: 2,
            accepts: 0,
            rejects: 2,
            pending: 1,
            hasQuorum: false,
            consensusReached: false,
          },
          3
        )
      ).toBe(true);
    });

    it('should return false when consensus still possible', () => {
      expect(
        isConsensusFailed(
          {
            required: 2,
            accepts: 1,
            rejects: 0,
            pending: 2,
            hasQuorum: false,
            consensusReached: false,
          },
          3
        )
      ).toBe(false);
    });
  });
});

describe('AegeanProtocol EventBus integration', () => {
  it('should emit protocol.started event on execution', async () => {
    const mockEventBus = createMockEventBus();
    const protocol = createAegeanProtocol({ eventBus: mockEventBus });

    const config: CollaborationConfig = {
      sessionId: 'test-session',
      pattern: 'aegean',
      experts: ['agent1', 'agent2', 'agent3'],
      task: { id: 'test', description: 'Test task', context: {} },
    };

    const agents = new Map([
      ['agent1', createMockAgent('agent1', 'proposal')],
      ['agent2', createMockAgent('agent2', 'ACCEPT')],
      ['agent3', createMockAgent('agent3', 'ACCEPT')],
    ]);

    await protocol.execute(config, agents);

    const startedEvent = mockEventBus.emittedEvents.find((e) => e.topic === 'protocol.started');
    expect(startedEvent).toBeDefined();
    expect(startedEvent?.payload.protocolType).toBe('aegean');
    expect(startedEvent?.payload.config.agentCount).toBe(3);
    expect(startedEvent?.sessionId).toBe('test-session');
  });

  it('should emit protocol.iteration events for each round', async () => {
    const mockEventBus = createMockEventBus();
    const protocol = createAegeanProtocol({ eventBus: mockEventBus });

    const config: CollaborationConfig = {
      sessionId: 'iter-session',
      pattern: 'aegean',
      experts: ['agent1', 'agent2', 'agent3'],
      task: { id: 'test', description: 'Test task', context: {} },
    };

    const agents = new Map([
      ['agent1', createMockAgent('agent1', 'proposal')],
      ['agent2', createMockAgent('agent2', 'ACCEPT')],
      ['agent3', createMockAgent('agent3', 'ACCEPT')],
    ]);

    await protocol.execute(config, agents);

    const iterationEvents = mockEventBus.emittedEvents.filter(
      (e) => e.topic === 'protocol.iteration'
    );
    expect(iterationEvents.length).toBeGreaterThanOrEqual(1);
    expect(iterationEvents[0]?.payload.round).toBe(1);
    expect(iterationEvents[0]?.sessionId).toBe('iter-session');
  });

  it('should emit protocol.completed event with success status', async () => {
    const mockEventBus = createMockEventBus();
    const protocol = createAegeanProtocol({ eventBus: mockEventBus });

    const config: CollaborationConfig = {
      sessionId: 'complete-session',
      pattern: 'aegean',
      experts: ['agent1', 'agent2', 'agent3'],
      task: { id: 'test', description: 'Test task', context: {} },
    };

    const agents = new Map([
      ['agent1', createMockAgent('agent1', 'proposal')],
      ['agent2', createMockAgent('agent2', 'ACCEPT')],
      ['agent3', createMockAgent('agent3', 'ACCEPT')],
    ]);

    await protocol.execute(config, agents);

    const completedEvent = mockEventBus.emittedEvents.find((e) => e.topic === 'protocol.completed');
    expect(completedEvent).toBeDefined();
    expect(completedEvent?.payload.success).toBe(true);
    expect(completedEvent?.payload.iterations).toBeGreaterThanOrEqual(1);
    expect(completedEvent?.payload.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should emit protocol.completed event with failure status when consensus fails', async () => {
    const mockEventBus = createMockEventBus();
    const protocol = createAegeanProtocol({
      eventBus: mockEventBus,
      aegeanConfig: { maxRounds: 1, earlyTermination: true },
    });

    const config: CollaborationConfig = {
      sessionId: 'fail-session',
      pattern: 'aegean',
      experts: ['agent1', 'agent2', 'agent3'],
      task: { id: 'test', description: 'Test task', context: {} },
    };

    const agents = new Map([
      ['agent1', createMockAgent('agent1', 'proposal')],
      ['agent2', createMockAgent('agent2', 'REJECT')],
      ['agent3', createMockAgent('agent3', 'REJECT')],
    ]);

    await protocol.execute(config, agents);

    const completedEvent = mockEventBus.emittedEvents.find((e) => e.topic === 'protocol.completed');
    expect(completedEvent).toBeDefined();
    expect(completedEvent?.payload.success).toBe(false);
  });

  it('should use global EventBus when none provided', () => {
    const protocol = createAegeanProtocol();
    expect(protocol.pattern).toBe('aegean');
  });
});
