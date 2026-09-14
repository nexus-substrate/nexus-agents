/**
 * nexus-agents/consensus - Result Builder
 *
 * Helper functions for building consensus results.
 */

import { getTimeProvider } from '../core/index.js';
import type { ProposalId, ProposalState, ConsensusResult, ConsensusEngineConfig } from './types.js';
import type { VotingOutcome } from './strategies.js';
import { determineFinalStatus } from './decision/verdict.js';

/**
 * `determineFinalStatus` moved to `decision/verdict.ts` (#6000 step 1) so the
 * quorum + approval → outcome step can be governed on its own path.
 * Re-exported here so every existing import keeps resolving.
 */
export { determineFinalStatus } from './decision/verdict.js';

/**
 * Build a pending result for an active proposal.
 */
export function buildPendingResult(
  state: ProposalState,
  proposalId: ProposalId,
  outcome: VotingOutcome,
  config: ConsensusEngineConfig
): ConsensusResult {
  const now = new Date(getTimeProvider().now());
  return {
    proposalId,
    proposal: state.proposal,
    outcome: state.status === 'voting' ? 'pending' : state.status,
    votes: new Map(state.votes),
    voteCounts: outcome.voteCounts,
    weightedCounts: outcome.weightedCounts,
    weightBasis: outcome.weightBasis,
    approvalPercentage: outcome.approvalPercentage,
    quorumReached: state.votes.size >= config.minVotersForQuorum,
    startedAt: state.startedAt.toISOString(),
    closedAt: now.toISOString(),
    durationMs: now.getTime() - state.startedAt.getTime(),
  };
}

/**
 * Build a final result for a closed proposal.
 */
export function buildFinalResult(
  state: ProposalState,
  proposalId: ProposalId,
  outcome: VotingOutcome,
  config: ConsensusEngineConfig
): ConsensusResult {
  const now = new Date(getTimeProvider().now());
  const quorumReached = state.votes.size >= config.minVotersForQuorum;
  const finalStatus = determineFinalStatus(quorumReached, outcome.approved);

  return {
    proposalId,
    proposal: state.proposal,
    outcome: finalStatus,
    votes: new Map(state.votes),
    voteCounts: outcome.voteCounts,
    weightedCounts: outcome.weightedCounts,
    weightBasis: outcome.weightBasis,
    approvalPercentage: outcome.approvalPercentage,
    quorumReached,
    startedAt: state.startedAt.toISOString(),
    closedAt: now.toISOString(),
    durationMs: now.getTime() - state.startedAt.getTime(),
  };
}

/**
 * Build a timeout result for an expired proposal.
 */
export function buildTimeoutResult(
  state: ProposalState,
  proposalId: ProposalId,
  outcome: VotingOutcome,
  config: ConsensusEngineConfig
): ConsensusResult {
  const now = new Date(getTimeProvider().now());
  return {
    proposalId,
    proposal: state.proposal,
    outcome: 'timeout',
    votes: new Map(state.votes),
    voteCounts: outcome.voteCounts,
    weightedCounts: outcome.weightedCounts,
    weightBasis: outcome.weightBasis,
    approvalPercentage: outcome.approvalPercentage,
    quorumReached: state.votes.size >= config.minVotersForQuorum,
    startedAt: state.startedAt.toISOString(),
    closedAt: now.toISOString(),
    durationMs: now.getTime() - state.startedAt.getTime(),
  };
}
