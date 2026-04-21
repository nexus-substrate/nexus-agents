/**
 * Aegean Consensus Protocol E2E Tests - Byzantine Fault Tolerance
 *
 * Tests for Byzantine fault tolerance in the Aegean consensus protocol.
 * Based on arXiv:2512.20184 "Reaching Agreement Among Reasoning LLM Agents".
 *
 * @module testing/e2e/consensus/aegean-byzantine
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { IAgent } from '../../../core/index.js';
import { ok } from '../../../core/index.js';
import { createAegeanProtocol } from '../../../agents/collaboration/aegean-protocol.js';
import {
  createMockEventBus,
  createConfigurableAgent,
  createAcceptingAgent,
  createTestConfig,
  wasConsensusReached,
  type MockEventBus,
} from './aegean-test-utils.js';

describe('Aegean Byzantine Fault Tolerance E2E', () => {
  let mockEventBus: MockEventBus;

  beforeEach(() => {
    mockEventBus = createMockEventBus();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should require minimum 3f+1 agents for f Byzantine tolerance', async () => {
    // f=1 requires minimum 4 agents
    const protocol = createAegeanProtocol({
      eventBus: mockEventBus,
      aegeanConfig: { byzantineTolerance: 1 },
    });

    const config = createTestConfig(['agent1', 'agent2', 'agent3']); // Only 3 agents

    const agents = new Map([
      ['agent1', createAcceptingAgent('agent1', 'Proposal')],
      ['agent2', createAcceptingAgent('agent2', 'ACCEPT')],
      ['agent3', createAcceptingAgent('agent3', 'ACCEPT')],
    ]);

    const result = await protocol.execute(config, agents);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('at least');
      expect(result.error.message).toContain('4'); // 3*1+1 = 4
    }
  });

  it('should reach consensus despite f=1 Byzantine agent', async () => {
    const protocol = createAegeanProtocol({
      eventBus: mockEventBus,
      aegeanConfig: { byzantineTolerance: 1 },
    });

    // 4 agents (3f+1 where f=1)
    const config = createTestConfig(['agent1', 'agent2', 'agent3', 'byzantine']);

    const agents = new Map([
      ['agent1', createAcceptingAgent('agent1', 'Honest proposal')],
      ['agent2', createAcceptingAgent('agent2', 'ACCEPT')],
      ['agent3', createAcceptingAgent('agent3', 'ACCEPT')],
      // Byzantine agent always rejects
      [
        'byzantine',
        createConfigurableAgent('byzantine', {
          proposalOutput: 'Byzantine proposal',
          voteOutput: 'REJECT',
        }),
      ],
    ]);

    const result = await protocol.execute(config, agents);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // With 3 accepts (leader + 2 voters) vs 1 reject, should reach consensus
      expect(wasConsensusReached(result.value)).toBe(true);
    }
  });

  it('should handle Byzantine agents voting inconsistently', async () => {
    const protocol = createAegeanProtocol({
      eventBus: mockEventBus,
      aegeanConfig: { byzantineTolerance: 1, maxRounds: 2 },
    });

    const config = createTestConfig(['leader', 'honest1', 'honest2', 'byzantine']);

    // Byzantine agent changes vote between rounds
    let byzantineCallCount = 0;
    const byzantineAgent: IAgent = {
      id: 'byzantine',
      role: 'code_expert',
      capabilities: [],
      state: 'idle',
      execute: vi.fn().mockImplementation(() => {
        byzantineCallCount++;
        const vote = byzantineCallCount % 2 === 0 ? 'ACCEPT' : 'REJECT';
        return ok({
          taskId: 'test',
          output: vote,
          metadata: { durationMs: 50, tokensUsed: 25, toolsUsed: [], model: 'test' },
        });
      }),
      handleMessage: vi.fn().mockResolvedValue(ok({ messageId: 'msg', status: 'completed' })),
      initialize: vi.fn().mockResolvedValue(ok(undefined)),
      cleanup: vi.fn().mockResolvedValue(undefined),
    };

    const agents = new Map([
      ['leader', createAcceptingAgent('leader', 'Proposal')],
      ['honest1', createAcceptingAgent('honest1', 'ACCEPT')],
      ['honest2', createAcceptingAgent('honest2', 'ACCEPT')],
      ['byzantine', byzantineAgent],
    ]);

    const result = await protocol.execute(config, agents);

    // System should still function despite Byzantine behavior
    expect(result.ok).toBe(true);
  });

  it('should fail gracefully when too many Byzantine agents', async () => {
    const protocol = createAegeanProtocol({
      eventBus: mockEventBus,
      aegeanConfig: { byzantineTolerance: 1, maxRounds: 1, earlyTermination: true },
    });

    // 4 agents with 2 Byzantine (exceeds f=1 tolerance)
    const config = createTestConfig(['leader', 'honest', 'byzantine1', 'byzantine2']);

    const agents = new Map([
      ['leader', createAcceptingAgent('leader', 'Proposal')],
      ['honest', createAcceptingAgent('honest', 'ACCEPT')],
      [
        'byzantine1',
        createConfigurableAgent('byzantine1', {
          proposalOutput: 'Bad',
          voteOutput: 'REJECT',
        }),
      ],
      [
        'byzantine2',
        createConfigurableAgent('byzantine2', {
          proposalOutput: 'Bad',
          voteOutput: 'REJECT',
        }),
      ],
    ]);

    const result = await protocol.execute(config, agents);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // With 2 Byzantine rejects out of 4, consensus should not be reached
      expect(wasConsensusReached(result.value)).toBe(false);
    }
  });
});
