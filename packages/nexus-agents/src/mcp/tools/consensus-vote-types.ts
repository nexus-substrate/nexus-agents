/**
 * Types, schemas, and response helpers for the consensus_vote MCP tool.
 * Extracted from consensus-vote.ts for file size compliance (Issue #708).
 *
 * @module mcp/tools/consensus-vote-types
 */

import { z } from 'zod';
import type { AgentVoteResult, VotingResult } from '../../cli/vote-types.js';
import { VOTER_ROLES } from '../../cli/vote-types.js';
import type { HigherOrderVotingResult } from '../../consensus/higher-order-types.js';

/** Maximum proposal length (memory bounds per Issue #435). */
export const MAX_PROPOSAL_LENGTH = 4000;

// ============================================================================
// Strategy Types
// ============================================================================

/**
 * Available consensus voting strategies.
 *
 * - `simple_majority`: Standard majority voting (>50%)
 * - `supermajority`: Requires >=67% approval
 * - `unanimous`: Requires 100% approval
 * - `proof_of_learning`: Weighted by agent performance (Issue #103)
 * - `higher_order`: Bayesian-optimal with correlation awareness (Issue #514)
 * - `opinion_wise`: Alias for higher_order (Issue #333)
 */
export type VotingStrategy =
  | 'simple_majority'
  | 'supermajority'
  | 'unanimous'
  | 'proof_of_learning'
  | 'higher_order'
  | 'opinion_wise';

export const VotingStrategySchema = z.enum([
  'simple_majority',
  'supermajority',
  'unanimous',
  'proof_of_learning',
  'higher_order',
  'opinion_wise',
]);

// ============================================================================
// Input / Output Schemas
// ============================================================================

export const ConsensusVoteInputSchema = z.object({
  proposal: z.string().min(1).max(MAX_PROPOSAL_LENGTH).describe('Proposal text to vote on'),
  threshold: z
    .enum(['majority', 'supermajority', 'unanimous'])
    .optional()
    .describe(
      'Voting threshold (legacy): majority, supermajority, unanimous. Use strategy instead.'
    ),
  strategy: VotingStrategySchema.optional().describe(
    'Voting strategy: simple_majority (default), supermajority, unanimous, proof_of_learning, or higher_order (Bayesian-optimal)'
  ),
  quickMode: z
    .boolean()
    .optional()
    .default(false)
    .describe('Use 3 agents instead of 5 for faster execution'),
  simulateVotes: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'TESTS ONLY — when true, voters return random decisions. Output must not be used for real decisions. (#2319)'
    ),
});

export type ConsensusVoteInput = z.infer<typeof ConsensusVoteInputSchema>;

// ============================================================================
// Response Types
// ============================================================================

export interface AgentVoteSummary {
  role: string;
  decision: 'approve' | 'reject' | 'abstain';
  confidence: number;
  reasoning: string;
  simulated: boolean;
  /** True when this vote was generated from an error (Issue #815). */
  error: boolean;
  /** Model used for this agent's vote (Issue #817). */
  modelUsed?: string;
  /** Structured rejection categories for reject→refine→re-vote loops (Issue #1213). */
  rejectionCategories?: readonly string[];
}

export type VoteDecisionStatus = 'approved' | 'rejected' | 'pending' | 'timeout' | 'no_quorum';

/** Higher-Order Voting metadata (Issue #514). */
export interface HigherOrderMetadata {
  posteriorApproval: number;
  posteriorRejection: number;
  effectiveVoteCount: number;
  method: 'ow' | 'isp' | 'simple';
  usedCorrelationData: boolean;
  improvementOverBaseline: number;
  downweightedAgents: readonly string[];
  reasoning: string;
}

export interface ConsensusVoteResponse {
  proposal: string;
  threshold?: 'majority' | 'supermajority' | 'unanimous';
  strategy: VotingStrategy;
  decision: VoteDecisionStatus;
  approvalPercentage: number;
  voteCounts: { approve: number; reject: number; abstain: number; error: number };
  votes: AgentVoteSummary[];
  durationMs: number;
  simulateVotes: boolean;
  higherOrderMetadata?: HigherOrderMetadata;
}

/** Extended voting result with optional Higher-Order metadata. */
export interface ExtendedVotingResult extends VotingResult {
  strategy: VotingStrategy;
  higherOrderResult?: HigherOrderVotingResult;
}

// ============================================================================
// Helper Functions
// ============================================================================

/** Converts AgentVoteResult to AgentVoteSummary for response. */
export function toAgentVoteSummary(result: AgentVoteResult): AgentVoteSummary {
  const roleName = VOTER_ROLES[result.role].split(' - ')[0] ?? result.role;
  return {
    role: roleName,
    decision: result.vote.decision,
    confidence: result.vote.confidence,
    reasoning: result.vote.reasoning,
    simulated: result.source === 'simulation',
    error: result.source === 'error',
    ...(result.vote.rejectionCategories !== undefined
      ? { rejectionCategories: result.vote.rejectionCategories }
      : {}),
  };
}

/** Maps ProposalStatus to VoteDecisionStatus. */
export function mapOutcomeToDecision(outcome: string): VoteDecisionStatus {
  switch (outcome) {
    case 'approved':
      return 'approved';
    case 'rejected':
      return 'rejected';
    case 'timeout':
      return 'timeout';
    default:
      return 'pending';
  }
}

/** Builds the response from voting result. */
export function buildResponse(
  input: ConsensusVoteInput,
  result: ExtendedVotingResult
): ConsensusVoteResponse {
  const proposalTruncated =
    input.proposal.length > 200 ? input.proposal.slice(0, 200) + '...' : input.proposal;

  const errorCount = result.votes.filter((v) => v.source === 'error').length;

  const allErrors = errorCount === result.votes.length && errorCount > 0;
  const decision: VoteDecisionStatus =
    !result.result.quorumReached && allErrors
      ? 'no_quorum'
      : mapOutcomeToDecision(result.result.outcome);

  const response: ConsensusVoteResponse = {
    proposal: proposalTruncated,
    strategy: result.strategy,
    decision,
    approvalPercentage: result.result.approvalPercentage,
    voteCounts: {
      approve: result.result.voteCounts.approve,
      reject: result.result.voteCounts.reject,
      abstain: result.result.voteCounts.abstain,
      error: errorCount,
    },
    votes: result.votes.map(toAgentVoteSummary),
    durationMs: result.totalTimeMs,
    simulateVotes: result.simulateVotes,
  };

  if (input.threshold !== undefined) {
    response.threshold = input.threshold;
  }

  if (result.strategy === 'higher_order' && result.higherOrderResult) {
    response.higherOrderMetadata = {
      posteriorApproval: result.higherOrderResult.posteriorApproval,
      posteriorRejection: result.higherOrderResult.posteriorRejection,
      effectiveVoteCount: result.higherOrderResult.effectiveVoteCount,
      method: result.higherOrderResult.method,
      usedCorrelationData: result.higherOrderResult.usedCorrelationData,
      improvementOverBaseline: result.higherOrderResult.improvementOverBaseline,
      downweightedAgents: result.higherOrderResult.downweightedAgents,
      reasoning: result.higherOrderResult.reasoning,
    };
  }

  return response;
}
