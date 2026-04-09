/**
 * nexus-agents/consensus - Voting Strategies
 *
 * Implementation of different voting strategies for consensus engine.
 * Supports simple majority, supermajority, unanimous, and proof-of-learning.
 */

import type {
  ConsensusAlgorithm,
  Vote,
  VoteCounts,
  WeightedVoteCounts,
  AgentPerformance,
} from './types.js';
import { VOTING_THRESHOLDS } from './types.js';
import { HigherOrderVotingStrategy } from './higher-order-voting.js';

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

  /**
   * Calculate weighted vote counts using agent performance weights.
   */
  protected countWeightedVotes(
    votes: Map<string, Vote>,
    weights: Map<string, number>
  ): WeightedVoteCounts {
    let approve = 0;
    let reject = 0;
    let abstain = 0;
    let totalWeight = 0;

    for (const [agentId, vote] of votes.entries()) {
      const weight = weights.get(agentId) ?? 1.0;
      totalWeight += weight;

      switch (vote.decision) {
        case 'approve':
          approve += weight;
          break;
        case 'reject':
          reject += weight;
          break;
        case 'abstain':
          abstain += weight;
          break;
      }
    }

    return { approve, reject, abstain, totalWeight };
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

    const approvalPercentage = (counts.approve / votingVotes) * 100;
    const approved = counts.approve / votingVotes > threshold;

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
 * Supermajority voting strategy (>=67% approval).
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

    const approvalPercentage = (counts.approve / votingVotes) * 100;
    const approved = counts.approve / votingVotes >= threshold;

    return {
      approved,
      approvalPercentage,
      voteCounts: counts,
      reason: approved
        ? `Approved with ${approvalPercentage.toFixed(1)}% (>=${String(threshold * 100)}% required)`
        : `Rejected with ${approvalPercentage.toFixed(1)}% (<${String(threshold * 100)}% threshold)`,
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

/**
 * Proof-of-learning weighted voting strategy.
 * Agents with better track records have more voting power.
 */
export class ProofOfLearningStrategy extends BaseVotingStrategy {
  readonly algorithm: ConsensusAlgorithm = 'proof_of_learning';

  calculateOutcome(votes: Map<string, Vote>, weights?: Map<string, number>): VotingOutcome {
    const counts = this.countVotes(votes);
    const effectiveWeights = weights ?? new Map<string, number>();
    const weightedCounts = this.countWeightedVotes(votes, effectiveWeights);
    const threshold = VOTING_THRESHOLDS.proof_of_learning;

    const votingWeight = weightedCounts.approve + weightedCounts.reject;

    if (votingWeight === 0) {
      return {
        approved: false,
        approvalPercentage: 0,
        voteCounts: counts,
        weightedCounts,
        reason: 'No weighted votes cast (excluding abstentions)',
      };
    }

    const approvalPercentage = (weightedCounts.approve / votingWeight) * 100;
    const approved = weightedCounts.approve / votingWeight > threshold;

    return {
      approved,
      approvalPercentage,
      voteCounts: counts,
      weightedCounts,
      reason: approved
        ? `Approved with ${approvalPercentage.toFixed(1)}% weighted approval`
        : `Rejected with ${approvalPercentage.toFixed(1)}% weighted approval`,
    };
  }
}

/**
 * Calculate vote weight for an agent based on their performance history.
 * Weight ranges from 0.5 (no history) to 1.0 (perfect track record).
 */
export function calculateVoteWeight(performance: AgentPerformance | undefined): number {
  if (performance === undefined || performance.totalVotes === 0) {
    return 1.0; // Default weight for new agents
  }

  // Weight = 0.5 + (successRate * 0.5)
  // This gives a range of 0.5 to 1.0 based on historical accuracy
  return 0.5 + performance.successRate * 0.5;
}

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
      ['proof_of_learning', new ProofOfLearningStrategy()],
      ['opinion_wise', new HigherOrderVotingStrategy()],
      ['higher_order', new HigherOrderVotingStrategy()],
    ]);
  }

  /**
   * Get a voting strategy by algorithm type.
   */
  getStrategy(algorithm: ConsensusAlgorithm): IVotingStrategy {
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
