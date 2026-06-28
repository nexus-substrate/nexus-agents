/**
 * Shared async-job dispatcher — `runAsJob` (#3729 / epic #2631).
 *
 * Three tools (orchestrate, run_workflow, consensus_vote) implemented the
 * async-mode dispatcher VERBATIM: resolve idempotency → tryAcquire (busy
 * envelope on cap) → writeJobPending → registerIdempotentJob → fire a
 * detached background `run` that writes complete/failed + releases the slot
 * in a `finally` → return a synchronous `{ status: 'pending', jobId }`
 * envelope. This module extracts that sequence once so new long-running
 * tools (run_dev_pipeline, run_pipeline, …) opt into async with a few lines.
 *
 * The dispatcher sequence is FIXED here; the only per-tool variation is the
 * envelope shape (some tools use `ToolResult` via toolSuccess/
 * toolStructuredError, run_workflow uses its structurally-identical
 * `ToolResponse`). Callers that need a non-default envelope supply
 * `toEnvelope`; the default builders reproduce the orchestrate/consensus_vote
 * `ToolResult` envelopes byte-for-byte so faithful migration is a drop-in.
 *
 * @module mcp/jobs/run-as-job
 */

import type { ILogger } from '../../core/index.js';
import { toolSuccess, toolStructuredError, type ToolResult } from '../tools/tool-result.js';
import { writeJobComplete, writeJobFailed, writeJobPending } from './job-result-store.js';
import { registerJobAbort, unregisterJobAbort } from './job-abort-registry.js';
import { registerIdempotentJob, shortCircuitOrFreshJobId } from './job-idempotency.js';
import { release, suggestRetryAfterMs, tryAcquire } from './job-concurrency.js';
import { resolveClassGuardMs } from '../../config/timeouts.js';

/**
 * Async-job-body runaway-guard (#3734). A backgrounded job body has NO MCP
 * request timeout (that is the point of async mode), so without a ceiling a
 * wedged `run` would hold its concurrency slot and pending record forever.
 * The `async-job-body` operation class (3600s, honoring NEXUS_TIMEOUT_MULTIPLIER
 * + the per-class override) bounds it. On expiry the job is recorded as failed
 * with `runaway guard exceeded` and the slot is released by the existing
 * `finally`. This is a runaway-guard, not an SLA — 1h is generous.
 */
export const ASYNC_JOB_BODY_GUARD_CLASS = 'async-job-body' as const;

/**
 * Fraction of the async-job-body guard at which a near-timeout WARN is emitted
 * before the guard fires. Lower than the generic 0.8 so operators see a wedged
 * long-running job well before the (very high) ceiling trips.
 */
export const ASYNC_JOB_BODY_NEAR_TIMEOUT_THRESHOLD = 0.5;

/** Sentinel rejection used to distinguish a guard expiry from a body failure. */
const ASYNC_JOB_BODY_RUNAWAY_MESSAGE = 'runaway guard exceeded';

interface GuardHandles {
  /** Resolves only when the guard window elapses (never resolves on clear). */
  readonly expired: Promise<never>;
  /** Cancels the guard + near-timeout timers. */
  readonly clear: () => void;
}

/**
 * Builds a guard that rejects with the runaway sentinel after `guardMs`, and
 * emits a one-shot near-timeout WARN at {@link ASYNC_JOB_BODY_NEAR_TIMEOUT_THRESHOLD}.
 */
function makeAsyncBodyGuard(
  jobId: string,
  toolName: string,
  guardMs: number,
  logger: ILogger | undefined
): GuardHandles {
  let guardTimer: ReturnType<typeof setTimeout> | undefined;
  let warnTimer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_resolve, reject) => {
    warnTimer = setTimeout(
      () => {
        logger?.warn(`Async ${toolName} job approaching runaway guard`, {
          jobId,
          guardMs,
          thresholdFraction: ASYNC_JOB_BODY_NEAR_TIMEOUT_THRESHOLD,
        });
      },
      Math.floor(guardMs * ASYNC_JOB_BODY_NEAR_TIMEOUT_THRESHOLD)
    );
    guardTimer = setTimeout(() => {
      reject(new Error(ASYNC_JOB_BODY_RUNAWAY_MESSAGE));
    }, guardMs);
    // Don't keep the event loop alive solely for these timers.
    guardTimer.unref();
    warnTimer.unref();
  });
  return {
    expired,
    clear: () => {
      if (guardTimer !== undefined) clearTimeout(guardTimer);
      if (warnTimer !== undefined) clearTimeout(warnTimer);
    },
  };
}

/**
 * Per-tool envelope builders. Every async dispatcher returns the same five
 * logical outcomes; only their wire shape differs. Supplying this lets a tool
 * that uses a different success/error factory (e.g. run_workflow's
 * `successResponse`/`errorResponse`) reuse the dispatcher unchanged.
 *
 * @template E - The tool's MCP envelope type (defaults to {@link ToolResult}).
 */
export interface JobEnvelopeBuilders<E> {
  /** `{ status: 'pending', jobId, pollTool, note }` — returned synchronously after dispatch. */
  readonly pending: (jobId: string) => E;
  /** `{ status: 'busy', retryAfterMs, note }` — concurrency cap reached. */
  readonly busy: (retryAfterMs: number, toolName: string) => E;
  /** `{ status: 'replay', jobId, pollTool, note }` — idempotency key matched a prior dispatch. */
  readonly replay: (jobId: string) => E;
  /** Error envelope — idempotency key reused with different inputs. */
  readonly collision: (existingJobId: string) => E;
}

/** Default pending envelope (orchestrate/consensus_vote shape). */
export function defaultPendingEnvelope(jobId: string): ToolResult {
  return toolSuccess(
    JSON.stringify({
      status: 'pending',
      jobId,
      pollTool: 'get_job_result',
      note: 'Poll via get_job_result({ jobId }) until status !== "pending".',
    })
  );
}

/** Default busy envelope (orchestrate/consensus_vote shape). */
export function defaultBusyEnvelope(retryAfterMs: number, toolName: string): ToolResult {
  return toolSuccess(
    JSON.stringify({
      status: 'busy',
      retryAfterMs,
      note: `Async-mode concurrency cap reached for ${toolName}. Retry later or use mode: "sync".`,
    })
  );
}

/** Default replay envelope (orchestrate/consensus_vote shape). */
export function defaultReplayEnvelope(jobId: string): ToolResult {
  return toolSuccess(
    JSON.stringify({
      status: 'replay',
      jobId,
      pollTool: 'get_job_result',
      note: 'Idempotency key matched a prior dispatch — poll get_job_result for current status.',
    })
  );
}

/** Default collision envelope (orchestrate/consensus_vote shape). */
export function defaultCollisionEnvelope(existingJobId: string): ToolResult {
  return toolStructuredError({
    errorCategory: 'validation',
    message: `Idempotency key already used with different inputs. Existing jobId: ${existingJobId}. Use a fresh key or omit it.`,
  });
}

/** The full default ({@link ToolResult}) envelope set. */
export const DEFAULT_JOB_ENVELOPES: JobEnvelopeBuilders<ToolResult> = {
  pending: defaultPendingEnvelope,
  busy: defaultBusyEnvelope,
  replay: defaultReplayEnvelope,
  collision: defaultCollisionEnvelope,
};

/**
 * Parameters for {@link runAsJob}.
 *
 * @template I - The tool's validated input type (hashed for idempotency,
 *   passed to `run`).
 * @template R - The structured result `run` resolves to; recorded verbatim
 *   via `writeJobComplete` and returned by a later `get_job_result(jobId)`.
 * @template E - The tool's envelope type (defaults to {@link ToolResult}).
 */
export interface RunAsJobParams<I, R, E = ToolResult> {
  /** MCP tool name — the idempotency / concurrency / job-store key. */
  readonly toolName: string;
  /** Validated tool input. Hashed for idempotency + passed to `run`. */
  readonly input: I;
  /** Caller-supplied idempotency key (optional). */
  readonly idempotencyKey?: string | undefined;
  /** Mints a fresh jobId when no idempotency short-circuit applies. */
  readonly freshJobId: () => string;
  /**
   * The detached background work. Receives the resolved `jobId` (so the
   * runner can thread it into a task-state log), the `input`, and an
   * `AbortSignal` (#4086) that fires when `cancel_job` cancels this job —
   * thread it into awaited operations to make cancellation actually stop the
   * work. Existing 2-arg callbacks remain valid (the trailing param is
   * ignored). Its resolved value is recorded as the job's `complete` result;
   * a rejection is recorded as `failed`.
   */
  readonly run: (jobId: string, input: I, signal: AbortSignal) => Promise<R>;
  /** Per-tool envelope builders. Defaults to the {@link ToolResult} set. */
  readonly toEnvelope?: JobEnvelopeBuilders<E>;
  /** Optional logger for the background failure path. */
  readonly logger?: ILogger | undefined;
}

/**
 * Dispatch `run` as a detached background job and return a synchronous
 * envelope. Performs the EXACT sequence the three hand-rolled dispatchers
 * shared:
 *
 * 1. Resolve idempotency BEFORE acquiring a slot — a replay/collision must
 *    not burn capacity a live caller could use.
 * 2. `tryAcquire(toolName)` — over-cap returns the `busy` envelope.
 * 3. `writeJobPending` + `registerIdempotentJob` (when a key was supplied).
 * 4. Fire-and-forget `run(jobId, input)`: on resolve `writeJobComplete`,
 *    on reject `writeJobFailed`, `release` in a `finally`.
 * 5. Return the `pending` envelope (`{ status: 'pending', jobId, … }`).
 *
 * The background promise is intentionally not awaited — async mode exists
 * precisely because awaiting it would defeat the contract. Its rejection is
 * caught + recorded; nothing escapes unhandled.
 *
 * @returns The synchronous envelope: `pending` on dispatch, `busy` on cap,
 *   `replay`/`collision` on an idempotency match.
 */
export function runAsJob<I, R, E = ToolResult>(params: RunAsJobParams<I, R, E>): E {
  const env = params.toEnvelope ?? (DEFAULT_JOB_ENVELOPES as unknown as JobEnvelopeBuilders<E>);

  // Step 1: idempotency resolves BEFORE the slot acquire.
  const idempotency = shortCircuitOrFreshJobId<E>({
    tool: params.toolName,
    idempotencyKey: params.idempotencyKey,
    inputs: params.input,
    freshJobId: params.freshJobId,
    replayEnvelope: env.replay,
    collisionEnvelope: env.collision,
  });
  if (idempotency.kind === 'shortCircuit') return idempotency.value;

  // Step 2: per-tool concurrency cap. Over-cap returns busy synchronously.
  if (!tryAcquire(params.toolName)) {
    return env.busy(suggestRetryAfterMs(params.toolName), params.toolName);
  }

  const jobId = idempotency.jobId;
  // Step 3: pending record + idempotency index entry.
  writeJobPending(jobId, params.toolName);
  if (params.idempotencyKey !== undefined && params.idempotencyKey !== '') {
    registerIdempotentJob({
      tool: params.toolName,
      idempotencyKey: params.idempotencyKey,
      inputs: params.input,
      jobId,
    });
  }

  // Step 4: detached background run with terminal recording + slot release.
  void runJobInBackground(jobId, params);

  // Step 5: synchronous pending envelope.
  return env.pending(jobId);
}

/**
 * Fire-and-forget background runner. Exported (awaitable) so integration
 * tests can drive the dispatch deterministically instead of racing the
 * detached promise.
 * @internal
 */
export async function runJobInBackground<I, R, E>(
  jobId: string,
  params: RunAsJobParams<I, R, E>
): Promise<void> {
  const guardMs = resolveClassGuardMs(ASYNC_JOB_BODY_GUARD_CLASS);
  const guard = makeAsyncBodyGuard(jobId, params.toolName, guardMs, params.logger);
  // #4086: register an AbortController so cancel_job can stop this job's work. Its
  // signal is threaded into params.run; abort → run rejects → writeJobFailed, which
  // no-ops against the already-written `cancelled` record (#4022), preserving it.
  const controller = registerJobAbort(jobId);
  try {
    // Race the body against the runaway-guard. On guard expiry the guard
    // rejects with the sentinel → recorded as failed below. On body settle the
    // guard is cleared so it can never fire afterward.
    const result = await Promise.race([
      params.run(jobId, params.input, controller.signal),
      guard.expired,
    ]);
    writeJobComplete(jobId, params.toolName, result);
  } catch (err: unknown) {
    const errObj = err instanceof Error ? err : new Error(String(err));
    params.logger?.error(`Async ${params.toolName} dispatch failed`, errObj, { jobId });
    writeJobFailed(jobId, params.toolName, errObj.message);
  } finally {
    guard.clear();
    unregisterJobAbort(jobId);
    release(params.toolName);
  }
}
