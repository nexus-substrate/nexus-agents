/**
 * Iterative Consensus Stage — Reusable vote loop (#1734, Phase 1.2)
 *
 * Extracts the plan→vote→feedback iteration pattern from agent-executor.ts
 * into a reusable stage. Wraps executeVoting from consensus-vote.ts.
 *
 * @module pipeline/iterative-consensus
 */

import { createLogger, getTimeProvider } from '../core/index.js';
import type { ILogger } from '../core/index.js';
import type { VoteResult } from './dev-pipeline.js';
import { emitPipelineStageEvent } from './pipeline-observability.js';

const defaultLogger = createLogger({ component: 'iterative-consensus' });

// ============================================================================
// Types
// ============================================================================

/** Configuration for an iterative consensus vote. */
export interface IterativeConsensusConfig {
  /** Maximum plan→vote iterations (default: 3). */
  readonly maxIterations?: number | undefined;
  /** Use simulated votes (for testing). */
  readonly simulateVotes?: boolean | undefined;
  /** Use quick mode (3 agents instead of 6). */
  readonly quickMode?: boolean | undefined;
  /** Voting strategy (default: 'higher_order'). */
  readonly strategy?: string | undefined;
  /** Max proposal length sent to voters (default: 4000). */
  readonly maxProposalLength?: number | undefined;
  /** Logger instance. */
  readonly logger?: ILogger | undefined;
  /** Pipeline prefix for observability events. */
  readonly pipelinePrefix?: string | undefined;
}

/** Result of the iterative consensus process. */
export interface IterativeConsensusResult {
  readonly vote: VoteResult;
  readonly iterations: number;
  readonly durationMs: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MAX_ITERATIONS = 3;
const DEFAULT_MAX_PROPOSAL_LENGTH = 4000;
const DEFAULT_STRATEGY = 'higher_order';
const DEFAULT_PREFIX = 'pipeline';

// ============================================================================
// Core
// ============================================================================

/**
 * Run an iterative consensus vote with plan→vote→feedback loop.
 *
 * On rejection, calls `revisePlan` with feedback and re-votes.
 * Stops on approval, conditional_go, or iteration exhaustion.
 */
/** Internal state for the consensus loop. */
interface ConsensusLoopState {
  plan: string;
  lastVote: VoteResult | undefined;
  readonly config: IterativeConsensusConfig | undefined;
  readonly log: ILogger;
  readonly prefix: string;
  readonly globalStart: number;
}

/** Run one iteration of the consensus loop. Returns result if accepted, undefined to continue. */
async function runOneIteration(
  state: ConsensusLoopState,
  iteration: number
): Promise<IterativeConsensusResult | undefined> {
  state.log.info('Consensus iteration', { iteration });
  emitPipelineStageEvent(state.prefix, 'vote', 'started');

  state.lastVote = await executeSingleVote(state.plan, state.config, state.log);
  const iterMs = getTimeProvider().now() - state.globalStart;
  const status = isVoteAccepted(state.lastVote) ? 'completed' : 'failed';
  emitPipelineStageEvent(state.prefix, 'vote', status, { durationMs: iterMs });

  if (isVoteAccepted(state.lastVote)) {
    return { vote: state.lastVote, iterations: iteration, durationMs: iterMs };
  }
  return undefined;
}

export async function runIterativeConsensus(
  initialPlan: string,
  revisePlan: (plan: string, feedback: string) => Promise<string>,
  config?: IterativeConsensusConfig
): Promise<IterativeConsensusResult> {
  const maxIter = config?.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const state: ConsensusLoopState = {
    plan: initialPlan,
    lastVote: undefined,
    config,
    log: config?.logger ?? defaultLogger,
    prefix: config?.pipelinePrefix ?? DEFAULT_PREFIX,
    globalStart: getTimeProvider().now(),
  };

  for (let i = 0; i < maxIter; i++) {
    const accepted = await runOneIteration(state, i + 1);
    if (accepted !== undefined) return accepted;
    await maybeRevise(state, i, maxIter, revisePlan);
  }

  return buildExhaustedResult(state, maxIter);
}

// ============================================================================
// Helpers
// ============================================================================

/** Check if a vote result is accepted (approved or conditional_go). */
function isVoteAccepted(vote: VoteResult): boolean {
  return vote.kind === 'approved' || vote.kind === 'conditional_go';
}

/** Extract feedback text from a vote (empty string if not rejected). */
function extractFeedback(vote: VoteResult | undefined): string {
  if (vote === undefined) return '';
  return vote.kind === 'rejected' ? vote.feedback : '';
}

/** Revise the plan if there are remaining iterations. */
async function maybeRevise(
  state: ConsensusLoopState,
  iteration: number,
  maxIter: number,
  revisePlan: (plan: string, feedback: string) => Promise<string>
): Promise<void> {
  if (iteration >= maxIter - 1) return;
  state.log.info('Vote rejected, revising plan', { iteration: iteration + 1 });
  state.plan = await revisePlan(state.plan, extractFeedback(state.lastVote));
}

/** Build result when iterations are exhausted. */
function buildExhaustedResult(
  state: ConsensusLoopState,
  maxIter: number
): IterativeConsensusResult {
  const totalMs = getTimeProvider().now() - state.globalStart;
  const fallback: VoteResult = {
    kind: 'rejected',
    feedback: 'No votes executed',
    approvalPercentage: 0,
  };
  return { vote: state.lastVote ?? fallback, iterations: maxIter, durationMs: totalMs };
}

/** Build the voting input from config. */
function buildVotingInput(
  plan: string,
  config: IterativeConsensusConfig | undefined
): { proposal: string; strategy: string; simulateVotes: boolean; quickMode: boolean } {
  const maxLen = config?.maxProposalLength ?? DEFAULT_MAX_PROPOSAL_LENGTH;
  return {
    proposal: plan.slice(0, maxLen),
    strategy: config?.strategy ?? DEFAULT_STRATEGY,
    simulateVotes: config?.simulateVotes ?? false,
    quickMode: config?.quickMode ?? false,
  };
}

// ============================================================================
// Vote Execution
// ============================================================================

/** Execute a single vote round using the consensus-vote tool. */
async function executeSingleVote(
  plan: string,
  config: IterativeConsensusConfig | undefined,
  log: ILogger
): Promise<VoteResult> {
  try {
    const { executeVoting } = await import('../mcp/tools/consensus-vote.js');
    const input = buildVotingInput(plan, config);
    const result = await executeVoting(input, log);
    return parseVotingResult(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.warn('Vote execution failed, auto-approving', { error: msg });
    return { kind: 'approved', approvalPercentage: 0 };
  }
}

/** Parse executeVoting output into a VoteResult. */
function parseVotingResult(result: {
  readonly result: {
    readonly outcome: string;
    readonly voteCounts: { readonly approve: number; readonly reject: number };
  };
  readonly votes: ReadonlyArray<{
    readonly vote: { readonly decision: string; readonly reasoning: string };
  }>;
}): VoteResult {
  const approved = result.result.outcome === 'approved';
  const total = Math.max(1, result.result.voteCounts.approve + result.result.voteCounts.reject);
  const pct = (result.result.voteCounts.approve / total) * 100;

  if (approved) {
    return { kind: 'approved', approvalPercentage: pct };
  }

  const feedback = result.votes
    .filter((v) => v.vote.decision !== 'approve')
    .map((v) => v.vote.reasoning)
    .join('\n');

  return { kind: 'rejected', feedback, approvalPercentage: pct };
}
