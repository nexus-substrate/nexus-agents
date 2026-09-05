/**
 * nexus-agents/consensus - Correlation Tracker
 *
 * Tracks voting history and computes pairwise correlations between agents.
 * Used by higher-order voting methods to account for agent dependencies.
 *
 * @module consensus/correlation-tracker
 * (Source: Issue #333)
 */

import { createLogger } from '../core/logger.js';
import { getTimeProvider, getRandomProvider } from '../core/index.js';
import type { Vote } from './types-core.js';
import type {
  ICorrelationTracker,
  CorrelationMatrix,
  CorrelationCoefficient,
  IndependentSubset,
  VotingObservation,
  HigherOrderVotingConfig,
  CorrelationTrackerStats,
  AgentPairKey,
  CorrelationRecordContext,
} from './higher-order-types.js';
import { createAgentPairKey, DEFAULT_HIGHER_ORDER_CONFIG } from './higher-order-types.js';
import {
  type MutablePairwiseHistory,
  isComparable,
  votesAgree,
  didAlignWithOutcome,
  computeCorrelationCoefficient,
  partitionIntoIndependentGroups,
} from './correlation-helpers.js';
import { CorrelationModelPartitions } from './correlation-model-partitions.js';

// Re-export helper types and functions for convenience
export type { MutablePairwiseHistory } from './correlation-helpers.js';
export {
  isComparable,
  votesAgree,
  didAlignWithOutcome,
  computeCorrelationCoefficient,
  isIndependentFromSubset,
  computeSubsetIndependenceScore,
  computeSubsetObservationCount,
  partitionIntoIndependentGroups,
} from './correlation-helpers.js';

const logger = createLogger({ component: 'correlation-tracker' });

/**
 * Correlation tracker implementation.
 * Records voting history and computes pairwise agent correlations.
 *
 * Memory bounded: uses FIFO eviction when maxObservationsPerAgent or maxProposals limits reached.
 */
export class CorrelationTracker implements ICorrelationTracker {
  private readonly config: HigherOrderVotingConfig;
  private readonly observations: Map<string, VotingObservation[]> = new Map();
  private readonly modelPartitions;
  private readonly agentProposals: Map<string, Map<string, VotingObservation>> = new Map();
  /** Ordered list of proposal IDs for FIFO eviction */
  private readonly proposalOrder: string[] = [];
  private cachedSubsets: IndependentSubset[] | null = null;

  constructor(config?: Partial<HigherOrderVotingConfig>) {
    this.config = { ...DEFAULT_HIGHER_ORDER_CONFIG, ...config };
    this.modelPartitions = new CorrelationModelPartitions(this.config.maxTrackedPairs, logger);
    logger.info('CorrelationTracker initialized', {
      maxObservationsPerAgent: this.config.maxObservationsPerAgent,
      maxProposals: this.config.maxProposals,
    });
  }

  setCurrentModelPins(modelPins: ReadonlyMap<string, string>): void {
    this.modelPartitions.setCurrentPins(modelPins);
    this.invalidateCache();
  }

  recordVote(
    agentId: string,
    vote: Vote,
    outcome: 'approved' | 'rejected',
    context?: CorrelationRecordContext
  ): void {
    if (context !== undefined) this.setCurrentModelPins(context.modelPins);
    const proposalId = `proposal-${String(getTimeProvider().now())}-${getRandomProvider().random().toString(36).slice(2, 9)}`;
    const modelKey = context?.modelPins.get(agentId);
    const observedModel = context?.observedModels?.get(agentId);
    const observation: VotingObservation = {
      proposalId,
      agentId,
      decision: vote.decision,
      confidence: vote.confidence,
      alignedWithOutcome: didAlignWithOutcome(vote.decision, outcome),
      timestamp: new Date(getTimeProvider().now()),
      ...(modelKey !== undefined ? { modelKey } : {}),
      ...(observedModel !== undefined ? { observedModel } : {}),
    };
    this.storeObservation(agentId, observation);
    this.invalidateCache();
  }

  recordProposalVotes(
    proposalId: string,
    votes: ReadonlyMap<string, Vote>,
    outcome: 'approved' | 'rejected',
    context?: CorrelationRecordContext
  ): void {
    if (context !== undefined) this.setCurrentModelPins(context.modelPins);
    // FIFO eviction when proposal limit reached (Issue #521)
    this.evictOldProposalsIfNeeded();

    const proposalObservations: VotingObservation[] = [];

    for (const [agentId, vote] of votes) {
      const modelKey = context?.modelPins.get(agentId);
      const observedModel = context?.observedModels?.get(agentId);
      const observation: VotingObservation = {
        proposalId,
        agentId,
        decision: vote.decision,
        confidence: vote.confidence,
        alignedWithOutcome: didAlignWithOutcome(vote.decision, outcome),
        timestamp: new Date(getTimeProvider().now()),
        ...(modelKey !== undefined ? { modelKey } : {}),
        ...(observedModel !== undefined ? { observedModel } : {}),
      };
      this.storeObservation(agentId, observation);
      this.storeAgentProposal(agentId, proposalId, observation);
      proposalObservations.push(observation);
    }

    // Track proposal order for FIFO eviction
    this.proposalOrder.push(proposalId);

    this.updatePairwiseCorrelations(proposalObservations);
    this.invalidateCache();

    logger.debug('Recorded proposal votes', {
      proposalId,
      agentCount: votes.size,
      outcome,
      totalProposals: this.proposalOrder.length,
    });
  }

  computeCorrelationMatrix(): CorrelationMatrix {
    const matrix: CorrelationMatrix = new Map();

    for (const [pairKey, history] of this.getActivePairwiseHistory()) {
      if (history.jointObservations >= this.config.minObservationsForCorrelation) {
        matrix.set(pairKey, history.correlation);
      }
    }

    return matrix;
  }

  getCorrelation(agentA: string, agentB: string): CorrelationCoefficient | undefined {
    const pairKey = createAgentPairKey(agentA, agentB);
    const history = this.getActivePairwiseHistory().get(pairKey);

    if (history === undefined) return undefined;
    if (history.jointObservations < this.config.minObservationsForCorrelation) return undefined;

    return history.correlation;
  }

  identifyIndependentSubsets(): readonly IndependentSubset[] {
    if (this.cachedSubsets !== null) return this.cachedSubsets;

    const agents = this.getTrackedAgents();
    if (agents.length === 0) {
      this.cachedSubsets = [];
      return this.cachedSubsets;
    }

    const correlationMatrix = this.computeCorrelationMatrix();
    const activeHistory = this.getActivePairwiseHistory();
    const subsets = partitionIntoIndependentGroups(
      agents,
      correlationMatrix,
      activeHistory,
      this.config
    );

    this.cachedSubsets = subsets;
    logger.debug('Identified independent subsets', {
      agentCount: agents.length,
      subsetCount: subsets.length,
    });

    return subsets;
  }

  hasSufficientData(agentIds: readonly string[]): boolean {
    if (agentIds.length < 2) return false;

    let pairsWithData = 0;
    const totalPairs = (agentIds.length * (agentIds.length - 1)) / 2;
    const activeHistory = this.getActivePairwiseHistory();

    for (let i = 0; i < agentIds.length; i++) {
      for (let j = i + 1; j < agentIds.length; j++) {
        const agentA = agentIds[i];
        const agentB = agentIds[j];
        if (agentA !== undefined && agentB !== undefined) {
          const pairKey = createAgentPairKey(agentA, agentB);
          const history = activeHistory.get(pairKey);
          if (
            history !== undefined &&
            history.jointObservations >= this.config.minObservationsForCorrelation
          ) {
            pairsWithData++;
          }
        }
      }
    }

    // Require at least 50% of pairs to have sufficient data
    return pairsWithData >= totalPairs * 0.5;
  }

  getStats(): CorrelationTrackerStats {
    const agents = this.getTrackedAgents();
    // Used by callers to understand full correlation state
    void this.computeCorrelationMatrix();
    const subsets = this.identifyIndependentSubsets();

    let totalCorrelation = 0;
    let pairsWithSufficientData = 0;
    const activeHistory = this.getActivePairwiseHistory();

    for (const [, history] of activeHistory) {
      if (history.jointObservations >= this.config.minObservationsForCorrelation) {
        totalCorrelation += history.correlation;
        pairsWithSufficientData++;
      }
    }

    let totalObservations = 0;
    for (const obs of this.observations.values()) {
      totalObservations += obs.length;
    }

    return {
      totalAgents: agents.length,
      trackedPairs: activeHistory.size,
      totalObservations,
      averageCorrelation:
        pairsWithSufficientData > 0 ? totalCorrelation / pairsWithSufficientData : 0,
      independentSubsetCount: subsets.length,
      pairsWithSufficientData,
    };
  }

  clear(): void {
    this.observations.clear();
    this.modelPartitions.clear();
    this.agentProposals.clear();
    this.proposalOrder.length = 0;
    this.cachedSubsets = null;
    logger.info('CorrelationTracker cleared');
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  /**
   * Evict oldest proposals when maxProposals limit is reached.
   * Also cleans up agentProposals entries for evicted proposals.
   */
  private evictOldProposalsIfNeeded(): void {
    while (this.proposalOrder.length >= this.config.maxProposals) {
      const evictedProposalId = this.proposalOrder.shift();
      if (evictedProposalId === undefined) break;

      // Clean up agentProposals for the evicted proposal
      for (const [agentId, proposalMap] of this.agentProposals) {
        if (proposalMap.has(evictedProposalId)) {
          proposalMap.delete(evictedProposalId);
          // Clean up empty agent entries
          if (proposalMap.size === 0) {
            this.agentProposals.delete(agentId);
          }
        }
      }

      logger.debug('Evicted oldest proposal', {
        evictedProposalId,
        reason: 'maxProposals',
        remainingProposals: this.proposalOrder.length,
      });
    }
  }

  private storeObservation(agentId: string, observation: VotingObservation): void {
    let agentObs = this.observations.get(agentId);
    if (agentObs === undefined) {
      agentObs = [];
      this.observations.set(agentId, agentObs);
    }

    // FIFO eviction when per-agent limit reached (Issue #521)
    while (agentObs.length >= this.config.maxObservationsPerAgent) {
      const evicted = agentObs.shift();
      if (evicted !== undefined) {
        logger.debug('Evicted oldest observation for agent', {
          agentId,
          evictedProposalId: evicted.proposalId,
          reason: 'maxObservationsPerAgent',
        });
      }
    }

    agentObs.push(observation);
  }

  private storeAgentProposal(
    agentId: string,
    proposalId: string,
    observation: VotingObservation
  ): void {
    let agentProposalMap = this.agentProposals.get(agentId);
    if (agentProposalMap === undefined) {
      agentProposalMap = new Map();
      this.agentProposals.set(agentId, agentProposalMap);
    }
    agentProposalMap.set(proposalId, observation);
  }

  private updatePairwiseCorrelations(observations: VotingObservation[]): void {
    for (let i = 0; i < observations.length; i++) {
      for (let j = i + 1; j < observations.length; j++) {
        const obsA = observations[i];
        const obsB = observations[j];
        if (obsA === undefined || obsB === undefined) continue;

        const pairKey = createAgentPairKey(obsA.agentId, obsB.agentId);
        const history = this.modelPartitions.getOrCreate(pairKey, () => {
          return {
            pairKey,
            jointObservations: 0,
            agreements: 0,
            disagreements: 0,
            correlation: 0,
            lastUpdated: new Date(getTimeProvider().now()),
          };
        });

        // Skip abstain observations — they are neutral (Issue #763)
        if (!isComparable(obsA, obsB)) continue;

        history.jointObservations++;
        const agreed = votesAgree(obsA, obsB);
        if (agreed === true) {
          history.agreements++;
        } else {
          history.disagreements++;
        }

        history.correlation = computeCorrelationCoefficient(history);
        history.lastUpdated = new Date(getTimeProvider().now());
      }
    }
  }

  private getTrackedAgents(): string[] {
    return Array.from(this.observations.keys());
  }

  private getActivePairwiseHistory(): Map<AgentPairKey, MutablePairwiseHistory> {
    return this.modelPartitions.getActiveHistory();
  }

  private invalidateCache(): void {
    this.cachedSubsets = null;
  }
}

/**
 * Creates a new correlation tracker instance.
 */
export function createCorrelationTracker(
  config?: Partial<HigherOrderVotingConfig>
): ICorrelationTracker {
  return new CorrelationTracker(config);
}
