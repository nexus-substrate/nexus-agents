/**
 * Aegean Protocol Helpers
 * (Source: Issue #216, Sprint #219)
 *
 * Pure helper functions extracted from aegean-protocol.ts to reduce file length.
 */

import type { IAgent, Task } from '../../core/types/index.js';
import type {
  AgentVote,
  AegeanRound,
  AegeanResult,
  AegeanConfig,
  Proposal,
  QuorumStatus,
} from './aegean-types.js';
import { calculateQuorumSize, AegeanConfigSchema, DEFAULT_AEGEAN_CONFIG } from './aegean-types.js';

// =============================================================================
// Types
// =============================================================================

/** Options for vote collection. */
export interface CollectVotesOptions {
  readonly experts: readonly string[];
  readonly agents: Map<string, IAgent>;
  readonly proposal: Proposal;
  readonly leaderId: string;
  readonly roundNumber: number;
  readonly sessionId: string;
}

/** Options for creating Aegean protocol. */
export interface AegeanProtocolBuildOptions {
  readonly aegeanConfig?: Partial<AegeanConfig>;
}

// =============================================================================
// Config Building
// =============================================================================

/** Builds and validates Aegean configuration. */
export function buildAegeanConfig(options: AegeanProtocolBuildOptions): AegeanConfig {
  const merged = { ...DEFAULT_AEGEAN_CONFIG, ...options.aegeanConfig };
  const parsed = AegeanConfigSchema.safeParse(merged);
  if (!parsed.success) {
    throw new Error(`Invalid Aegean config: ${parsed.error.message}`);
  }
  return parsed.data;
}

// =============================================================================
// Proposal Building
// =============================================================================

/** Creates a proposal task for the leader. */
export function createProposalTask(task: Task, round: number): Task {
  return {
    ...task,
    id: `${task.id}-proposal-${String(round)}`,
    description: `${task.description}\n\nAs the leader for round ${String(round + 1)}, propose a solution.`,
  };
}

/** Creates a proposal from leader output. */
export function createProposal(round: number, leaderId: string, output: unknown): Proposal {
  return {
    proposalId: `proposal-${String(round)}-${String(Date.now())}`,
    round,
    leaderId,
    value: output,
    timestamp: Date.now(),
  };
}

// =============================================================================
// Task Building
// =============================================================================

/** Creates a vote task for an agent. */
export function createVoteTask(proposal: Proposal, agentId: string): Task {
  return {
    id: `vote-${proposal.proposalId}-${agentId}`,
    description: `Review the following proposal and vote ACCEPT or REJECT.\n\nProposal:\n${JSON.stringify(proposal.value, null, 2)}`,
    context: { metadata: { proposal } },
  };
}

/** Creates a vote from agent output. */
export function createVoteFromOutput(
  agentId: string,
  proposalId: string,
  output: unknown,
  tokensUsed: number
): { vote: AgentVote; tokensUsed: number } {
  const { status, confidence } = parseVoteStatus(output);
  return {
    vote: {
      agentId,
      proposalId,
      status,
      reasoning: extractReasoning(output),
      confidence,
      timestamp: Date.now(),
    },
    tokensUsed,
  };
}

// =============================================================================
// Vote Parsing
// =============================================================================

/** Patterns for detecting accept/reject in vote responses. */
const ACCEPT_PATTERN = /accept|approve|agree|yes/i;
const REJECT_PATTERN = /reject|disapprove|disagree|no/i;

/** Parses agent output to determine vote status. */
export function parseVoteStatus(output: unknown): {
  status: AgentVote['status'];
  confidence: number;
} {
  const outputStr = typeof output === 'string' ? output : JSON.stringify(output);
  const isAccept = ACCEPT_PATTERN.test(outputStr);
  const isReject = REJECT_PATTERN.test(outputStr);

  return {
    status: isAccept ? 'accept' : isReject ? 'reject' : 'pending',
    confidence: isAccept || isReject ? 0.8 : 0.5,
  };
}

/** Extracts reasoning from output, truncating to max length. */
export function extractReasoning(output: unknown, maxLength = 500): string {
  const outputStr = typeof output === 'string' ? output : JSON.stringify(output);
  return outputStr.slice(0, maxLength);
}

// =============================================================================
// Vote Creation
// =============================================================================

/** Creates a timeout vote for an unresponsive agent. */
export function createTimeoutVote(agentId: string, proposalId: string): AgentVote {
  return {
    agentId,
    proposalId,
    status: 'timeout',
    reasoning: 'Agent did not respond in time',
    confidence: 0,
    timestamp: Date.now(),
  };
}

/** Creates a leader self-vote (implicit accept). */
export function createLeaderVote(leaderId: string, proposalId: string): AgentVote {
  return {
    agentId: leaderId,
    proposalId,
    status: 'accept',
    reasoning: 'Leader accepts own proposal',
    confidence: 1.0,
    timestamp: Date.now(),
  };
}

// =============================================================================
// Quorum Evaluation
// =============================================================================

/** Options for evaluating quorum. */
export interface EvaluateQuorumOptions {
  readonly votes: readonly AgentVote[];
  readonly totalAgents: number;
  readonly byzantineTolerance: number;
}

/** Evaluates quorum status from votes. */
export function evaluateQuorumStatus(opts: EvaluateQuorumOptions): {
  required: number;
  accepts: number;
  rejects: number;
  pending: number;
  hasQuorum: boolean;
  consensusReached: boolean;
} {
  const required = calculateQuorumSize(opts.totalAgents, opts.byzantineTolerance);
  const accepts = opts.votes.filter((v) => v.status === 'accept').length;
  const rejects = opts.votes.filter((v) => v.status === 'reject').length;
  const pending = opts.votes.filter((v) => v.status === 'pending' || v.status === 'timeout').length;
  const hasQuorum = accepts >= required;

  return { required, accepts, rejects, pending, hasQuorum, consensusReached: hasQuorum };
}

// =============================================================================
// Result Building
// =============================================================================

/** Options for building Aegean result. */
export interface BuildResultOptions {
  readonly rounds: readonly AegeanRound[];
  readonly consensusValue: unknown;
  readonly terminationReason: AegeanResult['terminationReason'];
  readonly startTime: number;
  readonly tokensUsed: number;
}

/** Builds the final Aegean result. */
export function buildAegeanResult(opts: BuildResultOptions): AegeanResult {
  return {
    consensusValue: opts.consensusValue,
    consensusReached: opts.terminationReason === 'consensus',
    totalRounds: opts.rounds.length,
    totalDurationMs: Date.now() - opts.startTime,
    tokensUsed: opts.tokensUsed,
    rounds: opts.rounds,
    terminationReason: opts.terminationReason,
  };
}

// =============================================================================
// Round Helpers
// =============================================================================

/** Selects leader for a round using round-robin. */
export function selectLeader(experts: readonly string[], round: number): string {
  const expertList = experts as string[];
  return expertList[round % expertList.length] as string;
}

/** Options for creating round data. */
export interface CreateRoundDataOptions {
  readonly roundNumber: number;
  readonly leaderId: string;
  readonly proposal: Proposal;
  readonly votes: AgentVote[];
  readonly quorumStatus: QuorumStatus;
  readonly startTime: number;
}

/** Creates round data object. */
export function createRoundData(opts: CreateRoundDataOptions): AegeanRound {
  return {
    roundNumber: opts.roundNumber,
    phase: opts.quorumStatus.consensusReached ? 'done' : 'voting',
    leaderId: opts.leaderId,
    proposal: opts.proposal,
    votes: opts.votes,
    quorumStatus: opts.quorumStatus,
    startTime: opts.startTime,
    endTime: Date.now(),
  };
}

// =============================================================================
// Consensus Loop Helpers
// =============================================================================

/** Result of a consensus loop iteration. */
export type IterationAction =
  | { type: 'continue' }
  | { type: 'consensus'; value: unknown }
  | { type: 'early_termination' }
  | { type: 'cancelled' };

/** Options for determining iteration action. */
export interface DetermineIterationActionOptions {
  readonly cancelled: boolean;
  readonly consensusReached: boolean;
  readonly consensusValue: unknown;
  readonly earlyTerminationEnabled: boolean;
  readonly shouldEarlyTerminate: boolean;
}

/** Determines the action to take after a consensus round. */
export function determineIterationAction(opts: DetermineIterationActionOptions): IterationAction {
  if (opts.cancelled) return { type: 'cancelled' };
  if (opts.consensusReached) return { type: 'consensus', value: opts.consensusValue };
  if (opts.earlyTerminationEnabled && opts.shouldEarlyTerminate)
    return { type: 'early_termination' };
  return { type: 'continue' };
}
