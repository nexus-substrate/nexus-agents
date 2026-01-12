/**
 * Aegean Protocol Helpers
 * (Source: Issue #216, Sprint #219)
 *
 * Pure helper functions extracted from aegean-protocol.ts to reduce file length.
 */

import type { AgentVote, AegeanRound, AegeanResult } from './aegean-types.js';

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
