/**
 * nexus-agents/consensus - Core Type Definitions
 *
 * Core type definitions and Zod schemas for the consensus engine.
 * Supports multiple voting strategies for multi-agent decisions.
 */

import { z } from 'zod';

/**
 * Consensus algorithm types.
 * - simple_majority: >50% of votes required
 * - supermajority: >=67% of votes required
 * - unanimous: 100% approval required
 * - proof_of_learning: weighted voting based on agent performance
 * - opinion_wise: higher-order voting with correlation awareness (Issue #333)
 */
export const ConsensusAlgorithmSchema = z.enum([
  'simple_majority',
  'supermajority',
  'unanimous',
  'proof_of_learning',
  'opinion_wise',
]);
export type ConsensusAlgorithm = z.infer<typeof ConsensusAlgorithmSchema>;

/**
 * Vote decision options.
 */
export const VoteDecisionSchema = z.enum(['approve', 'reject', 'abstain']);
export type VoteDecision = z.infer<typeof VoteDecisionSchema>;

/**
 * Proposal status in the lifecycle.
 */
export const ProposalStatusSchema = z.enum([
  'pending',
  'voting',
  'approved',
  'rejected',
  'timeout',
  'closed',
]);
export type ProposalStatus = z.infer<typeof ProposalStatusSchema>;

/**
 * A vote cast by an agent.
 */
export const VoteSchema = z.object({
  decision: VoteDecisionSchema,
  reasoning: z.string().min(1).describe('Explanation for the vote'),
  confidence: z.number().min(0).max(1).describe('Confidence level 0-1'),
  conditions: z.array(z.string()).optional().describe('Conditions for approval'),
  timestamp: z.string().datetime().optional(),
});
export type Vote = z.infer<typeof VoteSchema>;

/**
 * A proposal submitted for consensus.
 */
export const ProposalSchema = z.object({
  id: z.string().optional().describe('Auto-generated if not provided'),
  title: z.string().min(1).max(200).describe('Short proposal title'),
  description: z.string().min(1).describe('Detailed proposal description'),
  algorithm: ConsensusAlgorithmSchema,
  timeout: z.number().int().positive().optional().describe('Timeout in milliseconds'),
  requiredVoters: z.array(z.string()).optional().describe('Agent IDs that must vote'),
  metadata: z.record(z.unknown()).optional().describe('Additional context'),
  createdAt: z.string().datetime().optional(),
});
export type Proposal = z.infer<typeof ProposalSchema>;

/**
 * Unique identifier for a proposal.
 */
export type ProposalId = string;

/**
 * Vote counts summary.
 */
export interface VoteCounts {
  approve: number;
  reject: number;
  abstain: number;
  total: number;
}

/**
 * Weighted vote counts for proof-of-learning.
 */
export interface WeightedVoteCounts {
  approve: number;
  reject: number;
  abstain: number;
  totalWeight: number;
}

/**
 * Result of a consensus decision.
 */
export interface ConsensusResult {
  proposalId: ProposalId;
  proposal: Proposal;
  outcome: ProposalStatus;
  votes: Map<string, Vote>;
  voteCounts: VoteCounts;
  weightedCounts?: WeightedVoteCounts | undefined;
  approvalPercentage: number;
  quorumReached: boolean;
  startedAt: string;
  closedAt: string;
  durationMs: number;
}

/**
 * Consensus result schema for validation.
 */
export const ConsensusResultSchema = z.object({
  proposalId: z.string(),
  proposal: ProposalSchema,
  outcome: ProposalStatusSchema,
  votes: z.map(z.string(), VoteSchema),
  voteCounts: z.object({
    approve: z.number().int().nonnegative(),
    reject: z.number().int().nonnegative(),
    abstain: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
  weightedCounts: z
    .object({
      approve: z.number().nonnegative(),
      reject: z.number().nonnegative(),
      abstain: z.number().nonnegative(),
      totalWeight: z.number().nonnegative(),
    })
    .optional(),
  approvalPercentage: z.number().min(0).max(100),
  quorumReached: z.boolean(),
  startedAt: z.string().datetime(),
  closedAt: z.string().datetime(),
  durationMs: z.number().int().nonnegative(),
});

/**
 * Agent performance record for proof-of-learning.
 */
export interface AgentPerformance {
  agentId: string;
  totalVotes: number;
  correctVotes: number;
  successRate: number;
  lastUpdated: string;
}

/**
 * Agent performance schema.
 */
export const AgentPerformanceSchema = z.object({
  agentId: z.string(),
  totalVotes: z.number().int().nonnegative(),
  correctVotes: z.number().int().nonnegative(),
  successRate: z.number().min(0).max(1),
  lastUpdated: z.string().datetime(),
});

/**
 * Proposal content caching configuration for determinism. (Issue #589)
 */
export interface ProposalCacheConfig {
  /** Enable content-based caching for repeated proposals */
  enabled: boolean;
  /** TTL in milliseconds (default: 1 hour) */
  ttlMs: number;
  /** Maximum cached entries (default: 500) */
  maxEntries: number;
}

/**
 * Consensus engine configuration.
 */
export interface ConsensusEngineConfig {
  defaultTimeout: number;
  minVotersForQuorum: number;
  maxActiveProposals: number;
  enablePerformanceTracking: boolean;
  /** Maximum number of closed proposals to retain. Oldest are evicted when exceeded. (Issue #549) */
  maxClosedProposals: number;
  /** Content-based proposal caching for determinism (Issue #589) */
  proposalCache?: ProposalCacheConfig;
}

/**
 * Proposal cache configuration schema. (Issue #589)
 */
export const ProposalCacheConfigSchema = z.object({
  enabled: z.boolean().default(false),
  ttlMs: z.number().int().positive().default(3600000), // 1 hour
  maxEntries: z.number().int().positive().default(500),
});

/**
 * Consensus engine configuration schema.
 */
export const ConsensusEngineConfigSchema = z.object({
  defaultTimeout: z.number().int().positive().default(300000), // 5 minutes
  minVotersForQuorum: z.number().int().positive().default(2),
  maxActiveProposals: z.number().int().positive().default(100),
  enablePerformanceTracking: z.boolean().default(true),
  maxClosedProposals: z.number().int().positive().default(1000), // Issue #549
  proposalCache: ProposalCacheConfigSchema.optional(), // Issue #589
});

/**
 * Default configuration values.
 */
export const DEFAULT_CONSENSUS_CONFIG: ConsensusEngineConfig = {
  defaultTimeout: 300000, // 5 minutes
  minVotersForQuorum: 2,
  maxActiveProposals: 100,
  enablePerformanceTracking: true,
  maxClosedProposals: 1000, // Issue #549: Prevent unbounded memory growth
};

/**
 * Voting thresholds for each algorithm.
 */
export const VOTING_THRESHOLDS: Record<ConsensusAlgorithm, number> = {
  simple_majority: 0.5,
  supermajority: 0.67,
  unanimous: 1.0,
  proof_of_learning: 0.5, // Uses weighted voting
  opinion_wise: 0.5, // Uses correlation-aware Bayesian aggregation (Issue #333)
};

/**
 * Internal proposal state managed by the engine.
 */
export interface ProposalState {
  proposal: Proposal;
  status: ProposalStatus;
  votes: Map<string, Vote>;
  voteWeights: Map<string, number>;
  startedAt: Date;
  timeoutId?: ReturnType<typeof setTimeout>;
}

/**
 * Consensus metrics for monitoring.
 */
export interface ConsensusMetrics {
  totalProposals: number;
  approvedProposals: number;
  rejectedProposals: number;
  timedOutProposals: number;
  averageDurationMs: number;
  averageVotesPerProposal: number;
  algorithmUsage: Record<ConsensusAlgorithm, number>;
}

/**
 * Consensus metrics schema.
 */
export const ConsensusMetricsSchema = z.object({
  totalProposals: z.number().int().nonnegative(),
  approvedProposals: z.number().int().nonnegative(),
  rejectedProposals: z.number().int().nonnegative(),
  timedOutProposals: z.number().int().nonnegative(),
  averageDurationMs: z.number().nonnegative(),
  averageVotesPerProposal: z.number().nonnegative(),
  algorithmUsage: z.record(ConsensusAlgorithmSchema, z.number().int().nonnegative()),
});
