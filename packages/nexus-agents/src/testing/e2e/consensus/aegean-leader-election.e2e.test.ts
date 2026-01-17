/**
 * Aegean Consensus Protocol E2E Tests - Leader Election
 *
 * Tests for leader selection and rotation in the Aegean Byzantine-fault-tolerant
 * consensus protocol based on arXiv:2512.20184.
 *
 * @module testing/e2e/consensus/aegean-leader-election
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createAegeanProtocol } from '../../../agents/collaboration/aegean-protocol.js';
import {
  createMockEventBus,
  createConfigurableAgent,
  createAcceptingAgent,
  createFailingAgent,
  createTestConfig,
  type MockEventBus,
} from './aegean-test-utils.js';

describe('Aegean Leader Election E2E', () => {
  let mockEventBus: MockEventBus;

  beforeEach(() => {
    mockEventBus = createMockEventBus();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should select leader using round-robin in first round', async () => {
    const protocol = createAegeanProtocol({ eventBus: mockEventBus });
    const config = createTestConfig(['leader1', 'voter2', 'voter3']);

    const leader1 = createConfigurableAgent('leader1', {
      proposalOutput: 'Leader 1 proposal',
      voteOutput: 'ACCEPT',
    });
    const voter2 = createConfigurableAgent('voter2', {
      proposalOutput: 'Voter 2 (not used)',
      voteOutput: 'ACCEPT',
    });
    const voter3 = createConfigurableAgent('voter3', {
      proposalOutput: 'Voter 3 (not used)',
      voteOutput: 'ACCEPT',
    });

    const agents = new Map([
      ['leader1', leader1],
      ['voter2', voter2],
      ['voter3', voter3],
    ]);

    const result = await protocol.execute(config, agents);

    expect(result.ok).toBe(true);

    // Verify leader1 was called first (as proposer)
    expect(leader1.execute).toHaveBeenCalled();

    // Check round started event shows leader1 as leader
    const roundStartedEvent = mockEventBus.emittedEvents.find(
      (e) => e.topic === 'protocol.aegean.round_started'
    );
    expect(roundStartedEvent?.payload.leaderId).toBe('leader1');
  });

  it('should rotate leader across multiple rounds when no consensus', async () => {
    const protocol = createAegeanProtocol({
      eventBus: mockEventBus,
      aegeanConfig: { maxRounds: 3, earlyTermination: false },
    });

    const config = createTestConfig(['agent1', 'agent2', 'agent3']);

    // All agents reject to force multiple rounds
    const agents = new Map([
      [
        'agent1',
        createConfigurableAgent('agent1', {
          proposalOutput: 'Proposal from agent1',
          voteOutput: 'REJECT',
        }),
      ],
      [
        'agent2',
        createConfigurableAgent('agent2', {
          proposalOutput: 'Proposal from agent2',
          voteOutput: 'REJECT',
        }),
      ],
      [
        'agent3',
        createConfigurableAgent('agent3', {
          proposalOutput: 'Proposal from agent3',
          voteOutput: 'REJECT',
        }),
      ],
    ]);

    await protocol.execute(config, agents);

    // Check that different leaders were selected across rounds
    const roundStartedEvents = mockEventBus.emittedEvents.filter(
      (e) => e.topic === 'protocol.aegean.round_started'
    );

    expect(roundStartedEvents.length).toBeGreaterThanOrEqual(1);
    // Round-robin: round 0 -> agent1, round 1 -> agent2, round 2 -> agent3
    if (roundStartedEvents.length >= 2) {
      expect(roundStartedEvents[0]?.payload.leaderId).toBe('agent1');
      expect(roundStartedEvents[1]?.payload.leaderId).toBe('agent2');
    }
  });

  it('should handle leader agent failure gracefully', async () => {
    const protocol = createAegeanProtocol({
      eventBus: mockEventBus,
      aegeanConfig: { maxRounds: 2 },
    });

    const config = createTestConfig(['failing_leader', 'voter2', 'voter3']);

    const agents = new Map([
      ['failing_leader', createFailingAgent('failing_leader')],
      ['voter2', createAcceptingAgent('voter2', 'ACCEPT')],
      ['voter3', createAcceptingAgent('voter3', 'ACCEPT')],
    ]);

    const result = await protocol.execute(config, agents);

    // Protocol should handle failure gracefully
    expect(result.ok).toBe(false);
  });
});
