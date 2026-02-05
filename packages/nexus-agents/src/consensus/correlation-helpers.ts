/**
 * nexus-agents/consensus - Correlation Helpers
 *
 * Helper functions for correlation tracking and independent subset partitioning.
 * Extracted from correlation-tracker.ts to maintain file size limits.
 *
 * @module consensus/correlation-helpers
 * (Source: Issue #339)
 */

import type {
  CorrelationMatrix,
  CorrelationCoefficient,
  IndependentSubset,
  VotingObservation,
  HigherOrderVotingConfig,
  AgentPairKey,
} from './higher-order-types.js';
import { createAgentPairKey } from './higher-order-types.js';

// ============================================================================
// Pairwise History Types
// ============================================================================

/**
 * Internal mutable representation of pairwise history.
 */
export interface MutablePairwiseHistory {
  pairKey: AgentPairKey;
  jointObservations: number;
  agreements: number;
  disagreements: number;
  correlation: CorrelationCoefficient;
  lastUpdated: Date;
}

// ============================================================================
// Vote Agreement
// ============================================================================

/**
 * Check if two observations are comparable (neither is an abstain).
 * Abstain votes should be excluded from correlation tracking.
 *
 * @param obsA - First observation
 * @param obsB - Second observation
 * @returns True if both observations have non-abstain decisions
 */
export function isComparable(obsA: VotingObservation, obsB: VotingObservation): boolean {
  return obsA.decision !== 'abstain' && obsB.decision !== 'abstain';
}

/**
 * Check if two votes agree.
 * Only call this after verifying isComparable() returns true.
 * Abstains are treated as neutral - neither agree nor disagree.
 *
 * @param obsA - First observation
 * @param obsB - Second observation
 * @returns True if votes agree, null if either is an abstain (neutral)
 */
export function votesAgree(obsA: VotingObservation, obsB: VotingObservation): boolean | null {
  if (obsA.decision === 'abstain' || obsB.decision === 'abstain') {
    return null; // Neutral — skip this pair (Issue #763)
  }
  return obsA.decision === obsB.decision;
}

/**
 * Check if a decision aligned with the outcome.
 *
 * @param decision - The voting decision
 * @param outcome - The final outcome
 * @returns True if decision aligned with outcome
 */
export function didAlignWithOutcome(decision: string, outcome: 'approved' | 'rejected'): boolean {
  if (decision === 'abstain') return true;
  return (
    (decision === 'approve' && outcome === 'approved') ||
    (decision === 'reject' && outcome === 'rejected')
  );
}

// ============================================================================
// Correlation Computation
// ============================================================================

/**
 * Compute correlation coefficient from pairwise history.
 *
 * Simple correlation: (agreements - disagreements) / total
 * Range: -1 (always disagree) to +1 (always agree)
 *
 * @param history - Pairwise history
 * @returns Correlation coefficient
 */
export function computeCorrelationCoefficient(
  history: MutablePairwiseHistory
): CorrelationCoefficient {
  const n = history.jointObservations;
  if (n === 0) return 0;

  // Map agreement/disagreement rates to [-1, 1] correlation
  // 0.5 agreement rate = 0 correlation (random)
  // 1.0 agreement rate = +1 correlation (perfect agreement)
  // 0.0 agreement rate = -1 correlation (perfect disagreement)
  const agreementRate = history.agreements / n;
  const disagreementRate = history.disagreements / n;

  return agreementRate - disagreementRate;
}

// ============================================================================
// Independent Subset Partitioning
// ============================================================================

/**
 * Check if an agent is independent from all members of a subset.
 *
 * @param agent - Agent to check
 * @param subset - Existing subset members
 * @param correlationMatrix - Correlation matrix
 * @param independenceThreshold - Maximum correlation for independence
 * @returns True if agent is independent from subset
 */
export function isIndependentFromSubset(
  agent: string,
  subset: readonly string[],
  correlationMatrix: CorrelationMatrix,
  independenceThreshold: number
): boolean {
  for (const member of subset) {
    const pairKey = createAgentPairKey(agent, member);
    const correlation = correlationMatrix.get(pairKey);

    // If we don't have data, assume independent
    if (correlation === undefined) continue;

    // If correlation exceeds threshold, not independent
    if (Math.abs(correlation) > independenceThreshold) {
      return false;
    }
  }
  return true;
}

/**
 * Compute the average absolute correlation within a subset.
 *
 * @param subset - Agent IDs in the subset
 * @param correlationMatrix - Correlation matrix
 * @returns Average absolute correlation (0 if no pairs)
 */
export function computeSubsetIndependenceScore(
  subset: readonly string[],
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

/**
 * Compute the minimum observation count for pairs within a subset.
 *
 * @param subset - Agent IDs in the subset
 * @param pairwiseHistory - Map of pairwise histories
 * @returns Minimum observation count (0 if no history)
 */
export function computeSubsetObservationCount(
  subset: readonly string[],
  pairwiseHistory: ReadonlyMap<AgentPairKey, MutablePairwiseHistory>
): number {
  let minObservations = Infinity;

  for (let i = 0; i < subset.length; i++) {
    for (let j = i + 1; j < subset.length; j++) {
      const agentA = subset[i];
      const agentB = subset[j];
      if (agentA !== undefined && agentB !== undefined) {
        const pairKey = createAgentPairKey(agentA, agentB);
        const history = pairwiseHistory.get(pairKey);
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

/**
 * Partition agents into independent groups using greedy clustering.
 *
 * @param agents - List of agent IDs
 * @param correlationMatrix - Correlation matrix
 * @param pairwiseHistory - Map of pairwise histories
 * @param config - Higher-order voting configuration
 * @returns Array of independent subsets
 */
export function partitionIntoIndependentGroups(
  agents: readonly string[],
  correlationMatrix: CorrelationMatrix,
  pairwiseHistory: ReadonlyMap<AgentPairKey, MutablePairwiseHistory>,
  config: HigherOrderVotingConfig
): IndependentSubset[] {
  if (agents.length === 0) return [];

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
      if (isIndependentFromSubset(other, subset, correlationMatrix, config.independenceThreshold)) {
        subset.push(other);
        assigned.add(other);
      }
    }

    const independenceScore = computeSubsetIndependenceScore(subset, correlationMatrix);
    const observationCount = computeSubsetObservationCount(subset, pairwiseHistory);

    subsets.push({
      id: `subset-${String(subsetId++)}`,
      agentIds: subset,
      independenceScore,
      observationCount,
    });
  }

  return subsets;
}
