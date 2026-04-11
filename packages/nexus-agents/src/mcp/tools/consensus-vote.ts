/* eslint-disable max-lines */ // Consensus voting — cohesive single module (governance: 400-600 OK)
/**
 * nexus-agents/mcp - Consensus Vote Tool
 * @module mcp/tools/consensus-vote
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ILogger } from '../../core/index.js';
import {
  createLogger,
  getErrorMessage,
  getTimeProvider,
  getRandomProvider,
  formatZodError,
} from '../../core/index.js';
import type { IMcpNotifier } from '../mcp-notifier.js';
import { createMcpNotifier, NOOP_NOTIFIER, withProgressHeartbeat } from '../mcp-notifier.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import { toolError, toolSuccess, type ToolResult, type BaseMcpToolDeps } from './tool-result.js';
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
import {
  MAX_PROPOSAL_LENGTH,
  VotingStrategySchema,
  ConsensusVoteInputSchema,
  buildResponse,
} from './consensus-vote-types.js';
import { recordVoteSuccess, recordVoteError } from './consensus-vote-recording.js';
import type {
  VotingStrategy,
  ConsensusVoteInput,
  ConsensusVoteResponse,
  ExtendedVotingResult,
} from './consensus-vote-types.js';

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

// --- Correlation Tracker Singleton ---
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

// --- Dependencies ---
export interface ConsensusVoteDeps extends BaseMcpToolDeps {
  /** MCP notifier for client-visible logging (Issue #974) */
  notifier?: IMcpNotifier | undefined;
}

// --- Strategy Resolution ---
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
  if (strategy === 'higher_order') return 'higher_order';
  if (strategy === 'opinion_wise') return 'opinion_wise';
  return strategy as ConsensusAlgorithm;
}

function getVoterRoles(quickMode: boolean): readonly VoterRole[] {
  return quickMode
    ? ['architect', 'security', 'pm']
    : ['architect', 'security', 'devex', 'ai_ml', 'pm', 'catfish'];
}

// --- Voting Execution ---
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

/** Thresholds per algorithm for cascade detection. */
const CASCADE_THRESHOLDS: Record<string, number> = {
  majority: 0.5,
  supermajority: 0.67,
  unanimous: 1.0,
};

/** Detect if vote outcome is mathematically decided (#1765). */
function detectEarlyCascade(
  algorithm: string,
  approvals: number,
  rejections: number,
  total: number
): { decided: boolean; reason: string } {
  const threshold = CASCADE_THRESHOLDS[algorithm] ?? 0.5;
  if (total === 0) return { decided: false, reason: '' };

  // Unanimous: any rejection decides
  if (algorithm === 'unanimous' && rejections > 0) {
    return { decided: true, reason: `Unanimous rejected: ${String(rejections)} rejection(s)` };
  }
  // Approval locked: even if all remaining vote reject, approval holds
  if (approvals / total > threshold) {
    return {
      decided: true,
      reason: `Approval locked: ${String(approvals)}/${String(total)} > ${String(threshold)}`,
    };
  }
  // Rejection locked: even if all remaining vote approve, rejection holds
  const remaining = total - approvals - rejections;
  if ((approvals + remaining) / total < threshold) {
    return {
      decided: true,
      reason: `Rejection locked: max possible ${String(approvals + remaining)}/${String(total)} < ${String(threshold)}`,
    };
  }
  return { decided: false, reason: '' };
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
    throw new Error(`Failed to create proposal: ${proposalResult.error.message}`, {
      cause: proposalResult.error,
    });

  const proposalId = proposalResult.value;
  for (const { role, vote } of validVotes) await engine.vote(proposalId, role, vote);

  const resultRes = await engine.close(proposalId);
  if (!resultRes.ok)
    throw new Error(`Failed to close proposal: ${resultRes.error.message}`, {
      cause: resultRes.error,
    });
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

/** Process votes with cascade detection — extracted for max-lines-per-function (#1765). */
async function processVotesWithCascade(
  votes: readonly AgentVoteResult[],
  opts: {
    totalRoles: number;
    proposal: string;
    algorithm: ConsensusAlgorithm;
    strategy: VotingStrategy;
    log: ILogger;
  }
): Promise<{
  engineResult: ConsensusResult;
  voteMap: Map<string, Vote>;
  higherOrderResult: ReturnType<typeof runHigherOrderVoting>;
  outcome: 'approved' | 'rejected';
  cascaded: boolean;
}> {
  const validVotes = votes.filter((v) => v.source !== 'error');
  const approvals = validVotes.filter((v) => v.vote.decision === 'approve').length;
  const rejections = validVotes.filter((v) => v.vote.decision === 'reject').length;
  const cascadeInfo = detectEarlyCascade(opts.algorithm, approvals, rejections, opts.totalRoles);

  if (cascadeInfo.decided) {
    opts.log.info('Vote cascade: outcome decided early', {
      approvals,
      rejections,
      total: opts.totalRoles,
      reason: cascadeInfo.reason,
    });
  }

  const engineResult = await processVotesThroughEngine(votes, opts.proposal, opts.algorithm);
  const voteMap = new Map<string, Vote>();
  for (const { role, vote, source } of votes) {
    if (source !== 'error') voteMap.set(role, vote);
  }

  const higherOrderResult = cascadeInfo.decided
    ? undefined
    : runHigherOrderVoting(opts.strategy, voteMap, opts.log);
  const outcome: 'approved' | 'rejected' =
    engineResult.outcome === 'approved' ? 'approved' : 'rejected';

  return { engineResult, voteMap, higherOrderResult, outcome, cascaded: cascadeInfo.decided };
}

/** Execute a consensus vote with full strategy support. Exported for pipeline DRY (#1694). */
/** Confidence threshold above which a contrarian rejection triggers escalation (#1799). */
const CONTRARIAN_ESCALATION_THRESHOLD = 0.8;

/** Run a single contrarian agent to check for YAGNI/MISALIGNED/SECURITY_RISK (#1799). */
async function runContrarianCheck(
  proposal: string,
  log: ILogger
): Promise<{ shouldEscalate: boolean; reason: string; confidence: number }> {
  try {
    const { executeExpert } = await import('../../pipeline/expert-bridge.js');
    const prompt = [
      'You are a contrarian analyst. Your job is to find reasons this proposal should be REJECTED.',
      'Look for: YAGNI (not needed), MISALIGNED (wrong tech/architecture), SECURITY_RISK, SCOPE_CREEP.',
      '',
      `Proposal: ${proposal.slice(0, 2000)}`,
      '',
      'If you find a strong reason to reject, respond with JSON:',
      '{"decision":"reject","confidence":0.0-1.0,"reasoning":"your concern"}',
      'If the proposal is sound, respond with:',
      '{"decision":"approve","confidence":0.0-1.0,"reasoning":"why it is acceptable"}',
    ].join('\n');

    const result = await executeExpert('architecture', prompt);
    if (!result.success) return { shouldEscalate: false, reason: '', confidence: 0 };

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (jsonMatch === null) return { shouldEscalate: false, reason: '', confidence: 0 };

    const parsed = JSON.parse(jsonMatch[0]) as {
      decision?: string;
      confidence?: number;
      reasoning?: string;
    };

    const isRejection = parsed.decision === 'reject';
    const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0;
    const reasoning = typeof parsed.reasoning === 'string' ? parsed.reasoning : '';

    if (isRejection && confidence >= CONTRARIAN_ESCALATION_THRESHOLD) {
      log.info('Contrarian rejected with high confidence', {
        confidence,
        reasoning: reasoning.slice(0, 200),
      });
      return { shouldEscalate: true, reason: reasoning, confidence };
    }

    return { shouldEscalate: false, reason: '', confidence };
  } catch {
    return { shouldEscalate: false, reason: '', confidence: 0 };
  }
}

export async function executeVoting(
  input: ConsensusVoteInput,
  logger: ILogger
): Promise<ExtendedVotingResult> {
  const strategy = resolveStrategy(input);
  const algorithm = strategyToAlgorithm(strategy);
  const roles = getVoterRoles(input.quickMode);
  const startTime = getTimeProvider().now();

  logger.info('Starting consensus vote', { strategy, algorithm, roleCount: roles.length });

  const votes = await collectRealVotes({
    roles,
    proposal: input.proposal,
    simulate: input.simulateVotes,
  });

  // Check for early cascade and process votes (#1765)
  const { engineResult, voteMap, higherOrderResult, outcome, cascaded } =
    await processVotesWithCascade(votes, {
      totalRoles: roles.length,
      proposal: input.proposal,
      algorithm,
      strategy,
      log: logger,
    });

  recordVotesToTracker(votes, voteMap, outcome, logger);

  // Contrarian check for quickMode approvals (#1799):
  // When quickMode approves, run a single contrarian agent to catch YAGNI/SECURITY_RISK.
  // If contrarian rejects with high confidence, escalate to full vote.
  if (input.quickMode && outcome === 'approved' && !input.simulateVotes) {
    const escalation = await runContrarianCheck(input.proposal, logger);
    if (escalation.shouldEscalate) {
      logger.warn('Contrarian escalation: re-running with full vote', {
        reason: escalation.reason,
        confidence: escalation.confidence,
      });
      return executeVoting({ ...input, quickMode: false }, logger);
    }
  }

  const totalTimeMs = getTimeProvider().now() - startTime;
  logger.info('Consensus vote completed', { strategy, outcome, durationMs: totalTimeMs, cascaded });

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

// --- Handler & Registration ---
async function handleConsensusVote(
  deps: ConsensusVoteDeps,
  args: ConsensusVoteInput
): Promise<{ ok: true; value: ConsensusVoteResponse } | { ok: false; error: string }> {
  const logger = deps.logger ?? createLogger({ tool: 'consensus_vote' });
  try {
    const result = await executeVoting(args, logger);
    const strategy = args.strategy ?? 'simple_majority';

    // Detect all-error votes: return structured error instead of fake "rejected" (#1552)
    const errorVotes = result.votes.filter((v) => v.source === 'error');
    if (errorVotes.length === result.votes.length && result.votes.length > 0) {
      const failures = errorVotes.map((v) => `${v.role}: ${v.error ?? 'unknown error'}`).join('; ');
      logger.warn('All voters failed', { failureCount: errorVotes.length, failures });
      recordVoteError(args.proposal, `All ${String(errorVotes.length)} voters failed: ${failures}`);
      return {
        ok: false,
        error: `All ${String(errorVotes.length)} voters failed. Failures: ${failures}`,
      };
    }

    recordVoteSuccess(
      args.proposal,
      strategy,
      result.result.outcome,
      result.totalTimeMs,
      result.votes
    );
    return { ok: true, value: buildResponse(args, result) };
  } catch (error) {
    const message = getErrorMessage(error);
    const cause = error instanceof Error ? error : new Error(message);
    logger.error('Consensus vote failed', cause);
    recordVoteError(args.proposal, message);
    return { ok: false, error: `Voting failed: ${message}` };
  }
}

type ConsensusVoteToolResponse = ToolResult;

function createConsensusVoteHandler(deps: ConsensusVoteDeps) {
  const notifier = deps.notifier ?? NOOP_NOTIFIER;
  return async (args: unknown, ctx: HandlerContext): Promise<ConsensusVoteToolResponse> => {
    const validationResult = ConsensusVoteInputSchema.safeParse(args);
    if (!validationResult.success) {
      return toolError(`Validation error: ${formatZodError(validationResult.error)}`);
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
      return toolError(result.error);
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
    const data = result.value as unknown as Record<string, unknown>;
    return {
      ...toolSuccess(JSON.stringify(result.value, null, 2)),
      structuredContent: data,
    };
  };
}

/** Output schema for consensus_vote tool (Issue #1117, #1246). */
export const CONSENSUS_VOTE_OUTPUT_SCHEMA = {
  proposal: z.string(),
  strategy: VotingStrategySchema,
  decision: z.enum(['approved', 'rejected', 'no_quorum']),
  approvalPercentage: z.number(),
  voteCounts: z.object({
    approve: z.number(),
    reject: z.number(),
    abstain: z.number(),
    error: z.number(),
  }),
  votes: z.array(
    z.object({
      role: z.string().max(100),
      decision: z.enum(['approve', 'reject', 'abstain']),
      confidence: z.number(),
      reasoning: z.string().max(4000),
      simulated: z.boolean(),
      error: z.boolean(),
      modelUsed: z.string().max(100).optional(),
      rejectionCategories: z
        .array(
          z.enum([
            'YAGNI',
            'DRY_VIOLATION',
            'OVER_ENGINEERING',
            'SCOPE_CREEP',
            'SECURITY_RISK',
            'MISALIGNED',
            'INSUFFICIENT_EVIDENCE',
          ])
        )
        .optional(),
    })
  ),
  threshold: z.enum(['majority', 'supermajority', 'unanimous']).optional(),
  durationMs: z.number(),
  simulateVotes: z.boolean(),
  higherOrderMetadata: z
    .object({
      posteriorApproval: z.number(),
      posteriorRejection: z.number(),
      effectiveVoteCount: z.number(),
      method: z.enum(['ow', 'isp', 'simple']),
      usedCorrelationData: z.boolean(),
      improvementOverBaseline: z.number(),
      downweightedAgents: z.array(z.string().max(100)).max(10),
      reasoning: z.string().max(2000),
    })
    .optional(),
};

/**
 * Registers the consensus_vote tool with the MCP server.
 * Uses createSecureHandler (Issue #531) with timeout protection (Issue #271).
 * @category MCP
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
    { description, inputSchema: toolSchema, outputSchema: CONSENSUS_VOTE_OUTPUT_SCHEMA },
    toSdkCallback(wrappedHandler)
  );
  logger.info('Registered consensus_vote tool with secure handler and timeout protection');
}
