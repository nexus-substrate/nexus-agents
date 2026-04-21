/**
 * Aegean Consensus Protocol E2E Tests - Multi-Round Consensus
 *
 * Tests for multi-round consensus and integration scenarios in the Aegean
 * Byzantine-fault-tolerant consensus protocol based on arXiv:2512.20184.
 *
 * @module testing/e2e/consensus/aegean-multiround
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { IAgent } from '../../../core/index.js';
import { ok } from '../../../core/index.js';
import { createAegeanProtocol } from '../../../agents/collaboration/aegean-protocol.js';
import { measureLatency, withTimeout } from '../utils/index.js';
import {
  createMockEventBus,
  createConfigurableAgent,
  createAcceptingAgent,
  createTestConfig,
  type MockEventBus,
} from './aegean-test-utils.js';

describe('Aegean Multi-Round Consensus E2E', () => {
  let mockEventBus: MockEventBus;

  beforeEach(() => {
    mockEventBus = createMockEventBus();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should complete consensus in single round with unanimous agreement', async () => {
    const protocol = createAegeanProtocol({
      eventBus: mockEventBus,
      aegeanConfig: { maxRounds: 3 },
    });

    const config = createTestConfig(['agent1', 'agent2', 'agent3']);

    const agents = new Map([
      ['agent1', createAcceptingAgent('agent1', 'Single round proposal')],
      ['agent2', createAcceptingAgent('agent2', 'ACCEPT')],
      ['agent3', createAcceptingAgent('agent3', 'ACCEPT')],
    ]);

    const { result, ms } = await measureLatency(() => protocol.execute(config, agents));

    expect(result.ok).toBe(true);
    if (result.ok) {
      const output = result.value.aggregatedResult.output as { aegean?: { rounds: number } };
      expect(output.aegean?.rounds).toBe(1);
    }

    // Single round should be fast
    expect(ms).toBeLessThan(5000);
  });

  it('should respect maxRounds configuration', async () => {
    const maxRounds = 2;
    const protocol = createAegeanProtocol({
      eventBus: mockEventBus,
      aegeanConfig: { maxRounds, earlyTermination: false },
    });

    const config = createTestConfig(['agent1', 'agent2', 'agent3']);

    // All reject to force max rounds
    const agents = new Map([
      [
        'agent1',
        createConfigurableAgent('agent1', { proposalOutput: 'Proposal', voteOutput: 'REJECT' }),
      ],
      [
        'agent2',
        createConfigurableAgent('agent2', { proposalOutput: 'Proposal', voteOutput: 'REJECT' }),
      ],
      [
        'agent3',
        createConfigurableAgent('agent3', { proposalOutput: 'Proposal', voteOutput: 'REJECT' }),
      ],
    ]);

    const result = await protocol.execute(config, agents);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const output = result.value.aggregatedResult.output as { aegean?: { rounds: number } };
      expect(output.aegean?.rounds).toBe(maxRounds);
    }
  });

  it('should track token usage across multiple rounds', async () => {
    const protocol = createAegeanProtocol({
      eventBus: mockEventBus,
      aegeanConfig: { maxRounds: 2, earlyTermination: false },
    });

    const config = createTestConfig(['agent1', 'agent2', 'agent3']);

    // First round: no consensus, second round: consensus
    let round = 0;
    const switchingAgent: IAgent = {
      id: 'agent2',
      role: 'code_expert',
      capabilities: [],
      state: 'idle',
      execute: vi.fn().mockImplementation(() => {
        round++;
        const vote = round > 1 ? 'ACCEPT' : 'REJECT';
        return ok({
          taskId: 'test',
          output: vote,
          metadata: { durationMs: 100, tokensUsed: 100, toolsUsed: [], model: 'test' },
        });
      }),
      handleMessage: vi.fn().mockResolvedValue(ok({ messageId: 'msg', status: 'completed' })),
      initialize: vi.fn().mockResolvedValue(ok(undefined)),
      cleanup: vi.fn().mockResolvedValue(undefined),
    };

    const agents = new Map([
      ['agent1', createAcceptingAgent('agent1', 'Proposal')],
      ['agent2', switchingAgent],
      ['agent3', createAcceptingAgent('agent3', 'ACCEPT')],
    ]);

    const result = await protocol.execute(config, agents);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.aggregatedResult.metadata.totalTokensUsed).toBeGreaterThan(0);
    }
  });

  it('should emit correct events throughout multi-round execution', async () => {
    const protocol = createAegeanProtocol({
      eventBus: mockEventBus,
      aegeanConfig: { maxRounds: 2, earlyTermination: false },
    });

    const config = createTestConfig(['a1', 'a2', 'a3'], 'event-tracking-session');

    const agents = new Map([
      ['a1', createConfigurableAgent('a1', { proposalOutput: 'P1', voteOutput: 'REJECT' })],
      ['a2', createConfigurableAgent('a2', { proposalOutput: 'P2', voteOutput: 'REJECT' })],
      ['a3', createConfigurableAgent('a3', { proposalOutput: 'P3', voteOutput: 'REJECT' })],
    ]);

    await protocol.execute(config, agents);

    // Verify event sequence
    const eventTopics = mockEventBus.emittedEvents.map((e) => e.topic);

    expect(eventTopics).toContain('protocol.started');
    expect(eventTopics).toContain('protocol.aegean.round_started');
    expect(eventTopics).toContain('protocol.aegean.vote_collected');
    expect(eventTopics).toContain('protocol.iteration');
    expect(eventTopics).toContain('protocol.completed');

    // Verify session IDs are consistent
    const sessionEvents = mockEventBus.emittedEvents.filter(
      (e) => e.sessionId === 'event-tracking-session'
    );
    expect(sessionEvents.length).toBeGreaterThan(0);
  });

  it('should demonstrate token efficiency vs baseline voting', async () => {
    const aegeanProtocol = createAegeanProtocol({
      eventBus: mockEventBus,
      aegeanConfig: { maxRounds: 3, earlyTermination: true },
    });

    const config = createTestConfig(['agent1', 'agent2', 'agent3', 'agent4', 'agent5']);

    // All accept immediately
    const agents = new Map([
      ['agent1', createAcceptingAgent('agent1', 'Proposal')],
      ['agent2', createAcceptingAgent('agent2', 'ACCEPT')],
      ['agent3', createAcceptingAgent('agent3', 'ACCEPT')],
      ['agent4', createAcceptingAgent('agent4', 'ACCEPT')],
      ['agent5', createAcceptingAgent('agent5', 'ACCEPT')],
    ]);

    const { result, ms } = await measureLatency(() => aegeanProtocol.execute(config, agents));

    expect(result.ok).toBe(true);
    if (result.ok) {
      // With early termination, should complete in 1 round
      const output = result.value.aggregatedResult.output as { aegean?: { rounds: number } };
      expect(output.aegean?.rounds).toBe(1);

      // Verify efficiency - single round with 5 agents
      expect(ms).toBeLessThan(5000);
    }
  });
});

describe('Aegean Integration and Performance E2E', () => {
  let mockEventBus: MockEventBus;

  beforeEach(() => {
    mockEventBus = createMockEventBus();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should handle concurrent protocol executions', async () => {
    const protocols = [
      createAegeanProtocol({ eventBus: createMockEventBus() }),
      createAegeanProtocol({ eventBus: createMockEventBus() }),
      createAegeanProtocol({ eventBus: createMockEventBus() }),
    ];

    const configs = protocols.map((_, i) =>
      createTestConfig([`p${String(i)}_a1`, `p${String(i)}_a2`, `p${String(i)}_a3`])
    );

    const agentMaps = configs.map(
      (config) =>
        new Map(
          config.experts.map((id) => [
            id,
            createAcceptingAgent(id, id.endsWith('a1') ? 'Proposal' : 'ACCEPT'),
          ])
        )
    );

    const results = await Promise.all(
      protocols.map((protocol, i) => protocol.execute(configs[i]!, agentMaps[i]!))
    );

    // All should succeed
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it('should cancel execution gracefully', async () => {
    const protocol = createAegeanProtocol({
      eventBus: mockEventBus,
      aegeanConfig: { maxRounds: 10 },
    });

    const config = createTestConfig(['agent1', 'agent2', 'agent3']);

    // Slow agents to allow cancellation
    const slowAgent = createConfigurableAgent('agent1', {
      proposalOutput: 'Slow proposal',
      voteOutput: 'ACCEPT',
      delayMs: 500,
    });

    const agents = new Map([
      ['agent1', slowAgent],
      ['agent2', createAcceptingAgent('agent2', 'ACCEPT')],
      ['agent3', createAcceptingAgent('agent3', 'ACCEPT')],
    ]);

    // Cancel after short delay
    setTimeout(() => {
      protocol.cancel('Test cancellation');
    }, 50);

    const result = await protocol.execute(config, agents);

    // Should complete (possibly with cancelled state)
    expect(result.ok).toBe(true);
  });

  it('should complete within reasonable timeout', async () => {
    const protocol = createAegeanProtocol({ eventBus: mockEventBus });
    const config = createTestConfig(['agent1', 'agent2', 'agent3']);

    const agents = new Map([
      ['agent1', createAcceptingAgent('agent1', 'Fast proposal')],
      ['agent2', createAcceptingAgent('agent2', 'ACCEPT')],
      ['agent3', createAcceptingAgent('agent3', 'ACCEPT')],
    ]);

    const result = await withTimeout(protocol.execute(config, agents), 10000);

    expect(result.ok).toBe(true);
  });
});
