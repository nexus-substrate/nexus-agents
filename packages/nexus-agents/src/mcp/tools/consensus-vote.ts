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
import {
  wrapToolWithTimeout,
  toSdkCallbackWithBudgetCheck,
  getToolTimeout,
} from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import {
  toolStructuredError,
  toolSuccess,
  type ToolResult,
  type BaseMcpToolDeps,
} from './tool-result.js';
import type { ConsensusAlgorithm, Vote, ConsensusResult, Proposal } from '../../consensus/types.js';
import { SUPERMAJORITY_THRESHOLD } from '../../consensus/types-core.js';
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
  VoteDecisionStatusSchema,
  VoteThresholdSchema,
  ErrorPolicySchema,
  ConsensusVoteInputSchema,
  buildResponse,
  getDefaultErrorPolicy,
  isHigherOrderStrategy,
  shouldEscalateLowPosterior,
  resolveVoteDecision,
} from './consensus-vote-types.js';
import { applyErrorPolicy } from './consensus-vote-error-policy.js';
import {
  recordVoteSuccess,
  recordVoteError,
  recordAuthenticVote,
} from './consensus-vote-recording.js';
import type { VoteRecordPersistOutcome } from './consensus-vote-recording.js';
import { recordDecisionCost } from './decision-cost-recording.js';
import { DecisionCostSummarySchema } from '../../observability/decision-cost.js';
import type { IModelAdapter } from '../../core/index.js';
import { emitVoteRejectedSignal } from './consensus-vote-signals.js';
import { getPipelineEventBus } from '../../pipeline/event-bus.js';
import { checkSimulationAllowed, simulationDeniedResult } from './simulation-guard.js';
import { getToolAnnotations } from '../tool-annotations.js';
// #3045 / epic #2631 Stage 4 — async-mode dispatch + concurrency cap.
// #3045 / epic #2631 Stage 4 — async-mode dispatch via the shared `runAsJob`
// helper (#3729).
import { runAsJob } from '../jobs/run-as-job.js';
import { randomUUID } from 'node:crypto';
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
//
// Lifecycle & memory model (documented per #3169):
//   * SCOPE: one process-wide, lazily-created instance shared by every
//     `consensus_vote` call. It accumulates cross-proposal voter agreement so
//     the higher_order strategy can down-weight correlated (redundant) voters.
//     One shared tracker is intentional — correlation signal is only useful
//     pooled across proposals.
//   * PERSISTENCE: backed by `createPersistentCorrelationTracker()`, which
//     hydrates from / appends to the on-disk correlation store, so the signal
//     survives restarts (the in-memory map is a hot cache over that store).
//   * MEMORY BOUND: NOT unbounded. The underlying `CorrelationTracker` is
//     FIFO-bounded by `maxProposals` / `maxObservationsPerAgent` (#521) —
//     oldest proposals are evicted once the cap is hit (eviction is logged at
//     debug in `correlation-tracker.ts`, so memory pressure is observable).
//   * RESET: `resetCorrelationTracker()` drops the instance; the next
//     `getOrCreateCorrelationTracker()` rebuilds it (re-hydrating from disk).
//     Test-isolation only. There is intentionally no per-milestone "reset
//     between cycles" coordinator API — eviction already bounds growth, and
//     clearing history mid-run would discard the signal the strategy needs.
let persistentCorrelationTracker: ICorrelationTracker | undefined;

/**
 * Gets or creates the process-wide persistent CorrelationTracker (#517).
 * See the lifecycle / memory-bound / reset notes above the declaration (#3169).
 */
function getOrCreateCorrelationTracker(): ICorrelationTracker {
  persistentCorrelationTracker ??= createPersistentCorrelationTracker();
  return persistentCorrelationTracker;
}

/**
 * Drops the singleton so the next {@link getOrCreateCorrelationTracker} rebuilds
 * it (re-hydrating from the persistent store). Test-isolation only. @internal
 */
export function resetCorrelationTracker(): void {
  persistentCorrelationTracker = undefined;
}

// --- Dependencies ---
export interface ConsensusVoteDeps extends BaseMcpToolDeps {
  /** MCP notifier for client-visible logging (Issue #974) */
  notifier?: IMcpNotifier | undefined;
  /**
   * In-process gateway model adapters (#4040). When the server has a configured
   * OpenAI-compatible gateway, voters route through these HTTP adapters instead
   * of shelling out to a CLI subprocess — no per-subprocess key forwarding, and
   * the nested-spawn deadlock (#4033) cannot occur. Omitted ⇒ CLI voter path.
   */
  gatewayAdapters?: readonly IModelAdapter[] | undefined;
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
  return strategy;
}

function getVoterRoles(quickMode: boolean): readonly VoterRole[] {
  // Default panel expanded to 7 roles 2026-04-25 — scope_steward added to
  // catch build-vs-buy blind spots (#2185). QuickMode substitutes
  // scope_steward for pm so fast triage covers existence-justification.
  return quickMode
    ? ['architect', 'security', 'scope_steward']
    : ['architect', 'security', 'devex', 'ai_ml', 'pm', 'catfish', 'scope_steward'];
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

/**
 * Creates a synthetic ConsensusResult for an error-policy short-circuit
 * (#2630). Reused for both the hard floor (errors > 50%) and `fail_closed`.
 * Stamps the reason on the proposal title and, since #3124, reports the TRUE
 * vote breakdown of the responding (non-error) voters instead of all-zeros —
 * the internal `outcome` stays `rejected` (the policy failed closed), but the
 * counts and `approvalPercentage` are honest (e.g. 6 approvals + 1 error →
 * approve:6, 100%). As of #4053 the user-facing `decision` for this short-circuit
 * is `no_quorum` (not `rejected`) — too many voters errored to reach a valid
 * consensus, which is distinct from the panel rejecting the proposal.
 */
export function createPolicyFailedResult(
  proposal: string,
  algorithm: ConsensusAlgorithm,
  reason: string,
  votes: readonly AgentVoteResult[]
): ConsensusResult {
  const now = new Date().toISOString();
  const voteMap = new Map<string, Vote>();
  let approve = 0;
  let reject = 0;
  let abstain = 0;
  for (const v of votes) {
    if (v.source === 'error') continue; // errors surface separately, not as a decision
    voteMap.set(v.role, v.vote);
    if (v.vote.decision === 'approve') approve++;
    else if (v.vote.decision === 'reject') reject++;
    else abstain++;
  }
  const responding = approve + reject + abstain;
  return {
    proposalId: 'error-policy-short-circuit',
    proposal: { title: `MCP Consensus Vote — ${reason}`, description: proposal, algorithm },
    outcome: 'rejected',
    votes: voteMap,
    voteCounts: { approve, reject, abstain, total: responding },
    approvalPercentage: responding > 0 ? (approve / responding) * 100 : 0,
    quorumReached: false,
    startedAt: now,
    closedAt: now,
    durationMs: 0,
  };
}

/** Thresholds per algorithm for cascade detection. */
const CASCADE_THRESHOLDS: Record<string, number> = {
  majority: 0.5,
  supermajority: SUPERMAJORITY_THRESHOLD,
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

/**
 * Run the consensus engine over already-policy-applied votes.
 *
 * Callers MUST pass `engineVotes` produced by `applyErrorPolicy` (#2630)
 * — under `reduce_denominator` that means errors are already filtered;
 * under `count_as_abstain` errors have been converted to abstain
 * decisions but kept in the array. This function does no further
 * filtering on `source`.
 */
async function processVotesThroughEngine(
  engineVotes: readonly AgentVoteResult[],
  proposal: string,
  algorithm: ConsensusAlgorithm
): Promise<ConsensusResult> {
  if (engineVotes.length === 0) return createEmptyConsensusResult(proposal, algorithm);

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
  for (const { role, vote } of engineVotes) await engine.vote(proposalId, role, vote);

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
  if (!isHigherOrderStrategy(strategy)) return undefined;
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
  outcome: 'approved' | 'rejected',
  logger: ILogger
): void {
  // #3170: record the REAL (LLM) votes even when the panel is mixed-source,
  // rather than dropping ALL correlation data because one voter simulated/errored.
  // Recording the accurate LLM-only subset beats leaving the matrix permanently stale.
  const llmVotes = votes.filter((v) => v.source === 'llm');
  if (llmVotes.length < votes.length) {
    logger.warn('Recording only LLM votes to correlation tracker; excluding non-LLM votes', {
      recorded: llmVotes.length,
      excluded: votes.length - llmVotes.length,
    });
  }
  if (llmVotes.length === 0) return; // nothing real to record
  const llmVoteMap = new Map<string, Vote>();
  for (const v of llmVotes) llmVoteMap.set(v.role, v.vote);

  const tracker = getOrCreateCorrelationTracker();
  const id = `consensus-${String(getTimeProvider().now())}-${getRandomProvider().random().toString(36).slice(2, 9)}`;
  tracker.recordProposalVotes(id, llmVoteMap, outcome);
  logger.debug('Recorded votes to tracker', { proposalId: id, outcome });

  try {
    const persisted = createPersistedProposal(id, llmVoteMap, outcome);
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
/**
 * Run the engine + cascade-detection + higher-order voting against
 * already-policy-applied votes (#2630).
 *
 * Callers MUST pass `engineVotes` produced by `applyErrorPolicy` — no
 * filtering on `source` happens inside this function. Cascade-detection
 * counts and the higher-order voteMap are both built directly from
 * `engineVotes`.
 */
async function processVotesWithCascade(
  engineVotes: readonly AgentVoteResult[],
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
  const approvals = engineVotes.filter((v) => v.vote.decision === 'approve').length;
  const rejections = engineVotes.filter((v) => v.vote.decision === 'reject').length;
  const cascadeInfo = detectEarlyCascade(opts.algorithm, approvals, rejections, opts.totalRoles);

  if (cascadeInfo.decided) {
    opts.log.info('Vote cascade: outcome decided early', {
      approvals,
      rejections,
      total: opts.totalRoles,
      reason: cascadeInfo.reason,
    });
  }

  const engineResult = await processVotesThroughEngine(engineVotes, opts.proposal, opts.algorithm);
  const voteMap = new Map<string, Vote>();
  for (const { role, vote } of engineVotes) voteMap.set(role, vote);

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

/**
 * Run a single contrarian agent to check for YAGNI/MISALIGNED/SECURITY_RISK
 * (#1799). `errored` (#4132) is true when the contrarian voice could NOT be
 * obtained (import/executeExpert failure, or the expert reported failure) — the
 * absolute_quorum policy routes that to `no_quorum` instead of silently
 * proceeding as if the contrarian approved.
 */
async function runContrarianCheck(
  proposal: string,
  log: ILogger
): Promise<{ shouldEscalate: boolean; reason: string; confidence: number; errored: boolean }> {
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
    // Expert-bridge reported failure — the contrarian voice was NOT obtained.
    if (!result.success) return { shouldEscalate: false, reason: '', confidence: 0, errored: true };

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    // The expert responded but emitted no structured concern — treat as "no
    // escalation" (it spoke, it just didn't flag a blocker), not an error.
    if (jsonMatch === null)
      return { shouldEscalate: false, reason: '', confidence: 0, errored: false };

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
      return { shouldEscalate: true, reason: reasoning, confidence, errored: false };
    }

    return { shouldEscalate: false, reason: '', confidence, errored: false };
  } catch (error: unknown) {
    // Closes #2952 (medium): pre-fix the bare `catch {}` swallowed
    // `executeExpert` failures, JSON parse errors, and expert-bridge
    // import errors identically — the escalation guardrail silently
    // disabled itself with no log trail. Log + return the default
    // "no escalation" envelope so a contrarian-check infrastructure
    // bug is at least visible in operator logs.
    const message = error instanceof Error ? error.message : String(error);
    log.warn('Contrarian check failed; defaulting to no escalation', { error: message });
    // #4132: the contrarian voice was NOT obtained — errored:true so
    // absolute_quorum can degrade to no_quorum instead of silently proceeding.
    return { shouldEscalate: false, reason: '', confidence: 0, errored: true };
  }
}

/**
 * Build a short-circuit result for the error-policy gate (#2630). Called
 * when the hard floor (>50% errors) trips or `fail_closed` matches.
 * Logs the warning and returns the synthetic `ExtendedVotingResult` that
 * `executeVoting` propagates to the response builder.
 */
function buildPolicyShortCircuitResult(args: {
  input: ConsensusVoteInput;
  strategy: VotingStrategy;
  algorithm: ConsensusAlgorithm;
  roles: readonly VoterRole[];
  votes: readonly AgentVoteResult[];
  errorPolicy: ConsensusVoteInput['errorPolicy'];
  reason: string;
  startTime: number;
  logger: ILogger;
}): ExtendedVotingResult {
  args.logger.warn('Consensus vote short-circuited by error policy', {
    errorPolicy: args.errorPolicy,
    reason: args.reason,
  });
  const totalTimeMs = getTimeProvider().now() - args.startTime;
  return {
    proposal: args.input.proposal,
    threshold: args.algorithm,
    result: createPolicyFailedResult(args.input.proposal, args.algorithm, args.reason, args.votes),
    votes: args.votes,
    totalTimeMs,
    simulateVotes: args.input.simulateVotes,
    strategy: args.strategy,
    // #4132: thread the requested panel shape so the absolute_quorum predicate
    // in buildResponse has PANEL_SIZE + contrarian-presence even on a short-circuit.
    panelSize: args.roles.length,
    contrarianRequested: args.roles.includes('catfish'),
    // #3124: surface WHY a high-approval result is still 'rejected' so callers
    // don't mistake a fail-closed policy short-circuit for a genuine rejection.
    policyReason: args.reason,
  };
}

/**
 * Escalation gate for `quickMode` approvals. Two independent triggers, both
 * re-running `executeVoting` with the full voter panel:
 *
 * 1. Posterior-confidence (#3174): for `higher_order`/`opinion_wise`, a borderline
 *    Bayesian posterior (below `HIGHER_ORDER_ESCALATION_POSTERIOR_FLOOR`) means the
 *    3-voter quick panel was barely decisive — escalate without spending a
 *    contrarian call. Checked first so a borderline posterior short-circuits it.
 * 2. Contrarian agent (#1799): run a single contrarian to catch
 *    YAGNI / SECURITY_RISK / SCOPE_CREEP; escalate if it rejects with high
 *    confidence.
 *
 * Returns:
 *  - `{ escalated }` — a full-panel re-vote result to use instead;
 *  - `{ degradeReason }` — (#4132, absolute_quorum only) the contrarian check
 *    ERRORED, so the quickMode verdict must degrade to `no_quorum`;
 *  - `{}` — no escalation, continue with the quickMode result.
 */
export async function maybeEscalateContrarian(
  input: ConsensusVoteInput,
  outcome: 'approved' | 'rejected',
  ctx: { strategy: VotingStrategy; posteriorApproval: number | undefined },
  logger: ILogger,
  // Mirror executeVoting's opts so gateway routing (#4040) survives the escalation
  // re-vote — the object is forwarded by reference today, but the wider type makes
  // that contract explicit and refactor-safe.
  opts?: { voteTimeoutMs?: number; gatewayAdapters?: readonly IModelAdapter[] | undefined }
): Promise<{ escalated?: ExtendedVotingResult; degradeReason?: string }> {
  if (!input.quickMode || outcome !== 'approved' || input.simulateVotes) return {};

  if (shouldEscalateLowPosterior(ctx.strategy, outcome, input.quickMode, ctx.posteriorApproval)) {
    logger.warn('Posterior-confidence escalation: re-running with full vote (#3174)', {
      strategy: ctx.strategy,
      posteriorApproval: ctx.posteriorApproval,
    });
    return { escalated: await executeVoting({ ...input, quickMode: false }, logger, opts) };
  }

  const escalation = await runContrarianCheck(input.proposal, logger);
  // #4132: under absolute_quorum, a contrarian check that ERRORED means the
  // contrarian voice was never heard — that voids the quorum (no_quorum), it is
  // not silently skipped. Only under absolute_quorum; every other policy keeps
  // the pre-#4132 behavior of proceeding with the quickMode result.
  if (escalation.errored && input.errorPolicy === 'absolute_quorum') {
    logger.warn('Contrarian check errored under absolute_quorum — degrading to no_quorum (#4132)');
    return {
      degradeReason: 'no_quorum: re-run — contrarian check errored (absolute_quorum quick-mode)',
    };
  }
  if (!escalation.shouldEscalate) return {};
  logger.warn('Contrarian escalation: re-running with full vote', {
    reason: escalation.reason,
    confidence: escalation.confidence,
  });
  return { escalated: await executeVoting({ ...input, quickMode: false }, logger, opts) };
}

/*
 * Top-level voting flow: vote collection → error-policy gate → engine +
 * cascade → contrarian escalation → finalize. Further extraction
 * obscures control flow more than it helps; helpers already extracted
 * are applyErrorPolicy, buildPolicyShortCircuitResult,
 * maybeEscalateContrarian, finalizeVotingResult.
 */
export async function executeVoting(
  input: ConsensusVoteInput,
  logger: ILogger,
  opts?: { voteTimeoutMs?: number; gatewayAdapters?: readonly IModelAdapter[] | undefined }
): Promise<ExtendedVotingResult> {
  const result = await executeVotingInner(input, logger, opts);
  // #4135: stamp the response-layer decision (incl. `no_quorum`) ONCE, using the
  // SAME `resolveVoteDecision` `buildResponse` consumes, so pipeline consumers can
  // honor a quorum void instead of misreading it as a rejection — without
  // recomputing the policy math (DRY; the decision can't diverge). `errorCount`
  // uses the identical definition `buildResponse` uses.
  const errorCount = result.votes.filter((v) => v.source === 'error').length;
  result.decision = resolveVoteDecision(input, result, errorCount).decision;
  return result;
}

// eslint-disable-next-line max-lines-per-function -- see block comment above
async function executeVotingInner(
  input: ConsensusVoteInput,
  logger: ILogger,
  opts?: { voteTimeoutMs?: number; gatewayAdapters?: readonly IModelAdapter[] | undefined }
): Promise<ExtendedVotingResult> {
  const strategy = resolveStrategy(input);
  const algorithm = strategyToAlgorithm(strategy);
  const roles = getVoterRoles(input.quickMode);
  const startTime = getTimeProvider().now();
  const errorPolicy = input.errorPolicy ?? getDefaultErrorPolicy(strategy);

  logger.info('Starting consensus vote', {
    strategy,
    algorithm,
    roleCount: roles.length,
    errorPolicy,
  });
  const votes = await collectRealVotes({
    roles,
    proposal: input.proposal,
    simulate: input.simulateVotes,
    ...(opts?.voteTimeoutMs !== undefined && { timeoutMs: opts.voteTimeoutMs }),
    ...(opts?.gatewayAdapters !== undefined && { gatewayAdapters: opts.gatewayAdapters }),
  });

  // Error-policy gate (#2630): hard floor + fail_closed + reduce_denominator /
  // count_as_abstain transformation. Engine sees the resulting shape.
  const policyDecision = applyErrorPolicy(votes, errorPolicy);
  if (policyDecision.shortCircuit) {
    return buildPolicyShortCircuitResult({
      input,
      strategy,
      algorithm,
      roles,
      votes,
      errorPolicy,
      reason: policyDecision.reason ?? 'error policy short-circuit',
      startTime,
      logger,
    });
  }

  // Check for early cascade and process votes (#1765)
  const { engineResult, higherOrderResult, outcome, cascaded } = await processVotesWithCascade(
    policyDecision.engineVotes,
    {
      totalRoles: roles.length,
      proposal: input.proposal,
      algorithm,
      strategy,
      log: logger,
    }
  );

  recordVotesToTracker(votes, outcome, logger);

  const escalation = await maybeEscalateContrarian(
    input,
    outcome,
    { strategy, posteriorApproval: higherOrderResult?.posteriorApproval },
    logger,
    opts
  );
  if (escalation.escalated !== undefined) return escalation.escalated;

  const finalized = finalizeVotingResult({
    input,
    strategy,
    algorithm,
    roles,
    engineResult,
    higherOrderResult,
    votes,
    outcome,
    cascaded,
    startTime,
    logger,
  });
  // #4132: a contrarian check that errored under absolute_quorum voids the quorum
  // — stamp policyReason so buildResponse's existing ternary downgrades to
  // no_quorum, matching the errored-voter path. (Kept out of finalizeVotingResult
  // to hold executeVoting within its cyclomatic budget.)
  return applyContrarianDegrade(finalized, escalation.degradeReason);
}

/**
 * #4132: stamp the contrarian-check-errored degrade reason onto a finalized
 * result (unless an upstream short-circuit already set one). A no-op when the
 * contrarian check ran cleanly (`degradeReason` undefined).
 */
function applyContrarianDegrade(
  result: ExtendedVotingResult,
  degradeReason: string | undefined
): ExtendedVotingResult {
  if (degradeReason === undefined || result.policyReason !== undefined) return result;
  return { ...result, policyReason: degradeReason };
}

/**
 * Run a consensus vote with a plain goal as the proposal, default settings
 * (real voters, default strategy). The strategy executor the unified `run`
 * entry point dispatches to for the `consensus` strategy (#3575). Non-simulated.
 */
export async function runConsensusForGoal(
  goal: string,
  logger: ILogger = createLogger({ tool: 'consensus_vote' }),
  gatewayAdapters?: readonly IModelAdapter[]
): Promise<ExtendedVotingResult> {
  // Parse through the schema so defaults (quickMode, simulateVotes:false) apply.
  // #4042: thread the in-process gateway adapters so the run/MetaOrchestrator
  // consensus path routes voters through the gateway like consensus_vote (#4040),
  // not the CLI subprocess.
  return executeVoting(ConsensusVoteInputSchema.parse({ proposal: goal }), logger, {
    ...(gatewayAdapters !== undefined && { gatewayAdapters }),
  });
}

/** Build the final `ExtendedVotingResult` once the engine + cascade settle. */
function finalizeVotingResult(args: {
  input: ConsensusVoteInput;
  strategy: VotingStrategy;
  algorithm: ConsensusAlgorithm;
  roles: readonly VoterRole[];
  engineResult: ConsensusResult;
  higherOrderResult: ReturnType<typeof runHigherOrderVoting>;
  votes: readonly AgentVoteResult[];
  outcome: 'approved' | 'rejected';
  cascaded: boolean;
  startTime: number;
  logger: ILogger;
}): ExtendedVotingResult {
  const totalTimeMs = getTimeProvider().now() - args.startTime;
  args.logger.info('Consensus vote completed', {
    strategy: args.strategy,
    outcome: args.outcome,
    durationMs: totalTimeMs,
    cascaded: args.cascaded,
  });
  const result: ExtendedVotingResult = {
    proposal: args.input.proposal,
    threshold: args.algorithm,
    result: args.engineResult,
    votes: args.votes,
    totalTimeMs,
    simulateVotes: args.input.simulateVotes,
    strategy: args.strategy,
    // #4132: PANEL_SIZE + contrarian-presence for the absolute_quorum predicate.
    panelSize: args.roles.length,
    contrarianRequested: args.roles.includes('catfish'),
  };
  if (args.higherOrderResult !== undefined) result.higherOrderResult = args.higherOrderResult;
  return result;
}

// --- Handler & Registration ---
/**
 * Best-effort post-vote side effects, extracted to keep `handleConsensusVote`
 * under the per-function line cap. Persists the authentic hash-chained vote
 * record (#3897) and rolls up per-decision cost (#3855), sharing one decision
 * id as the correlation key. Neither must fail the vote — both are guarded.
 *
 * Returns both the cost rollup and the structured vote-record persistence
 * outcome (#3991) so the handler can surface persistence visibility in the
 * result instead of leaving a skip as a server-only WARN.
 */
function recordVoteSideEffects(
  proposal: string,
  strategy: string,
  result: ExtendedVotingResult,
  logger: ILogger,
  ratifies?: string
): {
  costSummary: ReturnType<typeof recordDecisionCost> | undefined;
  voteRecord: VoteRecordPersistOutcome;
} {
  const decisionId = `consensus-${String(getTimeProvider().now())}-${randomUUID().slice(0, 8)}`;
  // #3897: persist an authentic, hash-chained vote record to the committable
  // governance artifact at vote time so the promotion gate/CI can rest
  // authenticity on the chain, not on hand-transcribed YAML. #4004: bind the
  // authority-tier ratification subject into the record when provided.
  const voteRecord = recordAuthenticVote({
    proposal,
    strategy,
    result: result.result,
    votes: result.votes,
    // #4053: an error-policy short-circuit voided the vote → the PERSISTED record
    // must record `no_quorum`, matching the MCP response (not a stale `rejected`).
    errorVoided: result.policyReason !== undefined,
    correlationId: decisionId,
    ...(ratifies !== undefined ? { ratifies } : {}),
  });
  // #3855: roll up + persist this decision's per-voter cost and ride it on the
  // existing response (no new MCP tool). A rollup failure must not fail the vote.
  let costSummary: ReturnType<typeof recordDecisionCost> | undefined;
  try {
    costSummary = recordDecisionCost({ decisionId, gate: 'consensus_vote', votes: result.votes });
  } catch (costError) {
    logger.warn('Per-decision cost rollup failed (non-fatal)', {
      error: getErrorMessage(costError),
    });
    costSummary = undefined;
  }
  return { costSummary, voteRecord };
}

async function handleConsensusVote(
  deps: ConsensusVoteDeps,
  args: ConsensusVoteInput
): Promise<{ ok: true; value: ConsensusVoteResponse } | { ok: false; error: string }> {
  const logger = deps.logger ?? createLogger({ tool: 'consensus_vote' });
  try {
    const result = await executeVoting(args, logger, {
      ...(deps.gatewayAdapters !== undefined && { gatewayAdapters: deps.gatewayAdapters }),
    });
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
    const { costSummary, voteRecord } = recordVoteSideEffects(
      args.proposal,
      strategy,
      result,
      logger,
      args.ratifies
    );
    // Close the self-tuning loop: a rejected vote emits signal.vote_rejected
    // onto the typed pipeline bus for the shadow TuneStage (#3147; #3289 Option 2).
    emitVoteRejectedSignal(result.result, getPipelineEventBus(), logger);
    return { ok: true, value: buildResponse(args, result, costSummary, voteRecord) };
  } catch (error) {
    const message = getErrorMessage(error);
    const cause = error instanceof Error ? error : new Error(message);
    logger.error('Consensus vote failed', cause);
    recordVoteError(args.proposal, message);
    return { ok: false, error: `Voting failed: ${message}` };
  }
}

type ConsensusVoteToolResponse = ToolResult;

/**
 * Dispatch the vote on a background promise + return a pending envelope
 * (#3045 / epic #2631 Stage 4). Mirrors run_workflow / orchestrate.
 *
 * Cancellation semantics: when `cancel_job` lands while the vote is
 * in-flight, the existing collector unwinds via the AbortSignal plumbing
 * already in #3038 — `collectRealVotes` honors per-voter signals — and
 * the dispatcher writes whatever partial vote set landed before the
 * abort signal as the job result. That preserves audit visibility into
 * who voted before the cancel happened, instead of throwing away all
 * the work.
 *
 * Concurrency cap is enforced via `tryAcquire('consensus_vote')`
 * (default 2; voting is 7-fan-out so caps multiply adapter load fast).
 */
function dispatchAsyncConsensusVote(
  deps: ConsensusVoteDeps,
  args: import('./consensus-vote-types.js').ConsensusVoteInput
): ConsensusVoteToolResponse {
  // #3729: dispatch via the shared `runAsJob` helper — the exact sequence this
  // function used to inline. consensus_vote's only diff is the freshJobId; its
  // pending/busy/replay/collision envelopes are byte-for-byte the helper's
  // ToolResult defaults, so no per-tool `toEnvelope` is needed.
  return runAsJob<
    import('./consensus-vote-types.js').ConsensusVoteInput,
    Awaited<ReturnType<typeof handleConsensusVote>>
  >({
    toolName: 'consensus_vote',
    input: args,
    idempotencyKey: args.idempotencyKey,
    freshJobId: () => `job-vote-${randomUUID()}`,
    run: (_jobId, input) => handleConsensusVote(deps, input),
    ...(deps.logger !== undefined ? { logger: deps.logger } : {}),
  });
}

/**
 * Run the synchronous vote path + format the response. Extracted from
 * the handler so the async-mode branch keeps the per-function size cap
 * (#3045 added a branch + dispatcher call site to the handler).
 */
async function runSyncConsensusVote(
  deps: ConsensusVoteDeps,
  notifier: IMcpNotifier,
  args: import('./consensus-vote-types.js').ConsensusVoteInput
): Promise<ConsensusVoteToolResponse> {
  const result = await withProgressHeartbeat('consensus_vote', notifier, () =>
    handleConsensusVote(deps, args)
  );
  if (!result.ok) {
    return toolStructuredError({ errorCategory: 'internal', message: result.error });
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
}

function createConsensusVoteHandler(deps: ConsensusVoteDeps) {
  const notifier = deps.notifier ?? NOOP_NOTIFIER;
  return async (args: unknown, ctx: HandlerContext): Promise<ConsensusVoteToolResponse> => {
    const validationResult = ConsensusVoteInputSchema.safeParse(args);
    if (!validationResult.success) {
      return toolStructuredError({
        errorCategory: 'validation',
        message: `Validation error: ${formatZodError(validationResult.error)}`,
      });
    }
    // #4170: simulateVotes fails CLOSED outside test runners — checked in the
    // sync prelude BEFORE the async runAsJob dispatch so sync and async modes
    // reject identically (no pending envelope for a random panel).
    if (validationResult.data.simulateVotes) {
      const simCheck = checkSimulationAllowed('consensus_vote', ctx.logger);
      if (!simCheck.allowed) return simulationDeniedResult(simCheck.reason);
    }
    const strategy = validationResult.data.strategy ?? 'simple_majority';
    ctx.logger.debug('Starting consensus vote', {
      strategy,
      quickMode: validationResult.data.quickMode,
      ...(validationResult.data.mode !== undefined ? { mode: validationResult.data.mode } : {}),
    });
    notifier.info('consensus_vote', {
      event: 'vote_start',
      proposalLength: validationResult.data.proposal.length,
      strategy,
    });
    // #3045 / epic #2631 Stage 4 — async-mode dispatch.
    if (validationResult.data.mode === 'async') {
      const asyncResult = dispatchAsyncConsensusVote(deps, validationResult.data);
      notifier.info('consensus_vote', {
        event: 'vote_dispatched_async',
        proposalLength: validationResult.data.proposal.length,
        strategy,
      });
      return asyncResult;
    }
    return runSyncConsensusVote(deps, notifier, validationResult.data);
  };
}

/** Output schema for consensus_vote tool (Issue #1117, #1246). */
export const CONSENSUS_VOTE_OUTPUT_SCHEMA = {
  proposal: z.string(),
  strategy: VotingStrategySchema,
  // Reuses the canonical VoteDecisionStatusSchema (single source) — a hand-listed
  // subset here (was ['approved','rejected','no_quorum']) omitted the reachable
  // 'timeout'/'pending' outcomes and made strict clients reject those votes (#4032).
  decision: VoteDecisionStatusSchema,
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
  threshold: VoteThresholdSchema.optional(),
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
  // #3124: explains a `rejected` decision that coexists with a high
  // approvalPercentage (an error-policy short-circuit, e.g. fail_closed).
  policyReason: z.string().max(200).optional(),
  // #3991: whether the authentic vote record was persisted at vote time. Post-
  // #3991 it routes through nexusDataPath under governance/, so true is the
  // normal case; false means all-simulated (skipped by design) or write-failed
  // (data dir unwritable) — voteRecordNote carries the actionable reason. Makes
  // a previously WARN-only skip visible to MCP callers.
  voteRecordPersisted: z.boolean(),
  voteRecordNote: z.string().max(500).optional(),
  // #3587: set when the panel DEGRADED (some voters errored), so the decision
  // rests on fewer voters than requested. Part of the response since #3587 but
  // omitted from this schema until #4032 — its absence made a strict MCP client
  // reject any degraded-panel vote (`-32602 additional properties`).
  panelWarning: z.string().optional(),
  // #3855: per-decision cost rollup. Same omission as panelWarning (#4032) — it
  // is present on the response whenever cost recording succeeds (common in `api`
  // billing mode). Shared schema lives with the type (single source of truth).
  costSummary: DecisionCostSummarySchema.optional(),
};

/** Advertised MCP input schema for consensus_vote (hoisted to keep the register fn within its line budget). */
const CONSENSUS_VOTE_TOOL_SCHEMA = {
  proposal: z.string().min(1).max(MAX_PROPOSAL_LENGTH).describe('Proposal text to vote on'),
  threshold: z
    .enum(['majority', 'supermajority', 'unanimous'])
    .optional()
    .describe('Voting threshold (legacy). Use strategy instead.'),
  strategy: VotingStrategySchema.optional().describe(
    'Voting strategy: simple_majority (default), supermajority, unanimous, proof_of_learning, or higher_order'
  ),
  errorPolicy: ErrorPolicySchema.optional().describe(
    'How to treat errored/timed-out voters (#2630): reduce_denominator (default non-strict) | count_as_abstain | fail_closed (default unanimous) | absolute_quorum (#4132 opt-in — an errored voter, esp. the contrarian, degrades the verdict to no_quorum instead of being dropped; never manufactures approved/rejected from an induced error). Errors > 50% always fails.'
  ),
  quickMode: z.boolean().optional().default(false).describe('Use 3 agents instead of 7'),
  simulateVotes: z
    .boolean()
    .optional()
    .default(false)
    .describe('TESTS ONLY — random output, must not be used for real decisions (#2319)'),
  ratifies: z
    .string()
    .min(1)
    .max(256)
    .optional()
    .describe(
      'Authority-tier ratification subject (#4004) — the loop/strategy id this vote ratifies for an authority-ladder promotion. Bound into the authentic vote record so the promotion gate can verify it. Omit for ordinary votes.'
    ),
};

/** Advertised MCP tool description for consensus_vote. */
const CONSENSUS_VOTE_DESCRIPTION =
  'Execute multi-model consensus voting on a proposal. ' +
  'Uses 7 roles by default (architect, security, devex, ai_ml, pm, catfish, scope_steward) ' +
  'or 3 with quickMode (architect, security, scope_steward), voting with configurable strategies. ' +
  'Supports higher_order strategy for Bayesian-optimal aggregation with correlation awareness (Issue #514). ' +
  "Supports async mode (mode: 'async') — returns a jobId to poll via get_job_result. " +
  'Pass ratifies=<subject> to bind an authority-ladder ratification vote into its authentic record.';

/**
 * Registers the consensus_vote tool with the MCP server.
 * Uses createSecureHandler (Issue #531) with timeout protection (Issue #271).
 * @category MCP
 */
export function registerConsensusVoteTool(server: McpServer, deps: ConsensusVoteDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'consensus_vote' });
  const notifier = deps.notifier ?? createMcpNotifier(server);
  const depsWithNotifier = { ...deps, notifier };

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
    {
      description: CONSENSUS_VOTE_DESCRIPTION,
      inputSchema: CONSENSUS_VOTE_TOOL_SCHEMA,
      outputSchema: CONSENSUS_VOTE_OUTPUT_SCHEMA,
      annotations: getToolAnnotations('consensus_vote'),
    },
    toSdkCallbackWithBudgetCheck(wrappedHandler, 'consensus_vote', timeoutMs, logger)
  );
  logger.info('Registered consensus_vote tool with secure handler and timeout protection');
}
