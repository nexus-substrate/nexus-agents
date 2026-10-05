/**
 * nexus-agents/consensus - Voting Strategies
 *
 * Implementation of different voting strategies for consensus engine.
 * Supports simple majority, supermajority, unanimous, and higher-order voting.
 */

import type {
  ConsensusAlgorithm,
  Vote,
  VoteCounts,
  WeightedVoteCounts,
  WeightBasis,
} from './types.js';
import { RETIRED_CONSENSUS_STRATEGY_MESSAGE } from './types-core.js';
import { VOTING_THRESHOLDS } from './decision/thresholds.js';
import { HigherOrderVotingStrategy } from './higher-order-voting.js';
// The ratio-vs-bar comparison lives in the governed decision module (#6000 step 1).
import { evaluateThreshold } from './decision/verdict.js';

/**
 * Interface for voting strategy implementations.
 */
export interface IVotingStrategy {
  readonly algorithm: ConsensusAlgorithm;
  calculateOutcome(votes: Map<string, Vote>, weights?: Map<string, number>): VotingOutcome;
}

/**
 * Result of a voting strategy calculation.
 */
export interface VotingOutcome {
  approved: boolean;
  approvalPercentage: number;
  voteCounts: VoteCounts;
  weightedCounts?: WeightedVoteCounts;
  /**
   * Retained for historical results and custom weighted strategies. Built-in
   * strategies leave this absent after the proof-of-learning retirement (#5234).
   */
  weightBasis?: WeightBasis;
  reason: string;
}

/**
 * Base voting strategy with common functionality.
 */
abstract class BaseVotingStrategy implements IVotingStrategy {
  abstract readonly algorithm: ConsensusAlgorithm;

  abstract calculateOutcome(votes: Map<string, Vote>, weights?: Map<string, number>): VotingOutcome;

  /**
   * Count votes by decision type.
   */
  protected countVotes(votes: Map<string, Vote>): VoteCounts {
    let approve = 0;
    let reject = 0;
    let abstain = 0;

    for (const vote of votes.values()) {
      switch (vote.decision) {
        case 'approve':
          approve++;
          break;
        case 'reject':
          reject++;
          break;
        case 'abstain':
          abstain++;
          break;
      }
    }

    return { approve, reject, abstain, total: votes.size };
  }
}

/**
 * Simple majority voting strategy (>50% approval).
 */
export class SimpleMajorityStrategy extends BaseVotingStrategy {
  readonly algorithm: ConsensusAlgorithm = 'simple_majority';

  calculateOutcome(votes: Map<string, Vote>): VotingOutcome {
    const counts = this.countVotes(votes);
    const votingVotes = counts.approve + counts.reject; // Abstains don't count
    const threshold = VOTING_THRESHOLDS.simple_majority;

    if (votingVotes === 0) {
      return {
        approved: false,
        approvalPercentage: 0,
        voteCounts: counts,
        reason: 'No votes cast (excluding abstentions)',
      };
    }

    const { approved, approvalPercentage } = evaluateThreshold(
      counts.approve,
      votingVotes,
      threshold,
      false
    );

    return {
      approved,
      approvalPercentage,
      voteCounts: counts,
      reason: approved
        ? `Approved with ${approvalPercentage.toFixed(1)}% (>${String(threshold * 100)}% required)`
        : `Rejected with ${approvalPercentage.toFixed(1)}% (<=${String(threshold * 100)}% threshold)`,
    };
  }
}

/**
 * Supermajority voting strategy (at least 2/3 approval).
 */
export class SupermajorityStrategy extends BaseVotingStrategy {
  readonly algorithm: ConsensusAlgorithm = 'supermajority';

  calculateOutcome(votes: Map<string, Vote>): VotingOutcome {
    const counts = this.countVotes(votes);
    const votingVotes = counts.approve + counts.reject;
    const threshold = VOTING_THRESHOLDS.supermajority;

    if (votingVotes === 0) {
      return {
        approved: false,
        approvalPercentage: 0,
        voteCounts: counts,
        reason: 'No votes cast (excluding abstentions)',
      };
    }

    const { approved, approvalPercentage } = evaluateThreshold(
      counts.approve,
      votingVotes,
      threshold,
      true
    );
    const thresholdPercentage = (threshold * 100).toFixed(1);

    return {
      approved,
      approvalPercentage,
      voteCounts: counts,
      reason: approved
        ? `Approved with ${approvalPercentage.toFixed(1)}% (>=${thresholdPercentage}% required)`
        : `Rejected with ${approvalPercentage.toFixed(1)}% (<${thresholdPercentage}% threshold)`,
    };
  }
}

/**
 * Unanimous voting strategy (100% approval required).
 */
export class UnanimousStrategy extends BaseVotingStrategy {
  readonly algorithm: ConsensusAlgorithm = 'unanimous';

  calculateOutcome(votes: Map<string, Vote>): VotingOutcome {
    const counts = this.countVotes(votes);

    if (counts.total === 0) {
      return {
        approved: false,
        approvalPercentage: 0,
        voteCounts: counts,
        reason: 'No votes cast',
      };
    }

    // For unanimous, any rejection fails the proposal
    // Abstentions are allowed but don't count toward approval
    const approvalPercentage = counts.total > 0 ? (counts.approve / counts.total) * 100 : 0;

    if (counts.reject > 0) {
      return {
        approved: false,
        approvalPercentage,
        voteCounts: counts,
        reason: `Rejected: ${String(counts.reject)} rejection(s) cast (unanimous approval required)`,
      };
    }

    if (counts.approve === 0) {
      return {
        approved: false,
        approvalPercentage: 0,
        voteCounts: counts,
        reason: 'No approvals cast (at least one approval required)',
      };
    }

    return {
      approved: true,
      approvalPercentage,
      voteCounts: counts,
      reason: `Unanimously approved with ${String(counts.approve)} vote(s)`,
    };
  }
}

// Widened to string so runtime callers can receive the retirement error even
// though TypeScript no longer permits selecting this algorithm.
const RETIRED_ALGORITHM: string = 'proof_of_learning';

/**
 * Factory for creating voting strategies.
 */
export class VotingStrategyFactory {
  private readonly strategies: Map<ConsensusAlgorithm, IVotingStrategy>;

  constructor() {
    this.strategies = new Map<ConsensusAlgorithm, IVotingStrategy>([
      ['simple_majority', new SimpleMajorityStrategy()],
      ['supermajority', new SupermajorityStrategy()],
      ['unanimous', new UnanimousStrategy()],
      ['opinion_wise', new HigherOrderVotingStrategy()],
      ['higher_order', new HigherOrderVotingStrategy()],
    ]);
  }

  /**
   * Get a voting strategy by algorithm type.
   */
  getStrategy(algorithm: ConsensusAlgorithm): IVotingStrategy {
    if (algorithm === RETIRED_ALGORITHM) {
      throw new Error(RETIRED_CONSENSUS_STRATEGY_MESSAGE);
    }
    const strategy = this.strategies.get(algorithm);
    if (strategy === undefined) {
      throw new Error(`Unknown voting algorithm: ${algorithm}`);
    }
    return strategy;
  }

  /**
   * Register a custom voting strategy.
   */
  registerStrategy(strategy: IVotingStrategy): void {
    this.strategies.set(strategy.algorithm, strategy);
  }

  /**
   * Get all available algorithm types.
   */
  getAvailableAlgorithms(): ConsensusAlgorithm[] {
    return Array.from(this.strategies.keys());
  }
}

/**
 * Creates a voting strategy factory with default strategies.
 */
export function createStrategyFactory(): VotingStrategyFactory {
  return new VotingStrategyFactory();
}
