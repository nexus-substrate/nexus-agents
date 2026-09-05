/**
 * nexus-agents/consensus - Multi-Round Voting Protocol Types
 *
 * Multi-Round Voting Protocol Types (Issue #100)
 * Based on arXiv:2512.21352 - Multi-Agent Committees for Code Review
 */

import { z } from 'zod';
import type { Vote } from './types-core.js';
import { SUPERMAJORITY_THRESHOLD } from './types-core.js';
import { OPERATION_CLASSES } from '../config/timeouts.js';

/**
 * Default per-round voting timeout (#3734). A voting round guards a parallel
 * MULTI-LLM panel, so it derives from the central `multi-llm-panel` runaway-guard
 * (900s) — not the old accidental 60s, which killed legitimate slow voters.
 */
const VOTING_ROUND_DEFAULT_TIMEOUT_MS = OPERATION_CLASSES['multi-llm-panel'].guardMs;

/**
 * Voting round phases.
 * - analysis: Independent analysis (Round 1)
 * - deliberation: Share findings and discuss (Round 2)
 * - consensus: Final vote on recommendations (Round 3)
 */
export const VotingRoundPhaseSchema = z.enum(['analysis', 'deliberation', 'consensus']);
export type VotingRoundPhase = z.infer<typeof VotingRoundPhaseSchema>;

/**
 * Voting round status.
 */
export const VotingRoundStatusSchema = z.enum([
  'pending',
  'in_progress',
  'awaiting_votes',
  'completed',
  'aborted',
]);
export type VotingRoundStatus = z.infer<typeof VotingRoundStatusSchema>;

/**
 * A finding submitted by an agent during analysis.
 */
export const AgentFindingSchema = z.object({
  agentId: z.string(),
  category: z.enum(['bug', 'security', 'performance', 'style', 'design', 'documentation', 'other']),
  severity: z.enum(['critical', 'major', 'minor', 'suggestion']),
  description: z.string().min(1),
  location: z.string().optional().describe('File path and line range if applicable'),
  suggestion: z.string().optional().describe('Recommended fix'),
  confidence: z.number().min(0).max(1),
  timestamp: z.iso.datetime().optional(),
});
export type AgentFinding = z.infer<typeof AgentFindingSchema>;

/**
 * Finding vote during deliberation.
 */
export const FindingVoteSchema = z.object({
  agentId: z.string(),
  findingId: z.string(),
  agree: z.boolean(),
  reasoning: z.string().optional(),
  amendedSeverity: z.enum(['critical', 'major', 'minor', 'suggestion']).optional(),
});
export type FindingVote = z.infer<typeof FindingVoteSchema>;

/**
 * A single voting round in the protocol.
 */
export interface VotingRound {
  id: string;
  phase: VotingRoundPhase;
  status: VotingRoundStatus;
  findings: Map<string, AgentFinding>; // findingId -> finding
  findingVotes: Map<string, FindingVote[]>; // findingId -> votes
  finalVotes: Map<string, Vote>; // agentId -> final vote
  startedAt: string;
  completedAt?: string;
  roundNumber: number;
}

/**
 * Configuration for the voting protocol.
 */
export interface VotingProtocolConfig {
  /** Number of agents in the committee (default: 3) */
  committeeSize: number;
  /** Maximum rounds before forcing decision (default: 3) */
  maxRounds: number;
  /** Timeout per round in milliseconds (default: multi-llm-panel guard, 900000) */
  roundTimeoutMs: number;
  /** Minimum agreement threshold (default: 2/3, approximately 0.667) */
  agreementThreshold: number;
  /** Enable anti-sycophancy detection (default: true) */
  enableAntiSycophancy: boolean;
  /** Similarity threshold for sycophancy detection (default: 0.8) */
  sycophancyThreshold: number;
}

export const VotingProtocolConfigSchema = z.object({
  committeeSize: z.number().int().min(2).max(7).default(3),
  maxRounds: z.number().int().min(1).max(5).default(3),
  roundTimeoutMs: z.number().int().positive().default(VOTING_ROUND_DEFAULT_TIMEOUT_MS),
  agreementThreshold: z.number().min(0.5).max(1).default(SUPERMAJORITY_THRESHOLD),
  enableAntiSycophancy: z.boolean().default(true),
  sycophancyThreshold: z.number().min(0).max(1).default(0.8),
});

export const DEFAULT_VOTING_PROTOCOL_CONFIG: VotingProtocolConfig = {
  committeeSize: 3,
  maxRounds: 3,
  roundTimeoutMs: VOTING_ROUND_DEFAULT_TIMEOUT_MS,
  // Default agreement level IS the supermajority (2/3) — single source (#3571).
  agreementThreshold: SUPERMAJORITY_THRESHOLD,
  enableAntiSycophancy: true,
  sycophancyThreshold: 0.8,
};

/**
 * Session state for a voting protocol instance.
 */
export interface VotingSession {
  id: string;
  topic: string;
  committee: string[]; // Agent IDs
  rounds: VotingRound[];
  currentRound: number;
  config: VotingProtocolConfig;
  status: 'active' | 'completed' | 'aborted';
  createdAt: string;
  completedAt?: string;
  finalResult?: VotingProtocolResult;
}

/**
 * Final result of a voting protocol session.
 */
export interface VotingProtocolResult {
  sessionId: string;
  topic: string;
  outcome: 'approved' | 'rejected' | 'needs_revision' | 'no_consensus';
  consolidatedFindings: ConsolidatedFinding[];
  roundSummaries: RoundSummary[];
  agreementScore: number;
  sycophancyDetected: boolean;
  totalDurationMs: number;
  participatingAgents: string[];
}

/**
 * A consolidated finding after deliberation.
 */
export interface ConsolidatedFinding {
  id: string;
  category: AgentFinding['category'];
  severity: AgentFinding['severity'];
  description: string;
  location?: string;
  suggestion?: string;
  supportingAgents: string[];
  agreementRatio: number;
  originalFindings: AgentFinding[];
}

/**
 * Summary of a single round.
 */
export interface RoundSummary {
  roundNumber: number;
  phase: VotingRoundPhase;
  findingsCount: number;
  votesCount: number;
  agreementScore: number;
  durationMs: number;
}

/**
 * Interface for the multi-round voting protocol.
 * (Source: Issue #100, arXiv:2512.21352)
 */
export interface IVotingProtocol {
  /** Create a new voting session with a committee */
  createSession(
    topic: string,
    committee: string[],
    config?: Partial<VotingProtocolConfig>
  ): VotingSession;

  /** Start the analysis round (Round 1) */
  startAnalysisRound(sessionId: string): Promise<VotingRound>;

  /** Submit findings from an agent during analysis */
  submitFindings(sessionId: string, agentId: string, findings: AgentFinding[]): Promise<void>;

  /** Start the deliberation round (Round 2) */
  startDeliberationRound(sessionId: string): Promise<VotingRound>;

  /** Vote on findings during deliberation */
  voteOnFinding(sessionId: string, vote: FindingVote): Promise<void>;

  /** Start the consensus round (Round 3) */
  startConsensusRound(sessionId: string): Promise<VotingRound>;

  /** Submit final vote during consensus */
  submitFinalVote(sessionId: string, agentId: string, vote: Vote): Promise<void>;

  /** Get the final result (closes session if complete) */
  getResult(sessionId: string): Promise<VotingProtocolResult | null>;

  /** Check for sycophancy in the current round */
  detectSycophancy(sessionId: string): SycophancyReport;

  /** Get the current session state */
  getSession(sessionId: string): VotingSession | undefined;
}

/**
 * Report from sycophancy detection.
 */
export interface SycophancyReport {
  detected: boolean;
  confidenceScore: number;
  indicators: SycophancyIndicator[];
  affectedAgents: string[];
  recommendation: string;
}

/**
 * Individual sycophancy indicator.
 */
export interface SycophancyIndicator {
  type: 'premature_consensus' | 'opinion_convergence' | 'confidence_inflation' | 'echo_chamber';
  description: string;
  severity: 'low' | 'medium' | 'high';
  agents: string[];
}
