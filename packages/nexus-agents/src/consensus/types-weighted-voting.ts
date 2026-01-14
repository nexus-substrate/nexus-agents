/**
 * nexus-agents/consensus - Weighted Byzantine Voting Types
 *
 * Weighted Byzantine Voting Types (Issue #103)
 * Based on CP-WBFT (arXiv:2511.10400)
 */

import { z } from 'zod';
import type { Vote } from './types-core.js';

/**
 * Task outcome for tracking agent performance.
 */
export const TaskOutcomeSchema = z.enum(['success', 'failure', 'partial', 'unknown']);
export type TaskOutcome = z.infer<typeof TaskOutcomeSchema>;

/**
 * Extended agent performance with Byzantine detection.
 */
export interface WeightedAgentRecord {
  readonly agentId: string;
  readonly totalTasks: number;
  readonly successfulTasks: number;
  readonly failedTasks: number;
  readonly partialTasks: number;
  readonly successRate: number;
  readonly weight: number;
  readonly trustScore: number;
  readonly byzantineFlags: number;
  readonly lastActive: Date;
  readonly createdAt: Date;
}

export const WeightedAgentRecordSchema = z.object({
  agentId: z.string().min(1),
  totalTasks: z.number().int().nonnegative(),
  successfulTasks: z.number().int().nonnegative(),
  failedTasks: z.number().int().nonnegative(),
  partialTasks: z.number().int().nonnegative(),
  successRate: z.number().min(0).max(1),
  weight: z.number().min(0).max(1),
  trustScore: z.number().min(0).max(1),
  byzantineFlags: z.number().int().nonnegative(),
  lastActive: z.date(),
  createdAt: z.date(),
});

/**
 * Weighted consensus result.
 */
export interface WeightedConsensusResult {
  readonly decision: 'approve' | 'reject' | 'no_consensus';
  readonly weightedApproval: number;
  readonly weightedRejection: number;
  readonly totalWeight: number;
  readonly quorumReached: boolean;
  readonly byzantineDetected: boolean;
  readonly participatingAgents: readonly string[];
  readonly weightBreakdown: ReadonlyMap<string, number>;
}

/**
 * Configuration for weighted Byzantine voting.
 */
export interface WeightedVotingConfig {
  /** Minimum weight to participate in voting (default: 0.1) */
  readonly minWeight: number;
  /** Maximum Byzantine fault tolerance (default: 0.33) */
  readonly maxByzantineFraction: number;
  /** Weight decay factor per failed task (default: 0.9) */
  readonly weightDecayFactor: number;
  /** Weight recovery factor per successful task (default: 1.05) */
  readonly weightRecoveryFactor: number;
  /** Trust score required to vote (default: 0.3) */
  readonly minTrustScore: number;
  /** Byzantine flag threshold for exclusion (default: 3) */
  readonly byzantineFlagThreshold: number;
  /** Initial weight for new agents (default: 0.5) */
  readonly initialWeight: number;
  /** Quorum threshold for valid consensus (default: 0.67) */
  readonly quorumThreshold: number;
}

export const WeightedVotingConfigSchema = z.object({
  minWeight: z.number().min(0).max(1).default(0.1),
  maxByzantineFraction: z.number().min(0).max(0.5).default(0.33),
  weightDecayFactor: z.number().min(0.5).max(1).default(0.9),
  weightRecoveryFactor: z.number().min(1).max(2).default(1.05),
  minTrustScore: z.number().min(0).max(1).default(0.3),
  byzantineFlagThreshold: z.number().int().positive().default(3),
  initialWeight: z.number().min(0).max(1).default(0.5),
  quorumThreshold: z.number().min(0.5).max(1).default(0.67),
});

export const DEFAULT_WEIGHTED_VOTING_CONFIG: WeightedVotingConfig = {
  minWeight: 0.1,
  maxByzantineFraction: 0.33,
  weightDecayFactor: 0.9,
  weightRecoveryFactor: 1.05,
  minTrustScore: 0.3,
  byzantineFlagThreshold: 3,
  initialWeight: 0.5,
  quorumThreshold: 0.67,
};

/**
 * Interface for weighted Byzantine voting.
 * (Source: Issue #103, arXiv:2511.10400 - CP-WBFT)
 */
export interface IWeightedVoting {
  /** Calculate vote weight for an agent */
  calculateWeight(agentId: string): number;

  /** Update agent performance based on task outcome */
  updatePerformance(agentId: string, outcome: TaskOutcome): void;

  /** Run weighted consensus on votes */
  weightedConsensus(votes: ReadonlyMap<string, Vote>): WeightedConsensusResult;

  /** Register a new agent */
  registerAgent(agentId: string): void;

  /** Get agent performance record */
  getAgentRecord(agentId: string): WeightedAgentRecord | undefined;

  /** Flag agent for Byzantine behavior */
  flagByzantine(agentId: string, reason: string): void;

  /** Get all agent records */
  getAllRecords(): readonly WeightedAgentRecord[];

  /** Check if agent can vote */
  canVote(agentId: string): boolean;

  /** Recalibrate all weights based on global performance */
  recalibrateWeights(): void;
}
