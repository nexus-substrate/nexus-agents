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
} from './higher-order-types.js';
import { createAgentPairKey, DEFAULT_HIGHER_ORDER_CONFIG } from './higher-order-types.js';

const logger = createLogger({ component: 'correlation-tracker' });

/**
 * Internal mutable representation of pairwise history.
 */
interface MutablePairwiseHistory {
  pairKey: AgentPairKey;
  jointObservations: number;
  agreements: number;
  disagreements: number;
  correlation: CorrelationCoefficient;
  lastUpdated: Date;
}

/**
 * Correlation tracker implementation.
 * Records voting history and computes pairwise agent correlations.
 */
export class CorrelationTracker implements ICorrelationTracker {
  private readonly config: HigherOrderVotingConfig;
  private readonly observations: Map<string, VotingObservation[]> = new Map();
  private readonly pairwiseHistory: Map<AgentPairKey, MutablePairwiseHistory> = new Map();
  private readonly agentProposals: Map<string, Map<string, VotingObservation>> = new Map();
  private cachedSubsets: IndependentSubset[] | null = null;

  constructor(config?: Partial<HigherOrderVotingConfig>) {
    this.config = { ...DEFAULT_HIGHER_ORDER_CONFIG, ...config };
    logger.info('CorrelationTracker initialized', { config: this.config });
  }

  recordVote(agentId: string, vote: Vote, outcome: 'approved' | 'rejected'): void {
    const proposalId = `proposal-${String(Date.now())}-${Math.random().toString(36).slice(2, 9)}`;
    const observation: VotingObservation = {
      proposalId,
      agentId,
      decision: vote.decision,
      confidence: vote.confidence,
      alignedWithOutcome: this.didAlignWithOutcome(vote.decision, outcome),
      timestamp: new Date(),
    };
    this.storeObservation(agentId, observation);
    this.invalidateCache();
  }

  recordProposalVotes(
    proposalId: string,
    votes: ReadonlyMap<string, Vote>,
    outcome: 'approved' | 'rejected'
  ): void {
    const proposalObservations: VotingObservation[] = [];

    for (const [agentId, vote] of votes) {
      const observation: VotingObservation = {
        proposalId,
        agentId,
        decision: vote.decision,
        confidence: vote.confidence,
        alignedWithOutcome: this.didAlignWithOutcome(vote.decision, outcome),
        timestamp: new Date(),
      };
      this.storeObservation(agentId, observation);
      this.storeAgentProposal(agentId, proposalId, observation);
      proposalObservations.push(observation);
    }

    this.updatePairwiseCorrelations(proposalId, proposalObservations);
    this.invalidateCache();

    logger.debug('Recorded proposal votes', {
      proposalId,
      agentCount: votes.size,
      outcome,
    });
  }

  computeCorrelationMatrix(): CorrelationMatrix {
    const matrix: CorrelationMatrix = new Map();

    for (const [pairKey, history] of this.pairwiseHistory) {
      if (history.jointObservations >= this.config.minObservationsForCorrelation) {
        matrix.set(pairKey, history.correlation);
      }
    }

    return matrix;
  }

  getCorrelation(agentA: string, agentB: string): CorrelationCoefficient | undefined {
    const pairKey = createAgentPairKey(agentA, agentB);
    const history = this.pairwiseHistory.get(pairKey);

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
    const subsets = this.partitionIntoIndependentGroups(agents, correlationMatrix);

    this.cachedSubsets = subsets;
    logger.debug('Identified independent subsets', {
      agentCount: agents.length,
      subsetCount: subsets.length,
    });

    return subsets;
  }

  hasSufficientData(agentIds: readonly string[]): boolean {
    if (agentIds.length < 2) return true;

    let pairsWithData = 0;
    const totalPairs = (agentIds.length * (agentIds.length - 1)) / 2;

    for (let i = 0; i < agentIds.length; i++) {
      for (let j = i + 1; j < agentIds.length; j++) {
        const agentA = agentIds[i];
        const agentB = agentIds[j];
        if (agentA !== undefined && agentB !== undefined) {
          const pairKey = createAgentPairKey(agentA, agentB);
          const history = this.pairwiseHistory.get(pairKey);
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

    for (const [, history] of this.pairwiseHistory) {
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
      trackedPairs: this.pairwiseHistory.size,
      totalObservations,
      averageCorrelation:
        pairsWithSufficientData > 0 ? totalCorrelation / pairsWithSufficientData : 0,
      independentSubsetCount: subsets.length,
      pairsWithSufficientData,
    };
  }

  clear(): void {
    this.observations.clear();
    this.pairwiseHistory.clear();
    this.agentProposals.clear();
    this.cachedSubsets = null;
    logger.info('CorrelationTracker cleared');
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  private didAlignWithOutcome(decision: string, outcome: 'approved' | 'rejected'): boolean {
    if (decision === 'abstain') return true;
    return (
      (decision === 'approve' && outcome === 'approved') ||
      (decision === 'reject' && outcome === 'rejected')
    );
  }

  private storeObservation(agentId: string, observation: VotingObservation): void {
    let agentObs = this.observations.get(agentId);
    if (agentObs === undefined) {
      agentObs = [];
      this.observations.set(agentId, agentObs);
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

  private updatePairwiseCorrelations(proposalId: string, observations: VotingObservation[]): void {
    for (let i = 0; i < observations.length; i++) {
      for (let j = i + 1; j < observations.length; j++) {
        const obsA = observations[i];
        const obsB = observations[j];
        if (obsA === undefined || obsB === undefined) continue;

        const pairKey = createAgentPairKey(obsA.agentId, obsB.agentId);
        let history = this.pairwiseHistory.get(pairKey);

        if (history === undefined) {
          history = {
            pairKey,
            jointObservations: 0,
            agreements: 0,
            disagreements: 0,
            correlation: 0,
            lastUpdated: new Date(),
          };
          this.pairwiseHistory.set(pairKey, history);
        }

        history.jointObservations++;
        if (this.votesAgree(obsA, obsB)) {
          history.agreements++;
        } else {
          history.disagreements++;
        }

        history.correlation = this.computeCorrelationCoefficient(history);
        history.lastUpdated = new Date();
      }
    }
  }

  private votesAgree(obsA: VotingObservation, obsB: VotingObservation): boolean {
    // Abstains are treated as neutral - neither agree nor disagree
    if (obsA.decision === 'abstain' || obsB.decision === 'abstain') {
      return true;
    }
    return obsA.decision === obsB.decision;
  }

  private computeCorrelationCoefficient(history: MutablePairwiseHistory): CorrelationCoefficient {
    const n = history.jointObservations;
    if (n === 0) return 0;

    // Simple correlation: (agreements - disagreements) / total
    // Range: -1 (always disagree) to +1 (always agree)
    const agreementRate = history.agreements / n;
    const disagreementRate = history.disagreements / n;

    // Map [0, 1] agreement rate to [-1, 1] correlation
    // 0.5 agreement rate = 0 correlation (random)
    // 1.0 agreement rate = +1 correlation (perfect agreement)
    // 0.0 agreement rate = -1 correlation (perfect disagreement)
    return agreementRate - disagreementRate;
  }

  private getTrackedAgents(): string[] {
    return Array.from(this.observations.keys());
  }

  private invalidateCache(): void {
    this.cachedSubsets = null;
  }

  private partitionIntoIndependentGroups(
    agents: string[],
    correlationMatrix: CorrelationMatrix
  ): IndependentSubset[] {
    if (agents.length === 0) return [];

    // Use greedy clustering: start with each agent, merge if not correlated
    const subsets: IndependentSubset[] = [];
    const assigned = new Set<string>();
    let subsetId = 0;

    for (const agent of agents) {
      if (assigned.has(agent)) continue;

      const subset: string[] = [agent];
      assigned.add(agent);

      // Try to add other unassigned agents if they're independent
      for (const other of agents) {
        if (assigned.has(other)) continue;
        if (this.isIndependentFromSubset(other, subset, correlationMatrix)) {
          subset.push(other);
          assigned.add(other);
        }
      }

      const independenceScore = this.computeSubsetIndependenceScore(subset, correlationMatrix);
      const observationCount = this.computeSubsetObservationCount(subset);

      subsets.push({
        id: `subset-${String(subsetId++)}`,
        agentIds: subset,
        independenceScore,
        observationCount,
      });
    }

    return subsets;
  }

  private isIndependentFromSubset(
    agent: string,
    subset: string[],
    correlationMatrix: CorrelationMatrix
  ): boolean {
    for (const member of subset) {
      const pairKey = createAgentPairKey(agent, member);
      const correlation = correlationMatrix.get(pairKey);

      // If we don't have data, assume independent
      if (correlation === undefined) continue;

      // If correlation exceeds threshold, not independent
      if (Math.abs(correlation) > this.config.independenceThreshold) {
        return false;
      }
    }
    return true;
  }

  private computeSubsetIndependenceScore(
    subset: string[],
    correlationMatrix: CorrelationMatrix
  ): number {
    if (subset.length < 2) return 0;

    let totalCorrelation = 0;
    let pairs = 0;

    for (let i = 0; i < subset.length; i++) {
      for (let j = i + 1; j < subset.length; j++) {
        const agentA = subset[i];
        const agentB = subset[j];
        if (agentA !== undefined && agentB !== undefined) {
          const pairKey = createAgentPairKey(agentA, agentB);
          const correlation = correlationMatrix.get(pairKey);
          if (correlation !== undefined) {
            totalCorrelation += Math.abs(correlation);
            pairs++;
          }
        }
      }
    }

    return pairs > 0 ? totalCorrelation / pairs : 0;
  }

  private computeSubsetObservationCount(subset: string[]): number {
    let minObservations = Infinity;

    for (let i = 0; i < subset.length; i++) {
      for (let j = i + 1; j < subset.length; j++) {
        const agentA = subset[i];
        const agentB = subset[j];
        if (agentA !== undefined && agentB !== undefined) {
          const pairKey = createAgentPairKey(agentA, agentB);
          const history = this.pairwiseHistory.get(pairKey);
          if (history !== undefined) {
            minObservations = Math.min(minObservations, history.jointObservations);
          } else {
            minObservations = 0;
          }
        }
      }
    }

    return minObservations === Infinity ? 0 : minObservations;
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
