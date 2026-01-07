/**
 * nexus-agents/consensus - Type Definitions
 *
 * Type definitions and Zod schemas for the consensus engine.
 * Supports multiple voting strategies for multi-agent decisions.
 */

import { z } from 'zod';

/**
 * Consensus algorithm types.
 * - simple_majority: >50% of votes required
 * - supermajority: >=67% of votes required
 * - unanimous: 100% approval required
 * - proof_of_learning: weighted voting based on agent performance
 */
export const ConsensusAlgorithmSchema = z.enum([
  'simple_majority',
  'supermajority',
  'unanimous',
  'proof_of_learning',
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
 * Consensus engine configuration.
 */
export interface ConsensusEngineConfig {
  defaultTimeout: number;
  minVotersForQuorum: number;
  maxActiveProposals: number;
  enablePerformanceTracking: boolean;
}

/**
 * Consensus engine configuration schema.
 */
export const ConsensusEngineConfigSchema = z.object({
  defaultTimeout: z.number().int().positive().default(300000), // 5 minutes
  minVotersForQuorum: z.number().int().positive().default(2),
  maxActiveProposals: z.number().int().positive().default(100),
  enablePerformanceTracking: z.boolean().default(true),
});

/**
 * Default configuration values.
 */
export const DEFAULT_CONSENSUS_CONFIG: ConsensusEngineConfig = {
  defaultTimeout: 300000, // 5 minutes
  minVotersForQuorum: 2,
  maxActiveProposals: 100,
  enablePerformanceTracking: true,
};

/**
 * Voting thresholds for each algorithm.
 */
export const VOTING_THRESHOLDS: Record<ConsensusAlgorithm, number> = {
  simple_majority: 0.5,
  supermajority: 0.67,
  unanimous: 1.0,
  proof_of_learning: 0.5, // Uses weighted voting
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

// ============================================================================
// Multi-Round Voting Protocol Types (Issue #100)
// Based on arXiv:2512.21352 - Multi-Agent Committees for Code Review
// ============================================================================

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
  timestamp: z.string().datetime().optional(),
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
  /** Timeout per round in milliseconds (default: 60000) */
  roundTimeoutMs: number;
  /** Minimum agreement threshold (default: 0.67) */
  agreementThreshold: number;
  /** Enable anti-sycophancy detection (default: true) */
  enableAntiSycophancy: boolean;
  /** Similarity threshold for sycophancy detection (default: 0.8) */
  sycophancyThreshold: number;
}

export const VotingProtocolConfigSchema = z.object({
  committeeSize: z.number().int().min(2).max(7).default(3),
  maxRounds: z.number().int().min(1).max(5).default(3),
  roundTimeoutMs: z.number().int().positive().default(60000),
  agreementThreshold: z.number().min(0.5).max(1).default(0.67),
  enableAntiSycophancy: z.boolean().default(true),
  sycophancyThreshold: z.number().min(0).max(1).default(0.8),
});

export const DEFAULT_VOTING_PROTOCOL_CONFIG: VotingProtocolConfig = {
  committeeSize: 3,
  maxRounds: 3,
  roundTimeoutMs: 60000,
  agreementThreshold: 0.67,
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
