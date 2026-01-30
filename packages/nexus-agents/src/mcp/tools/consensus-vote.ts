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
import { createLogger, getTimeProvider, getRandomProvider } from '../../core/index.js';
import type { RateLimiter } from '../middleware/rate-limiter.js';
import type { SecurityConfig } from '../../config/schemas.js';
import { wrapToolWithTimeout } from '../middleware/tool-wrapper.js';
import type { ConsensusAlgorithm, Vote, ConsensusResult } from '../../consensus/types.js';
import type { VoterRole, VotingResult, AgentVoteResult } from '../../cli/vote-types.js';
import { VOTER_ROLES } from '../../cli/vote-types.js';
import { collectRealVotes } from '../../cli/voter-agents.js';
import { createConsensusEngine } from '../../consensus/engine.js';
import type { Proposal } from '../../consensus/types.js';
import type {
  HigherOrderVotingResult,
  ICorrelationTracker,
} from '../../consensus/higher-order-types.js';
import { HigherOrderVotingStrategy, createCorrelationTracker } from '../../consensus/index.js';

/**
 * Maximum proposal length (memory bounds per Issue #435).
 */
const MAX_PROPOSAL_LENGTH = 4000;

/**
 * Module-level persistent CorrelationTracker for Higher-Order Voting.
 * Persists across consensus_vote calls to accumulate voting history.
 * (Source: Issue #517 - Fix HOV never activating due to fresh tracker)
 *
 * Note: This is an in-memory store that resets on process restart.
 * For production persistence, consider Redis/database storage.
 */
let persistentCorrelationTracker: ICorrelationTracker | undefined;

/**
 * Gets or creates the persistent CorrelationTracker.
 * @returns The module-level CorrelationTracker instance
 */
function getOrCreateCorrelationTracker(): ICorrelationTracker {
  persistentCorrelationTracker ??= createCorrelationTracker();
  return persistentCorrelationTracker;
}

/**
 * Resets the persistent CorrelationTracker.
 * Useful for testing or when correlation data should be cleared.
 * @internal Exported for testing only
 */
export function resetCorrelationTracker(): void {
  persistentCorrelationTracker = undefined;
}

/**
 * Available consensus voting strategies.
 *
 * - `simple_majority`: Standard majority voting (>50%)
 * - `supermajority`: Requires >=67% approval
 * - `unanimous`: Requires 100% approval
 * - `proof_of_learning`: Weighted by agent performance (Issue #103)
 * - `higher_order`: Bayesian-optimal with correlation awareness (Issue #514)
 *
 * (Source: Issue #514 - Wire Higher-Order Voting to consensus_vote tool)
 */
export type VotingStrategy =
  | 'simple_majority'
  | 'supermajority'
  | 'unanimous'
  | 'proof_of_learning'
  | 'higher_order';

/**
 * Schema for voting strategy validation.
 */
export const VotingStrategySchema = z.enum([
  'simple_majority',
  'supermajority',
  'unanimous',
  'proof_of_learning',
  'higher_order',
]);

/**
 * Input schema for consensus_vote tool.
 */
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
 * Higher-Order Voting metadata included in response when using higher_order strategy.
 * (Source: Issue #514)
 */
export interface HigherOrderMetadata {
  /** Posterior probability of approval (Bayesian estimate) */
  posteriorApproval: number;
  /** Posterior probability of rejection (Bayesian estimate) */
  posteriorRejection: number;
  /** Effective vote count after correlation adjustment */
  effectiveVoteCount: number;
  /** Method used: 'ow' (opinion-wise), 'isp' (independent subset), or 'simple' (fallback) */
  method: 'ow' | 'isp' | 'simple';
  /** Whether correlation data was used */
  usedCorrelationData: boolean;
  /** Percentage improvement over simple majority baseline */
  improvementOverBaseline: number;
  /** Agents that were downweighted due to correlation */
  downweightedAgents: readonly string[];
  /** Human-readable reasoning */
  reasoning: string;
}

/**
 * Response from consensus_vote tool.
 */
export interface ConsensusVoteResponse {
  /** Proposal that was voted on (truncated if long) */
  proposal: string;
  /** Voting threshold used (legacy) */
  threshold?: 'majority' | 'supermajority' | 'unanimous';
  /** Voting strategy used */
  strategy: VotingStrategy;
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
  /** Higher-Order Voting metadata (only present when strategy='higher_order') */
  higherOrderMetadata?: HigherOrderMetadata;
}

/**
 * Resolves the voting strategy from input.
 * Strategy takes precedence over threshold if both are specified.
 * (Source: Issue #514)
 */
function resolveStrategy(input: ConsensusVoteInput): VotingStrategy {
  // Strategy takes precedence if specified
  if (input.strategy !== undefined) {
    return input.strategy;
  }

  // Map threshold to strategy for backward compatibility
  if (input.threshold !== undefined) {
    switch (input.threshold) {
      case 'majority':
        return 'simple_majority';
      case 'supermajority':
        return 'supermajority';
      case 'unanimous':
        return 'unanimous';
    }
  }

  // Default
  return 'simple_majority';
}

/**
 * Maps VotingStrategy to ConsensusAlgorithm.
 * Higher-order uses opinion_wise algorithm.
 */
function strategyToAlgorithm(strategy: VotingStrategy): ConsensusAlgorithm {
  switch (strategy) {
    case 'higher_order':
      return 'opinion_wise';
    default:
      return strategy as ConsensusAlgorithm;
  }
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
 * Extended voting result with optional Higher-Order metadata.
 * (Source: Issue #514)
 */
interface ExtendedVotingResult extends VotingResult {
  /** Strategy used for voting */
  strategy: VotingStrategy;
  /** Higher-Order Voting result (only present when strategy='higher_order') */
  higherOrderResult?: HigherOrderVotingResult;
}

/**
 * Builds the response from voting result.
 * Updated for Issue #514 to include strategy and Higher-Order metadata.
 */
function buildResponse(
  input: ConsensusVoteInput,
  result: ExtendedVotingResult
): ConsensusVoteResponse {
  const proposalTruncated =
    input.proposal.length > 200 ? input.proposal.slice(0, 200) + '...' : input.proposal;

  const response: ConsensusVoteResponse = {
    proposal: proposalTruncated,
    strategy: result.strategy,
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

  // Add legacy threshold if provided (for backward compatibility)
  if (input.threshold !== undefined) {
    response.threshold = input.threshold;
  }

  // Add Higher-Order metadata when using higher_order strategy
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

/** Process votes through consensus engine and return result. */
async function processVotesThroughEngine(
  votes: readonly AgentVoteResult[],
  proposal: string,
  algorithm: ConsensusAlgorithm
): Promise<ConsensusResult> {
  const engine = createConsensusEngine();
  const engineProposal: Proposal = {
    title: 'MCP Consensus Vote',
    description: proposal,
    algorithm,
  };
  const proposalResult = await engine.propose(engineProposal);
  if (!proposalResult.ok)
    throw new Error(`Failed to create proposal: ${proposalResult.error.message}`);

  const proposalId = proposalResult.value;
  for (const { role, vote } of votes) await engine.vote(proposalId, role, vote);

  const resultRes = await engine.close(proposalId);
  if (!resultRes.ok) throw new Error(`Failed to close proposal: ${resultRes.error.message}`);
  return resultRes.value;
}

/** Run Higher-Order Voting aggregation if strategy is higher_order. */
function runHigherOrderVoting(
  strategy: VotingStrategy,
  voteMap: Map<string, Vote>,
  logger: ILogger
): HigherOrderVotingResult | undefined {
  if (strategy !== 'higher_order') return undefined;
  const hovStrategy = new HigherOrderVotingStrategy();
  const tracker = getOrCreateCorrelationTracker();
  const result = hovStrategy.aggregate(voteMap, tracker);
  logger.info('Higher-Order Voting complete', {
    method: result.method,
    decision: result.decision,
    posteriorApproval: result.posteriorApproval.toFixed(3),
  });
  return result;
}

/** Record votes to correlation tracker if all votes are real LLM votes. */
function recordVotesToTracker(
  votes: readonly AgentVoteResult[],
  voteMap: Map<string, Vote>,
  outcome: 'approved' | 'rejected',
  logger: ILogger
): void {
  const allVotesReal = votes.every((v) => v.source === 'llm');
  if (!allVotesReal) {
    const nonReal = votes.filter((v) => v.source !== 'llm');
    logger.warn('Skipping correlation recording due to non-LLM votes', { count: nonReal.length });
    return;
  }
  const tracker = getOrCreateCorrelationTracker();
  const id = `consensus-${String(getTimeProvider().now())}-${getRandomProvider().random().toString(36).slice(2, 9)}`;
  tracker.recordProposalVotes(id, voteMap, outcome);
  logger.debug('Recorded votes to tracker', { proposalId: id, outcome });
}

/** Executes the consensus voting process. */
async function executeVoting(
  input: ConsensusVoteInput,
  logger: ILogger
): Promise<ExtendedVotingResult> {
  const strategy = resolveStrategy(input);
  const algorithm = strategyToAlgorithm(strategy);
  const roles = getVoterRoles(input.quickMode);
  const startTime = getTimeProvider().now();

  logger.info('Starting consensus vote', { strategy, algorithm, roleCount: roles.length });

  const votes = await collectRealVotes({ roles, proposal: input.proposal, simulate: input.dryRun });
  const engineResult = await processVotesThroughEngine(votes, input.proposal, algorithm);

  const voteMap = new Map<string, Vote>();
  for (const { role, vote } of votes) voteMap.set(role, vote);

  const higherOrderResult = runHigherOrderVoting(strategy, voteMap, logger);
  const outcome: 'approved' | 'rejected' =
    engineResult.outcome === 'approved' ? 'approved' : 'rejected';
  recordVotesToTracker(votes, voteMap, outcome, logger);

  const totalTimeMs = getTimeProvider().now() - startTime;
  logger.info('Consensus vote completed', { strategy, outcome, durationMs: totalTimeMs });

  const result: ExtendedVotingResult = {
    proposal: input.proposal,
    threshold: algorithm,
    result: engineResult,
    votes,
    totalTimeMs,
    dryRun: input.dryRun,
    strategy,
  };
  if (higherOrderResult !== undefined) result.higherOrderResult = higherOrderResult;
  return result;
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
      .describe(
        'Voting threshold (legacy): majority (>50%), supermajority (>=67%), unanimous (100%). Use strategy instead.'
      ),
    strategy: VotingStrategySchema.optional().describe(
      'Voting strategy: simple_majority (default), supermajority, unanimous, proof_of_learning, or higher_order (Bayesian-optimal with correlation awareness)'
    ),
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
    'to vote on proposals with configurable strategies. ' +
    'Supports higher_order strategy for Bayesian-optimal aggregation with correlation awareness (Issue #514).';

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
