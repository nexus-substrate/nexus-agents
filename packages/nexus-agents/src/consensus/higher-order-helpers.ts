/**
 * nexus-agents/consensus - Higher-Order Voting Helpers
 *
 * Helper functions for Opinion-Wise (OW) and Independent Subset Partition (ISP)
 * voting methods. Extracted from higher-order-voting.ts to maintain file size limits.
 *
 * @module consensus/higher-order-helpers
 * (Source: Issue #333, #339)
 */

import type { Vote } from './types-core.js';
import type {
  CorrelationMatrix,
  HigherOrderVotingResult,
  IndependentSubset,
} from './higher-order-types.js';
import { createAgentPairKey } from './higher-order-types.js';

/**
 * Result of Bayesian aggregation.
 */
export interface BayesianAggregateResult {
  readonly posteriorApproval: number;
  readonly posteriorRejection: number;
  readonly effectiveVoteCount: number;
  readonly downweightedAgents: string[];
}

/**
 * Result of subset aggregation.
 */
export interface SubsetAggregationResult {
  readonly subsetResults: Array<{ approval: number; rejection: number; weight: number }>;
  readonly downweightedAgents: string[];
}

/**
 * Result of combined subset results.
 */
export interface CombinedSubsetResult {
  readonly posteriorApproval: number;
  readonly posteriorRejection: number;
  readonly totalWeight: number;
}

/**
 * Check if there is sufficient correlation data for analysis.
 */
export function hasSufficientCorrelationData(
  agentIds: readonly string[],
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

/**
 * Compute effective weights for agents based on correlations.
 * Reduces weights for highly correlated agents.
 */
export function computeEffectiveWeights(
  agentIds: readonly string[],
  correlationMatrix: CorrelationMatrix,
  correlationThreshold: number
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

      if (correlation !== undefined && correlation > correlationThreshold) {
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

/**
 * Perform Bayesian aggregation of votes with effective weights.
 */
export function bayesianAggregate(
  votes: ReadonlyMap<string, Vote>,
  effectiveWeights: Map<string, number>
): BayesianAggregateResult {
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

/**
 * Aggregate votes within independent subsets.
 */
export function aggregateSubsets(
  votes: ReadonlyMap<string, Vote>,
  independentSubsets: readonly IndependentSubset[]
): SubsetAggregationResult {
  const subsetResults: Array<{ approval: number; rejection: number; weight: number }> = [];
  const downweightedAgents: string[] = [];

  for (const subset of independentSubsets) {
    const subsetVotes = new Map<string, Vote>();
    for (const agentId of subset.agentIds) {
      const vote = votes.get(agentId);
      if (vote !== undefined) subsetVotes.set(agentId, vote);
    }
    if (subsetVotes.size === 0) continue;

    const { approval, rejection } = countSubsetVotes(subsetVotes);
    const weight = subsetVotes.size * (1 - subset.independenceScore);
    subsetResults.push({ approval, rejection, weight });

    if (subset.agentIds.length === 1) downweightedAgents.push(...subset.agentIds);
  }
  return { subsetResults, downweightedAgents };
}

/**
 * Combine subset results into overall posterior probabilities.
 */
export function combineSubsetResults(
  subsetResults: readonly { approval: number; rejection: number; weight: number }[]
): CombinedSubsetResult {
  let totalApproval = 0;
  let totalRejection = 0;
  let totalWeight = 0;
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

/**
 * Count votes within a subset, weighted by confidence.
 */
export function countSubsetVotes(votes: ReadonlyMap<string, Vote>): {
  approval: number;
  rejection: number;
} {
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

/**
 * Determine decision based on posterior probabilities.
 */
export function determineHigherOrderDecision(
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

/**
 * Perform simple majority aggregation (no correlation data).
 */
export function aggregateSimple(
  votes: ReadonlyMap<string, Vote>,
  buildReasoningFn: (
    decision: 'approve' | 'reject' | 'no_consensus',
    effectiveVotes: number,
    downweightedAgents: string[],
    method: 'ow' | 'isp' | 'simple'
  ) => string
): HigherOrderVotingResult {
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
  const decision = determineHigherOrderDecision(posteriorApproval, posteriorRejection);

  return {
    decision,
    posteriorApproval,
    posteriorRejection,
    effectiveVoteCount: total,
    usedCorrelationData: false,
    method: 'simple',
    improvementOverBaseline: 0,
    downweightedAgents: [],
    reasoning: buildReasoningFn(decision, total, [], 'simple'),
  };
}

/**
 * Calculate improvement over baseline.
 */
export function calculateImprovement(
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

/**
 * Build reasoning string for voting result.
 */
export function buildReasoning(
  decision: 'approve' | 'reject' | 'no_consensus',
  effectiveVotes: number,
  downweightedAgents: readonly string[],
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
