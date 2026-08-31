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
  WeightBasis,
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
  /**
   * Present on weighted strategies only. Absent means the strategy does not
   * weight at all (simple majority, supermajority, unanimous) — which is
   * different from `'unweighted'`, meaning a weighted strategy ran with nothing
   * to weight by.
   */
  weightBasis?: WeightBasis;
  reason: string;
}

/**
 * Classifies a weighted tally by how many of its voters had a real weight
 * supplied (#5117).
 *
 * A voter absent from `weights` had no performance record; `countWeightedVotes`
 * already defaults such a voter to `1.0`, so the arithmetic is unchanged — the
 * absence is what carries the provenance.
 */
function deriveWeightBasis(votes: Map<string, Vote>, weights: Map<string, number>): WeightBasis {
  let withRecord = 0;
  for (const agentId of votes.keys()) {
    if (weights.has(agentId)) withRecord++;
  }

  // The empty case, named rather than left to a default: zero voters carrying a
  // record — including the zero-voter case — is 'unweighted', never
  // 'performance'. Answering it with `withRecord === votes.size` would make
  // 0 === 0 report a full performance basis over nothing measured.
  if (withRecord === 0) return 'unweighted';
  return withRecord === votes.size ? 'performance' : 'partial';
}

/**
 * Evaluates an approval ratio against a threshold — the shared math behind
 * the simple-majority, supermajority and proof-of-learning strategies.
 *
 * `inclusive` selects the comparison: `>=` for supermajority (67% passes at
 * exactly 67%), strict `>` for simple-majority and proof-of-learning (a tie
 * at the threshold is not enough). Callers apply their own zero-denominator
 * guard before calling this.
 */
function evaluateThreshold(
  approveCount: number,
  votingTotal: number,
  threshold: number,
  inclusive: boolean
): { approved: boolean; approvalPercentage: number } {
  const ratio = approveCount / votingTotal;
  return {
    approved: inclusive ? ratio >= threshold : ratio > threshold,
    approvalPercentage: ratio * 100,
  };
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

    const { approved, approvalPercentage } = evaluateThreshold(
      counts.approve,
      votingVotes,
      threshold,
      true
    );

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

    const { approved, approvalPercentage } = evaluateThreshold(
      weightedCounts.approve,
      votingWeight,
      threshold,
      false
    );

    const weightBasis = deriveWeightBasis(votes, effectiveWeights);
    const verdict = approved ? 'Approved' : 'Rejected';

    return {
      approved,
      approvalPercentage,
      voteCounts: counts,
      weightedCounts,
      weightBasis,
      reason: `${verdict} with ${approvalPercentage.toFixed(1)}% ${describeBasis(weightBasis)}`,
    };
  }
}

/**
 * The tail of the reason string, naming what the percentage was computed over.
 *
 * Calling an unweighted tally "weighted approval" is the misreport #5117 fixes:
 * the phrase invites a reader to believe voter track record moved the number
 * when nothing had ever recorded one.
 */
function describeBasis(basis: WeightBasis): string {
  switch (basis) {
    case 'performance':
      return 'weighted approval (weights from voter performance history)';
    case 'partial':
      return 'partly weighted approval (some voters have no performance history; those count as 1.0)';
    case 'unweighted':
      return 'approval (UNWEIGHTED — no voter performance history recorded)';
    default: {
      const unreachable: never = basis;
      throw new Error(`Unhandled weight basis: ${String(unreachable)}`);
    }
  }
}

/**
 * Calculate vote weight for an agent based on their performance history.
 *
 * Weight ranges from 0.5 (never correct) to 1.0 (perfect track record). An
 * agent with NO history returns 1.0, not 0.5 — the doc used to say "0.5 (no
 * history)", which the code has never done (#5117). The distinction matters:
 * a 1.0 default is indistinguishable from a perfect record by value alone,
 * which is why callers must not infer "was this measured?" from the number.
 * `deriveWeightBasis` answers that from provenance instead.
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
