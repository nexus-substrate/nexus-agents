/**
 * Contrarian escalation for `quickMode` consensus votes (#1799, #3174, #4132,
 * #6111).
 *
 * A quick-mode approval is a 3-voter verdict. Before it stands, this module
 * either re-runs the vote with the full panel (a borderline Bayesian posterior,
 * or a single contrarian expert rejecting with high confidence) or, under
 * `absolute_quorum`, reports that the contrarian voice could not be obtained so
 * the verdict degrades to `no_quorum` instead of silently proceeding.
 *
 * Moved out of `consensus-vote.ts` as a pure extraction (#6148, row 1): the
 * only in-tree consumer is `executeVotingInner`. The full-panel re-vote is
 * INJECTED (`ctx.revote`) rather than imported, so this module does not
 * import the parent and the split introduces no import cycle.
 *
 * @module mcp/tools/consensus-vote-contrarian
 * (Source: Issue #6148)
 */

import type { ILogger, IModelAdapter } from '../../core/index.js';
import { boundArtifactForReview, type BoundedArtifact } from '../../utils/bounded-artifact.js';
import type { ResolvedVoterProject } from '../../cli/voter-project.js';
import { buildWorkspaceBlock } from '../../cli/voter-response.js';
import { shouldEscalateLowPosterior } from './consensus-vote-types.js';
import type {
  ConsensusVoteInput,
  ContrarianCheckStatus,
  ExtendedVotingResult,
  VotingStrategy,
} from './consensus-vote-types.js';

/** Options forwarded unchanged to the full-panel re-vote (#4040, #5393, #6110). */
interface RevoteOpts {
  voteTimeoutMs?: number;
  gatewayAdapters?: readonly IModelAdapter[] | undefined;
  /** #5393: stops LAUNCHING un-started voters when `cancel_job` fires. */
  signal?: AbortSignal | undefined;
  /** #6110: already resolved by the outer frame; the re-vote reuses it. */
  project?: ResolvedVoterProject | undefined;
  workspace?: string | undefined;
  workspaceSha?: string | undefined;
}

/**
 * The full-panel re-vote, supplied by the caller. `executeVoting` in
 * `consensus-vote.ts` satisfies it; declared here so the sibling never
 * imports the parent.
 */
type QuickModeRevote = (
  input: ConsensusVoteInput,
  logger: ILogger,
  opts?: RevoteOpts
) => Promise<ExtendedVotingResult>;

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
function buildContrarianPrompt(bounded: BoundedArtifact, opts?: RevoteOpts): string {
  const workspaceBlock = buildWorkspaceBlock(opts?.workspace, opts?.workspaceSha);
  return [
    'You are a contrarian analyst. Your job is to find reasons this proposal should be REJECTED.',
    'Look for: YAGNI (not needed), MISALIGNED (wrong tech/architecture), SECURITY_RISK, SCOPE_CREEP.',
    '',
    ...(workspaceBlock === '' ? [] : [workspaceBlock]),
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
  log: ILogger,
  opts?: RevoteOpts
): Promise<{ shouldEscalate: boolean; reason: string; confidence: number; errored: boolean }> {
  try {
    const { executeExpert } = await import('../../pipeline/expert-bridge.js');
    // #5301: the proposal was cut to 2000 chars with no marker. A `pr_review`
    // proposal carries the whole diff whenever it fits the panel's context
    // (#6003; up to the 2 MB input cap), so the
    // contrarian could be deciding whether to escalate having seen ~4% of it —
    // the header region, where a diff is least informative — and returned the
    // same `shouldEscalate: false` it returns after reading the whole thing.
    const bounded = boundArtifactForReview(proposal, CONTRARIAN_PROPOSAL_BUDGET, 'proposal');
    logPartialProposal(bounded, log);
    const result = await executeExpert('architecture', buildContrarianPrompt(bounded, opts), {
      workDir: opts?.workspace,
    });
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
 *
 * Every shape also carries `contrarianCheck` (#6111): what became of the
 * contrarian call itself — `skipped` when this gate returned before making it,
 * `errored` when it was made and the voice was not obtained (under every
 * policy, not only absolute_quorum — the policy decides the verdict, the field
 * reports the check), `ok` when it answered.
 */
export async function maybeEscalateContrarian(
  input: ConsensusVoteInput,
  outcome: 'approved' | 'rejected',
  ctx: {
    strategy: VotingStrategy;
    posteriorApproval: number | undefined;
    /** Required, not defaulted: the compiler names every call site (#6148). */
    revote: QuickModeRevote;
  },
  logger: ILogger,
  // Mirror executeVoting's opts so gateway routing (#4040) survives the escalation
  // re-vote — the object is forwarded by reference today, but the wider type makes
  // that contract explicit and refactor-safe.
  opts?: RevoteOpts
): Promise<{
  escalated?: ExtendedVotingResult;
  degradeReason?: string;
  contrarianCheck: ContrarianCheckStatus;
}> {
  if (!input.quickMode || outcome !== 'approved' || input.simulateVotes) {
    return { contrarianCheck: 'skipped' };
  }

  if (shouldEscalateLowPosterior(ctx.strategy, outcome, input.quickMode, ctx.posteriorApproval)) {
    logger.warn('Posterior-confidence escalation: re-running with full vote (#3174)', {
      strategy: ctx.strategy,
      posteriorApproval: ctx.posteriorApproval,
    });
    return {
      escalated: await ctx.revote({ ...input, quickMode: false }, logger, opts),
      contrarianCheck: 'skipped',
    };
  }

  const escalation = await runContrarianCheck(input.proposal, logger, opts);
  const contrarianCheck: ContrarianCheckStatus = escalation.errored ? 'errored' : 'ok';
  // #4132: under absolute_quorum, a contrarian check that ERRORED means the
  // contrarian voice was never heard — that voids the quorum (no_quorum), it is
  // not silently skipped. Only under absolute_quorum; every other policy keeps
  // the pre-#4132 behavior of proceeding with the quickMode result.
  if (escalation.errored && input.errorPolicy === 'absolute_quorum') {
    logger.warn('Contrarian check errored under absolute_quorum — degrading to no_quorum (#4132)');
    return {
      degradeReason: 'no_quorum: re-run — contrarian check errored (absolute_quorum quick-mode)',
      contrarianCheck,
    };
  }
  if (!escalation.shouldEscalate) return { contrarianCheck };
  logger.warn('Contrarian escalation: re-running with full vote', {
    reason: escalation.reason,
    confidence: escalation.confidence,
  });
  return {
    escalated: await ctx.revote({ ...input, quickMode: false }, logger, opts),
    contrarianCheck,
  };
}
