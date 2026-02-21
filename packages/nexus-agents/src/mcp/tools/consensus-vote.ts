/**
 * nexus-agents/mcp - Consensus Vote Tool
 *
 * MCP tool for multi-model consensus voting on proposals.
 * Types and response helpers extracted to consensus-vote-types.ts (Issue #708).
 *
 * @module mcp/tools/consensus-vote
 * (Source: Issue #435, #531, #514, #708)
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ILogger } from '../../core/index.js';
import { getErrorMessage } from '../../core/index.js';

import {
  createLogger,
  getTimeProvider,
  getRandomProvider,
  formatZodError,
} from '../../core/index.js';
import type { RateLimiter } from '../middleware/rate-limiter.js';
import type { SecurityConfig } from '../../config/schemas.js';
import type { IMcpNotifier } from '../mcp-notifier.js';
import { createMcpNotifier, NOOP_NOTIFIER, withProgressHeartbeat } from '../mcp-notifier.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import type { ConsensusAlgorithm, Vote, ConsensusResult, Proposal } from '../../consensus/types.js';
import type { VoterRole, AgentVoteResult } from '../../cli/vote-types.js';
import { collectRealVotes } from '../../cli/voter-agents.js';
import { createConsensusEngine } from '../../consensus/engine.js';
import type {
  HigherOrderVotingResult,
  ICorrelationTracker,
} from '../../consensus/higher-order-types.js';
import { HigherOrderVotingStrategy } from '../../consensus/index.js';
import {
  createPersistentCorrelationTracker,
  createPersistedProposal,
  saveCorrelationData,
} from '../../consensus/correlation-persistence.js';
import { getToolMemory } from './tool-memory.js';
import {
  MAX_PROPOSAL_LENGTH,
  VotingStrategySchema,
  ConsensusVoteInputSchema,
  buildResponse,
} from './consensus-vote-types.js';
import type {
  VotingStrategy,
  ConsensusVoteInput,
  ConsensusVoteResponse,
  ExtendedVotingResult,
} from './consensus-vote-types.js';

// Re-export types for consumers
export type {
  VotingStrategy,
  ConsensusVoteInput,
  ConsensusVoteResponse,
  AgentVoteSummary,
  VoteDecisionStatus,
  HigherOrderMetadata,
  ExtendedVotingResult,
} from './consensus-vote-types.js';
export { VotingStrategySchema, ConsensusVoteInputSchema } from './consensus-vote-types.js';

// ============================================================================
// Correlation Tracker Singleton
// ============================================================================

let persistentCorrelationTracker: ICorrelationTracker | undefined;

/** Gets or creates the persistent CorrelationTracker (Issue #517). */
function getOrCreateCorrelationTracker(): ICorrelationTracker {
  persistentCorrelationTracker ??= createPersistentCorrelationTracker();
  return persistentCorrelationTracker;
}

/** Resets the persistent CorrelationTracker. @internal */
export function resetCorrelationTracker(): void {
  persistentCorrelationTracker = undefined;
}

// ============================================================================
// Dependencies
// ============================================================================

export interface ConsensusVoteDeps {
  logger?: ILogger;
  rateLimiter: RateLimiter;
  security?: SecurityConfig | undefined;
  /** MCP notifier for client-visible logging (Issue #974) */
  notifier?: IMcpNotifier | undefined;
}

// ============================================================================
// Strategy Resolution
// ============================================================================

function resolveStrategy(input: ConsensusVoteInput): VotingStrategy {
  if (input.strategy !== undefined) return input.strategy;
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
  return 'simple_majority';
}

function strategyToAlgorithm(strategy: VotingStrategy): ConsensusAlgorithm {
  return strategy === 'higher_order' ? 'opinion_wise' : (strategy as ConsensusAlgorithm);
}

function getVoterRoles(quickMode: boolean): readonly VoterRole[] {
  return quickMode
    ? ['architect', 'security', 'pm']
    : ['architect', 'security', 'devex', 'ai_ml', 'pm', 'catfish'];
}

// ============================================================================
// Voting Execution
// ============================================================================

/** Creates a synthetic ConsensusResult when all votes are errors (Issue #815). */
function createEmptyConsensusResult(
  proposal: string,
  algorithm: ConsensusAlgorithm
): ConsensusResult {
  const now = new Date().toISOString();
  return {
    proposalId: 'no-valid-votes',
    proposal: { title: 'MCP Consensus Vote', description: proposal, algorithm },
    outcome: 'rejected',
    votes: new Map<string, Vote>(),
    voteCounts: { approve: 0, reject: 0, abstain: 0, total: 0 },
    approvalPercentage: 0,
    quorumReached: false,
    startedAt: now,
    closedAt: now,
    durationMs: 0,
  };
}

async function processVotesThroughEngine(
  votes: readonly AgentVoteResult[],
  proposal: string,
  algorithm: ConsensusAlgorithm
): Promise<ConsensusResult> {
  const validVotes = votes.filter((v) => v.source !== 'error');
  if (validVotes.length === 0) return createEmptyConsensusResult(proposal, algorithm);

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
  for (const { role, vote } of validVotes) await engine.vote(proposalId, role, vote);

  const resultRes = await engine.close(proposalId);
  if (!resultRes.ok) throw new Error(`Failed to close proposal: ${resultRes.error.message}`);
  return resultRes.value;
}

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

function recordVotesToTracker(
  votes: readonly AgentVoteResult[],
  voteMap: Map<string, Vote>,
  outcome: 'approved' | 'rejected',
  logger: ILogger
): void {
  const allVotesReal = votes.every((v) => v.source === 'llm');
  if (!allVotesReal) {
    logger.warn('Skipping correlation recording due to non-LLM votes', {
      count: votes.filter((v) => v.source !== 'llm').length,
    });
    return;
  }
  const tracker = getOrCreateCorrelationTracker();
  const id = `consensus-${String(getTimeProvider().now())}-${getRandomProvider().random().toString(36).slice(2, 9)}`;
  tracker.recordProposalVotes(id, voteMap, outcome);
  logger.debug('Recorded votes to tracker', { proposalId: id, outcome });

  try {
    const persisted = createPersistedProposal(id, voteMap, outcome);
    const saveResult = saveCorrelationData([persisted]);
    if (!saveResult.ok) {
      logger.warn('Failed to persist correlation data', { error: saveResult.error.message });
    }
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    logger.warn('Error persisting correlation data', { error: message });
  }
}

async function executeVoting(
  input: ConsensusVoteInput,
  logger: ILogger
): Promise<ExtendedVotingResult> {
  const strategy = resolveStrategy(input);
  const algorithm = strategyToAlgorithm(strategy);
  const roles = getVoterRoles(input.quickMode);
  const startTime = getTimeProvider().now();

  logger.info('Starting consensus vote', {
    strategy,
    algorithm,
    roleCount: roles.length,
    roles: roles.join(', '),
    simulated: input.simulateVotes,
  });

  const votes = await collectRealVotes({
    roles,
    proposal: input.proposal,
    simulate: input.simulateVotes,
  });
  const engineResult = await processVotesThroughEngine(votes, input.proposal, algorithm);

  const voteMap = new Map<string, Vote>();
  for (const { role, vote, source } of votes) {
    if (source !== 'error') voteMap.set(role, vote);
  }

  const higherOrderResult = runHigherOrderVoting(strategy, voteMap, logger);
  const outcome: 'approved' | 'rejected' =
    engineResult.outcome === 'approved' ? 'approved' : 'rejected';
  recordVotesToTracker(votes, voteMap, outcome, logger);

  const totalTimeMs = getTimeProvider().now() - startTime;
  const voteSummary = votes.map((v) => `${v.role}:${v.source}`).join(', ');
  logger.info('Consensus vote completed', {
    strategy,
    outcome,
    durationMs: totalTimeMs,
    voteSummary,
  });

  const result: ExtendedVotingResult = {
    proposal: input.proposal,
    threshold: algorithm,
    result: engineResult,
    votes,
    totalTimeMs,
    simulateVotes: input.simulateVotes,
    strategy,
  };
  if (higherOrderResult !== undefined) result.higherOrderResult = higherOrderResult;
  return result;
}

// ============================================================================
// Memory Recording (Issue #753)
// ============================================================================

/** Records a successful consensus vote to session memory. Best-effort. */
function recordVoteSuccess(
  proposal: string,
  strategy: string,
  outcome: string,
  duration: number
): void {
  try {
    const memory = getToolMemory();
    memory.recordTask({
      approach: `Consensus vote: ${strategy} on "${proposal.slice(0, 50)}"`,
      challenges: [],
      durationMs: duration,
    });
    memory.recordLearning({
      pattern: `${strategy} vote → ${outcome}`,
      context: `proposal="${proposal.slice(0, 40)}" duration=${String(duration)}ms`,
      confidence: 0.8,
      source: 'consensus-vote',
    });
    // Fire-and-forget promotion pipeline
    void memory.runPromotionPipeline().catch((error: unknown) => {
      createLogger({ tool: 'consensus-vote' }).debug('Promotion pipeline failed', { error });
    });
  } catch (error: unknown) {
    createLogger({ tool: 'consensus-vote' }).warn('Failed to record vote success', {
      error: getErrorMessage(error),
    });
  }
}

/** Records a failed consensus vote to session memory. Best-effort. */
function recordVoteError(proposal: string, errorMessage: string): void {
  try {
    const memory = getToolMemory();
    memory.recordError({
      error: `Consensus vote failed: ${errorMessage.slice(0, 150)}`,
      solution: 'Pending - vote execution failed',
      filePattern: 'mcp/tools/consensus-vote',
    });
  } catch (error: unknown) {
    createLogger({ tool: 'consensus-vote' }).warn('Failed to record vote error', {
      error: getErrorMessage(error),
    });
  }
}

// ============================================================================
// Handler & Registration
// ============================================================================

async function handleConsensusVote(
  deps: ConsensusVoteDeps,
  args: ConsensusVoteInput
): Promise<{ ok: true; value: ConsensusVoteResponse } | { ok: false; error: string }> {
  const logger = deps.logger ?? createLogger({ tool: 'consensus_vote' });
  try {
    const result = await executeVoting(args, logger);
    const strategy = args.strategy ?? 'simple_majority';
    recordVoteSuccess(args.proposal, strategy, result.result.outcome, result.totalTimeMs);
    return { ok: true, value: buildResponse(args, result) };
  } catch (error) {
    const message = getErrorMessage(error);
    const cause = error instanceof Error ? error : new Error(message);
    logger.error('Consensus vote failed', cause);
    recordVoteError(args.proposal, message);
    return { ok: false, error: `Voting failed: ${message}` };
  }
}

type ConsensusVoteToolResponse = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

function createConsensusVoteHandler(deps: ConsensusVoteDeps) {
  const notifier = deps.notifier ?? NOOP_NOTIFIER;
  return async (args: unknown, ctx: HandlerContext): Promise<ConsensusVoteToolResponse> => {
    const validationResult = ConsensusVoteInputSchema.safeParse(args);
    if (!validationResult.success) {
      return {
        isError: true,
        content: [
          { type: 'text', text: `Validation error: ${formatZodError(validationResult.error)}` },
        ],
      };
    }

    const strategy = validationResult.data.strategy ?? 'simple_majority';
    ctx.logger.debug('Starting consensus vote', {
      strategy,
      quickMode: validationResult.data.quickMode,
    });
    notifier.info('consensus_vote', {
      event: 'vote_start',
      proposalLength: validationResult.data.proposal.length,
      strategy,
    });

    const result = await withProgressHeartbeat('consensus_vote', notifier, () =>
      handleConsensusVote(deps, validationResult.data)
    );
    if (!result.ok) {
      return { isError: true, content: [{ type: 'text', text: result.error }] };
    }

    for (const vote of result.value.votes) {
      notifier.debug('consensus_vote', {
        event: 'vote_collected',
        role: vote.role,
        decision: vote.decision,
      });
    }
    notifier.info('consensus_vote', {
      event: 'vote_complete',
      decision: result.value.decision,
      approvalPercentage: result.value.approvalPercentage,
      voteCount: result.value.votes.length,
    });
    return { content: [{ type: 'text', text: JSON.stringify(result.value, null, 2) }] };
  };
}

/**
 * Registers the consensus_vote tool with the MCP server.
 * Uses createSecureHandler (Issue #531) with timeout protection (Issue #271).
 */
export function registerConsensusVoteTool(server: McpServer, deps: ConsensusVoteDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'consensus_vote' });
  const notifier = deps.notifier ?? createMcpNotifier(server);
  const depsWithNotifier = { ...deps, notifier };
  const toolSchema = {
    proposal: z.string().min(1).max(MAX_PROPOSAL_LENGTH).describe('Proposal text to vote on'),
    threshold: z
      .enum(['majority', 'supermajority', 'unanimous'])
      .optional()
      .describe('Voting threshold (legacy). Use strategy instead.'),
    strategy: VotingStrategySchema.optional().describe(
      'Voting strategy: simple_majority (default), supermajority, unanimous, proof_of_learning, or higher_order'
    ),
    quickMode: z.boolean().optional().default(false).describe('Use 3 agents instead of 6'),
    simulateVotes: z.boolean().optional().default(false).describe('Use simulated votes'),
  };

  const description =
    'Execute multi-model consensus voting on a proposal. ' +
    'Uses 6 specialized agent roles (architect, security, devex, ai_ml, pm, catfish) ' +
    'to vote on proposals with configurable strategies. ' +
    'Supports higher_order strategy for Bayesian-optimal aggregation with correlation awareness (Issue #514).';

  const secureHandler = createSecureHandler(createConsensusVoteHandler(depsWithNotifier), {
    toolName: 'consensus_vote',
    rateLimiter: deps.rateLimiter,
    logger,
  });

  const timeoutMs = getToolTimeout('consensus_vote', deps.security);
  const wrappedHandler = wrapToolWithTimeout('consensus_vote', secureHandler, {
    timeoutMs,
    logger,
  });

  server.registerTool(
    'consensus_vote',
    { description, inputSchema: toolSchema },
    toSdkCallback(wrappedHandler)
  );
  logger.info('Registered consensus_vote tool with secure handler and timeout protection');
}
