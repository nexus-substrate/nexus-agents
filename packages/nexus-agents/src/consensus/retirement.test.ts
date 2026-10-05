import { describe, expect, it } from 'vitest';
import { createConsensusEngine } from './engine.js';
import { createStrategyFactory } from './strategies.js';
import { VOTING_THRESHOLDS } from './decision/thresholds.js';
import {
  DEFAULT_QUORUM_THRESHOLDS,
  QuorumValidator,
  type QuorumValidationInput,
} from './quorum-validator.js';
import type { ConsensusAlgorithm, Proposal, Vote } from './types.js';

const RETIRED_ALGORITHM = 'proof_of_learning';

describe('proof_of_learning retirement (#5234)', () => {
  it('does not offer the retired strategy or its threshold', () => {
    expect(createStrategyFactory().getAvailableAlgorithms()).not.toContain(RETIRED_ALGORITHM);
    expect(VOTING_THRESHOLDS).not.toHaveProperty(RETIRED_ALGORITHM);
    expect(DEFAULT_QUORUM_THRESHOLDS).not.toHaveProperty(RETIRED_ALGORITHM);
  });

  it('rejects attempts to instantiate the retired strategy', () => {
    expect(() =>
      createStrategyFactory().getStrategy(RETIRED_ALGORITHM as ConsensusAlgorithm)
    ).toThrow(/proof_of_learning.*retired.*#5234/);
  });

  it('rejects new proposals using the retired algorithm', async () => {
    const proposal = {
      title: 'Retired algorithm',
      description: 'New proposals cannot use a historical strategy',
      algorithm: RETIRED_ALGORITHM,
    } as unknown as Proposal;
    const result = await createConsensusEngine().propose(proposal);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/proof_of_learning.*retired.*#5234/);
  });

  it('rejects the retired algorithm at the quorum validation boundary', () => {
    const input = retiredQuorumInput();
    const result = new QuorumValidator().validateQuorum(input);
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid')
      expect(result.error).toMatch(/proof_of_learning.*retired.*#5234/);
  });

  it('rejects the retired algorithm when requesting a quorum breakdown', () => {
    expect(() => new QuorumValidator().getQuorumBreakdown(retiredQuorumInput())).toThrow(
      /proof_of_learning.*retired.*#5234/
    );
  });

  it('removes the unused in-memory performance tracking API', () => {
    const engine = createConsensusEngine();
    expect(engine).not.toHaveProperty('updateAgentPerformance');
    expect(engine).not.toHaveProperty('getAgentPerformance');
  });
});

function retiredQuorumInput(): QuorumValidationInput {
  const votes = new Map<string, Vote>([
    ['agent', { decision: 'approve', confidence: 1, reasoning: 'approve' }],
  ]);
  return {
    votes,
    config: { algorithm: RETIRED_ALGORITHM as ConsensusAlgorithm, threshold: 0.5, minVoters: 1 },
  };
}
