import { acceptanceIdentity, type AcceptanceContext } from './acceptance-context.js';
import { buildPlanVoteProposal, type VoteResearchSuffix } from './plan-vote-proposal.js';
export { buildVoteProposal } from './plan-vote-proposal.js';
import {
  captureAcceptanceRequest,
  recordAcceptanceInvocation,
  retainBuiltinVoteEvidence,
  getAcceptanceMetadata,
  type AcceptanceRun,
} from './acceptance-binding.js';
/**
 * Agent Executor vote stage — proposal construction, result classification and
 * the fail-closed stage itself (#3258, #4135, #4143, #6331).
 *
 * @module pipeline/agent-executor-vote
 */

import { warmModelMetadata } from '../adapters/model-metadata.js';
import { getVoterRoles } from '../cli/voter-roles.js';
import type { VoterRole } from '../cli/vote-types.js';
import { resolvePanelSeats, resolvePanelReadBudget } from '../mcp/tools/pr-review-panel-budget.js';
import {
  MAX_PROPOSAL_LENGTH,
  type ExtendedVotingResult,
  type VotingStrategy,
} from '../mcp/tools/consensus-vote-types.js';
import { createLogger, getTimeProvider, type IModelAdapter } from '../core/index.js';
import type { DevPipelineStages, VoteResult } from './dev-pipeline.js';
import { CONTRARIAN_PROPOSAL_BUDGET } from '../mcp/tools/consensus-vote-contrarian.js';
import { MAX_VOTE_ARTIFACT_BYTES } from '../cli/vote-artifact.js';
import { recordCompletedVote } from '../mcp/tools/consensus-vote-completed-recording.js';
import { sanitizeOutput } from '../security/output-sanitizer.js';
import {
  type AgentExecutorConfig,
  type StageDeps,
  emitStageEvent,
  postProgress,
  recordOutcome,
} from './agent-executor-core.js';

/** Pipeline plan votes are recorded apart from MCP consensus_vote calls (#6872). */
const PIPELINE_VOTE = { gate: 'dev_pipeline_vote', options: undefined } as const;

const logger = createLogger({ component: 'agent-executor' });

/** A clipped supplemental reviewer cannot authorize complete-plan approval. */
function assertQuickPlanSupported(proposal: string, quickMode: boolean): void {
  if (quickMode && proposal.length > CONTRARIAN_PROPOSAL_BUDGET) {
    throw new Error('Quick-mode contrarian cannot review this complete plan; use the full panel');
  }
}

/** Bound votes always measure assigned seats; legacy short proposals keep their contract. */
function requiresAssignedCapacity(
  proposal: string,
  config: AgentExecutorConfig,
  acceptance: AcceptanceContext | undefined
): boolean {
  return (
    config.simulateVotes !== true &&
    (acceptance !== undefined || proposal.length > MAX_PROPOSAL_LENGTH)
  );
}

/** Budget expanded plans against the exact assigned models, not guessed defaults. */
async function prepareCompletePlanVote(
  plan: string,
  research: string,
  config: AgentExecutorConfig,
  signal: AbortSignal | undefined,
  acceptance: AcceptanceContext | undefined
): Promise<{
  proposal: string;
  suffix: VoteResearchSuffix;
  roleAdapters: ReadonlyMap<VoterRole, IModelAdapter> | undefined;
}> {
  const { proposal, suffix } = buildPlanVoteProposal(plan, research, acceptance);
  assertQuickPlanSupported(proposal, config.quickMode ?? false);
  // Simulation has no measured model capacity; it remains explicitly test-only.
  // Ordinary summaries retain their existing path; expanded plans require proof.
  if (!requiresAssignedCapacity(proposal, config, acceptance)) {
    return { proposal, suffix, roleAdapters: undefined };
  }
  const roles = getVoterRoles(config.quickMode ?? false);
  const panel = await resolvePanelSeats(roles, undefined, logger);
  if (!panel.ok) throw new Error(`Plan vote context capacity unavailable: ${panel.reason}`);
  if (panel.seats.size !== roles.length || roles.some((role) => !panel.seats.has(role))) {
    throw new Error('Plan vote context capacity unavailable: incomplete assigned panel');
  }
  await warmModelMetadata(panel.seats.values(), signal);
  const models = [...panel.seats].map(([seat, adapter]) => ({ seat, modelId: adapter.modelId }));
  const budget = resolvePanelReadBudget(models, MAX_VOTE_ARTIFACT_BYTES);
  if (budget.source !== 'registry') {
    throw new Error(`Plan vote context capacity unmeasured: ${budget.detail}`);
  }
  const bytes = Buffer.byteLength(proposal, 'utf8');
  if (bytes > budget.panelReadBudgetBytes) {
    throw new Error(
      `Complete plan proposal exceeds context budget: ${String(bytes)} bytes > ` +
        `${String(budget.panelReadBudgetBytes)} bytes (${budget.detail})`
    );
  }
  return { proposal, suffix, roleAdapters: panel.seats };
}

/** Run the canonical vote with the exact proposal and preflighted seats. */
async function executePlanVote(
  plan: string,
  research: string,
  deps: StageDeps,
  strategy: VotingStrategy,
  signal: AbortSignal | undefined
): Promise<{ proposal: string; suffix: VoteResearchSuffix; votingResult: ExtendedVotingResult }> {
  const { config, acceptanceRun } = deps;
  const { executeVoting } = await import('../mcp/tools/consensus-vote.js');
  const { proposal, suffix, roleAdapters } = await prepareCompletePlanVote(
    plan,
    research,
    config,
    signal,
    acceptanceRun?.context
  );
  const request = captureAcceptanceRequest(acceptanceRun, 'vote', proposal, true);
  signal?.throwIfAborted();
  recordAcceptanceInvocation(request, 'voteInvoked');
  const votingResult = await executeVoting(
    {
      proposal,
      strategy,
      simulateVotes: config.simulateVotes ?? false,
      quickMode: config.quickMode ?? false,
      // #5506: plan approval requires the requested panel, not only survivors.
      errorPolicy: 'absolute_quorum',
    },
    logger,
    // The stage's signal still aborts the in-flight seats (#6736).
    signal !== undefined || roleAdapters !== undefined ? { signal, roleAdapters } : undefined
  );
  return { proposal, suffix, votingResult };
}

/**
 * #4135: classify a `consensus_vote` result into the pipeline {@link VoteResult},
 * reading the response-layer `decision` (which honors a `no_quorum` void under the
 * opt-in absolute_quorum policy / an error-policy short-circuit) rather than the
 * 2-valued engine outcome. Falls back to the engine outcome when `decision` is
 * absent — default-policy callers never see `no_quorum`, so this stays inert until
 * a call site opts in. `no_quorum` is a distinct terminal signal, not a rejection
 * fed into plan revision. Its cause can be an unmet absolute approval floor or
 * missing/errored/unverifiable coverage; it does not establish that the plan is fine.
 */
function classifyVoteStageResult(votingResult: {
  readonly decision?: string;
  readonly decisionReason?: string;
  readonly policyReason?: string;
  readonly result: {
    readonly outcome: string;
    readonly voteCounts: { readonly approve: number; readonly reject: number };
  };
  readonly votes: ReadonlyArray<{
    readonly vote: { readonly decision: string; readonly reasoning: string };
  }>;
}): { vote: VoteResult; label: string } {
  const { approve, reject } = votingResult.result.voteCounts;
  const pct = (approve / Math.max(1, approve + reject)) * 100;
  const decision =
    votingResult.decision ?? (votingResult.result.outcome === 'approved' ? 'approved' : 'rejected');

  if (decision === 'no_quorum') {
    return {
      vote: {
        kind: 'no_quorum',
        reason:
          sanitizeOutput(votingResult.decisionReason ?? votingResult.policyReason ?? '')
            .trim()
            .slice(0, 200) || 'consensus vote could not reach quorum (cause unavailable)',
        approvalPercentage: pct,
      },
      label: 'No quorum — re-run needed',
    };
  }
  if (decision !== 'approved') {
    const feedback = votingResult.votes
      .filter((v) => v.vote.decision !== 'approve')
      .map((v) => v.vote.reasoning)
      .join('\n');
    return { vote: { kind: 'rejected', feedback, approvalPercentage: pct }, label: 'Rejected' };
  }
  return { vote: { kind: 'approved', approvalPercentage: pct }, label: 'Approved' };
}

/**
 * #7181: carry the persisted record's id so the pipeline result can name it.
 * A vote that persisted nothing carries no id rather than a guess.
 */
function withRecordId(
  classified: { vote: VoteResult; label: string },
  recorded: Awaited<ReturnType<typeof recordCompletedVote>>
): { vote: VoteResult; label: string } {
  if (!recorded.voteRecord.persisted) return classified;
  return {
    vote: { ...classified.vote, voteRecordId: recorded.voteRecord.record.id },
    label: classified.label,
  };
}

/**
 * #4143: a vote-stage infra error (all voters errored / adapter down /
 * timeout) FAILS CLOSED to `no_quorum` — a recoverable "the vote couldn't
 * complete, re-run/escalate" state (#4135) — NOT auto-approved. Granting
 * approval on an errored gate is a fail-OPEN: it would execute an unvoted
 * plan. no_quorum blocks execution and routes to the bounded re-run/escalate
 * recovery, consistent with the fail-loud principle behind #4130/#4132.
 */
async function failClosedVote(
  config: AgentExecutorConfig,
  start: number,
  error: unknown
): Promise<VoteResult> {
  const msg = error instanceof Error ? error.message : String(error);
  emitStageEvent('vote', 'failed', { error: msg });
  recordOutcome({
    sessionId: config.sessionId,
    taskId: 'vote',
    category: 'planning',
    cli: 'unknown',
    routedBy: undefined,
    served: undefined,
    accessMode: undefined,
    requestedAccessMode: undefined,
    success: false,
    durationMs: getTimeProvider().now() - start,
    error: msg,
  });
  await postProgress(config, 'Vote', `Error (failing closed — no quorum): ${msg.slice(0, 200)}`);
  return {
    kind: 'no_quorum' as const,
    reason: `vote stage errored — failing closed: ${msg.slice(0, 160)}`,
    approvalPercentage: 0,
  };
}

/** The consensus-vote stage: votes on the plan, failing closed on infra error. */
export function createVoteStage(deps: StageDeps): DevPipelineStages['vote'] {
  const { config, startStage, acceptanceRun } = deps;
  return async (plan, research, signal) => {
    startStage('vote');
    const start = getTimeProvider().now();
    const strategy = config.votingStrategy ?? 'higher_order';
    await postProgress(config, 'Vote', `Running consensus with ${strategy} strategy...`);
    try {
      const { proposal, suffix, votingResult } = await executePlanVote(
        plan,
        research,
        deps,
        strategy,
        signal
      );
      const recorded = await recordCompletedVote(proposal, votingResult, logger, {
        ...PIPELINE_VOTE,
        signal,
      });
      // #4135: read the response-layer decision (honors a `no_quorum` void under
      // the opt-in absolute_quorum policy / an error-policy short-circuit) instead
      // of the 2-valued engine outcome. `classifyVoteStageResult` maps it to the
      // stage VoteResult (incl. the distinct no_quorum terminal signal).
      const { vote, label } = withRecordId(classifyVoteStageResult(votingResult), recorded);
      const ms = getTimeProvider().now() - start;
      emitStageEvent('vote', 'completed', { durationMs: ms });
      // The shared recorder above writes the consensus decision's per-seat
      // outcomes. This stage has no single CLI attribution; its pipeline
      // session trace remains separate from the vote's decision ID (#6858).
      recordOutcome({
        sessionId: config.sessionId,
        taskId: 'vote',
        category: 'planning',
        cli: undefined,
        routedBy: undefined,
        served: undefined,
        accessMode: undefined,
        requestedAccessMode: undefined,
        success: vote.kind === 'approved',
        durationMs: ms,
      });
      await postProgress(
        config,
        'Vote',
        `${label} (${String(Math.round(vote.approvalPercentage))}%, ${String(ms)}ms)`
      );
      retainApprovedEvidence(acceptanceRun, vote, { plan, suffix, recorded });
      return vote.kind === 'approved' || acceptanceRun !== undefined ? vote : { ...vote, proposal };
    } catch (error) {
      return failClosedVote(config, start, error);
    }
  };
}

/** Only the actual persisted, approved builtin result acquires private reconstruction evidence. */
function retainApprovedEvidence(
  run: AcceptanceRun | undefined,
  vote: VoteResult,
  data: {
    plan: string;
    suffix: VoteResearchSuffix;
    recorded: Awaited<ReturnType<typeof recordCompletedVote>>;
  }
): void {
  if (run === undefined || vote.kind !== 'approved' || !data.recorded.voteRecord.persisted) return;
  const record = data.recorded.voteRecord.record;
  if (record.decision !== 'approved') return;
  retainBuiltinVoteEvidence(run, vote, {
    format: 'bound-plan-vote-v1',
    voteRecordId: record.id,
    recordHash: record.hash,
    proposalHash: record.proposalHash,
    planIdentity: acceptanceIdentity(data.plan),
    acceptance: getAcceptanceMetadata(run.context),
    suffix: data.suffix,
  });
}
