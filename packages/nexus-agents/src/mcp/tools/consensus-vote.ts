/* eslint-disable max-lines */ // Consensus voting — cohesive single module (governance: 400-600 OK)
/**
 * nexus-agents/mcp - Consensus Vote Tool
 * @module mcp/tools/consensus-vote
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ILogger } from '../../core/index.js';
import { boundArtifactForReview, type BoundedArtifact } from '../../utils/bounded-artifact.js';
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
  toolSuccessStructured,
  type ToolResult,
  type BaseMcpToolDeps,
} from './tool-result.js';
import type { ConsensusAlgorithm, Vote, ConsensusResult, Proposal } from '../../consensus/types.js';
import { SUPERMAJORITY_THRESHOLD } from '../../consensus/types-core.js';
import type { VoterRole, AgentVoteResult } from '../../cli/vote-types.js';
import { collectRealVotes } from '../../cli/voter-agents.js';
import { evaluateOptionGate, optionThresholdFor } from './consensus-vote-option-gate.js';
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
  VotingStrategySchema,
  VoteDecisionStatusSchema,
  VoteThresholdSchema,
  ConsensusVoteInputSchema,
  buildResponse,
  getDefaultErrorPolicy,
  isHigherOrderStrategy,
  shouldEscalateLowPosterior,
  resolveVoteDecision,
  toRecordDecision,
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
import {
  runAsJob,
  defaultCollisionEnvelope,
  type JobEnvelopeBuilders,
} from '../jobs/run-as-job.js';
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
 * Characters of the proposal the contrarian is shown.
 *
 * Unchanged from the value that was inline, so escalation behaviour on
 * ordinary proposals is identical; what changed is that exceeding it is now
 * disclosed to the contrarian rather than silently applied (#5301).
 */
const CONTRARIAN_PROPOSAL_BUDGET = 2000;

/** Build the contrarian prompt, carrying the partial-view note when present. */
function buildContrarianPrompt(bounded: BoundedArtifact): string {
  return [
    'You are a contrarian analyst. Your job is to find reasons this proposal should be REJECTED.',
    'Look for: YAGNI (not needed), MISALIGNED (wrong tech/architecture), SECURITY_RISK, SCOPE_CREEP.',
    '',
    ...(bounded.note === '' ? [] : [bounded.note, '']),
    `Proposal: ${bounded.text}`,
    '',
    'If you find a strong reason to reject, respond with JSON:',
    '{"decision":"reject","confidence":0.0-1.0,"reasoning":"your concern"}',
    'If the proposal is sound, respond with:',
    '{"decision":"approve","confidence":0.0-1.0,"reasoning":"why it is acceptable"}',
  ].join('\n');
}

/**
 * Record that the contrarian saw only part of the proposal.
 *
 * Logged rather than left silent because `shouldEscalate: false` is the same
 * value whether the contrarian read everything or 4% of it, so the envelope
 * alone cannot distinguish them.
 */
function logPartialProposal(bounded: BoundedArtifact, log: ILogger): void {
  if (bounded.bound === undefined) return;
  log.info('Contrarian sees a partial proposal', {
    reviewedChars: bounded.bound.reviewedChars,
    totalChars: bounded.bound.totalChars,
  });
}

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
    // #5301: the proposal was cut to 2000 chars with no marker. A `pr_review`
    // proposal carries up to MAX_DIFF_LENGTH = 50_000 bytes of diff, so the
    // contrarian could be deciding whether to escalate having seen ~4% of it —
    // the header region, where a diff is least informative — and returned the
    // same `shouldEscalate: false` it returns after reading the whole thing.
    const bounded = boundArtifactForReview(proposal, CONTRARIAN_PROPOSAL_BUDGET, 'proposal');
    logPartialProposal(bounded, log);
    const result = await executeExpert('architecture', buildContrarianPrompt(bounded));
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
  opts?: {
    voteTimeoutMs?: number;
    gatewayAdapters?: readonly IModelAdapter[] | undefined;
    /** #5393: stops LAUNCHING un-started voters when `cancel_job` fires. */
    signal?: AbortSignal | undefined;
  }
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
  opts?: {
    voteTimeoutMs?: number;
    gatewayAdapters?: readonly IModelAdapter[] | undefined;
    /** #5393: stops LAUNCHING un-started voters when `cancel_job` fires. */
    signal?: AbortSignal | undefined;
  }
): Promise<ExtendedVotingResult> {
  const result = await executeVotingInner(input, logger, opts ?? {});
  // #4135: stamp the response-layer decision (incl. `no_quorum`) ONCE, using the
  // SAME `resolveVoteDecision` `buildResponse` consumes, so pipeline consumers can
  // honor a quorum void instead of misreading it as a rejection — without
  // recomputing the policy math (DRY; the decision can't diverge). `errorCount`
  // uses the identical definition `buildResponse` uses.
  const errorCount = result.votes.filter((v) => v.source === 'error').length;
  // #4472: when the proposal declared options, the leading option must clear
  // the bar too. Applied BEFORE the decision is stamped so the record and the
  // response both reflect the gated verdict — a veto that only reached the
  // response would leave the audit trail claiming an approval that did not
  // happen. No-op when no options were declared.
  applyOptionGate(input, result);
  result.decision = resolveVoteDecision(input, result, errorCount).decision;
  return result;
}

/**
 * Veto an approved verdict whose declared-option split failed its bar.
 *
 * Mutates `result` in place: `executeVoting` owns it and has not yet published
 * it. Only ever flips approved to rejected, never the reverse — and the
 * resulting `decision` must be `rejected`, not `no_quorum` (#4529): the panel
 * convened and disagreed, which is the opposite of a voided vote.
 *
 * Exported for the composition test (#4529): the defect this guards against
 * lives in how this function's output feeds `resolveVoteDecision` on the very
 * next line of `executeVoting`, not in either function alone.
 */
export function applyOptionGate(input: ConsensusVoteInput, result: ExtendedVotingResult): void {
  const declaredOptions = input.options;
  if (declaredOptions === undefined || declaredOptions.length === 0) return;

  const outcome = evaluateOptionGate(
    result.votes,
    declaredOptions,
    optionThresholdFor(result.strategy, input.threshold),
    result.result.outcome === 'approved'
  );

  if (!outcome.vetoed) {
    result.optionGate = outcome.verdict;
    return;
  }

  result.result.outcome = 'rejected';
  // #4529: the reason rides on the verdict, NOT on policyReason. policyReason
  // means "an error policy voided this vote", and resolveVoteDecision
  // short-circuits any non-undefined value straight to `no_quorum` — so
  // borrowing the field filed a measured split as "nothing was decided", and
  // `--on-no-quorum=retry` then re-rolled the panel and discarded the dissent
  // the gate had just detected. Decided by a 7-voter higher_order panel
  // (6 approvers, all selecting this shape).
  result.optionGate =
    outcome.reason !== undefined ? { ...outcome.verdict, reason: outcome.reason } : outcome.verdict;
}

// eslint-disable-next-line max-lines-per-function -- see block comment above
async function executeVotingInner(
  input: ConsensusVoteInput,
  logger: ILogger,
  // Required here, normalized by `executeVoting`. Every `opts.` inside was a
  // branch against the same never-null value; taking the option away at this
  // boundary removes them all rather than adding one more (#5393).
  opts: {
    voteTimeoutMs?: number;
    gatewayAdapters?: readonly IModelAdapter[] | undefined;
    /** #5393: stops LAUNCHING un-started voters when `cancel_job` fires. */
    signal?: AbortSignal | undefined;
  }
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
    ...(opts.voteTimeoutMs !== undefined && { timeoutMs: opts.voteTimeoutMs }),
    ...(opts.gatewayAdapters !== undefined && { gatewayAdapters: opts.gatewayAdapters }),
    declaredOptions: input.options,
    signal: opts.signal,
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
    // #4986: hand over the decision `resolveVoteDecision` already produced
    // (stamped on the result by `executeVoting`). `errorVoided` alone cannot
    // express an absolute_quorum void, whose reason is stamped on the response
    // and never on the result — so the record used to say `approved` for a vote
    // this tool reports as `no_quorum`.
    resolvedDecision: toRecordDecision(result.decision),
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
  args: ConsensusVoteInput,
  signal?: AbortSignal
): Promise<{ ok: true; value: ConsensusVoteResponse } | { ok: false; error: string }> {
  const logger = deps.logger ?? createLogger({ tool: 'consensus_vote' });
  try {
    const result = await executeVoting(args, logger, {
      ...(deps.gatewayAdapters !== undefined && { gatewayAdapters: deps.gatewayAdapters }),
      signal,
    });
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

    if (result.decision === undefined) {
      throw new Error('Consensus vote completed without a resolved decision');
    }
    recordVoteSuccess({
      proposal: args.proposal,
      strategy: result.strategy,
      decision: toRecordDecision(result.decision) ?? 'no_quorum',
      durationMs: result.totalTimeMs,
      approvalPercentage: result.result.approvalPercentage,
      votes: result.votes,
    });
    const { costSummary, voteRecord } = recordVoteSideEffects(
      args.proposal,
      result.strategy,
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
 * Cancellation semantics (#5393). This paragraph previously claimed
 * `collectRealVotes` "honors per-voter signals" via plumbing from #3038. It did
 * not — the function had no signal parameter at all, so `cancel_job` marked the
 * job cancelled while every remaining voter still ran. The comment describing a
 * capability that did not exist is plausibly why that went unnoticed.
 *
 * What happens now: the signal is threaded to the vote launcher, which checks it
 * after each stagger delay and does NOT launch the voters that have not started,
 * recording them as error results rather than as any decision. Votes already
 * in flight are left to settle — an adapter call is a subprocess or HTTP request
 * whose cost is already incurred, and abandoning it would lose the result
 * without saving the spend. The dispatcher still writes whatever landed, so
 * audit visibility into who voted before the cancel is preserved.
 *
 * Concurrency cap is enforced via `tryAcquire('consensus_vote')`
 * (default 2; voting is 7-fan-out so caps multiply adapter load fast).
 */
/**
 * Reject when the vote failed, so `runAsJob` records the job `failed` rather
 * than `complete` (#4362). Increment 2 (#4363) folds this fail-closed check into
 * `runAsJob` itself for every caller.
 *
 * Exported so the transform can be asserted without standing up a live voter
 * panel (the success path initializes the whole memory substrate).
 * @internal
 */
export async function unwrapVoteOrThrow(
  pending: ReturnType<typeof handleConsensusVote>
): Promise<Awaited<ReturnType<typeof handleConsensusVote>>> {
  const result = await pending;
  if (!result.ok) throw new Error(result.error);
  return result;
}

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
    // #5066: structured envelopes — this tool declares an outputSchema, and
    // the SDK rejects a non-error result that carries no structured content.
    toEnvelope: ASYNC_ENVELOPES,
    // #4362: `handleConsensusVote`'s `{ ok: false }` used to flow into the job
    // record verbatim, and `runAsJob` records `complete` for anything its `run`
    // callback RESOLVES — so a dead voter panel produced a job a caller polling
    // `get_job_result` read as a success. Reject instead, mirroring the sync
    // sibling's `toolStructuredError` on the same condition.
    // #5393: arity 3. `runAsJob` derives `signalAccepted` from `run.length`, so
    // taking the signal is what makes the job record say cancellation works —
    // the claim follows the capability instead of being asserted separately.
    run: (_jobId, input, signal) => unwrapVoteOrThrow(handleConsensusVote(deps, input, signal)),
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

/**
 * Async-dispatch envelopes carrying `structuredContent` (#5066).
 *
 * `runAsJob`'s defaults are text-only. Because this tool declares an
 * `outputSchema`, the SDK requires structured content on every non-error
 * result, so every `mode: 'async'` call failed with -32602 — the mode the
 * tool's own description recommends for 7-voter panels.
 */
const ASYNC_ENVELOPES: JobEnvelopeBuilders<ToolResult> = {
  pending: (jobId) =>
    toolSuccessStructured({
      status: 'pending',
      jobId,
      pollTool: 'get_job_result',
      note: 'Poll via get_job_result({ jobId }) until status !== "pending".',
    }),
  busy: (retryAfterMs, toolName) =>
    toolSuccessStructured({
      status: 'busy',
      retryAfterMs,
      note: `Async-mode concurrency cap reached for ${toolName}. Retry later or use mode: "sync".`,
    }),
  replay: (jobId) =>
    toolSuccessStructured({
      status: 'replay',
      jobId,
      pollTool: 'get_job_result',
      note: 'Poll via get_job_result({ jobId }) until status !== "pending".',
    }),
  collision: defaultCollisionEnvelope,
};

/**
 * Output schema for consensus_vote tool (Issue #1117, #1246).
 *
 * Every vote field is optional because this tool has TWO response shapes and
 * `registerTool` takes a `ZodRawShape`, which cannot express a discriminated
 * union (#5066). `status` tells them apart: present means an async-dispatch
 * envelope, absent means a completed vote.
 *
 * What that gives up is requiredness. What it keeps is the guarantee that
 * actually protects the protocol: the SDK validates with
 * `additionalProperties: false`, so an UNDECLARED response field still fails
 * every call — the #5044 regression this schema exists to catch.
 */
export const CONSENSUS_VOTE_OUTPUT_SCHEMA = {
  /** Async-dispatch envelope discriminator — absent on a completed vote. */
  status: z.enum(['pending', 'busy', 'replay']).optional(),
  jobId: z.string().max(200).optional(),
  pollTool: z.literal('get_job_result').optional(),
  note: z.string().max(500).optional(),
  retryAfterMs: z.number().optional(),
  proposal: z.string().optional(),
  strategy: VotingStrategySchema.optional(),
  // Reuses the canonical VoteDecisionStatusSchema (single source) — a hand-listed
  // subset here (was ['approved','rejected','no_quorum']) omitted the reachable
  // 'timeout'/'pending' outcomes and made strict clients reject those votes (#4032).
  decision: VoteDecisionStatusSchema.optional(),
  approvalPercentage: z.number().optional(),
  voteCounts: z
    .object({
      approve: z.number(),
      reject: z.number(),
      abstain: z.number(),
      error: z.number(),
    })
    .optional(),
  votes: z
    .array(
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
    )
    .optional(),
  threshold: VoteThresholdSchema.optional(),
  durationMs: z.number().optional(),
  simulateVotes: z.boolean().optional(),
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
  voteRecordPersisted: z.boolean().optional(),
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
  // #4472: declared-option outcome. Present whenever the proposal declared
  // `options`. `unattributedApprovals` is part of the contract, not telemetry:
  // without it a caller cannot tell a real split from unreadable responses.
  optionOutcome: z
    .object({
      tally: z.array(z.object({ option: z.string(), count: z.number().int().nonnegative() })),
      leadingOption: z.string().optional(),
      leadingShare: z.number().min(0).max(1),
      approverCount: z.number().int().nonnegative(),
      selectedCount: z.number().int().nonnegative(),
      unattributedApprovals: z.number().int().nonnegative(),
      thresholdMet: z.boolean(),
      // #4529: present only on a veto. Declared here because a strict MCP
      // client rejects any property the advertised schema omits — the same
      // drift that made degraded-panel votes unusable before #4032.
      vetoReason: z.string().max(400).optional(),
    })
    .optional(),
};

/** Advertised MCP input schema for consensus_vote (hoisted to keep the register fn within its line budget). */
/**
 * The schema advertised to MCP clients.
 *
 * Registered from {@link ConsensusVoteInputSchema}'s shape rather than
 * hand-copied. A subset drifts: `options` shipped internally in #4494 and was
 * unreachable through the tool until someone noticed, and `mode` stayed
 * unadvertised while this tool's own description told callers to pass it —
 * so the documented async path could not be invoked at all (#4969).
 */
export const CONSENSUS_VOTE_TOOL_SCHEMA = ConsensusVoteInputSchema.shape;

/** Advertised MCP tool description for consensus_vote. */
const CONSENSUS_VOTE_DESCRIPTION =
  'Execute multi-model consensus voting on a proposal. ' +
  'Uses 7 roles by default (architect, security, devex, ai_ml, pm, catfish, scope_steward) ' +
  'or 3 with quickMode (architect, security, scope_steward), voting with configurable strategies. ' +
  'higher_order does NOT decide the verdict by correlation-aware aggregation (#4701): approve/reject ' +
  'is a simple tally of the panel, so correlated voters each carry full independent weight. The ' +
  'Bayesian correlation analysis is computed and feeds contrarian escalation only. Choose it for the ' +
  'escalation behaviour, not for a weighted verdict. ' +
  "Supports async mode (mode: 'async') — returns a jobId to poll via get_job_result. " +
  'Pass ratifies=<subject> to bind an authority-ladder ratification vote into its authentic record. ' +
  'If your proposal asks voters to choose among named alternatives, you MUST pass them in ' +
  '`options` (#4472) — the threshold is then measured over WHICH option won, and the record ' +
  'carries the per-option tally plus selection coverage. WITHOUT `options` the tally is ' +
  'approve/reject/abstain only, so every voter who engages returns `approve` and a 6-1 split on ' +
  'which option persists as 7-0, 100% (#4452).';

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
