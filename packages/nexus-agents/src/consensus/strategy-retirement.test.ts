import { describe, expect, it } from 'vitest';
import { ConsensusAlgorithmSchema, ProposalSchema } from './types-core.js';

describe('proof_of_learning retirement (#5234): schemas', () => {
  it('rejects the retired algorithm with a migration error', () => {
    const result = ConsensusAlgorithmSchema.safeParse('proof_of_learning');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('retired');
      expect(result.error.message).toContain('#5234');
      expect(result.error.message).toContain('simple_majority');
      expect(result.error.message).toContain('higher_order');
    }
  });

  it('rejects new proposals selecting the retired algorithm', () => {
    expect(
      ProposalSchema.safeParse({
        title: 'Retired strategy',
        description: 'A new proposal must use a supported algorithm',
        algorithm: 'proof_of_learning',
      }).success
    ).toBe(false);
  });

  it.each(['simple_majority', 'supermajority', 'unanimous', 'higher_order', 'opinion_wise'])(
    'continues accepting %s',
    (algorithm) => {
      expect(ConsensusAlgorithmSchema.safeParse(algorithm).success).toBe(true);
    }
  );
});
