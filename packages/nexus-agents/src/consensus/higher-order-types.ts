/**
 * nexus-agents/consensus - Higher-Order Voting Types
 *
 * Type definitions for Opinion-Wise (OW) and Independent Subset Partition (ISP)
 * voting methods that account for correlations between agent opinions.
 *
 * Higher-order voting uses Bayesian-optimal aggregation that handles correlated
 * agents better than traditional independent voting assumptions.
 *
 * @module consensus/higher-order-types
 * (Source: Issue #333)
 */

import { z } from 'zod';
import type { Vote, VoteDecision } from './types-core.js';

// ============================================================================
// CORRELATION TYPES
// ============================================================================

/**
 * Pair of agent IDs for correlation tracking.
 * Stored as "agentA:agentB" where agentA < agentB lexicographically.
 */
export type AgentPairKey = `${string}:${string}`;

/**
 * Creates a canonical agent pair key for correlation lookup.
 * Orders agents lexicographically to ensure consistent keys.
 */
export function createAgentPairKey(agentA: string, agentB: string): AgentPairKey {
  return agentA < agentB ? `${agentA}:${agentB}` : `${agentB}:${agentA}`;
}

/**
 * Extracts agent IDs from a pair key.
 */
export function parseAgentPairKey(key: AgentPairKey): [string, string] {
  const parts = key.split(':');
  if (parts.length !== 2 || parts[0] === undefined || parts[1] === undefined) {
    throw new Error(`Invalid agent pair key: ${key}`);
  }
  return [parts[0], parts[1]];
}

/**
 * Correlation coefficient between two agents' voting patterns.
 * Range: -1 (perfectly anti-correlated) to +1 (perfectly correlated).
 * 0 indicates independence.
 */
export const CorrelationCoefficientSchema = z.number().min(-1).max(1);
export type CorrelationCoefficient = z.infer<typeof CorrelationCoefficientSchema>;

/**
 * Correlation matrix storing pairwise correlations between agents.
 */
export type CorrelationMatrix = Map<AgentPairKey, CorrelationCoefficient>;

/**
 * A subset of agents that vote independently of each other.
 * Used in ISP (Independent Subset Partition) method.
 */
export interface IndependentSubset {
  /** Unique identifier for this subset */
  readonly id: string;
  /** Agent IDs in this independent subset */
  readonly agentIds: readonly string[];
  /**
   * Average internal independence score (lower = more independent).
   *
   * Averaged over the pairs that HAVE a correlation, so read it together with
   * {@link pairCoverage}: a subset whose pairs were measured at 0 and one whose
   * pairs were never observed both score 0, and 0 is the score that earns the
   * maximum posterior weight.
   */
  readonly independenceScore: number;
  /**
   * How many of the subset's agent pairs actually had a correlation, out of how
   * many exist.
   *
   * `observed < total` means {@link independenceScore} is an average over a
   * subset of the pairs — the unobserved ones contributed nothing rather than
   * being represented as unknown. A singleton has `total: 0`: there is no pair
   * to observe, so its score is not a measurement at all.
   */
  readonly pairCoverage: { readonly observed: number; readonly total: number };
  /** Number of observations supporting this grouping */
  readonly observationCount: number;
}

export const IndependentSubsetSchema = z.object({
  id: z.string(),
  agentIds: z.array(z.string()),
  independenceScore: z.number().min(0).max(1),
  pairCoverage: z.object({
    observed: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
  observationCount: z.number().int().nonnegative(),
});

// ============================================================================
// VOTING HISTORY TYPES
// ============================================================================

/**
 * Record of a single voting observation for correlation tracking.
 */
export interface VotingObservation {
  /** Unique proposal ID */
  readonly proposalId: string;
  /** Agent who cast the vote */
  readonly agentId: string;
  /** The vote decision */
  readonly decision: VoteDecision;
  /** Confidence level (0-1) */
  readonly confidence: number;
  /** Whether the vote aligned with the final outcome */
  readonly alignedWithOutcome: boolean;
  /** Timestamp of the vote */
  readonly timestamp: Date;
  /** Pinned model identity used to select the correlation partition. */
  readonly modelKey?: string;
  /** Model that actually answered, retained for provenance only. */
  readonly observedModel?: string;
}

export const VotingObservationSchema = z.object({
  proposalId: z.string(),
  agentId: z.string(),
  decision: z.enum(['approve', 'reject', 'abstain']),
  confidence: z.number().min(0).max(1),
  alignedWithOutcome: z.boolean(),
  timestamp: z.date(),
  modelKey: z.string().optional(),
  observedModel: z.string().optional(),
});

/** Model identities associated with one correlation-recording operation. */
export interface CorrelationRecordContext {
  /** Role-to-pinned-model map used for correlation partition selection. */
  readonly modelPins: ReadonlyMap<string, string>;
  /** Role-to-serving-model map retained only as observation provenance. */
  readonly observedModels?: ReadonlyMap<string, string>;
}

/**
 * Aggregated voting history for a pair of agents.
 */
export interface PairwiseVotingHistory {
  /** Agent pair key */
  readonly pairKey: AgentPairKey;
  /** Number of proposals where both agents voted */
  readonly jointObservations: number;
  /** Number of times both agents agreed */
  readonly agreements: number;
  /** Number of times agents disagreed */
  readonly disagreements: number;
  /** Computed correlation coefficient */
  readonly correlation: CorrelationCoefficient;
  /** Last update timestamp */
  readonly lastUpdated: Date;
}

export const PairwiseVotingHistorySchema = z.object({
  pairKey: z.string() as z.ZodType<AgentPairKey>,
  jointObservations: z.number().int().nonnegative(),
  agreements: z.number().int().nonnegative(),
  disagreements: z.number().int().nonnegative(),
  correlation: CorrelationCoefficientSchema,
  lastUpdated: z.date(),
});

// ============================================================================
// HIGHER-ORDER VOTING CONFIG
// ============================================================================

/**
 * Configuration for higher-order voting.
 * Correlation aggregates are lifetime evidence; retained records are count-bounded
 * by `maxProposals` FIFO and `maxObservationsPerAgent`, and active history is
 * partitioned by each role's pinned model. The legacy correlation lifetime keys
 * are deprecated and ignored.
 */
export interface HigherOrderVotingConfig {
  /** Minimum observations before using correlation data (default: 10) */
  readonly minObservationsForCorrelation: number;
  /** Correlation threshold to consider agents correlated (default: 0.3) */
  readonly correlationThreshold: number;
  /**
   * @deprecated Ignored since 8.x: correlation evidence is lifetime and partitioned by the role's pinned model (#5555); nothing reads this value. Removed in the next major (#5564).
   */
  readonly correlationMaxAgeMs: number;
  /** Independence threshold for ISP grouping (default: 0.2) */
  readonly independenceThreshold: number;
  /** Whether to fall back to simple voting when correlation data insufficient */
  readonly fallbackToSimpleVoting: boolean;
  /**
   * @deprecated Ignored since 8.x: correlation evidence is lifetime and partitioned by the role's pinned model (#5555); nothing reads this value. Removed in the next major (#5564).
   */
  readonly observationDecayFactor: number;
  /** Maximum observations to store per agent before FIFO eviction (default: 1000) */
  readonly maxObservationsPerAgent: number;
  /** Maximum total proposals to track before evicting oldest (default: 5000) */
  readonly maxProposals: number;
  /** Maximum pairwise history entries before LRU eviction (default: 100) */
  readonly maxTrackedPairs: number;
}

export const HigherOrderVotingConfigSchema = z.object({
  minObservationsForCorrelation: z.number().int().positive().default(10),
  correlationThreshold: z.number().min(0).max(1).default(0.3),
  /**
   * @deprecated Ignored since 8.x: correlation evidence is lifetime and partitioned by the role's pinned model (#5555); nothing reads this value. Removed in the next major (#5564).
   */
  correlationMaxAgeMs: z.number().int().positive().default(86400000), // 24 hours
  independenceThreshold: z.number().min(0).max(1).default(0.2),
  fallbackToSimpleVoting: z.boolean().default(true),
  /**
   * @deprecated Ignored since 8.x: correlation evidence is lifetime and partitioned by the role's pinned model (#5555); nothing reads this value. Removed in the next major (#5564).
   */
  observationDecayFactor: z.number().min(0).max(1).default(0.95),
  maxObservationsPerAgent: z.number().int().positive().default(1000),
  maxProposals: z.number().int().positive().default(5000),
  maxTrackedPairs: z.number().int().positive().default(100),
});

export const DEFAULT_HIGHER_ORDER_CONFIG: HigherOrderVotingConfig = {
  minObservationsForCorrelation: 10,
  correlationThreshold: 0.3,
  correlationMaxAgeMs: 86400000, // 24 hours
  independenceThreshold: 0.2,
  fallbackToSimpleVoting: true,
  observationDecayFactor: 0.95,
  maxObservationsPerAgent: 1000,
  maxProposals: 5000,
  maxTrackedPairs: 100,
};

// ============================================================================
// HIGHER-ORDER VOTING RESULTS
// ============================================================================

/**
 * Result of Bayesian aggregation with correlation awareness.
 */
export interface HigherOrderVotingResult {
  /** Final decision */
  readonly decision: 'approve' | 'reject' | 'no_consensus';
  /** Posterior probability of approval */
  readonly posteriorApproval: number;
  /** Posterior probability of rejection */
  readonly posteriorRejection: number;
  /** Effective number of independent votes */
  readonly effectiveVoteCount: number;
  /** Whether correlation data was sufficient */
  readonly usedCorrelationData: boolean;
  /** Method used: 'ow' (opinion-wise), 'isp', or 'simple' (fallback) */
  readonly method: 'ow' | 'isp' | 'simple';
  /** Improvement over baseline majority voting (percentage points) */
  readonly improvementOverBaseline: number;
  /** Independent subsets used (if ISP method) */
  readonly independentSubsets?: readonly IndependentSubset[];
  /** Agents whose votes were down-weighted due to correlation */
  readonly downweightedAgents: readonly string[];
  /** Reasoning for the decision */
  readonly reasoning: string;
}

export const HigherOrderVotingResultSchema = z.object({
  decision: z.enum(['approve', 'reject', 'no_consensus']),
  posteriorApproval: z.number().min(0).max(1),
  posteriorRejection: z.number().min(0).max(1),
  effectiveVoteCount: z.number().nonnegative(),
  usedCorrelationData: z.boolean(),
  method: z.enum(['ow', 'isp', 'simple']),
  improvementOverBaseline: z.number(),
  independentSubsets: z.array(IndependentSubsetSchema).optional(),
  downweightedAgents: z.array(z.string()),
  reasoning: z.string(),
});

// ============================================================================
// CORRELATION TRACKER INTERFACE
// ============================================================================

/**
 * Statistics about correlation tracking.
 */
export interface CorrelationTrackerStats {
  /** Total agents being tracked */
  readonly totalAgents: number;
  /** Total agent pairs with correlation data */
  readonly trackedPairs: number;
  /** Total voting observations recorded */
  readonly totalObservations: number;
  /** Average correlation across all pairs */
  readonly averageCorrelation: number;
  /** Number of identified independent subsets */
  readonly independentSubsetCount: number;
  /** Pairs with sufficient data for correlation calculation */
  readonly pairsWithSufficientData: number;
}

export const CorrelationTrackerStatsSchema = z.object({
  totalAgents: z.number().int().nonnegative(),
  trackedPairs: z.number().int().nonnegative(),
  totalObservations: z.number().int().nonnegative(),
  averageCorrelation: z.number(),
  independentSubsetCount: z.number().int().nonnegative(),
  pairsWithSufficientData: z.number().int().nonnegative(),
});

/**
 * Interface for correlation tracking between agents.
 */
export interface ICorrelationTracker {
  /** Select the active model partition for each pinned role. */
  setCurrentModelPins?(modelPins: ReadonlyMap<string, string>): void;

  /**
   * Record a vote and its outcome for correlation tracking.
   */
  recordVote(
    agentId: string,
    vote: Vote,
    outcome: 'approved' | 'rejected',
    context?: CorrelationRecordContext
  ): void;

  /**
   * Record votes from multiple agents for the same proposal.
   */
  recordProposalVotes(
    proposalId: string,
    votes: ReadonlyMap<string, Vote>,
    outcome: 'approved' | 'rejected',
    context?: CorrelationRecordContext
  ): void;

  /**
   * Compute the full correlation matrix for all tracked agents.
   */
  computeCorrelationMatrix(): CorrelationMatrix;

  /**
   * Get correlation between two specific agents.
   * Returns undefined if insufficient data.
   */
  getCorrelation(agentA: string, agentB: string): CorrelationCoefficient | undefined;

  /**
   * Identify groups of agents that vote independently.
   */
  identifyIndependentSubsets(): readonly IndependentSubset[];

  /**
   * Check if there is sufficient correlation data for a set of agents.
   */
  hasSufficientData(agentIds: readonly string[]): boolean;

  /**
   * Get statistics about the correlation tracker.
   */
  getStats(): CorrelationTrackerStats;

  /**
   * Clear all recorded data.
   */
  clear(): void;
}

// ============================================================================
// OW VOTING INTERFACE
// ============================================================================

/**
 * Interface for Opinion-Wise higher-order voting.
 */
export interface IHigherOrderVoting {
  /**
   * Aggregate votes using Bayesian correlation-aware method.
   */
  aggregateWithCorrelation(
    votes: ReadonlyMap<string, Vote>,
    correlationMatrix: CorrelationMatrix
  ): HigherOrderVotingResult;

  /**
   * Estimate correlation matrix from voting history.
   */
  estimateCorrelation(tracker: ICorrelationTracker): CorrelationMatrix;

  /**
   * Compute result using Independent Subset Partition method.
   */
  computeISP(
    votes: ReadonlyMap<string, Vote>,
    independentSubsets: readonly IndependentSubset[]
  ): HigherOrderVotingResult;

  /**
   * Full pipeline: estimate correlation, compute result.
   *
   * `tracker` is OPTIONAL (#3173): when omitted, the instance uses the tracker
   * injected at construction (`OWVotingOptions.tracker`), letting higher-order
   * voting be reused as a building block without threading the tracker through
   * every call. A per-call `tracker` still wins. Throws if neither is available.
   */
  aggregate(
    votes: ReadonlyMap<string, Vote>,
    tracker?: ICorrelationTracker
  ): HigherOrderVotingResult;

  /**
   * Get the current configuration.
   */
  getConfig(): HigherOrderVotingConfig;
}
