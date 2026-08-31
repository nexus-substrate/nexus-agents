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
import type { VotingStrategy, ErrorPolicy } from '../mcp/tools/consensus-vote-types.js';
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
  /** Use quick mode (3 agents instead of the full 7-role panel). */
  readonly quickMode?: boolean | undefined;
  /** Voting strategy (default: 'higher_order'). */
  readonly strategy?: VotingStrategy | undefined;
  /**
   * #4138: error policy for the vote (default: 'absolute_quorum'). The dev-pipeline
   * plan gate opts in to `absolute_quorum` so an errored voter — especially the
   * contrarian — degrades to a recoverable `no_quorum` (which the bounded
   * `maxNoQuorumRetries` re-run then terminal path already honors) instead of being
   * silently dropped from the denominator. Overridable per-caller.
   */
  readonly errorPolicy?: ErrorPolicy | undefined;
  /**
   * #4135: how many times to re-run the SAME plan when a vote returns
   * `no_quorum` — a missing/errored voice, not a rejection — before giving up
   * (default: 2). Counted SEPARATELY from `maxIterations`: a quorum void is a
   * recoverable "re-run the missing voice" state, not a plan-revision trigger, so
   * it must not consume the refine budget.
   */
  readonly maxNoQuorumRetries?: number | undefined;
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
/** #4135: default bounded re-runs for a `no_quorum` void (separate from maxIterations). */
const DEFAULT_MAX_NO_QUORUM_RETRIES = 2;
const DEFAULT_MAX_PROPOSAL_LENGTH = 4000;
const DEFAULT_STRATEGY: VotingStrategy = 'higher_order';
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
  /** #4135: bounded re-runs for a `no_quorum` void (separate from maxIterations). */
  readonly maxNoQuorumRetries: number;
}

/**
 * Run one vote and, on a `no_quorum` void, re-run the SAME plan (a voice was
 * missing — the plan is fine, so we do NOT revise) up to `maxNoQuorumRetries`
 * times (#4135). Returns the recovered vote, or the last `no_quorum` when the
 * bounded re-runs are exhausted.
 */
async function voteWithQuorumRecovery(state: ConsensusLoopState): Promise<VoteResult> {
  let vote = await executeSingleVote(state.plan, state.config, state.log);
  for (
    let attempt = 1;
    vote.kind === 'no_quorum' && attempt <= state.maxNoQuorumRetries;
    attempt++
  ) {
    state.log.warn('Vote reached no_quorum — re-running the missing voice (bounded)', {
      attempt,
      maxNoQuorumRetries: state.maxNoQuorumRetries,
      reason: vote.reason,
    });
    emitPipelineStageEvent(state.prefix, 'vote', 'started');
    vote = await executeSingleVote(state.plan, state.config, state.log);
  }
  return vote;
}

/**
 * Run one consensus iteration: vote (with bounded no_quorum recovery), then
 * classify. Returns `{ result }` when accepted (stop), `{ terminal }` when the
 * quorum could not be reached after the bounded re-runs (#4135 — a non-rejected
 * TERMINAL failure, do NOT drop into revise), or `{}` to continue (rejected).
 */
async function runOneIteration(
  state: ConsensusLoopState,
  iteration: number
): Promise<{ result?: IterativeConsensusResult; terminal?: IterativeConsensusResult }> {
  state.log.info('Consensus iteration', { iteration });
  emitPipelineStageEvent(state.prefix, 'vote', 'started');

  state.lastVote = await voteWithQuorumRecovery(state);
  const iterMs = getTimeProvider().now() - state.globalStart;
  const accepted = isVoteAccepted(state.lastVote);
  emitPipelineStageEvent(state.prefix, 'vote', accepted ? 'completed' : 'failed', {
    durationMs: iterMs,
  });

  if (accepted) {
    return { result: { vote: state.lastVote, iterations: iteration, durationMs: iterMs } };
  }
  // #4135: a quorum void that survived the bounded re-runs is TERMINAL — surface a
  // non-rejected failure so it never enters the refine-and-re-vote loop.
  if (state.lastVote.kind === 'no_quorum') {
    const terminalVote: VoteResult = {
      kind: 'no_quorum',
      reason: `vote could not reach quorum after ${String(state.maxNoQuorumRetries)} re-run(s): ${state.lastVote.reason}`,
      approvalPercentage: state.lastVote.approvalPercentage,
    };
    return { terminal: { vote: terminalVote, iterations: iteration, durationMs: iterMs } };
  }
  return {};
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
    maxNoQuorumRetries: config?.maxNoQuorumRetries ?? DEFAULT_MAX_NO_QUORUM_RETRIES,
  };

  return runConsensusLoop(state, maxIter, revisePlan);
}

/**
 * The plan→vote→(revise) loop. Stops on acceptance, on a terminal `no_quorum`
 * void (#4135 — never dropping into revise), or on iteration exhaustion.
 */
async function runConsensusLoop(
  state: ConsensusLoopState,
  maxIter: number,
  revisePlan: (plan: string, feedback: string) => Promise<string>
): Promise<IterativeConsensusResult> {
  for (let i = 0; i < maxIter; i++) {
    const outcome = await runOneIteration(state, i + 1);
    const done = outcome.result ?? outcome.terminal;
    if (done !== undefined) return done;
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
): {
  proposal: string;
  strategy: VotingStrategy;
  simulateVotes: boolean;
  quickMode: boolean;
  errorPolicy: ErrorPolicy;
} {
  const c = config ?? {};
  const maxLen = c.maxProposalLength ?? DEFAULT_MAX_PROPOSAL_LENGTH;
  return {
    proposal: plan.slice(0, maxLen),
    strategy: c.strategy ?? DEFAULT_STRATEGY,
    simulateVotes: c.simulateVotes ?? false,
    quickMode: c.quickMode ?? false,
    // #4138: the dev-pipeline plan gate opts in to absolute_quorum (overridable).
    errorPolicy: c.errorPolicy ?? 'absolute_quorum',
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
    // Pre-#2951 this returned { kind: 'approved', approvalPercentage: 0 } —
    // auto-approving on infrastructure failure inverts the gate's purpose.
    // A vote that physically didn't happen is NOT consensus to proceed.
    // Returning rejected lets runIterativeConsensus count this against
    // maxIterations and surface the failure to the operator.
    const msg = error instanceof Error ? error.message : String(error);
    log.warn('Vote execution failed, treating as rejected', { error: msg });
    return {
      kind: 'rejected',
      feedback: `Vote infrastructure failed — no consensus produced: ${msg}`,
      approvalPercentage: 0,
    };
  }
}

/** Parse executeVoting output into a VoteResult. */
function parseVotingResult(result: {
  /**
   * #4135: the response-layer decision (incl. `no_quorum`) `executeVoting` stamps.
   * Preferred over the 2-valued engine `outcome` so a quorum void is honored, not
   * misread as a rejection. Absent for callers/mocks that don't set it — the
   * engine outcome is the fallback (legacy behavior, never `no_quorum`).
   */
  readonly decision?: string;
  readonly result: {
    readonly outcome: string;
    readonly voteCounts: { readonly approve: number; readonly reject: number };
  };
  readonly votes: ReadonlyArray<{
    readonly vote: { readonly decision: string; readonly reasoning: string };
  }>;
}): VoteResult {
  const total = Math.max(1, result.result.voteCounts.approve + result.result.voteCounts.reject);
  const pct = (result.result.voteCounts.approve / total) * 100;

  const decision =
    result.decision ?? (result.result.outcome === 'approved' ? 'approved' : 'rejected');

  if (decision === 'approved') {
    return { kind: 'approved', approvalPercentage: pct };
  }
  // #4135: a quorum void — the plan is fine, a voice was missing. Do NOT synthesize
  // rejection feedback (that would feed a plan revision the loop must skip).
  if (decision === 'no_quorum') {
    return {
      kind: 'no_quorum',
      reason: 'vote could not reach quorum (a voice was missing)',
      approvalPercentage: pct,
    };
  }

  const feedback = result.votes
    .filter((v) => v.vote.decision !== 'approve')
    .map((v) => v.vote.reasoning)
    .join('\n');

  return { kind: 'rejected', feedback, approvalPercentage: pct };
}
