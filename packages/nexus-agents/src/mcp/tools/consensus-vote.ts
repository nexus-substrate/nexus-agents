/**
 * nexus-agents/mcp - Consensus Vote Tool
 *
 * MCP tool for multi-model consensus voting on proposals.
 * Wraps the CLI vote command functionality for MCP clients.
 *
 * @module mcp/tools/consensus-vote
 * (Source: Issue #435 - Add consensus_vote tool for multi-model voting)
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ILogger } from '../../core/index.js';
import { createLogger } from '../../core/index.js';
import type { RateLimiter } from '../middleware/rate-limiter.js';
import type { SecurityConfig } from '../../config/schemas.js';
import { wrapToolWithTimeout } from '../middleware/tool-wrapper.js';
import type { ConsensusAlgorithm } from '../../consensus/types.js';
import type { VoterRole, VotingResult, AgentVoteResult } from '../../cli/vote-types.js';
import { THRESHOLD_MAP, VOTER_ROLES } from '../../cli/vote-types.js';
import { collectRealVotes } from '../../cli/voter-agents.js';
import { createConsensusEngine } from '../../consensus/engine.js';
import type { Proposal } from '../../consensus/types.js';

/**
 * Maximum proposal length (memory bounds per Issue #435).
 */
const MAX_PROPOSAL_LENGTH = 4000;

/**
 * Input schema for consensus_vote tool.
 */
export const ConsensusVoteInputSchema = z.object({
  proposal: z.string().min(1).max(MAX_PROPOSAL_LENGTH).describe('Proposal text to vote on'),
  threshold: z
    .enum(['majority', 'supermajority', 'unanimous'])
    .optional()
    .default('majority')
    .describe('Voting threshold: majority (>50%), supermajority (>=67%), unanimous (100%)'),
  quickMode: z
    .boolean()
    .optional()
    .default(false)
    .describe('Use 3 agents instead of 5 for faster execution'),
  dryRun: z.boolean().optional().default(false).describe('Simulate without actual LLM execution'),
});

/**
 * Type for validated consensus vote input.
 */
export type ConsensusVoteInput = z.infer<typeof ConsensusVoteInputSchema>;

/**
 * Dependencies for consensus_vote tool.
 */
export interface ConsensusVoteDeps {
  /** Optional logger */
  logger?: ILogger;
  /** Rate limiter for throttling tool calls (required) */
  rateLimiter: RateLimiter;
  /** Security configuration (includes timeout settings) */
  security?: SecurityConfig | undefined;
}

/**
 * Vote result from a single agent.
 */
export interface AgentVoteSummary {
  /** Agent role */
  role: string;
  /** Vote decision */
  decision: 'approve' | 'reject' | 'abstain';
  /** Confidence score (0-1) */
  confidence: number;
  /** Reasoning for the vote */
  reasoning: string;
  /** Whether the vote was simulated */
  simulated: boolean;
}

/**
 * Final decision status for the response.
 * Maps ProposalStatus to a simpler set of outcomes.
 */
export type VoteDecisionStatus = 'approved' | 'rejected' | 'pending' | 'timeout';

/**
 * Response from consensus_vote tool.
 */
export interface ConsensusVoteResponse {
  /** Proposal that was voted on (truncated if long) */
  proposal: string;
  /** Voting threshold used */
  threshold: 'majority' | 'supermajority' | 'unanimous';
  /** Final decision */
  decision: VoteDecisionStatus;
  /** Approval percentage */
  approvalPercentage: number;
  /** Vote breakdown */
  voteCounts: {
    approve: number;
    reject: number;
    abstain: number;
  };
  /** Individual agent votes */
  votes: AgentVoteSummary[];
  /** Execution duration in milliseconds */
  durationMs: number;
  /** Whether this was a dry run */
  dryRun: boolean;
}

/**
 * Maps threshold input to consensus algorithm.
 */
function mapThreshold(threshold: 'majority' | 'supermajority' | 'unanimous'): ConsensusAlgorithm {
  return THRESHOLD_MAP[threshold] ?? 'simple_majority';
}

/**
 * Gets voter roles based on quick mode setting.
 */
function getVoterRoles(quickMode: boolean): readonly VoterRole[] {
  return quickMode
    ? ['architect', 'security', 'pm']
    : ['architect', 'security', 'devex', 'ai_ml', 'pm'];
}

/**
 * Converts AgentVoteResult to AgentVoteSummary for response.
 */
function toAgentVoteSummary(result: AgentVoteResult): AgentVoteSummary {
  const roleName = VOTER_ROLES[result.role].split(' - ')[0] ?? result.role;
  return {
    role: roleName,
    decision: result.vote.decision,
    confidence: result.vote.confidence,
    reasoning: result.vote.reasoning,
    simulated: result.source === 'simulation',
  };
}

/**
 * Maps ProposalStatus to VoteDecisionStatus for response.
 * 'voting' and 'closed' are mapped to 'pending' for simplicity.
 */
function mapOutcomeToDecision(outcome: string): VoteDecisionStatus {
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

/**
 * Builds the response from voting result.
 */
function buildResponse(input: ConsensusVoteInput, result: VotingResult): ConsensusVoteResponse {
  const proposalTruncated =
    input.proposal.length > 200 ? input.proposal.slice(0, 200) + '...' : input.proposal;

  return {
    proposal: proposalTruncated,
    threshold: input.threshold,
    decision: mapOutcomeToDecision(result.result.outcome),
    approvalPercentage: result.result.approvalPercentage,
    voteCounts: {
      approve: result.result.voteCounts.approve,
      reject: result.result.voteCounts.reject,
      abstain: result.result.voteCounts.abstain,
    },
    votes: result.votes.map(toAgentVoteSummary),
    durationMs: result.totalTimeMs,
    dryRun: result.dryRun,
  };
}

/**
 * Executes the consensus voting process.
 */
async function executeVoting(input: ConsensusVoteInput, logger: ILogger): Promise<VotingResult> {
  const threshold = mapThreshold(input.threshold);
  const roles = getVoterRoles(input.quickMode);
  const startTime = Date.now();

  logger.info('Starting consensus vote', {
    threshold,
    roleCount: roles.length,
    dryRun: input.dryRun,
  });

  // Collect votes from agents
  const votes = await collectRealVotes({
    roles,
    proposal: input.proposal,
    simulate: input.dryRun,
  });

  // Create proposal and process votes through consensus engine
  const engine = createConsensusEngine();
  const proposal: Proposal = {
    title: 'MCP Consensus Vote',
    description: input.proposal,
    algorithm: threshold,
  };

  const proposalResult = await engine.propose(proposal);
  if (!proposalResult.ok) {
    throw new Error(`Failed to create proposal: ${proposalResult.error.message}`);
  }

  const proposalId = proposalResult.value;
  for (const { role, vote } of votes) {
    await engine.vote(proposalId, role, vote);
  }

  const resultRes = await engine.close(proposalId);
  if (!resultRes.ok) {
    throw new Error(`Failed to close proposal: ${resultRes.error.message}`);
  }

  const totalTimeMs = Date.now() - startTime;
  logger.info('Consensus vote completed', {
    outcome: resultRes.value.outcome,
    approvalPercentage: resultRes.value.approvalPercentage,
    durationMs: totalTimeMs,
  });

  return {
    proposal: input.proposal,
    threshold,
    result: resultRes.value,
    votes,
    totalTimeMs,
    dryRun: input.dryRun,
  };
}

/**
 * Handles the consensus_vote tool execution.
 */
async function handleConsensusVote(
  deps: ConsensusVoteDeps,
  args: ConsensusVoteInput
): Promise<{ ok: true; value: ConsensusVoteResponse } | { ok: false; error: string }> {
  const logger = deps.logger ?? createLogger({ tool: 'consensus_vote' });

  try {
    const result = await executeVoting(args, logger);
    return { ok: true, value: buildResponse(args, result) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const cause = error instanceof Error ? error : new Error(message);
    logger.error('Consensus vote failed', cause);
    return { ok: false, error: `Voting failed: ${message}` };
  }
}

/** MCP tool response type for consensus_vote */
type ConsensusVoteToolResponse = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

/**
 * Creates a handler function for the consensus_vote tool.
 */
function createToolHandler(deps: ConsensusVoteDeps) {
  return async (args: unknown): Promise<ConsensusVoteToolResponse> => {
    // Rate limiting check
    const acquired = deps.rateLimiter.tryAcquire();
    if (!acquired) {
      const state = deps.rateLimiter.getState();
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Rate limit exceeded. Try again in ${String(state.nextTokenMs)}ms.`,
          },
        ],
      };
    }

    // Validate input
    const validationResult = ConsensusVoteInputSchema.safeParse(args);
    if (!validationResult.success) {
      const errorMessage = validationResult.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');
      return {
        isError: true,
        content: [{ type: 'text', text: `Validation error: ${errorMessage}` }],
      };
    }

    // Execute tool logic
    const result = await handleConsensusVote(deps, validationResult.data);

    if (!result.ok) {
      return {
        isError: true,
        content: [{ type: 'text', text: result.error }],
      };
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(result.value, null, 2) }],
    };
  };
}

/**
 * Registers the consensus_vote tool with the MCP server.
 *
 * Includes timeout protection for CVE-2026-0621 mitigation (Issue #271).
 *
 * @param server - MCP server instance
 * @param deps - Tool dependencies
 */
export function registerConsensusVoteTool(server: McpServer, deps: ConsensusVoteDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'consensus_vote' });
  const toolSchema = {
    proposal: z.string().min(1).max(MAX_PROPOSAL_LENGTH).describe('Proposal text to vote on'),
    threshold: z
      .enum(['majority', 'supermajority', 'unanimous'])
      .optional()
      .default('majority')
      .describe('Voting threshold: majority (>50%), supermajority (>=67%), unanimous (100%)'),
    quickMode: z
      .boolean()
      .optional()
      .default(false)
      .describe('Use 3 agents instead of 5 for faster execution'),
    dryRun: z.boolean().optional().default(false).describe('Simulate without actual LLM execution'),
  };

  const description =
    'Execute multi-model consensus voting on a proposal. ' +
    'Uses 5 specialized agent roles (architect, security, devex, ai_ml, pm) ' +
    'to vote on proposals with configurable thresholds.';

  // Wrap handler with timeout protection (Issue #271, CVE-2026-0621)
  // Longer timeout for voting (up to 5 minutes for 5 agents)
  const handler = createToolHandler(deps);
  const timeoutMs = deps.security?.timeout?.defaultTimeoutMs ?? 300000;
  const wrappedHandler = wrapToolWithTimeout('consensus_vote', handler, {
    timeoutMs,
    logger,
  });

  // Type assertion needed: MCP SDK expects index signature, our ToolResult is structurally compatible
  /* eslint-disable @typescript-eslint/no-deprecated, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */
  server.tool('consensus_vote', description, toolSchema, wrappedHandler as any);
  /* eslint-enable @typescript-eslint/no-deprecated, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */
  logger.info('Registered consensus_vote tool with timeout protection');
}
