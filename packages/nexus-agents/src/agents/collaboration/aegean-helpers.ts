/**
 * Aegean Protocol Helpers
 * (Source: Issue #216, Sprint #219)
 *
 * Helper functions for aegean-protocol.ts.
 * Pure utility functions are in aegean-helpers-utils.ts.
 */

import type { Result, IAgent, TaskResult } from '../../core/index.js';
import { ok, err, AgentError, getTimeProvider } from '../../core/index.js';
import type {
  AgentVote,
  AegeanRound,
  AegeanResult,
  AegeanConfig,
  Proposal,
  QuorumStatus,
} from './aegean-types.js';
import { AegeanConfigSchema, DEFAULT_AEGEAN_CONFIG } from './aegean-types.js';
import type { CollaborationConfig } from './collaboration-types.js';

// Re-export utilities from aegean-helpers-utils.ts
export {
  parseVoteStatus,
  extractReasoning,
  createTimeoutVote,
  createLeaderVote,
  createVoteFromOutput,
  createProposalTask,
  createProposal,
  createVoteTask,
  selectLeader,
  evaluateQuorumStatus,
  type EvaluateQuorumOptions,
} from './aegean-helpers-utils.js';

// =============================================================================
// Types
// =============================================================================

/** Options for vote collection. */
export interface CollectVotesOptions {
  readonly experts: readonly string[];
  readonly agents: Map<string, IAgent>;
  readonly proposal: Proposal;
  readonly leaderId: string;
  readonly roundNumber: number;
  readonly sessionId: string;
}

/** Options for creating Aegean protocol. */
export interface AegeanProtocolBuildOptions {
  readonly aegeanConfig?: Partial<AegeanConfig>;
}

// =============================================================================
// Config Building
// =============================================================================

/** Builds and validates Aegean configuration. */
export function buildAegeanConfig(options: AegeanProtocolBuildOptions): AegeanConfig {
  const merged = { ...DEFAULT_AEGEAN_CONFIG, ...options.aegeanConfig };
  const parsed = AegeanConfigSchema.safeParse(merged);
  if (!parsed.success) {
    throw new Error(`Invalid Aegean config: ${parsed.error.message}`);
  }
  return parsed.data;
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
    totalDurationMs: getTimeProvider().now() - opts.startTime,
    tokensUsed: opts.tokensUsed,
    rounds: opts.rounds,
    terminationReason: opts.terminationReason,
  };
}

// =============================================================================
// Round Helpers
// =============================================================================

/** Options for creating round data. */
export interface CreateRoundDataOptions {
  readonly roundNumber: number;
  readonly leaderId: string;
  readonly proposal: Proposal;
  readonly votes: AgentVote[];
  readonly quorumStatus: QuorumStatus;
  readonly startTime: number;
}

/** Creates round data object. */
export function createRoundData(opts: CreateRoundDataOptions): AegeanRound {
  return {
    roundNumber: opts.roundNumber,
    phase: opts.quorumStatus.consensusReached ? 'done' : 'voting',
    leaderId: opts.leaderId,
    proposal: opts.proposal,
    votes: opts.votes,
    quorumStatus: opts.quorumStatus,
    startTime: opts.startTime,
    endTime: getTimeProvider().now(),
  };
}

// =============================================================================
// Consensus Loop Helpers
// =============================================================================

/** Result of a consensus loop iteration. */
export type IterationAction =
  | { type: 'continue' }
  | { type: 'consensus'; value: unknown }
  | { type: 'early_termination' }
  | { type: 'cancelled' };

/** Options for determining iteration action. */
export interface DetermineIterationActionOptions {
  readonly cancelled: boolean;
  readonly consensusReached: boolean;
  readonly consensusValue: unknown;
  readonly earlyTerminationEnabled: boolean;
  readonly shouldEarlyTerminate: boolean;
}

/** Determines the action to take after a consensus round. */
export function determineIterationAction(opts: DetermineIterationActionOptions): IterationAction {
  if (opts.cancelled) return { type: 'cancelled' };
  if (opts.consensusReached) return { type: 'consensus', value: opts.consensusValue };
  if (opts.earlyTerminationEnabled && opts.shouldEarlyTerminate)
    return { type: 'early_termination' };
  return { type: 'continue' };
}

// =============================================================================
// Pre-Round Helpers
// =============================================================================

/** Determines if the consensus loop should exit before starting a round. */
export function determinePreRoundAction(
  cancelled: boolean,
  rounds: readonly AegeanRound[],
  startTime: number,
  tokensUsed: number
): AegeanResult | null {
  if (cancelled) {
    return buildAegeanResult({
      rounds,
      consensusValue: null,
      terminationReason: 'error',
      startTime,
      tokensUsed,
    });
  }
  return null;
}

/** Context for loop iteration handling. */
export interface IterationContext {
  readonly rounds: readonly AegeanRound[];
  readonly startTime: number;
  readonly tokensUsed: number;
}

/** Creates context object for iteration handling. */
export function createIterationContext(
  rounds: readonly AegeanRound[],
  startTime: number,
  totalTokensUsed: number
): IterationContext {
  return { rounds, startTime, tokensUsed: totalTokensUsed };
}

// =============================================================================
// Iteration Action Processing
// =============================================================================

/** Options for processing iteration action. */
export interface ProcessIterationActionOptions {
  readonly action: IterationAction;
  readonly round: number;
  readonly sessionId: string;
  readonly maxRounds: number;
  readonly ctx: IterationContext;
  readonly emitIterationEvent: (
    round: number,
    status: 'converged' | 'max_reached' | 'in_progress',
    sessionId: string
  ) => void;
  readonly onEarlyTermination?: (round: number) => void;
}

/** Processes the iteration action and returns result if loop should exit. */
export function processIterationAction(opts: ProcessIterationActionOptions): AegeanResult | null {
  const { action, round, sessionId, ctx, emitIterationEvent, onEarlyTermination } = opts;

  switch (action.type) {
    case 'consensus':
      emitIterationEvent(round, 'converged', sessionId);
      return buildAegeanResult({
        rounds: ctx.rounds,
        consensusValue: action.value,
        terminationReason: 'consensus',
        startTime: ctx.startTime,
        tokensUsed: ctx.tokensUsed,
      });
    case 'early_termination':
      if (onEarlyTermination) onEarlyTermination(round);
      emitIterationEvent(round, 'max_reached', sessionId);
      return buildAegeanResult({
        rounds: ctx.rounds,
        consensusValue: null,
        terminationReason: 'max_rounds',
        startTime: ctx.startTime,
        tokensUsed: ctx.tokensUsed,
      });
    case 'continue':
      emitIterationEvent(round, 'in_progress', sessionId);
      return null;
    case 'cancelled':
      return buildAegeanResult({
        rounds: ctx.rounds,
        consensusValue: null,
        terminationReason: 'error',
        startTime: ctx.startTime,
        tokensUsed: ctx.tokensUsed,
      });
  }
}

// =============================================================================
// Loop Result Building
// =============================================================================

/** Builds the final loop result with provided parameters. */
export function buildLoopResult(
  rounds: readonly AegeanRound[],
  consensusValue: unknown,
  terminationReason: AegeanResult['terminationReason'],
  startTime: number,
  tokensUsed: number
): AegeanResult {
  return buildAegeanResult({ rounds, consensusValue, terminationReason, startTime, tokensUsed });
}

// =============================================================================
// Validation Helpers
// =============================================================================

/** Options for validating Aegean protocol setup. */
export interface ValidateSetupOptions {
  readonly config: CollaborationConfig;
  readonly agents: Map<string, IAgent>;
  readonly byzantineTolerance: number;
}

/** Validates the Aegean protocol setup. */
export function validateAegeanSetup(opts: ValidateSetupOptions): Result<void, AgentError> {
  const minAgents = 3 * opts.byzantineTolerance + 1;
  if (opts.config.experts.length < minAgents) {
    return err(
      new AgentError(
        `Aegean requires at least ${String(minAgents)} agents for f=${String(opts.byzantineTolerance)} Byzantine tolerance`
      )
    );
  }

  for (const expertId of opts.config.experts) {
    if (!opts.agents.has(expertId)) {
      return err(new AgentError(`Agent not found: ${expertId}`));
    }
  }

  return ok(undefined);
}

// =============================================================================
// Session Finalization Helpers
// =============================================================================

/** Builds a task result for session submission. */
export function buildSessionTaskResult(
  taskId: string,
  result: AegeanResult,
  startTime: number
): TaskResult {
  return {
    taskId,
    output: {
      consensusValue: result.consensusValue,
      aegean: {
        rounds: result.totalRounds,
        consensusReached: result.consensusReached,
        terminationReason: result.terminationReason,
      },
    },
    metadata: {
      durationMs: getTimeProvider().now() - startTime,
      tokensUsed: result.tokensUsed,
      toolsUsed: [],
      model: 'aegean-protocol',
    },
  };
}
