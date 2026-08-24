/**
 * Unified Quorum Validator
 *
 * SCOPE, corrected (#4666). This module's docstring claimed it "abstracts
 * quorum validation across VotingProtocol, WeightedVoting, and ConsensusEngine"
 * and consolidates three implementations. It has exactly ONE consumer:
 * `voting-protocol-helpers.ts`. `WeightedVoting` and `ConsensusEngine` do not
 * use it. The intent from #576 was real; the consolidation did not happen, and
 * the doc has been describing the plan as though it were the state.
 *
 * A second, sharper caveat for anyone relying on this: `VotingProtocol` — the
 * one path that reaches here — has **no in-tree caller**. `createVotingProtocol`
 * is exported through `exports/consensus.ts` as public API and is constructed
 * only by tests. So this validator runs only for an external embedder.
 *
 * {@link QuorumValidator.isAgentEligible} in particular cannot exclude anyone
 * in practice: its sole caller passes no `record`, so it early-returns, and no
 * producer of trust scores or Byzantine flags exists anywhere in `src/`.
 * Removing it would be a breaking public-API change, so it stays — documented
 * as inert rather than presented as a working eligibility filter.
 *
 * @module consensus/quorum-validator
 * (Source: Issue #576, ADR-0003; scope corrected #4666)
 */

import { createLogger, formatPercentage, type ILogger } from '../core/index.js';
import type { ConsensusAlgorithm, Vote, VoteCounts, WeightedVoteCounts } from './types-core.js';
import { SUPERMAJORITY_THRESHOLD } from './types-core.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Agent record for eligibility checks and Byzantine detection.
 */
export interface AgentRecord {
  readonly agentId: string;
  readonly weight: number;
  readonly trustScore: number;
  readonly byzantineFlags?: number;
  readonly successRate?: number;
  readonly totalTasks?: number;
}

/**
 * Quorum validation configuration.
 */
export interface QuorumValidationConfig {
  /** Algorithm type */
  readonly algorithm: ConsensusAlgorithm | 'weighted_byzantine';
  /** Numeric threshold (0-1 for percentage, 0-N for weighted sum) */
  readonly threshold: number;
  /** Minimum voters required */
  readonly minVoters: number;
  /** Enable Byzantine detection */
  readonly enableByzantineDetection?: boolean;
  /** Apply confidence multiplier to weights */
  readonly confidenceMultiplier?: boolean;
  /** Include abstentions in quorum calculation */
  readonly includeAbstentions?: boolean;
}

/**
 * Input for quorum validation.
 */
export interface QuorumValidationInput {
  /** Votes cast by agent ID */
  readonly votes: ReadonlyMap<string, Vote>;
  /** Optional: Pre-calculated agent weights */
  readonly agentWeights?: ReadonlyMap<string, number>;
  /** Configuration */
  readonly config: QuorumValidationConfig;
  /** Optional: Agent records for eligibility checks */
  readonly agentRecords?: ReadonlyMap<string, AgentRecord>;
  /** Optional: Required participant count (for ratio-based quorum) */
  readonly requiredParticipants?: number;
}

/**
 * Quorum validation result (discriminated union).
 */
export type QuorumValidationResult =
  | {
      readonly status: 'reached';
      readonly decision: 'approve' | 'reject';
      readonly confidence: number;
      readonly reasoning: string;
    }
  | {
      readonly status: 'not_reached';
      readonly reason: 'insufficient_votes' | 'insufficient_weight' | 'no_consensus';
      readonly details: string;
    }
  | { readonly status: 'invalid'; readonly error: string }
  | { readonly status: 'timeout'; readonly partial: boolean; readonly details: string };

/**
 * Detailed quorum breakdown for observability.
 */
export interface QuorumBreakdown {
  readonly totalVotes: number;
  readonly voteCounts: VoteCounts;
  readonly totalWeight: number | undefined;
  readonly weightedCounts: WeightedVoteCounts | undefined;
  readonly threshold: number;
  readonly actualQuorum: number;
  readonly quorumReached: boolean;
  readonly eligibleAgents: readonly string[];
  readonly reasoning: string;
}

/**
 * Eligibility check result.
 */
export type EligibilityResult =
  | { readonly eligible: true; readonly weight: number }
  | {
      readonly eligible: false;
      readonly reason: 'insufficient_weight' | 'low_trust' | 'byzantine_flagged' | 'excluded';
      readonly weight: number;
    };

/**
 * Unified quorum validator interface.
 */
export interface IQuorumValidator {
  validateQuorum(input: QuorumValidationInput): QuorumValidationResult;
  getQuorumBreakdown(input: QuorumValidationInput): QuorumBreakdown;
  isAgentEligible(
    agentId: string,
    record: AgentRecord | undefined,
    config: QuorumValidationConfig
  ): EligibilityResult;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Default quorum thresholds by algorithm type.
 * Used for reference when config.threshold is not specified.
 */
export const DEFAULT_QUORUM_THRESHOLDS: Readonly<
  Record<ConsensusAlgorithm | 'weighted_byzantine', number>
> = {
  simple_majority: 0.5,
  supermajority: SUPERMAJORITY_THRESHOLD,
  unanimous: 1.0,
  proof_of_learning: 0.5,
  opinion_wise: 0.5,
  higher_order: 0.5,
  // Byzantine fault tolerance also requires 2/3 — the same supermajority.
  weighted_byzantine: SUPERMAJORITY_THRESHOLD,
};

const DEFAULT_MIN_TRUST = 0.3;
const DEFAULT_MIN_WEIGHT = 0.1;

/**
 * Unified quorum validator implementation.
 */
export class QuorumValidator implements IQuorumValidator {
  private readonly logger: ILogger;

  constructor(logger?: ILogger) {
    this.logger = logger ?? createLogger({ component: 'QuorumValidator' });
  }

  validateQuorum(input: QuorumValidationInput): QuorumValidationResult {
    const { votes, config } = input;

    // Validate input
    if (votes.size === 0) {
      return { status: 'invalid', error: 'No votes provided' };
    }

    // Calculate breakdown
    const breakdown = this.getQuorumBreakdown(input);

    // Check if quorum reached
    if (!breakdown.quorumReached) {
      return this.buildNotReachedResult(breakdown, config);
    }

    // Determine decision
    return this.buildReachedResult(breakdown);
  }

  getQuorumBreakdown(input: QuorumValidationInput): QuorumBreakdown {
    const { votes, agentWeights, config, agentRecords, requiredParticipants } = input;

    // Count votes
    const voteCounts = this.countVotes(votes);
    const eligibleAgents = this.getEligibleAgents(votes, agentRecords, config);

    // Calculate weights if applicable
    const { totalWeight, weightedCounts } = this.calculateWeights(
      votes,
      agentWeights,
      agentRecords,
      config
    );

    // Calculate quorum based on algorithm
    const { threshold, actualQuorum, quorumReached, reasoning } = this.calculateQuorumStatus(
      voteCounts,
      weightedCounts,
      totalWeight,
      config,
      requiredParticipants ?? votes.size
    );

    return {
      totalVotes: votes.size,
      voteCounts,
      totalWeight,
      weightedCounts,
      threshold,
      actualQuorum,
      quorumReached,
      eligibleAgents,
      reasoning,
    };
  }

  isAgentEligible(
    agentId: string,
    record: AgentRecord | undefined,
    config: QuorumValidationConfig
  ): EligibilityResult {
    if (record === undefined) {
      return { eligible: true, weight: 1.0 }; // Default eligibility
    }

    // Check Byzantine flags
    if (config.enableByzantineDetection === true && (record.byzantineFlags ?? 0) > 0) {
      this.logger.debug('Agent flagged as Byzantine', { agentId, flags: record.byzantineFlags });
      return { eligible: false, reason: 'byzantine_flagged', weight: record.weight };
    }

    // Check trust score
    if (record.trustScore < DEFAULT_MIN_TRUST) {
      this.logger.debug('Agent trust score below threshold', {
        agentId,
        trustScore: record.trustScore,
      });
      return { eligible: false, reason: 'low_trust', weight: record.weight };
    }

    // Check weight
    if (record.weight < DEFAULT_MIN_WEIGHT) {
      this.logger.debug('Agent weight below threshold', { agentId, weight: record.weight });
      return { eligible: false, reason: 'insufficient_weight', weight: record.weight };
    }

    return { eligible: true, weight: record.weight };
  }

  private countVotes(votes: ReadonlyMap<string, Vote>): VoteCounts {
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

  private getEligibleAgents(
    votes: ReadonlyMap<string, Vote>,
    agentRecords: ReadonlyMap<string, AgentRecord> | undefined,
    config: QuorumValidationConfig
  ): readonly string[] {
    const eligible: string[] = [];

    for (const agentId of votes.keys()) {
      const record = agentRecords?.get(agentId);
      const result = this.isAgentEligible(agentId, record, config);
      if (result.eligible) {
        eligible.push(agentId);
      }
    }

    return eligible;
  }

  private calculateWeights(
    votes: ReadonlyMap<string, Vote>,
    agentWeights: ReadonlyMap<string, number> | undefined,
    agentRecords: ReadonlyMap<string, AgentRecord> | undefined,
    config: QuorumValidationConfig
  ): { totalWeight: number | undefined; weightedCounts: WeightedVoteCounts | undefined } {
    // Skip weight calculation for simple algorithms
    if (config.algorithm === 'simple_majority' || config.algorithm === 'unanimous') {
      return { totalWeight: undefined, weightedCounts: undefined };
    }

    const counts = { totalWeight: 0, approve: 0, reject: 0, abstain: 0 };

    for (const [agentId, vote] of votes.entries()) {
      const weight = this.getVoteWeight(agentId, vote, agentWeights, agentRecords, config);
      counts.totalWeight += weight;
      this.addWeightToDecision(counts, vote.decision, weight);
    }

    return {
      totalWeight: counts.totalWeight,
      weightedCounts: {
        approve: counts.approve,
        reject: counts.reject,
        abstain: counts.abstain,
        totalWeight: counts.totalWeight,
      },
    };
  }

  private getVoteWeight(
    agentId: string,
    vote: Vote,
    agentWeights: ReadonlyMap<string, number> | undefined,
    agentRecords: ReadonlyMap<string, AgentRecord> | undefined,
    config: QuorumValidationConfig
  ): number {
    let weight = agentWeights?.get(agentId) ?? agentRecords?.get(agentId)?.weight ?? 1.0;
    if (config.confidenceMultiplier === true) {
      weight *= vote.confidence;
    }
    return weight;
  }

  private addWeightToDecision(
    counts: { approve: number; reject: number; abstain: number },
    decision: 'approve' | 'reject' | 'abstain',
    weight: number
  ): void {
    counts[decision] += weight;
  }

  private calculateQuorumStatus(
    voteCounts: VoteCounts,
    weightedCounts: WeightedVoteCounts | undefined,
    totalWeight: number | undefined,
    config: QuorumValidationConfig,
    requiredParticipants: number
  ): { threshold: number; actualQuorum: number; quorumReached: boolean; reasoning: string } {
    const threshold = config.threshold;

    // For weighted algorithms, use weighted counts
    if (weightedCounts !== undefined && totalWeight !== undefined && totalWeight > 0) {
      return this.calculateWeightedQuorum(weightedCounts, totalWeight, threshold);
    }

    // For simple algorithms, use vote counts
    return this.calculateSimpleQuorum(voteCounts, requiredParticipants, threshold, config);
  }

  private calculateWeightedQuorum(
    weightedCounts: WeightedVoteCounts,
    totalWeight: number,
    threshold: number
  ): { threshold: number; actualQuorum: number; quorumReached: boolean; reasoning: string } {
    const quorumReached = totalWeight >= threshold;
    const approveRatio = weightedCounts.approve / totalWeight;
    const rejectRatio = weightedCounts.reject / totalWeight;

    const reasoning = this.buildWeightedReasoning(
      quorumReached,
      totalWeight,
      threshold,
      approveRatio,
      rejectRatio
    );

    return { threshold, actualQuorum: totalWeight, quorumReached, reasoning };
  }

  private buildWeightedReasoning(
    quorumReached: boolean,
    totalWeight: number,
    threshold: number,
    approveRatio: number,
    rejectRatio: number
  ): string {
    if (!quorumReached) {
      return `Weighted quorum not reached: ${totalWeight.toFixed(2)} < ${String(threshold)}`;
    }
    if (approveRatio > rejectRatio) {
      return `Approval wins with weighted ratio ${formatPercentage(approveRatio, 1)}`;
    }
    if (rejectRatio > approveRatio) {
      return `Rejection wins with weighted ratio ${formatPercentage(rejectRatio, 1)}`;
    }
    return `No clear winner: approve=${formatPercentage(approveRatio, 1)}, reject=${formatPercentage(rejectRatio, 1)}`;
  }

  private calculateSimpleQuorum(
    voteCounts: VoteCounts,
    requiredParticipants: number,
    threshold: number,
    config: QuorumValidationConfig
  ): { threshold: number; actualQuorum: number; quorumReached: boolean; reasoning: string } {
    const activeVotes =
      config.includeAbstentions === true
        ? voteCounts.total
        : voteCounts.approve + voteCounts.reject;

    const total = requiredParticipants > 0 ? requiredParticipants : activeVotes;
    const approveRatio = total > 0 ? voteCounts.approve / total : 0;
    const rejectRatio = total > 0 ? voteCounts.reject / total : 0;

    const hasMinVoters = activeVotes >= config.minVoters;
    const quorumReached = hasMinVoters && (approveRatio >= threshold || rejectRatio >= threshold);

    const reasoning = this.buildSimpleReasoning({
      hasMinVoters,
      activeVotes,
      minVoters: config.minVoters,
      approveRatio,
      rejectRatio,
      threshold,
    });

    return {
      threshold,
      actualQuorum: Math.max(approveRatio, rejectRatio),
      quorumReached,
      reasoning,
    };
  }

  private buildSimpleReasoning(params: {
    hasMinVoters: boolean;
    activeVotes: number;
    minVoters: number;
    approveRatio: number;
    rejectRatio: number;
    threshold: number;
  }): string {
    const { hasMinVoters, activeVotes, minVoters, approveRatio, rejectRatio, threshold } = params;
    if (!hasMinVoters) {
      return `Insufficient voters: ${String(activeVotes)} < ${String(minVoters)}`;
    }
    if (approveRatio >= threshold) {
      return `Approval reaches threshold: ${formatPercentage(approveRatio, 1)} >= ${formatPercentage(threshold, 1)}`;
    }
    if (rejectRatio >= threshold) {
      return `Rejection reaches threshold: ${formatPercentage(rejectRatio, 1)} >= ${formatPercentage(threshold, 1)}`;
    }
    return `No decision reached threshold: approve=${formatPercentage(approveRatio, 1)}, reject=${formatPercentage(rejectRatio, 1)}`;
  }

  private buildNotReachedResult(
    breakdown: QuorumBreakdown,
    config: QuorumValidationConfig
  ): QuorumValidationResult {
    const { voteCounts, weightedCounts, threshold } = breakdown;

    if (voteCounts.total < config.minVoters) {
      return {
        status: 'not_reached',
        reason: 'insufficient_votes',
        details: `Only ${String(voteCounts.total)} votes, need ${String(config.minVoters)}`,
      };
    }

    if (weightedCounts !== undefined && weightedCounts.totalWeight < threshold) {
      return {
        status: 'not_reached',
        reason: 'insufficient_weight',
        details: `Weight ${weightedCounts.totalWeight.toFixed(2)} < threshold ${String(threshold)}`,
      };
    }

    return {
      status: 'not_reached',
      reason: 'no_consensus',
      details: breakdown.reasoning,
    };
  }

  private buildReachedResult(breakdown: QuorumBreakdown): QuorumValidationResult {
    const { voteCounts, weightedCounts } = breakdown;

    // Determine winning decision
    const approves = weightedCounts?.approve ?? voteCounts.approve;
    const rejects = weightedCounts?.reject ?? voteCounts.reject;
    const total = weightedCounts?.totalWeight ?? voteCounts.total;

    const decision: 'approve' | 'reject' = approves >= rejects ? 'approve' : 'reject';
    const confidence = total > 0 ? Math.abs(approves - rejects) / total : 0;

    return {
      status: 'reached',
      decision,
      confidence,
      reasoning: breakdown.reasoning,
    };
  }
}

/**
 * Creates a quorum validator instance.
 */
export function createQuorumValidator(logger?: ILogger): IQuorumValidator {
  return new QuorumValidator(logger);
}
