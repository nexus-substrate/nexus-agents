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

import { getTimeProvider, type ILogger } from '../../core/index.js';
import { toolSuccess, toolStructuredError, type ToolResult } from '../tools/tool-result.js';
import {
  pruneJobRecordsIfDue,
  writeJobComplete,
  writeJobFailed,
  writeJobPending,
  heartbeatJob,
  readLastProgressMs,
} from './job-result-store.js';
import { extractFailureDetail } from './job-failure-detail.js';
export { extractFailureDetail } from './job-failure-detail.js';
import { registerJobAbort, unregisterJobAbort } from './job-abort-registry.js';
import { bridgePipelineEventsToHeartbeat } from './job-heartbeat-bridge.js';
import { registerIdempotentJob, shortCircuitOrFreshJobId } from './job-idempotency.js';
import { release, suggestRetryAfterMs, tryAcquire } from './job-concurrency.js';
import { MCP_TIMEOUTS, resolveClassGuardMs } from '../../config/timeouts.js';
import { withAsyncTaskStateDispatch } from '../../context/structured-task-state.js';

/**
 * Async-job-body runaway-guard (#3734). A backgrounded job body has NO MCP
 * request timeout (that is the point of async mode), so without a ceiling a
 * wedged `run` would hold its concurrency slot and pending record forever.
 * The `async-job-body` operation class (3600s by default) bounds it.
 *
 * Because the body has no MCP request, it is the one class NOT ceilinged by
 * `MCP_TIMEOUTS.maxMs` (#5995, panel option 1). `NEXUS_TIMEOUT_MULTIPLIER` and
 * `NEXUS_TIMEOUT_CLASS_ASYNC_JOB_BODY_MS` raise it up to the class override
 * ceiling (7200000ms); a value past that is clamped and reported at startup by
 * `findIneffectiveVars`. The default is unchanged — the extra hour is opt-in,
 * and it costs something: a job holds its concurrency slot for as long as it
 * runs. Past the standard ceiling that cost is bounded by liveness (#6162): the
 * body must heartbeat via `progress()` or be failed as wedged at
 * {@link ASYNC_JOB_BODY_WEDGED_MISSED_HEARTBEATS} missed intervals. The guard a
 * job actually runs under is logged once at job start so real job durations
 * can be judged against it.
 *
 * On expiry the job is recorded as failed with `runaway guard exceeded` and the
 * slot is released by the existing `finally`. This is a runaway-guard, not an
 * SLA — 1h is generous.
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

/**
 * Liveness for a body allowed past the standard MCP ceiling (#6162 item 1).
 *
 * #6159 let an operator raise the guard from `MCP_TIMEOUTS.maxMs` (3.6M) to the
 * 7.2M class ceiling, and the only signals over the extra hour were the start
 * log and the 0.5 WARN — both say time passed, neither says the body is alive.
 * So a guard ABOVE the standard ceiling requires the body to prove progress:
 * `runAsJob` hands it a `progress()` heartbeat, and a watchdog fails the job as
 * wedged exactly one silence budget after its last heartbeat — releasing its
 * concurrency slot and recording `failed`, well before the guard would. The
 * watchdog is lazy: a timer armed for one budget that, on firing, measures the
 * silence from the record and re-arms for the exact remainder, so the verdict
 * lands at `lastHeartbeat + budget` wherever the heartbeat fell (#6428: a
 * poller ticking per interval held the slot for up to four intervals when the
 * heartbeat landed just after a tick). A guard at or under the standard
 * ceiling is not watched: those bodies never opted into anything and keep
 * their pre-#6162 behaviour.
 *
 * Interval = guard / {@link ASYNC_JOB_BODY_HEARTBEAT_INTERVAL_DIVISOR}; wedged
 * after {@link ASYNC_JOB_BODY_WEDGED_MISSED_HEARTBEATS} intervals of silence,
 * i.e. 3/8 of the guard — under the 0.5 near-timeout WARN fraction, so a silent
 * body is released before the WARN that used to be its only signal. On the
 * smallest watched guard (just over 3.6M) that is ~22.5 min of silence; on the
 * 7.2M ceiling, 45 min. Both exceed the `multi-llm-panel` class guard (15 min),
 * the longest single unit a body composes, so a body that heartbeats between
 * units is never wedged by one slow-but-alive unit; only a unit hung past its
 * own guard is. Module-private constants, not env vars: nothing reads a knob,
 * and the tests pin the numbers.
 *
 * A body that never calls `progress()` under a watched guard is wedged BY
 * DEFINITION — that is the point: opting into a longer guard is not opting into
 * a longer hang. The empty case (no heartbeat ever recorded) is measured from
 * job start, so such a body fails at exactly N intervals after dispatch.
 *
 * Not the same instrument as `agents/heartbeat-monitor.ts`: that monitor is
 * in-memory and reporting-only — it classifies an agent SESSION as healthy /
 * stalled / unmeasured for logs and the dashboard, and acts on nothing. This
 * watchdog is per JOB, durable through the job record, and its verdict frees a
 * concurrency slot and settles a record a poller reads. Both consume the same
 * `stepBus` progress signal; they answer different questions.
 */
const ASYNC_JOB_BODY_HEARTBEAT_INTERVAL_DIVISOR = 8;

/** Missed heartbeat intervals after which a watched body is failed as wedged. */
const ASYNC_JOB_BODY_WEDGED_MISSED_HEARTBEATS = 3;

/** Heartbeat handle for one job body: the callback plus its watch's teardown. */
interface LivenessWatch {
  /** The body's heartbeat — stamps the record and re-arms the watchdog. */
  readonly progress: () => void;
  /** Disarms the watchdog (no-op when the guard was not watched). */
  readonly clear: () => void;
}

/**
 * Build the heartbeat for one body and, when `guardMs` exceeds the standard
 * MCP ceiling, the watchdog that enforces it. The stamp is written under every
 * guard — a poller wants slow-vs-stuck regardless — only the watchdog is
 * gated. `onWedged` receives the failure the job is recorded with.
 *
 * Every heartbeat — the callback, `heartbeatJob(jobId)`, a bridged bus event —
 * goes through `heartbeatJob`, which stamps the record; nothing else is kept in
 * memory. When the timer fires it measures the silence from the record (empty
 * case: from job start): under budget, it re-arms for exactly the remainder;
 * otherwise the verdict quotes what `get_job_result` shows. So a body that
 * keeps heartbeating costs one file read per silence budget, and a body that
 * stops is failed at `lastHeartbeat + budget`, not at the next poll tick.
 */
function makeLivenessWatch(
  jobId: string,
  guardMs: number,
  onWedged: (err: Error) => void
): LivenessWatch {
  const startedAtMs = getTimeProvider().now();
  const progress = (): void => {
    heartbeatJob(jobId);
  };
  if (guardMs <= MCP_TIMEOUTS.maxMs) return { progress, clear: () => {} };

  const intervalMs = Math.floor(guardMs / ASYNC_JOB_BODY_HEARTBEAT_INTERVAL_DIVISOR);
  const silenceBudgetMs = intervalMs * ASYNC_JOB_BODY_WEDGED_MISSED_HEARTBEATS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = (ms: number): void => {
    timer = setTimeout(onFire, ms);
    // Like the guard timers: never keep the event loop alive for the watchdog.
    timer.unref();
  };
  const onFire = (): void => {
    const silentMs = getTimeProvider().now() - (readLastProgressMs(jobId) ?? startedAtMs);
    if (silentMs < silenceBudgetMs) {
      arm(silenceBudgetMs - silentMs);
      return;
    }
    onWedged(new Error(`wedged (no progress for ${String(silentMs)} ms)`));
  };
  arm(silenceBudgetMs);
  return {
    progress,
    clear: () => {
      clearTimeout(timer);
    },
  };
}

interface GuardHandles {
  /**
   * Rejects when the guard window elapses, or — under a guard past the
   * standard MCP ceiling — when the body goes
   * {@link ASYNC_JOB_BODY_WEDGED_MISSED_HEARTBEATS} intervals without a
   * heartbeat (#6162). Never settles on clear.
   */
  readonly expired: Promise<never>;
  /** The body's heartbeat (#6162). */
  readonly progress: () => void;
  /** Cancels the guard, near-timeout and liveness timers. */
  readonly clear: () => void;
}

/**
 * Builds a guard that rejects with the runaway sentinel after `guardMs`, emits
 * a one-shot near-timeout WARN at {@link ASYNC_JOB_BODY_NEAR_TIMEOUT_THRESHOLD},
 * and — past the standard MCP ceiling — rejects earlier with the wedged
 * failure when the body stops heartbeating ({@link makeLivenessWatch}).
 */
function makeAsyncBodyGuard(
  jobId: string,
  toolName: string,
  guardMs: number,
  logger: ILogger | undefined
): GuardHandles {
  // The executor runs synchronously, so `reject` is the promise's own by the
  // time any timer below can fire.
  let reject: (err: Error) => void = () => {};
  const expired = new Promise<never>((_resolve, rej) => {
    reject = rej;
  });
  const warnTimer = setTimeout(
    () => {
      logger?.warn(`Async ${toolName} job approaching runaway guard`, {
        jobId,
        guardMs,
        thresholdFraction: ASYNC_JOB_BODY_NEAR_TIMEOUT_THRESHOLD,
      });
    },
    Math.floor(guardMs * ASYNC_JOB_BODY_NEAR_TIMEOUT_THRESHOLD)
  );
  const guardTimer = setTimeout(() => {
    reject(new Error(ASYNC_JOB_BODY_RUNAWAY_MESSAGE));
  }, guardMs);
  // Don't keep the event loop alive solely for these timers.
  guardTimer.unref();
  warnTimer.unref();
  const liveness = makeLivenessWatch(jobId, guardMs, (err) => {
    reject(err);
  });
  return {
    expired,
    progress: liveness.progress,
    clear: () => {
      clearTimeout(guardTimer);
      clearTimeout(warnTimer);
      liveness.clear();
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
      note: `Async-mode concurrency cap reached for ${toolName}. Retry later or use dispatch: "sync".`,
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
   * work. The fourth argument is the body's heartbeat (#6162): call
   * `progress()` after each unit of work (a seat, a stage, a fetch) to stamp
   * `lastProgressAt` on the pending record. Under a guard past the standard
   * MCP ceiling (`MCP_TIMEOUTS.maxMs`) the heartbeat is REQUIRED — a body that
   * goes {@link ASYNC_JOB_BODY_WEDGED_MISSED_HEARTBEATS} intervals without one
   * is failed as wedged and its slot released; a body that never calls it is
   * wedged by definition. Each call is a synchronous sidecar write, so call it
   * per unit of work, not per token. Existing 2- and 3-arg callbacks remain
   * valid (trailing params are ignored). Its resolved value is recorded as the
   * job's `complete` result; a rejection is recorded as `failed`.
   */
  readonly run: (jobId: string, input: I, signal: AbortSignal, progress: () => void) => Promise<R>;
  /** Per-tool envelope builders. Defaults to the {@link ToolResult} set. */
  readonly toEnvelope?: JobEnvelopeBuilders<E>;
  /** Optional logger for the background failure path. */
  readonly logger?: ILogger | undefined;
  /**
   * Opt out of the fail-closed result check (#4363), stating why.
   *
   * By default a `run` callback that RESOLVES a failure-shaped payload records
   * the job `failed` rather than `complete`. A handful of tools legitimately
   * resolve such a payload as their real answer. Those set
   * this field; the reason is logged whenever it actually suppresses a
   * detection, so an opted-out caller is a visible policy decision rather than
   * a silent kwarg.
   */
  readonly allowFailureShapedResult?: string | undefined;
  /**
   * Version stamped on every record this dispatch writes (#5008). Defaults to
   * the running server's `VERSION` — the build that runs the job, which is
   * what a later `get_job_result` from a different build needs to see. A
   * test injects a value that differs from `VERSION` to prove the stamp is
   * taken from this seam and not from the reader.
   */
  readonly producerVersion?: string | undefined;
}

/** A root envelope key whose value marks the payload as a failure (#4363). */
interface FailureShape {
  /** Which key tripped — recorded so the job record is debuggable. */
  readonly key: string;
  /** The payload's own message, when it carries one. */
  readonly detail: string | undefined;
}

/** Root envelope keys and the value that means "this failed". */
const FAILURE_KEYS: ReadonlyArray<{ key: string; failsWhen: boolean }> = [
  // toolStructuredError
  { key: 'isError', failsWhen: true },
  // handleConsensusVote and the other Result-shaped handlers
  { key: 'ok', failsWhen: false },
  // GraphPipelineResult / AdaptiveOrchestratorResult
  { key: 'success', failsWhen: false },
];

/** Root keys carrying a human-readable reason, in order of preference. */
const DETAIL_KEYS: readonly string[] = ['error', 'message'];

/**
 * Render a failure shape for the job record. Names the key that tripped so the
 * record is debuggable, and carries the payload's own message when it has one —
 * a bare `failed` tells whoever polls the job nothing.
 */
function describeFailureShape(failure: FailureShape): string {
  const suffix = failure.detail === undefined ? '' : `: ${failure.detail}`;
  return `Job result reported failure via '${failure.key}'${suffix}`;
}

/**
 * Detect a failure-shaped job payload, or null when the result is a success
 * (#4363).
 *
 * Inspects the payload's ROOT keys only. A deep scan would turn fail-open into
 * fail-wrong: a vote whose *decision* is `reject` and a pipeline summary listing
 * a stage it recovered from both carry a nested falsy `success`, and both are
 * successful jobs. Only the top-level envelope says whether the job itself
 * failed.
 *
 * Exported for tests.
 * @internal
 */
export function detectFailureShapedResult(result: unknown): FailureShape | null {
  if (typeof result !== 'object' || result === null) return null;
  const record = result as Record<string, unknown>;

  for (const { key, failsWhen } of FAILURE_KEYS) {
    if (record[key] === failsWhen) {
      const detailKey = DETAIL_KEYS.find((k) => typeof record[k] === 'string');
      return { key, detail: detailKey === undefined ? undefined : (record[detailKey] as string) };
    }
  }
  return null;
}

/**
 * Dispatch `run` as a detached background job and return a synchronous
 * envelope. Performs the EXACT sequence the three hand-rolled dispatchers
 * shared:
 *
 * 1. Resolve idempotency BEFORE acquiring a slot — a replay/collision must
 *    not burn capacity a live caller could use.
 * 2. `tryAcquire(toolName)` — over-cap returns the `busy` envelope.
 * 3. `pruneJobRecordsIfDue` (#6224), then `writeJobPending` +
 *    `registerIdempotentJob` (when a key was supplied).
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
  // Step 3: retention sweep, then pending record + idempotency index entry.
  // #6224: the store had no reaper (#4976 gap 2), so every dispatch left a
  // record forever. Bounded to one sweep per process per hour inside the
  // store; a failed sweep is logged there and never blocks the dispatch.
  pruneJobRecordsIfDue(getTimeProvider().now());
  // #4972: record whether this tool can even receive a cancel. `run.length`
  // is the callback's declared arity, so >= 3 means it takes the `signal`
  // parameter. Structural, not behavioural — see `signalAccepted`'s doc.
  writeJobPending(jobId, params.toolName, params.run.length >= 3, params.producerVersion);
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
function settleJobResult<I, R, E>(
  jobId: string,
  params: RunAsJobParams<I, R, E>,
  result: unknown
): void {
  const failure = detectFailureShapedResult(result);
  if (failure !== null && params.allowFailureShapedResult === undefined) {
    writeJobFailed(
      jobId,
      params.toolName,
      describeFailureShape(failure),
      params.producerVersion,
      extractFailureDetail(result)
    );
    return;
  }
  if (failure !== null) {
    params.logger?.warn(
      `Recorded a failure-shaped ${params.toolName} result as complete (opted out)`,
      { jobId, key: failure.key, reason: params.allowFailureShapedResult }
    );
  }
  writeJobComplete(jobId, params.toolName, result, params.producerVersion);
}

/**
 * Detached executor for `runAsJob`. Exported for tests so a test can drive
 * the background run deterministically without racing the dispatch envelope.
 *
 * @internal
 */
export async function runJobInBackground<I, R, E>(
  jobId: string,
  params: RunAsJobParams<I, R, E>
): Promise<void> {
  const guardMs = resolveClassGuardMs(ASYNC_JOB_BODY_GUARD_CLASS);
  // Once per job, at info: the guard is operator-tunable (#5995), so the value
  // a job actually ran under is the record, not the config that produced it.
  params.logger?.info(`Async ${params.toolName} job started under runaway guard`, {
    jobId,
    guardMs,
    guardClass: ASYNC_JOB_BODY_GUARD_CLASS,
  });
  const guard = makeAsyncBodyGuard(jobId, params.toolName, guardMs, params.logger);
  // #4086: register an AbortController so cancel_job can stop this job's work. Its
  // signal is threaded into params.run; abort → run rejects → writeJobFailed, which
  // no-ops against the already-written `cancelled` record (#4022), preserving it.
  const controller = registerJobAbort(jobId);
  // #6162: pipeline bodies heartbeat through the stage events they already
  // emit; attributed to this job by the async context the body runs under.
  const unbridge = bridgePipelineEventsToHeartbeat(jobId, guard.progress);
  try {
    // Race the body against the runaway-guard. On guard expiry the guard
    // rejects with the sentinel → recorded as failed below. On body settle the
    // guard is cleared so it can never fire afterward.
    const body = withAsyncTaskStateDispatch(jobId, () =>
      params.run(jobId, params.input, controller.signal, guard.progress)
    );
    const result = await Promise.race([body, guard.expired]);
    // #4363: `writeJobComplete` used to fire on ANY resolved value, so a
    // callback resolving a failure-shaped payload recorded `complete` and a
    // caller polling `get_job_result` read it as a success. Fail closed by
    // default — an opt-in predicate was rejected because "caller forgot to
    // normalize" would just become "caller forgot to pass the predicate".
    settleJobResult(jobId, params, result);
  } catch (err: unknown) {
    const errObj = err instanceof Error ? err : new Error(String(err));
    params.logger?.error(`Async ${params.toolName} dispatch failed`, errObj, { jobId });
    writeJobFailed(
      jobId,
      params.toolName,
      errObj.message,
      params.producerVersion,
      extractFailureDetail(err)
    );
  } finally {
    unbridge();
    guard.clear();
    unregisterJobAbort(jobId);
    release(params.toolName);
  }
}
