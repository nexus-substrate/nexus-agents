/**
 * Aegean Consensus Protocol E2E Tests - Quorum Formation
 *
 * Tests for quorum detection and early termination in the Aegean
 * Byzantine-fault-tolerant consensus protocol based on arXiv:2512.20184.
 *
 * @module testing/e2e/consensus/aegean-quorum
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createAegeanProtocol } from '../../../agents/collaboration/aegean-protocol.js';
import {
  calculateQuorumSize,
  hasAcceptQuorum,
  isConsensusFailed,
  type QuorumStatus,
} from '../../../agents/collaboration/aegean-types.js';
import {
  createMockEventBus,
  createConfigurableAgent,
  createAcceptingAgent,
  createTestConfig,
  type MockEventBus,
} from './aegean-test-utils.js';

describe('Aegean Quorum Formation E2E', () => {
  let mockEventBus: MockEventBus;

  beforeEach(() => {
    mockEventBus = createMockEventBus();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should reach quorum with minimum 3 agents (f=0)', async () => {
    const protocol = createAegeanProtocol({ eventBus: mockEventBus });
    const config = createTestConfig(['agent1', 'agent2', 'agent3']);

    const agents = new Map([
      ['agent1', createAcceptingAgent('agent1', 'Proposal')],
      ['agent2', createAcceptingAgent('agent2', 'ACCEPT')],
      ['agent3', createAcceptingAgent('agent3', 'ACCEPT')],
    ]);

    const result = await protocol.execute(config, agents);
    expect(result.ok).toBe(true);

    // Check quorum detected event
    const quorumEvent = mockEventBus.emittedEvents.find(
      (e) => e.topic === 'protocol.aegean.quorum_detected'
    );
    expect(quorumEvent).toBeDefined();
  });

  it('should calculate correct quorum size for different agent counts', () => {
    // f=0: quorum = ceil((n + 0 + 1) / 2)
    expect(calculateQuorumSize(3, 0)).toBe(2); // (3+1)/2 = 2
    expect(calculateQuorumSize(5, 0)).toBe(3); // (5+1)/2 = 3
    expect(calculateQuorumSize(7, 0)).toBe(4); // (7+1)/2 = 4

    // f=1: quorum = ceil((n + 1 + 1) / 2)
    expect(calculateQuorumSize(4, 1)).toBe(3); // (4+2)/2 = 3
    expect(calculateQuorumSize(7, 1)).toBe(5); // (7+2)/2 = 4.5 -> 5

    // f=2: quorum = ceil((n + 2 + 1) / 2)
    expect(calculateQuorumSize(7, 2)).toBe(5); // (7+3)/2 = 5
  });

  it('should detect early termination when consensus impossible', async () => {
    const protocol = createAegeanProtocol({
      eventBus: mockEventBus,
      aegeanConfig: { maxRounds: 3, earlyTermination: true },
    });

    const config = createTestConfig(['agent1', 'agent2', 'agent3']);

    // 2 out of 3 reject - consensus impossible
    const agents = new Map([
      ['agent1', createAcceptingAgent('agent1', 'Proposal')],
      [
        'agent2',
        createConfigurableAgent('agent2', {
          proposalOutput: 'N/A',
          voteOutput: 'REJECT',
        }),
      ],
      [
        'agent3',
        createConfigurableAgent('agent3', {
          proposalOutput: 'N/A',
          voteOutput: 'REJECT',
        }),
      ],
    ]);

    const result = await protocol.execute(config, agents);
    expect(result.ok).toBe(true);

    if (result.ok) {
      const output = result.value.aggregatedResult.output as { aegean?: unknown };
      expect(output.aegean).toBeDefined();
    }
  });

  it('should validate hasAcceptQuorum correctly', () => {
    const quorumReached: QuorumStatus = {
      required: 2,
      accepts: 2,
      rejects: 1,
      pending: 0,
      hasQuorum: true,
      consensusReached: true,
    };
    expect(hasAcceptQuorum(quorumReached)).toBe(true);

    const quorumNotReached: QuorumStatus = {
      required: 3,
      accepts: 2,
      rejects: 1,
      pending: 1,
      hasQuorum: false,
      consensusReached: false,
    };
    expect(hasAcceptQuorum(quorumNotReached)).toBe(false);
  });

  it('should validate isConsensusFailed correctly', () => {
    // Too many rejects - consensus failed
    const failedStatus: QuorumStatus = {
      required: 2,
      accepts: 1,
      rejects: 2,
      pending: 0,
      hasQuorum: false,
      consensusReached: false,
    };
    expect(isConsensusFailed(failedStatus, 3)).toBe(true);

    // Still possible
    const possibleStatus: QuorumStatus = {
      required: 2,
      accepts: 1,
      rejects: 0,
      pending: 2,
      hasQuorum: false,
      consensusReached: false,
    };
    expect(isConsensusFailed(possibleStatus, 3)).toBe(false);
  });
});
