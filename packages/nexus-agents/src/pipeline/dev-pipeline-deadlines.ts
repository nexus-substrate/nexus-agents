/**
 * Stage boundaries for the dev pipeline: cancellation (#6305) and per-stage
 * deadlines (#6736).
 *
 * Every stage call goes through {@link guardDevPipelineStages}, which covers
 * every boundary — including each plan/vote and implement/QA iteration —
 * without threading anything through each phase of `runDevPipeline`. Each call:
 *
 * - refuses to start once the run's signal has fired (#6305);
 * - runs under its own deadline, resolved by {@link resolveDevStageTimeoutMs};
 * - receives its own `AbortSignal`, which aborts when the run is cancelled or
 *   the deadline passes, so the stage's model calls stop rather than run on
 *   behind a failure the pipeline has already recorded.
 *
 * @module pipeline/dev-pipeline-deadlines
 */

import { resolveClassGuardMs } from '../config/timeouts.js';
import { isTimeoutAbortReason } from '../adapters/abort-utils.js';
import { emitPipelineStageEvent } from './pipeline-observability.js';
import { resolveStageTimeoutMs } from './stage-deadline.js';
import type { DevPipelineStages } from './dev-pipeline.js';

/**
 * Raised once the run's cancel signal has fired: at a stage boundary (#6305),
 * or from inside a stage that stopped its work on it (`'during'`, #6747).
 */
export class DevPipelineCancelledError extends Error {
  constructor(stage: string, when: 'before' | 'during' = 'before') {
    super(`Dev pipeline cancelled ${when} the ${stage} stage`);
    this.name = 'DevPipelineCancelledError';
  }
}

/**
 * The error a stage throws once its signal has fired mid-work (#6747). The
 * reason decides it, with the same rule as `isTimeoutAbortReason` (#6691,
 * #6709): a `TimeoutError` reason is the stage's deadline, rethrown as is so
 * its message names the stage and the limit; any other reason is a cancel.
 */
export function stageAbortError(stage: string, signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  if (isTimeoutAbortReason(reason) && reason instanceof Error) return reason;
  return new DevPipelineCancelledError(stage, 'during');
}

/** Raised when one stage call outlives its deadline (#6736). */
export class DevPipelineStageTimeoutError extends Error {
  readonly stage: string;
  readonly timeoutMs: number;

  constructor(stage: string, timeoutMs: number) {
    super(`Dev pipeline ${stage} stage timed out after ${String(timeoutMs)}ms`);
    this.name = 'DevPipelineStageTimeoutError';
    this.stage = stage;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * The deadline one dev-pipeline stage call runs under (#6736).
 *
 * Same resolution as `run_pipeline` (#6730): an explicit `stageTimeoutMs`
 * applies to every stage, the vote defaults to the `multi-llm-panel` class
 * guard, and everything is clamped to the `pipeline` class guard. A non-vote
 * stage defaults to the `pipeline` class guard itself, not the graph's 120 s:
 * these stages never had a deadline before, and one expert call (an implement
 * on a complex task) can legitimately run for minutes. That default is also
 * below the `async-job-body` guard, so a backgrounded run's stuck stage fails
 * with its own timeout before the whole job is reaped (#6725).
 */
export function resolveDevStageTimeoutMs(
  stage: string,
  stageTimeoutMs: number | undefined
): number {
  return resolveStageTimeoutMs(stage, stageTimeoutMs, resolveClassGuardMs('pipeline'));
}

/** What {@link guardDevPipelineStages} bounds each stage call by. */
export interface DevStageGuardOptions {
  /** The run's cancel signal (#6305). Absent: the run is not cancellable. */
  readonly signal?: AbortSignal | undefined;
  /** The caller's deadline for EACH stage call (#6736). Absent: the defaults. */
  readonly stageTimeoutMs?: number | undefined;
}

/**
 * Read through a call, never inline: TypeScript narrows `signal.aborted` to
 * `false` after one check, which is unsound across the `await`s between stages.
 */
function throwIfCancelled(signal: AbortSignal | undefined, stage: string): void {
  if (signal?.aborted === true) throw new DevPipelineCancelledError(stage);
}

/**
 * Run one stage call under its deadline, handing it a signal that aborts on
 * the run's cancel or on the deadline. The deadline aborts with a
 * `TimeoutError` DOMException, as the async job guard does (#6725), so a CLI
 * breaker counts it as a timeout rather than a caller cancel.
 */
async function runStage<R>(
  stage: string,
  options: DevStageGuardOptions,
  call: (signal: AbortSignal) => Promise<R>
): Promise<R> {
  const { signal: runSignal } = options;
  throwIfCancelled(runSignal, stage);
  const timeoutMs = resolveDevStageTimeoutMs(stage, options.stageTimeoutMs);
  const controller = new AbortController();
  const forwardCancel = (): void => {
    controller.abort(runSignal?.reason);
  };
  runSignal?.addEventListener('abort', forwardCancel, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new DevPipelineStageTimeoutError(stage, timeoutMs);
      controller.abort(new DOMException(error.message, 'TimeoutError'));
      emitPipelineStageEvent('dev-pipeline', stage, 'failed', {
        reason: 'stage_timeout',
        timeoutMs,
      });
      reject(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([call(controller.signal), deadline]);
  } finally {
    clearTimeout(timer);
    runSignal?.removeEventListener('abort', forwardCancel);
  }
}

/**
 * Wrap every stage so each call checks the run's cancel signal, runs under its
 * deadline and receives its own abort signal (#6305, #6736).
 *
 * Each method is wrapped explicitly, not through a generic argument spread:
 * `plan`'s `priorFeedback` is optional, so appending the signal to whatever
 * arguments arrived would put it in `priorFeedback`'s slot.
 */
export function guardDevPipelineStages(
  stages: DevPipelineStages,
  options: DevStageGuardOptions
): DevPipelineStages {
  const qualityGate = stages.qualityGate?.bind(stages);
  return {
    research: (task) => runStage('research', options, (s) => stages.research(task, s)),
    plan: (task, research, priorFeedback) =>
      runStage('plan', options, (s) => stages.plan(task, research, priorFeedback, s)),
    vote: (plan, research) => runStage('vote', options, (s) => stages.vote(plan, research, s)),
    decompose: (plan) => runStage('decompose', options, (s) => stages.decompose(plan, s)),
    implement: (task) => runStage('implement', options, (s) => stages.implement(task, s)),
    qaReview: (task, implementation) =>
      runStage('qaReview', options, (s) => stages.qaReview(task, implementation, s)),
    ...(qualityGate !== undefined
      ? { qualityGate: () => runStage('qualityGate', options, (s) => qualityGate(s)) }
      : {}),
    securityScan: () => runStage('securityScan', options, (s) => stages.securityScan(s)),
  };
}
