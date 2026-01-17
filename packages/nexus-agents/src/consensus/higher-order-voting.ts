/**
 * nexus-agents/consensus - Higher-Order Voting Implementation
 *
 * Implements Opinion-Wise (OW) and Independent Subset Partition (ISP) voting
 * methods that account for correlations between agent opinions.
 *
 * Traditional voting assumes independence between voters. Higher-order voting
 * uses Bayesian-optimal aggregation that handles correlated agents better,
 * resulting in more accurate consensus decisions.
 *
 * @module consensus/higher-order-voting
 * (Source: Issue #333)
 */

import { createLogger } from '../core/logger.js';
import type { Vote, VoteCounts } from './types-core.js';
import type {
  IHigherOrderVoting,
  ICorrelationTracker,
  CorrelationMatrix,
  HigherOrderVotingConfig,
  HigherOrderVotingResult,
  IndependentSubset,
} from './higher-order-types.js';
import { createAgentPairKey, DEFAULT_HIGHER_ORDER_CONFIG } from './higher-order-types.js';
import type { IVotingStrategy, VotingOutcome } from './strategies.js';
import type { ConsensusAlgorithm } from './types-core.js';

const logger = createLogger({ component: 'higher-order-voting' });

/**
 * Options for creating OWVoting instance.
 */
export interface OWVotingOptions {
  readonly config?: Partial<HigherOrderVotingConfig>;
}

/**
 * Opinion-Wise higher-order voting implementation.
 * Uses Bayesian aggregation with correlation awareness.
 */
export class OWVoting implements IHigherOrderVoting, IVotingStrategy {
  readonly algorithm: ConsensusAlgorithm = 'simple_majority'; // Base algorithm
  private readonly config: HigherOrderVotingConfig;

  constructor(options: OWVotingOptions = {}) {
    this.config = { ...DEFAULT_HIGHER_ORDER_CONFIG, ...options.config };
    logger.info('OWVoting initialized', { config: this.config });
  }

  /**
   * IVotingStrategy implementation for integration with ConsensusEngine.
   * Note: weights parameter is unused in higher-order voting as it uses correlation-based weighting.
   */
  calculateOutcome(votes: Map<string, Vote>, _weights?: Map<string, number>): VotingOutcome {
    // Without correlation data, fall back to simple voting
    const result = this.aggregateSimple(votes);
    return this.toVotingOutcome(votes, result);
  }

  aggregateWithCorrelation(
    votes: ReadonlyMap<string, Vote>,
    correlationMatrix: CorrelationMatrix
  ): HigherOrderVotingResult {
    const agentIds = Array.from(votes.keys());

    // Check if we have sufficient correlation data
    const hasSufficientData = this.hasSufficientCorrelationData(agentIds, correlationMatrix);

    if (!hasSufficientData && this.config.fallbackToSimpleVoting) {
      logger.debug('Insufficient correlation data, falling back to simple voting');
      return this.aggregateSimple(votes);
    }

    // Compute effective weights based on correlations
    const effectiveWeights = this.computeEffectiveWeights(agentIds, correlationMatrix);

    // Compute posterior probabilities using Bayesian aggregation
    const { posteriorApproval, posteriorRejection, effectiveVoteCount, downweightedAgents } =
      this.bayesianAggregate(votes, effectiveWeights);

    // Determine decision
    const decision = this.determineDecision(posteriorApproval, posteriorRejection);

    // Calculate improvement over baseline
    const baselineResult = this.aggregateSimple(votes);
    const improvementOverBaseline = this.calculateImprovement(
      posteriorApproval,
      posteriorRejection,
      decision,
      baselineResult
    );

    const result: HigherOrderVotingResult = {
      decision,
      posteriorApproval,
      posteriorRejection,
      effectiveVoteCount,
      usedCorrelationData: hasSufficientData,
      method: 'ow',
      improvementOverBaseline,
      downweightedAgents,
      reasoning: this.buildReasoning(decision, effectiveVoteCount, downweightedAgents, 'ow'),
    };

    logger.info('OW aggregation complete', {
      decision,
      posteriorApproval: posteriorApproval.toFixed(3),
      effectiveVotes: effectiveVoteCount.toFixed(2),
      downweightedAgents: downweightedAgents.length,
    });

    return result;
  }

  estimateCorrelation(tracker: ICorrelationTracker): CorrelationMatrix {
    return tracker.computeCorrelationMatrix();
  }

  computeISP(
    votes: ReadonlyMap<string, Vote>,
    independentSubsets: readonly IndependentSubset[]
  ): HigherOrderVotingResult {
    if (independentSubsets.length === 0) {
      logger.debug('No independent subsets, falling back to simple voting');
      return this.aggregateSimple(votes);
    }

    const { subsetResults, downweightedAgents } = this.aggregateSubsets(votes, independentSubsets);
    const { posteriorApproval, posteriorRejection } = this.combineSubsetResults(subsetResults);
    const effectiveVoteCount = independentSubsets.length;
    const decision = this.determineDecision(posteriorApproval, posteriorRejection);

    const baselineResult = this.aggregateSimple(votes);
    const improvementOverBaseline = this.calculateImprovement(
      posteriorApproval,
      posteriorRejection,
      decision,
      baselineResult
    );

    const result: HigherOrderVotingResult = {
      decision,
      posteriorApproval,
      posteriorRejection,
      effectiveVoteCount,
      usedCorrelationData: true,
      method: 'isp',
      improvementOverBaseline,
      independentSubsets,
      downweightedAgents,
      reasoning: this.buildReasoning(decision, effectiveVoteCount, downweightedAgents, 'isp'),
    };

    logger.info('ISP aggregation complete', {
      decision,
      subsetCount: independentSubsets.length,
      posteriorApproval: posteriorApproval.toFixed(3),
    });

    return result;
  }

  aggregate(
    votes: ReadonlyMap<string, Vote>,
    tracker: ICorrelationTracker
  ): HigherOrderVotingResult {
    const agentIds = Array.from(votes.keys());

    // Check if we have sufficient data
    if (!tracker.hasSufficientData(agentIds)) {
      if (this.config.fallbackToSimpleVoting) {
        logger.debug('Insufficient data for correlation analysis, using simple voting');
        return this.aggregateSimple(votes);
      }
    }

    // Try OW method first
    const correlationMatrix = tracker.computeCorrelationMatrix();
    const owResult = this.aggregateWithCorrelation(votes, correlationMatrix);

    // Also try ISP and compare
    const independentSubsets = tracker.identifyIndependentSubsets();
    if (independentSubsets.length > 1) {
      const ispResult = this.computeISP(votes, independentSubsets);

      // Use ISP if it has better confidence
      const owConfidence = Math.abs(owResult.posteriorApproval - 0.5) * 2;
      const ispConfidence = Math.abs(ispResult.posteriorApproval - 0.5) * 2;

      if (ispConfidence > owConfidence) {
        logger.debug('Using ISP result over OW due to higher confidence');
        return ispResult;
      }
    }

    return owResult;
  }

  getConfig(): HigherOrderVotingConfig {
    return { ...this.config };
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  private hasSufficientCorrelationData(
    agentIds: string[],
    correlationMatrix: CorrelationMatrix
  ): boolean {
    if (agentIds.length < 2) return false;

    let pairsWithData = 0;
    const totalPairs = (agentIds.length * (agentIds.length - 1)) / 2;

    for (let i = 0; i < agentIds.length; i++) {
      for (let j = i + 1; j < agentIds.length; j++) {
        const agentA = agentIds[i];
        const agentB = agentIds[j];
        if (agentA !== undefined && agentB !== undefined) {
          const pairKey = createAgentPairKey(agentA, agentB);
          if (correlationMatrix.has(pairKey)) {
            pairsWithData++;
          }
        }
      }
    }

    return pairsWithData >= Math.ceil(totalPairs * 0.5);
  }

  private computeEffectiveWeights(
    agentIds: string[],
    correlationMatrix: CorrelationMatrix
  ): Map<string, number> {
    const weights = new Map<string, number>();

    // Start with equal weights
    for (const agentId of agentIds) {
      weights.set(agentId, 1.0);
    }

    // Reduce weights for highly correlated agents
    for (let i = 0; i < agentIds.length; i++) {
      for (let j = i + 1; j < agentIds.length; j++) {
        const agentA = agentIds[i];
        const agentB = agentIds[j];
        if (agentA === undefined || agentB === undefined) continue;

        const pairKey = createAgentPairKey(agentA, agentB);
        const correlation = correlationMatrix.get(pairKey);

        if (correlation !== undefined && correlation > this.config.correlationThreshold) {
          // Reduce weight proportionally to correlation
          const reduction = correlation * 0.5;
          const currentWeightA = weights.get(agentA) ?? 1.0;
          const currentWeightB = weights.get(agentB) ?? 1.0;

          // Apply reduction to both agents (but less to avoid over-penalizing)
          weights.set(agentA, Math.max(0.1, currentWeightA - reduction * 0.5));
          weights.set(agentB, Math.max(0.1, currentWeightB - reduction * 0.5));
        }
      }
    }

    return weights;
  }

  private bayesianAggregate(
    votes: ReadonlyMap<string, Vote>,
    effectiveWeights: Map<string, number>
  ): {
    posteriorApproval: number;
    posteriorRejection: number;
    effectiveVoteCount: number;
    downweightedAgents: string[];
  } {
    let weightedApproval = 0;
    let weightedRejection = 0;
    let totalWeight = 0;
    const downweightedAgents: string[] = [];

    for (const [agentId, vote] of votes) {
      const weight = effectiveWeights.get(agentId) ?? 1.0;

      // Track downweighted agents
      if (weight < 0.8) {
        downweightedAgents.push(agentId);
      }

      // Weight by confidence and effective weight
      const effectiveWeight = weight * vote.confidence;
      totalWeight += effectiveWeight;

      if (vote.decision === 'approve') {
        weightedApproval += effectiveWeight;
      } else if (vote.decision === 'reject') {
        weightedRejection += effectiveWeight;
      }
      // Abstains contribute to total weight but not to either side
    }

    const posteriorApproval = totalWeight > 0 ? weightedApproval / totalWeight : 0.5;
    const posteriorRejection = totalWeight > 0 ? weightedRejection / totalWeight : 0.5;
    const effectiveVoteCount = totalWeight;

    return { posteriorApproval, posteriorRejection, effectiveVoteCount, downweightedAgents };
  }

  private aggregateSubsets(
    votes: ReadonlyMap<string, Vote>,
    independentSubsets: readonly IndependentSubset[]
  ): {
    subsetResults: Array<{ approval: number; rejection: number; weight: number }>;
    downweightedAgents: string[];
  } {
    const subsetResults: Array<{ approval: number; rejection: number; weight: number }> = [];
    const downweightedAgents: string[] = [];

    for (const subset of independentSubsets) {
      const subsetVotes = new Map<string, Vote>();
      for (const agentId of subset.agentIds) {
        const vote = votes.get(agentId);
        if (vote !== undefined) subsetVotes.set(agentId, vote);
      }
      if (subsetVotes.size === 0) continue;

      const { approval, rejection } = this.countSubsetVotes(subsetVotes);
      const weight = subsetVotes.size * (1 - subset.independenceScore);
      subsetResults.push({ approval, rejection, weight });

      if (subset.agentIds.length === 1) downweightedAgents.push(...subset.agentIds);
    }
    return { subsetResults, downweightedAgents };
  }

  private combineSubsetResults(
    subsetResults: Array<{ approval: number; rejection: number; weight: number }>
  ): { posteriorApproval: number; posteriorRejection: number; totalWeight: number } {
    let totalApproval = 0,
      totalRejection = 0,
      totalWeight = 0;
    for (const { approval, rejection, weight } of subsetResults) {
      totalApproval += approval * weight;
      totalRejection += rejection * weight;
      totalWeight += weight;
    }
    return {
      posteriorApproval: totalWeight > 0 ? totalApproval / totalWeight : 0.5,
      posteriorRejection: totalWeight > 0 ? totalRejection / totalWeight : 0.5,
      totalWeight,
    };
  }

  private countSubsetVotes(votes: Map<string, Vote>): { approval: number; rejection: number } {
    let approval = 0;
    let rejection = 0;

    for (const vote of votes.values()) {
      if (vote.decision === 'approve') {
        approval += vote.confidence;
      } else if (vote.decision === 'reject') {
        rejection += vote.confidence;
      }
    }

    const total = approval + rejection;
    return {
      approval: total > 0 ? approval / total : 0.5,
      rejection: total > 0 ? rejection / total : 0.5,
    };
  }

  private determineDecision(
    posteriorApproval: number,
    posteriorRejection: number
  ): 'approve' | 'reject' | 'no_consensus' {
    const diff = Math.abs(posteriorApproval - posteriorRejection);

    // Require significant margin for decision
    if (diff < 0.1) {
      return 'no_consensus';
    }

    return posteriorApproval > posteriorRejection ? 'approve' : 'reject';
  }

  private aggregateSimple(votes: ReadonlyMap<string, Vote>): HigherOrderVotingResult {
    let approve = 0;
    let reject = 0;
    let total = 0;

    for (const vote of votes.values()) {
      if (vote.decision === 'approve') {
        approve++;
      } else if (vote.decision === 'reject') {
        reject++;
      }
      if (vote.decision !== 'abstain') {
        total++;
      }
    }

    const posteriorApproval = total > 0 ? approve / total : 0.5;
    const posteriorRejection = total > 0 ? reject / total : 0.5;
    const decision = this.determineDecision(posteriorApproval, posteriorRejection);

    return {
      decision,
      posteriorApproval,
      posteriorRejection,
      effectiveVoteCount: total,
      usedCorrelationData: false,
      method: 'simple',
      improvementOverBaseline: 0,
      downweightedAgents: [],
      reasoning: this.buildReasoning(decision, total, [], 'simple'),
    };
  }

  private calculateImprovement(
    posteriorApproval: number,
    posteriorRejection: number,
    decision: 'approve' | 'reject' | 'no_consensus',
    baseline: HigherOrderVotingResult
  ): number {
    // Improvement is measured by increased confidence in the same direction
    if (decision === 'no_consensus' || baseline.decision === 'no_consensus') {
      return 0;
    }

    const currentConfidence = decision === 'approve' ? posteriorApproval : posteriorRejection;
    const baselineConfidence =
      baseline.decision === 'approve' ? baseline.posteriorApproval : baseline.posteriorRejection;

    // Return improvement as percentage points
    return (currentConfidence - baselineConfidence) * 100;
  }

  private buildReasoning(
    decision: 'approve' | 'reject' | 'no_consensus',
    effectiveVotes: number,
    downweightedAgents: string[],
    method: 'ow' | 'isp' | 'simple'
  ): string {
    const methodName =
      method === 'ow'
        ? 'Opinion-Wise Bayesian aggregation'
        : method === 'isp'
          ? 'Independent Subset Partition'
          : 'simple majority voting';

    let reasoning = `Decision reached via ${methodName} with ${effectiveVotes.toFixed(1)} effective votes. `;

    if (downweightedAgents.length > 0) {
      reasoning += `${String(downweightedAgents.length)} agent(s) downweighted due to correlation. `;
    }

    if (decision === 'no_consensus') {
      reasoning += 'No consensus reached due to insufficient margin.';
    } else {
      reasoning += `Final decision: ${decision}.`;
    }

    return reasoning;
  }

  private toVotingOutcome(
    votes: Map<string, Vote>,
    result: HigherOrderVotingResult
  ): VotingOutcome {
    let approve = 0;
    let reject = 0;
    let abstain = 0;

    for (const vote of votes.values()) {
      if (vote.decision === 'approve') approve++;
      else if (vote.decision === 'reject') reject++;
      else abstain++;
    }

    const voteCounts: VoteCounts = { approve, reject, abstain, total: votes.size };

    return {
      approved: result.decision === 'approve',
      approvalPercentage: result.posteriorApproval * 100,
      voteCounts,
      reason: result.reasoning,
    };
  }
}

/**
 * Creates a new OWVoting instance.
 */
export function createOWVoting(options?: OWVotingOptions): IHigherOrderVoting {
  return new OWVoting(options);
}

/**
 * Higher-order voting strategy for integration with VotingStrategyFactory.
 * Wraps OWVoting to provide IVotingStrategy interface.
 */
export class HigherOrderVotingStrategy extends OWVoting implements IVotingStrategy {
  // algorithm is inherited as 'simple_majority' but we want 'opinion_wise'
  // Note: To add 'opinion_wise' to ConsensusAlgorithm, types-core.ts needs updating

  constructor(options: OWVotingOptions = {}) {
    super(options);
  }
}

/**
 * Creates a higher-order voting strategy for use with ConsensusEngine.
 */
export function createHigherOrderVotingStrategy(
  options?: OWVotingOptions
): HigherOrderVotingStrategy {
  return new HigherOrderVotingStrategy(options);
}
