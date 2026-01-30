/**
 * Aegean Protocol Utility Functions
 * (Source: Issue #272 - File splitting for 400-line limit compliance)
 *
 * Pure helper functions extracted from aegean-helpers.ts.
 * Contains vote parsing, vote creation, task building, and quorum evaluation.
 */

import type { AgentVote, Proposal } from './aegean-types.js';
import { calculateQuorumSize } from './aegean-types.js';
import type { Task } from '../../core/index.js';
import { getTimeProvider } from '../../core/index.js';

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
    timestamp: getTimeProvider().now(),
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
    timestamp: getTimeProvider().now(),
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
      timestamp: getTimeProvider().now(),
    },
    tokensUsed,
  };
}

// =============================================================================
// Task Building
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
    proposalId: `proposal-${String(round)}-${String(getTimeProvider().now())}`,
    round,
    leaderId,
    value: output,
    timestamp: getTimeProvider().now(),
  };
}

/** Creates a vote task for an agent. */
export function createVoteTask(proposal: Proposal, agentId: string): Task {
  return {
    id: `vote-${proposal.proposalId}-${agentId}`,
    description: `Review the following proposal and vote ACCEPT or REJECT.\n\nProposal:\n${JSON.stringify(proposal.value, null, 2)}`,
    context: { metadata: { proposal } },
  };
}

// =============================================================================
// Leader Selection
// =============================================================================

/** Selects leader for a round using round-robin. */
export function selectLeader(experts: readonly string[], round: number): string {
  const expertList = experts as string[];
  return expertList[round % expertList.length] as string;
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
