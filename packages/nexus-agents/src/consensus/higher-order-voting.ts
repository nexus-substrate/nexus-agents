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
import { DEFAULT_HIGHER_ORDER_CONFIG } from './higher-order-types.js';
import type { IVotingStrategy, VotingOutcome } from './strategies.js';
import type { ConsensusAlgorithm } from './types-core.js';
import {
  hasSufficientCorrelationData,
  computeEffectiveWeights,
  bayesianAggregate,
  aggregateSubsets,
  combineSubsetResults,
  determineHigherOrderDecision,
  aggregateSimple,
  calculateImprovement,
  buildReasoning,
} from './higher-order-helpers.js';

const logger = createLogger({ component: 'higher-order-voting' });

/** Options for creating OWVoting instance. */
export interface OWVotingOptions {
  readonly config?: Partial<HigherOrderVotingConfig>;
  /**
   * Algorithm label this instance reports (#3168). Defaults to `simple_majority`
   * for backward compatibility; `HigherOrderVotingStrategy` sets `opinion_wise`.
   * Keeps the label consistent whether constructed directly or via a factory.
   */
  readonly algorithm?: ConsensusAlgorithm;
}

/**
 * Opinion-Wise higher-order voting implementation.
 * Uses Bayesian aggregation with correlation awareness.
 */
export class OWVoting implements IHigherOrderVoting, IVotingStrategy {
  readonly algorithm: ConsensusAlgorithm;
  private readonly config: HigherOrderVotingConfig;

  constructor(options: OWVotingOptions = {}) {
    this.config = { ...DEFAULT_HIGHER_ORDER_CONFIG, ...options.config };
    // #3168: configurable so the label is correct whether built directly or via
    // a factory; defaults to simple_majority for backward compatibility.
    this.algorithm = options.algorithm ?? 'simple_majority';
    logger.info('OWVoting initialized', { config: this.config, algorithm: this.algorithm });
  }

  /** IVotingStrategy implementation for integration with ConsensusEngine. */
  calculateOutcome(votes: Map<string, Vote>, _weights?: Map<string, number>): VotingOutcome {
    const result = this.aggregateSimpleInternal(votes);
    return this.toVotingOutcome(votes, result);
  }

  aggregateWithCorrelation(
    votes: ReadonlyMap<string, Vote>,
    correlationMatrix: CorrelationMatrix
  ): HigherOrderVotingResult {
    const agentIds = Array.from(votes.keys());
    const hasSufficientData = hasSufficientCorrelationData(agentIds, correlationMatrix);

    if (!hasSufficientData && this.config.fallbackToSimpleVoting) {
      // Issue #525: Log at INFO level for visibility
      logger.info('Insufficient correlation data, falling back to simple voting', {
        agentCount: agentIds.length,
        reason: 'insufficient_correlation_data',
      });
      return this.aggregateSimpleInternal(votes);
    }

    const effectiveWeights = computeEffectiveWeights(
      agentIds,
      correlationMatrix,
      this.config.correlationThreshold
    );

    const { posteriorApproval, posteriorRejection, effectiveVoteCount, downweightedAgents } =
      bayesianAggregate(votes, effectiveWeights);

    const decision = determineHigherOrderDecision(posteriorApproval, posteriorRejection);
    const baselineResult = this.aggregateSimpleInternal(votes);
    const improvementOverBaseline = calculateImprovement(
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
      reasoning: buildReasoning(decision, effectiveVoteCount, downweightedAgents, 'ow'),
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
      // Issue #525: Log at INFO level for visibility
      logger.info('No independent subsets, falling back to simple voting', {
        reason: 'no_independent_subsets',
      });
      return this.aggregateSimpleInternal(votes);
    }

    const { subsetResults, downweightedAgents } = aggregateSubsets(votes, independentSubsets);
    const { posteriorApproval, posteriorRejection } = combineSubsetResults(subsetResults);
    const effectiveVoteCount = independentSubsets.length;
    const decision = determineHigherOrderDecision(posteriorApproval, posteriorRejection);

    const baselineResult = this.aggregateSimpleInternal(votes);
    const improvementOverBaseline = calculateImprovement(
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
      reasoning: buildReasoning(decision, effectiveVoteCount, downweightedAgents, 'isp'),
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

    if (!tracker.hasSufficientData(agentIds)) {
      if (this.config.fallbackToSimpleVoting) {
        // Issue #525: Log at INFO level for visibility
        logger.info('Insufficient data for correlation analysis, using simple voting', {
          agentCount: agentIds.length,
          reason: 'insufficient_tracker_data',
        });
        return this.aggregateSimpleInternal(votes);
      }
    }

    const correlationMatrix = tracker.computeCorrelationMatrix();
    const owResult = this.aggregateWithCorrelation(votes, correlationMatrix);

    const independentSubsets = tracker.identifyIndependentSubsets();
    if (independentSubsets.length > 1) {
      const ispResult = this.computeISP(votes, independentSubsets);
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

  private aggregateSimpleInternal(votes: ReadonlyMap<string, Vote>): HigherOrderVotingResult {
    return aggregateSimple(votes, buildReasoning);
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

    const rawPercentage = result.posteriorApproval * 100;
    const approvalPercentage = Number.isFinite(rawPercentage) ? rawPercentage : 0;

    return {
      approved: result.decision === 'approve',
      approvalPercentage,
      voteCounts,
      reason: result.reasoning,
    };
  }
}

/** Creates a new OWVoting instance. */
export function createOWVoting(options?: OWVotingOptions): IHigherOrderVoting {
  return new OWVoting(options);
}

/**
 * Higher-order voting strategy for integration with VotingStrategyFactory.
 * Wraps OWVoting to provide IVotingStrategy interface.
 */
export class HigherOrderVotingStrategy extends OWVoting implements IVotingStrategy {
  constructor(options: OWVotingOptions = {}) {
    // #3168: set the algorithm label via the constructor so it survives
    // regardless of how the instance is created (no field-override divergence).
    super({ ...options, algorithm: options.algorithm ?? 'opinion_wise' });
  }
}

/** Creates a higher-order voting strategy for use with ConsensusEngine. */
export function createHigherOrderVotingStrategy(
  options?: OWVotingOptions
): HigherOrderVotingStrategy {
  return new HigherOrderVotingStrategy(options);
}
