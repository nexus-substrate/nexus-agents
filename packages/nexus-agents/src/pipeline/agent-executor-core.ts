/**
 * Agent Executor core — the helpers every pipeline stage shares (#1684, #6331).
 *
 * Stage-event emission, OutcomeStore recording, the budget-guarded expert
 * call, progress comments and the executor config. Extracted from
 * `agent-executor.ts` so each stage module imports one seam instead of the
 * whole executor.
 *
 * @module pipeline/agent-executor-core
 */

import { createLogger, getTimeProvider } from '../core/index.js';
import type { ITaskTracker } from './task-tracker.js';
import { executeExpert, type ExpertBridgeResult } from './expert-bridge.js';
import type { BudgetGuard, AgentBudgetConfig } from './budget-guard.js';
import type { BuiltInExpertType } from '../agents/experts/expert-config.js';
import { getOutcomeStore } from '../orchestration/outcomes/outcome-store.js';
import { categorizeOutcomeErrorMessage } from '../orchestration/outcomes/outcome-types.js';
import { emitPipelineStageEvent, emitModelCalled } from './pipeline-observability.js';
import type { CliNameLiteral } from '../config/model-capabilities-types.js';
import type { OutcomeRoutedBy } from '../orchestration/outcomes/outcome-types.js';

const logger = createLogger({ component: 'agent-executor' });

// DRY: delegate to shared pipeline-observability.ts (#1734 Phase 1.1)
/**
 * What a stage records when no trust tier reached it (#4694).
 *
 * The empty case is NAMED rather than defaulted. Recording an absent tier as
 * `'1'`, or omitting the field, would make an unmeasured run indistinguishable
 * from a trusted one — and four voters made this an explicit condition of
 * approving the record-first approach: "a check that cannot fail is not a
 * check, and neither is a recorder that fills in trusted-by-default."
 */
export const UNMEASURED_TRUST_TIER = 'unmeasured';

export function emitStageEvent(
  stage: string,
  status: 'started' | 'completed' | 'failed',
  details?: Record<string, unknown>
): void {
  emitPipelineStageEvent('dev-pipeline', stage, status, details);
}

/** Options bundle for {@link recordOutcome} (collapses to satisfy max-params). */
interface RecordOutcomeArgs {
  taskId: string;
  category: string;
  /**
   * CLI that actually executed the stage. Pre-#2823 this helper hardcoded
   * `cli: 'claude'`, which was a regression of the bug #1154 fixed elsewhere
   * and silently corrupted weather-report + LinUCB cold-start warmStart()
   * with false `claude` credit on every pipeline run.
   *
   * When `undefined` (the bridge failed before dispatch — no adapter,
   * circuit-open, rate-limit cap — or the stage is non-CLI, like local
   * security scan) we *skip the record* rather than lie. The stage event
   * is still emitted; only the cli-attributed outcome that would poison
   * the routing learner is suppressed.
   */
  cli: CliNameLiteral | undefined;
  /**
   * The bridge result's `routedBy` (#6521), copied onto the outcome. Required
   * (though it may be `undefined`) so every call site states it: a stage that
   * forgot to forward it would silently drop the routed marker, and the
   * compiler is what names the call sites.
   */
  routedBy: OutcomeRoutedBy | undefined;
  success: boolean;
  durationMs: number;
  /** Failure message; classified into `failureCategory` on a failed row (#6521). */
  error?: string | undefined;
  /** Extra signals, e.g. the QA verdict, kept out of `success` (#6521 I2). */
  qualitySignals?: readonly string[];
  routingStage?: string;
  retryCount?: number;
}

/**
 * Outcome fields of an expert call, derived in one place (#6521).
 *
 * `success` is the CALL's success: whether the routed arm ran the task. A
 * stage's own verdict (QA pass/reject) is a judgement of other work and goes
 * in `qualitySignals`, not here. `durationMs` is the arm's own run time when
 * the router reported it, else the bridge's wall time.
 */
export function outcomeFieldsFromBridge(
  r: ExpertBridgeResult
): Pick<RecordOutcomeArgs, 'cli' | 'routedBy' | 'success' | 'durationMs' | 'error'> {
  return {
    cli: r.cli,
    routedBy: r.routedBy,
    success: r.success,
    durationMs: r.routedDurationMs ?? r.durationMs,
    error: r.error,
  };
}

/** Failure classification for a failed row, so no unclassified failure is written. */
function failureFields(args: RecordOutcomeArgs): Record<string, string> {
  if (args.success || args.error === undefined || args.error.length === 0) return {};
  return {
    failureCategory: categorizeOutcomeErrorMessage(args.error),
    errorMessage: args.error.slice(0, 500),
  };
}

/** Record a pipeline-stage outcome to the OutcomeStore. See {@link RecordOutcomeArgs}. */
export function recordOutcome(args: RecordOutcomeArgs): void {
  if (args.cli === undefined) {
    logger.debug('Skipping outcome record — no cli (bridge failed or non-CLI stage)', {
      taskId: args.taskId,
      category: args.category,
      success: args.success,
    });
    return;
  }
  try {
    // #2961: persisted outcome IDs/timestamps must go through the time
    // provider so replay/snapshot tests can reproduce.
    const nowMs = getTimeProvider().now();
    getOutcomeStore().append({
      id: `pipeline-${args.taskId}-${String(nowMs)}`,
      cli: args.cli,
      category: args.category as 'code_generation',
      model: 'pipeline',
      success: args.success,
      durationMs: args.durationMs,
      timestamp: new Date(nowMs).toISOString(),
      source: 'delegate' as const,
      routingStage: args.routingStage,
      retryCount: args.retryCount,
      ...(args.routedBy !== undefined && { routedBy: args.routedBy }),
      ...(args.qualitySignals !== undefined && { qualitySignals: [...args.qualitySignals] }),
      ...failureFields(args),
    });
  } catch (error) {
    logger.debug('Failed to record outcome', { taskId: args.taskId, error: String(error) });
  }
}

/** Configuration for the agent executor. */
export interface AgentExecutorConfig {
  readonly scanTarget?: string | undefined;
  readonly simulateVotes?: boolean | undefined;
  /** Voting strategy for consensus stages (default: higher_order). */
  readonly votingStrategy?:
    | 'simple_majority'
    | 'supermajority'
    | 'unanimous'
    | 'higher_order'
    | 'proof_of_learning'
    | 'opinion_wise'
    | undefined;
  /** Use 3 agents instead of the full 7-role panel for faster voting (default: false). */
  readonly quickMode?: boolean | undefined;
  readonly tracker?: ITaskTracker | undefined;
  readonly issueNumber?: number | undefined;
  readonly repo?: string | undefined;
  /**
   * Opt-in per-run token budget (#3395). When set, expert calls are metered
   * through a {@link BudgetGuard}: once cumulative usage crosses the ceiling,
   * further expert calls short-circuit to a failure result (stopping spend)
   * rather than aborting mid-pipeline. Absent → no enforcement (default).
   */
  readonly budget?: AgentBudgetConfig | undefined;
  /**
   * Caller authentication from measuredTrustTier(), recorded at stage entry.
   * Absent callerInfo means 'unmeasured'; no callerInfo producer exists today.
   * Record-only: no stage refuses on this value. Takes precedence over trustTier.
   */
  readonly callerTrustTier?: string | undefined;
  /**
   * Caller authentication, emitted with the same value as callerTrustTier.
   * @deprecated Use callerTrustTier. Removal is scheduled for the next major.
   */
  readonly trustTier?: string | undefined;
  /** Whether the handler's sanitizer changed its input; absent means 'unmeasured'. */
  readonly inputSanitization?: 'unmeasured' | 'unmodified' | 'modified' | undefined;
  /** Sanitizer counts, emitted beside inputSanitization only when it is 'modified'. */
  readonly inputSanitizationCounts?:
    | {
        readonly tagsRemoved: number;
        readonly commentsRemoved: number;
        readonly fieldsModified: number;
      }
    | undefined;
}

/**
 * Run an expert through the per-run budget guard (#3395): skip (and return a
 * failure result) once the budget is exhausted, otherwise execute and record
 * the tokens consumed. A no-budget guard makes this a transparent passthrough.
 */
export async function runExpert(
  guard: BudgetGuard,
  expertType: BuiltInExpertType,
  prompt: string,
  executionId?: string
): Promise<ExpertBridgeResult> {
  if (guard.isExhausted()) {
    // Observable escalation (#3262): a budget short-circuit must not be silent.
    // Emit a pipeline event + structured log so operators can see the run was
    // capped by its estimate-relative budget rather than failing for another
    // reason. Still a fail-CLOSED skip (no further token spend).
    emitPipelineStageEvent('dev-pipeline', 'budget', 'failed', {
      reason: 'budget_exceeded',
      expertType,
      ...(executionId !== undefined ? { executionId } : {}),
    });
    logger.warn('Budget exhausted — expert call skipped (#3262/#3395)', {
      expertType,
      ...(executionId !== undefined ? { executionId } : {}),
    });
    return {
      success: false,
      text: '',
      expertType,
      durationMs: 0,
      error: 'Budget exhausted — expert call skipped (estimate-relative cap, #3262/#3395)',
    };
  }
  const result = await executeExpert(expertType, prompt);
  guard.record(result.tokensUsed);
  maybeEmitModelCalled(executionId, result);
  return result;
}

/**
 * Emit a `model.called` observability event (#3387) for a completed expert call
 * — but only a *meaningful* one. We require, per the consensus refinements:
 *  - a successful call (never a partial event on failure),
 *  - an `executionId` to attribute it to (skip rather than emit an empty id),
 *  - a known `cli` + `model`, and real token usage (`tokensIn`/`tokensOut`).
 * When usage is absent (CLI-subprocess paths whose extractUsage returns null) we
 * skip rather than emit zeros — same "skip, don't lie" rule as recordOutcome.
 * This is purely additive: OutcomeStore stays the single outcome authority, so
 * there is no double-counting.
 */
function maybeEmitModelCalled(executionId: string | undefined, result: ExpertBridgeResult): void {
  if (!result.success || executionId === undefined) return;
  if (result.cli === undefined || result.model === undefined) return;
  if (result.tokensIn === undefined || result.tokensOut === undefined) return;
  emitModelCalled({
    executionId,
    cli: result.cli,
    model: result.model,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    durationMs: result.durationMs,
  });
}

/** What every stage closure needs from the executor. */
export interface StageDeps {
  readonly config: AgentExecutorConfig;
  /** Per-run budget guard (#3395). No-op unless config.budget is set. */
  readonly guard: BudgetGuard;
  /** Emits the stage `started` event with the caller-trust/sanitization record (#4733). */
  readonly startStage: (stage: string) => void;
}

// ============================================================================
// Progress Tracking
// ============================================================================

export async function postProgress(
  config: AgentExecutorConfig,
  stage: string,
  message: string
): Promise<void> {
  // DRY: tracker.postComment() is the canonical path — delegates to GitHubProvider/GitLabProvider
  // Raw gh CLI calls removed (#1711): tracker already handles this via scm/github-provider.ts
  if (config.tracker !== undefined && config.issueNumber !== undefined) {
    try {
      await config.tracker.postComment(String(config.issueNumber), `**[${stage}]** ${message}`);
    } catch {
      logger.debug('Failed to post progress', { stage, issueNumber: config.issueNumber });
    }
  }
}
