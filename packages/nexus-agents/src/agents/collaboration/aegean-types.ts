/**
 * nexus-agents/agents/collaboration - Aegean Protocol Types
 *
 * Type definitions for the Aegean Byzantine-fault-tolerant consensus
 * protocol based on arxiv:2512.20184 "Reaching Agreement Among Reasoning
 * LLM Agents".
 */

import { z } from 'zod';

/**
 * Phase of the Aegean protocol.
 */
export type AegeanPhase = 'proposal' | 'voting' | 'commit' | 'done';

export const AegeanPhaseSchema = z.enum(['proposal', 'voting', 'commit', 'done']);

/**
 * Vote status from an agent.
 */
export type AgentVoteStatus = 'pending' | 'accept' | 'reject' | 'timeout' | 'byzantine';

export const AgentVoteStatusSchema = z.enum([
  'pending',
  'accept',
  'reject',
  'timeout',
  'byzantine',
]);

/**
 * Proposal from the leader agent.
 */
export interface Proposal {
  readonly proposalId: string;
  readonly round: number;
  readonly leaderId: string;
  readonly value: unknown;
  readonly timestamp: number;
}

export const ProposalSchema = z.object({
  proposalId: z.string(),
  round: z.number().int().min(0),
  leaderId: z.string(),
  value: z.unknown(),
  timestamp: z.number(),
});

/**
 * Vote on a proposal.
 */
export interface AgentVote {
  readonly agentId: string;
  readonly proposalId: string;
  readonly status: AgentVoteStatus;
  readonly reasoning?: string;
  readonly confidence: number;
  readonly timestamp: number;
}

export const AgentVoteSchema = z.object({
  agentId: z.string(),
  proposalId: z.string(),
  status: AgentVoteStatusSchema,
  reasoning: z.string().optional(),
  confidence: z.number().min(0).max(1),
  timestamp: z.number(),
});

/**
 * Quorum status for a round.
 */
export interface QuorumStatus {
  readonly required: number;
  readonly accepts: number;
  readonly rejects: number;
  readonly pending: number;
  readonly hasQuorum: boolean;
  readonly consensusReached: boolean;
}

export const QuorumStatusSchema = z.object({
  required: z.number().int().min(1),
  accepts: z.number().int().min(0),
  rejects: z.number().int().min(0),
  pending: z.number().int().min(0),
  hasQuorum: z.boolean(),
  consensusReached: z.boolean(),
});

/**
 * Round state in the Aegean protocol.
 */
export interface AegeanRound {
  readonly roundNumber: number;
  readonly phase: AegeanPhase;
  readonly leaderId: string;
  readonly proposal: Proposal | null;
  readonly votes: readonly AgentVote[];
  readonly quorumStatus: QuorumStatus;
  readonly startTime: number;
  readonly endTime?: number;
}

export const AegeanRoundSchema = z.object({
  roundNumber: z.number().int().min(0),
  phase: AegeanPhaseSchema,
  leaderId: z.string(),
  proposal: ProposalSchema.nullable(),
  votes: z.array(AgentVoteSchema).readonly(),
  quorumStatus: QuorumStatusSchema,
  startTime: z.number(),
  endTime: z.number().optional(),
});

/**
 * Result of the Aegean protocol execution.
 */
export interface AegeanResult {
  readonly consensusValue: unknown;
  readonly consensusReached: boolean;
  readonly totalRounds: number;
  readonly totalDurationMs: number;
  readonly tokensUsed: number;
  readonly rounds: readonly AegeanRound[];
  readonly terminationReason:
    | 'consensus'
    | 'max_rounds'
    | 'timeout'
    | 'byzantine_failure'
    | 'error';
}

export const AegeanResultSchema = z.object({
  consensusValue: z.unknown().nullable(),
  consensusReached: z.boolean(),
  totalRounds: z.number().int().min(0),
  totalDurationMs: z.number(),
  tokensUsed: z.number().int().min(0),
  rounds: z.array(AegeanRoundSchema).readonly(),
  terminationReason: z.enum(['consensus', 'max_rounds', 'timeout', 'byzantine_failure', 'error']),
});

/**
 * Configuration for the Aegean protocol.
 */
export interface AegeanConfig {
  readonly maxRounds: number;
  readonly roundTimeoutMs: number;
  readonly byzantineTolerance: number;
  readonly confidenceThreshold: number;
  readonly earlyTermination: boolean;
}

export const AegeanConfigSchema = z.object({
  maxRounds: z.number().int().min(1).max(10),
  roundTimeoutMs: z.number().int().min(1000).max(300000),
  byzantineTolerance: z.number().int().min(0),
  confidenceThreshold: z.number().min(0).max(1),
  earlyTermination: z.boolean(),
});

/** Default Aegean configuration. */
export const DEFAULT_AEGEAN_CONFIG: AegeanConfig = {
  maxRounds: 3,
  roundTimeoutMs: 60000,
  byzantineTolerance: 0,
  confidenceThreshold: 0.7,
  earlyTermination: true,
};

/**
 * Calculates the required quorum size for Byzantine fault tolerance.
 * For n agents tolerating f Byzantine faults: quorum = (n + f + 1) / 2
 */
export function calculateQuorumSize(totalAgents: number, byzantineTolerance: number): number {
  return Math.ceil((totalAgents + byzantineTolerance + 1) / 2);
}

/**
 * Checks if a quorum of accepts has been reached.
 */
export function hasAcceptQuorum(quorum: QuorumStatus): boolean {
  return quorum.accepts >= quorum.required;
}

/**
 * Checks if consensus is mathematically impossible (too many rejects).
 */
export function isConsensusFailed(quorum: QuorumStatus, totalAgents: number): boolean {
  return quorum.rejects > totalAgents - quorum.required;
}
