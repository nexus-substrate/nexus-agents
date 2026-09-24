/**
 * Job-result store for async-mode MCP tools (#3042, Stage 1 of #2631).
 *
 * Persists the final result of a background-dispatched MCP tool
 * invocation to `<NEXUS_DATA_DIR>/jobs/result-<jobId>.json`. Lets a
 * caller dispatch a long-running tool via `dispatch: 'async'`, receive a
 * `jobId` immediately, and poll for the result via `get_job_result`
 * (or any other reader that imports `readJobResult`).
 *
 * **Why a sidecar file (not the structured-task-state log):** Stage 1
 * deliberately doesn't extend `StructuredTaskState` — that schema change
 * is Stage 2 (#3043). Putting the result in a sidecar file lets the
 * async-mode protocol ship and be validated end-to-end before the schema
 * migration lands. Once Stage 2 ships, this store can be deprecated:
 * `query_task_state` will return the result inline and the sidecar files
 * become legacy that the next cleanup sweep can remove.
 *
 * **Why per-repo storage (`jobs` is in `PER_REPO_SUBDIRS`):** a job
 * dispatched on repo A should not be pollable on repo B. The split
 * matches `tasks/state-orch-*.jsonl` which is also per-repo.
 *
 * Status lifecycle: `pending` → (`complete` | `failed` | `cancelled`).
 * `cancelled` isn't written by Stage 1 (no `cancel_job` yet — that's
 * a follow-up under the same Stage 1 umbrella) but the type space
 * carries it so the next PR doesn't churn the schema.
 *
 * @module mcp/jobs/job-result-store
 */

import { existsSync, readdirSync, unlinkSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { z } from 'zod';

import { createLogger, getTimeProvider } from '../../core/index.js';
import { nexusDataPath, nexusDataPathEnsure } from '../../config/nexus-data-dir.js';
import { resolveClassGuardMs, type OperationClassName } from '../../config/timeouts.js';
import { sanitizeErrorDetails } from '../../security/output-sanitizer.js';
import { assertValidJobId } from './job-id.js';
import { VERSION } from '../../version.js';
import { readIndexEntry } from './job-idempotency.js';
import {
  candidateJobResultPaths,
  readJobResultAcrossCandidates,
  readJobResultFile,
  syncAlternateCandidates,
} from './job-result-candidates.js';

export {
  candidateJobResultPaths,
  _setCandidatePathsResolverForTests,
} from './job-result-candidates.js';
export { JobFailureDetailSchema, type JobFailureDetail } from './job-failure-detail.js';
import {
  JobFailureDetailSchema,
  type JobFailureDetail,
  validateAndSanitizeFailureDetail,
} from './job-failure-detail.js';

const logger = createLogger({ component: 'job-result-store' });

/** Lifecycle status of a job-result record. */
export const JobStatusSchema = z.enum(['pending', 'complete', 'failed', 'cancelled']);
export type JobStatus = z.infer<typeof JobStatusSchema>;

/**
 * One on-disk job-result record. Versioned so future readers can
 * tell which Stage wrote it — bump on schema break.
 */
export const JobResultSchema = z.object({
  /** Format version. Currently `1` — bump if the shape changes. */
  v: z.literal(1),
  jobId: z.string().min(1),
  /** Tool that was invoked (e.g. `orchestrate`). */
  toolName: z.string().min(1),
  status: JobStatusSchema,
  createdAt: z.iso.datetime(),
  /** Set when the job leaves `pending` — either via `complete` or `failed` or `cancelled`. */
  completedAt: z.iso.datetime().optional(),
  /**
   * Structured payload the synchronous mode would have returned. Present
   * only when `status === 'complete'`. Shape is tool-specific — readers
   * cast to the tool's known output type after status check.
   */
  result: z.unknown().optional(),
  /**
   * Failure message when `status === 'failed'`. Cannot be paired with
   * `result` — the discriminator is `status`.
   */
  error: z.string().optional(),
  /**
   * Structured failure detail when `status === 'failed'` (#4375).
   * Holds normalized adapter, transport, and category information without
   * raw response bodies or prompt strings.
   */
  failureDetail: JobFailureDetailSchema.optional(),
  /**
   * Machine-readable reason for a `failed` record that was NOT settled by the
   * process that ran the job (#6224). `abandoned` is written only by
   * {@link pruneJobRecords}: the record was `pending` past the runaway guard
   * (so no live process could still own it) AND past the retention window, and
   * the sweep rewrote it rather than deleting it. Absent on every record the
   * job's own process wrote — `error` alone carries those failures.
   */
  errorKind: z.literal('abandoned').optional(),
  /**
   * Whether the tool's `run` callback accepts `runAsJob`'s `AbortSignal`
   * (#4972).
   *
   * `cancel_job` writes a `cancelled` record whether or not the tool can act
   * on the signal — as `cancel-job-tool.ts` says, "a tool that IGNORES the
   * signal still runs to completion… but its record stays `cancelled`". A
   * reader of that record could not tell the two apart, so `cancelled` claimed
   * more than was known.
   *
   * This is a STRUCTURAL fact — the callback's arity — not a behavioural one.
   * A tool may accept the signal and never await on it, so `true` means
   * "cancellation can reach this tool", not "the work stopped". Absent means
   * the writer did not report it, which is not the same as `false`.
   */
  signalAccepted: z.boolean().optional(),
  /**
   * `VERSION` of the nexus-agents process that WROTE this record (#5008) —
   * i.e. the build that ran the job, not the build that reads it back.
   *
   * `get_job_result` is itself a wrapped tool, so its `_meta['nexus-agents/build']`
   * stamp (#5056) names the READER's build. After a mid-session global install
   * the reader and the producer differ, and only the record can say which
   * build produced the payload. Each writer re-stamps on its own transition,
   * so a terminal record names the process that settled it.
   *
   * Optional so v1 records written before this field existed still parse:
   * on a SIDECAR record, absence means "produced before this field existed",
   * not a version of `undefined`. A record adapted from the task-state log
   * (`jobResultFromTaskState`, selected by `NEXUS_JOB_RESULT_SOURCE=task_state`)
   * NEVER carries it — that log records no producer version — so a reader
   * must consult the source (`get_job_result`'s `producerVersionSource`)
   * before reading absence as age. The value is recorded verbatim, including
   * `'dev'` — readers MUST run it through {@link isMeasuredBuildVersion}
   * before treating two stamps as comparable.
   */
  producerVersion: z.string().optional(),
  /**
   * When the job body last heartbeat — `runAsJob`'s `progress()` callback,
   * `heartbeatJob`, or a pipeline-bus event the body emitted (#6162). Present
   * once the body has heartbeat at least once and carried onto the terminal
   * record, so a settled job still says when it last moved (a wedged `failed`
   * record: the last progress before the silence). Absence means "no heartbeat
   * recorded", never "no progress" — a body that predates the callback, or one
   * that never adopted it, leaves the field off. On a long guard the reaper in
   * `run-as-job.ts` fails a body that stops heartbeating as wedged, measuring
   * silence from this stamp (or from job start when there is none).
   */
  lastProgressAt: z.iso.datetime().optional(),
});
export type JobResult = z.infer<typeof JobResultSchema>;

/**
 * The value `VERSION` takes when the build-time define is absent (a source
 * checkout run through tsx, or an unbundled test). Two local builds at
 * different commits both read this way.
 */
const UNMEASURED_BUILD_VERSION = 'dev';

/**
 * Whether a recorded build version actually identifies a build (#5008).
 *
 * `false` for an absent or empty value and for `'dev'`. `'dev'` is what
 * `VERSION` reads without the build-time define, so two `'dev'` stamps say
 * nothing about whether the same code wrote them — treating that as a match
 * would be exactly the misreport the field exists to prevent. A reader that
 * compares producer to reader must gate the comparison on this.
 */
export function isMeasuredBuildVersion(version: string | undefined): boolean {
  return version !== undefined && version !== '' && version !== UNMEASURED_BUILD_VERSION;
}

/**
 * The operation class `runJobInBackground` guards every job body with. Spelled
 * here rather than imported from `run-as-job.ts` because that module imports
 * this one; the literal is typed against `OperationClassName` so a rename
 * there is a compile error here.
 */
const ASYNC_JOB_BODY_CLASS: OperationClassName = 'async-job-body';

/**
 * Slack added to the resolved guard before a `pending` record is called
 * abandoned (#6224).
 *
 * The guard is a `setTimeout`, which fires no earlier than `guardMs` but later
 * under event-loop starvation, and the terminal `writeJobFailed` it triggers is
 * a synchronous JSON write. A record read in that gap is a live job that is
 * still in the guard's `finally`, not an abandoned one. 30 s covers a starved
 * loop plus the write; it is deliberately under a minute so the boundary stays
 * within the resolution operators reason about (the guard is quoted in hours).
 */
const ABANDONED_TERMINAL_WRITE_SLACK_MS = 30_000;

/** The fields the abandoned verdict reads — a record and a summary both carry them. */
type AbandonedProbe = Pick<JobResult, 'status' | 'createdAt'>;

/**
 * Whether a `pending` record describes work no process is still doing (#4976).
 *
 * The record is durable; the work is a detached in-process promise. If the
 * process dies mid-body no terminal writer ever runs, and `writeJobPending`
 * refuses to overwrite an existing file — so the record stays `pending`
 * forever and a caller polling `get_job_result` waits on work that no longer
 * exists.
 *
 * The anchor is objective rather than a guess: `async-job-body` is the runaway
 * guard `runAsJob` applies to every body, so a live job CANNOT still be pending
 * past it — it would have been recorded `failed` by the guard. The anchor is
 * the guard as RESOLVED for this process (`resolveClassGuardMs`, the same call
 * `runJobInBackground` makes), not the declared 3,600,000 ms base: since #6159
 * an operator may raise the guard to 7,200,000 ms via
 * `NEXUS_TIMEOUT_CLASS_ASYNC_JOB_BODY_MS` or `NEXUS_TIMEOUT_MULTIPLIER`, and
 * anchoring on the base reported a job 61 minutes into a live 2-hour body as
 * abandoned while its guard had 59 minutes left (#6224). Resolved on every
 * call, never cached, so a reader sees the environment the writer ran under.
 *
 * Reported rather than written back. The record is evidence of what was
 * observed; overwriting it on read would destroy that. This is the same
 * treatment `notVerified` gives an audit chain that verified nothing. The one
 * exception is {@link pruneJobRecords}, which rewrites an abandoned record
 * only once it is also past the retention window.
 *
 * Reads only `status` and `createdAt` ({@link AbandonedProbe}), so it takes a
 * {@link JobSummary} as well as a full record: `list_jobs` and
 * `get_job_result` flag the same job with the same predicate (#6726).
 */
export function isAbandonedJob(record: AbandonedProbe, nowMs: number): boolean {
  return isAbandonedAt(record, nowMs, abandonedAfterMs());
}

/**
 * Milliseconds a `pending` record may be old before no live process can own it:
 * the resolved `async-job-body` guard plus {@link ABANDONED_TERMINAL_WRITE_SLACK_MS}.
 */
function abandonedAfterMs(): number {
  return resolveClassGuardMs(ASYNC_JOB_BODY_CLASS) + ABANDONED_TERMINAL_WRITE_SLACK_MS;
}

/** The predicate with the threshold already resolved — one resolution per sweep. */
function isAbandonedAt(record: AbandonedProbe, nowMs: number, abandonedAfter: number): boolean {
  if (record.status !== 'pending') return false;
  // An unparseable `createdAt` yields NaN, and every NaN comparison is false —
  // so an unknown age reports "not abandoned" without a separate guard. That is
  // the right default: killing a job whose age cannot be read would be a guess.
  const startedMs = Date.parse(record.createdAt);
  return nowMs - startedMs > abandonedAfter;
}

/**
 * Resolve the sidecar path for a given jobId. Throws for an id outside the
 * minted format: writers only ever receive minted ids, so one that is not is a
 * defect, not a path to build.
 */
function jobResultPath(jobId: string): string {
  assertValidJobId(jobId);
  const primary =
    candidateJobResultPaths(jobId)[0] ?? nexusDataPathEnsure('jobs', `result-${jobId}.json`);
  mkdirSync(dirname(primary), { recursive: true });
  return primary;
}

/**
 * Write a job sidecar record with 0600 perms (#3753 defense-in-depth — the
 * payload may carry job result data; restrict to the owner if NEXUS_DATA_DIR is
 * ever shared). `chmodSync` after write guarantees the mode even when overwriting
 * a pre-existing (default-umask) file, which the `writeFileSync` mode option skips.
 */
function persistJobRecord(path: string, record: JobResult): void {
  writeFileSync(path, JSON.stringify(record, null, 2), { mode: 0o600 });
  chmodSync(path, 0o600);
}

/** The heartbeat a terminal writer carries forward from the record it replaces (#6162). */
function carriedProgress(existing: JobResult | null): Pick<JobResult, 'lastProgressAt'> {
  return existing?.lastProgressAt !== undefined ? { lastProgressAt: existing.lastProgressAt } : {};
}

/**
 * Every writer below takes a trailing `producerVersion` defaulting to the
 * running server's `VERSION` (#5008). The parameter is the DI seam: a test
 * can write a version that differs from `VERSION` and prove the stamp
 * round-trips from the injected value rather than from an ambient constant.
 */

/**
 * Write the initial `pending` record for a new job. Idempotent: if a
 * record for `jobId` already exists (e.g. operator restart re-runs the
 * same idempotencyKey — Stage 1 follow-up), this is a no-op.
 *
 * Caller responsibility: generate a fresh `jobId` per call (Stage 1
 * doesn't yet deduplicate via idempotencyKey — that's #3042 follow-up).
 */
export function writeJobPending(
  jobId: string,
  toolName: string,
  signalAccepted?: boolean,
  producerVersion: string = VERSION
): void {
  const path = jobResultPath(jobId);
  if (existsSync(path) || readJobResult(jobId) !== null) {
    logger.debug('Job result file already exists — leaving in place', { jobId });
    return;
  }
  const record: JobResult = {
    v: 1,
    jobId,
    toolName,
    status: 'pending',
    createdAt: new Date().toISOString(),
    ...(signalAccepted !== undefined ? { signalAccepted } : {}),
    producerVersion,
  };
  persistJobRecord(path, record);
  logger.debug('Wrote pending job record', { jobId, toolName, signalAccepted });
}

/**
 * Replace the record with a terminal `complete` status carrying the
 * structured payload. Caller writes the SAME shape the sync mode would
 * have returned, so a polling client can use the result interchangeably.
 *
 * COMPLETE-AFTER-CANCEL guard (#4017): if the job was already `cancelled`
 * (e.g. `cancel_job` landed while the work was in-flight — `runAsJob` does not
 * yet abort the underlying work), this is a NO-OP so the cancellation is not
 * silently rewritten back to `complete`. Symmetric with the caller-side
 * cancel-after-complete guard documented on {@link writeJobCancelled}.
 */
export function writeJobComplete(
  jobId: string,
  toolName: string,
  result: unknown,
  producerVersion: string = VERSION
): void {
  const existing = readJobResult(jobId);
  if (existing?.status === 'cancelled') {
    logger.debug('Skipping complete write — job already cancelled (preserving cancellation)', {
      jobId,
      toolName,
    });
    return;
  }
  const record: JobResult = {
    v: 1,
    jobId,
    toolName,
    status: 'complete',
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    completedAt: new Date().toISOString(),
    result,
    producerVersion,
    ...carriedProgress(existing),
  };
  const primaryPath = jobResultPath(jobId);
  persistJobRecord(primaryPath, record);
  syncAlternateCandidates(jobId, primaryPath, record, logger, persistJobRecord);
  logger.debug('Wrote complete job record', { jobId, toolName });
}

/**
 * Terminal `failed` status. `error` is the human-readable failure message.
 * Like {@link writeJobComplete}, a NO-OP when the job is already `cancelled`
 * (#4017) so a post-cancel failure cannot rewrite the cancellation.
 *
 * Write-path redaction (#4375): sanitizes `error` and any string fields in
 * `failureDetail` via {@link sanitizeErrorDetails} before persisting to disk.
 */
export function writeJobFailed(
  jobId: string,
  toolName: string,
  error: string,
  producerVersion: string = VERSION,
  failureDetail?: JobFailureDetail
): void {
  const existing = readJobResult(jobId);
  if (existing?.status === 'cancelled') {
    logger.debug('Skipping failed write — job already cancelled (preserving cancellation)', {
      jobId,
      toolName,
    });
    return;
  }
  const sanitizedError = sanitizeErrorDetails(error);
  const validatedDetail = validateAndSanitizeFailureDetail(failureDetail);

  const record: JobResult = {
    v: 1,
    jobId,
    toolName,
    status: 'failed',
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    completedAt: new Date().toISOString(),
    error: sanitizedError,
    ...(validatedDetail !== undefined ? { failureDetail: validatedDetail } : {}),
    producerVersion,
    ...carriedProgress(existing),
  };
  const primaryPath = jobResultPath(jobId);
  persistJobRecord(primaryPath, record);
  syncAlternateCandidates(jobId, primaryPath, record, logger, persistJobRecord);
  logger.debug('Wrote failed job record', { jobId, toolName, error: sanitizedError });
}

/**
 * Heartbeat `jobId` (#6162): stamp `lastProgressAt` on its `pending` record,
 * at `at` (an ISO instant; defaults to the time provider's now). The heartbeat
 * half of the liveness contract: `runAsJob`'s `progress()` callback is this,
 * and a job body that holds its `jobId` but not the callback — the arity-0/1
 * adopters, which cannot declare the fourth `run` parameter without also
 * claiming the third (`signalAccepted` is derived from `run.length`, #4972) —
 * calls it directly. Either way a poller reading `pending` can tell slow from
 * stuck, and the liveness watchdog in `run-as-job.ts` measures silence from
 * the same stamp — the record is the one source of truth for "last progress".
 *
 * A no-op unless the record exists AND is `pending`. A heartbeat that lands
 * after `cancel_job`, after the runaway guard, or after the body settled must
 * not resurrect a terminal record; and an unknown jobId is not created — the
 * stamp decorates a dispatch, it does not constitute one. Every other field of
 * the record is carried verbatim, including the producer's version.
 */
export function heartbeatJob(
  jobId: string,
  at: string = new Date(getTimeProvider().now()).toISOString()
): void {
  persistProgressStamp(jobId, at);
}

/**
 * Epoch ms of the recorded heartbeat, or `undefined` when the record has none
 * or cannot be read (#6162). The liveness reaper measures silence from this —
 * the record is the single source of truth for "last progress", for the
 * reaper and for every reader alike — falling back to job start on
 * `undefined`. An unparseable stamp is `undefined`, not `NaN`: a silence that
 * cannot be measured must not read as any particular length.
 */
export function readLastProgressMs(jobId: string): number | undefined {
  const at = readJobResult(jobId)?.lastProgressAt;
  if (at === undefined) return undefined;
  const ms = Date.parse(at);
  return Number.isNaN(ms) ? undefined : ms;
}

function persistProgressStamp(jobId: string, at: string): void {
  const existing = readJobResult(jobId);
  if (existing?.status !== 'pending') {
    logger.debug('Skipping progress stamp — job is not pending', {
      jobId,
      status: existing?.status ?? 'unknown',
    });
    return;
  }
  const updated: JobResult = { ...existing, lastProgressAt: at };
  const primaryPath = jobResultPath(jobId);
  persistJobRecord(primaryPath, updated);
  syncAlternateCandidates(jobId, primaryPath, updated, logger, persistJobRecord);
}

/**
 * Terminal `cancelled` status — set by `cancel_job` (#3042 Stage 1b).
 *
 * Idempotent-by-design at the in-memory state level: if the record is
 * already `complete` / `failed` / `cancelled`, `cancel_job` reports
 * `already_complete` / `already_cancelled` to the caller and DOES NOT
 * overwrite the terminal record (per the #3041 vote Security flag —
 * cancel-after-complete must not rewrite history).
 *
 * The caller (cancel_job tool) checks the current status BEFORE calling
 * this; this writer trusts the caller and always overwrites. Guarding
 * here too would duplicate the guard but is cheap insurance — current
 * design: caller-side guard only.
 */
export function writeJobCancelled(
  jobId: string,
  toolName: string,
  reason?: string,
  producerVersion: string = VERSION
): void {
  const existing = readJobResult(jobId);
  const sanitizedReason = reason !== undefined ? sanitizeErrorDetails(reason) : undefined;
  const record: JobResult = {
    v: 1,
    jobId,
    toolName,
    status: 'cancelled',
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    completedAt: new Date().toISOString(),
    ...(sanitizedReason !== undefined ? { error: sanitizedReason } : {}),
    producerVersion,
    ...carriedProgress(existing),
  };
  const primaryPath = jobResultPath(jobId);
  persistJobRecord(primaryPath, record);
  syncAlternateCandidates(jobId, primaryPath, record, logger, persistJobRecord);
  logger.debug('Wrote cancelled job record', { jobId, toolName, reason: sanitizedReason });
}

/**
 * Read a job-result record across candidate data directories (#5472).
 * Returns `null` if the jobId is unknown (no candidate file exists) or
 * unreadable (corrupt JSON, schema mismatch).
 *
 * Checks all candidate paths (primary and shared). If multiple valid records
 * exist, terminal status outranks pending, cancellations are preserved (#4017),
 * and later timestamps break ties.
 *
 * Schema mismatch is treated as "not found" not "error" so a client
 * polling against a future-Stage record from an older nexus-agents
 * process doesn't crash — the request just looks like an unknown jobId
 * until the operator upgrades.
 */
export function readJobResult(jobId: string): JobResult | null {
  return readJobResultAcrossCandidates(jobId, logger);
}

/**
 * List job records under `<NEXUS_DATA_DIR>/jobs/` (#3046 Stage 5).
 *
 * Returns ALL records sorted by `createdAt` descending (newest first).
 * Caller filters by `toolName` / `status` via the `list_jobs` MCP tool —
 * we don't push the filter logic in here because tools change shape but
 * the store doesn't.
 *
 * **The result payloads are intentionally EXCLUDED** from each summary
 * — large complete-status records can be 1 MiB each (per Stage 2's
 * TASK_RESULT_MAX_BYTES cap), and `list_jobs` is meant for discovery,
 * not retrieval. Callers re-fetch full records via `get_job_result(jobId)`.
 *
 * Schema-mismatch + unreadable files are silently dropped (logged as
 * warnings), same policy as `readJobResult`.
 */
export interface JobSummary {
  readonly jobId: string;
  readonly toolName: string;
  readonly status: JobResult['status'];
  readonly createdAt: string;
  readonly completedAt?: string;
  /** True iff the record carries an error message (status === 'failed'). */
  readonly hasError: boolean;
  /** Last heartbeat from the job body (#6162); absent when none was recorded. */
  readonly lastProgressAt?: string;
  /**
   * Set by `list_jobs` when a `pending` job has outlived the runaway guard, so
   * no live process can still own it: the same {@link isAbandonedJob} verdict
   * `get_job_result` reports (#6726). Computed at read time, never stored;
   * absent means "not abandoned", and `status` stays `pending` as observed.
   */
  readonly abandoned?: boolean;
}

/** Project a full {@link JobResult} down to its {@link JobSummary} — shared by
 * the sidecar walk here and the task-state list source (#3693). */
export function toJobSummary(record: JobResult): JobSummary {
  return {
    jobId: record.jobId,
    toolName: record.toolName,
    status: record.status,
    createdAt: record.createdAt,
    hasError: record.error !== undefined,
    ...(record.completedAt !== undefined ? { completedAt: record.completedAt } : {}),
    ...(record.lastProgressAt !== undefined ? { lastProgressAt: record.lastProgressAt } : {}),
  };
}

/**
 * What a job listing could NOT read (#6038).
 *
 * `listJobs` returned a bare array, so two very different worlds produced `[]`:
 * "there are no jobs" and "the jobs directory would not open". And a sidecar
 * that failed `JobResultSchema` — a record written by a newer nexus-agents, or
 * half-written by a concurrent job — was skipped by deliberate policy in
 * `readJobResult` and then left no trace at all. `list_jobs` reported
 * `{"count":0,"truncated":false}` over both, and an operator or the autonomous
 * loop concludes nothing is pending and re-dispatches work already running.
 */
interface JobListDiagnostics {
  /** True when the jobs directory exists but could not be enumerated. */
  readonly dirUnreadable: boolean;
  /** Sidecar files that matched the naming pattern but failed to parse or validate. */
  readonly unparseableRecords: number;
}

/** Job summaries plus what the listing could not read. */
export interface JobListing {
  readonly jobs: JobSummary[];
  readonly diagnostics: JobListDiagnostics;
}

export function listJobs(): JobSummary[] {
  return listJobsWithDiagnostics().jobs;
}

/** List jobs AND report what the listing could not read (#6038). */
export function listJobsWithDiagnostics(): JobListing {
  const dir = nexusDataPath('jobs');
  // An ABSENT directory is a measured absence: no jobs have ever been written.
  // That is different from a directory that exists and will not open.
  if (!existsSync(dir)) {
    return { jobs: [], diagnostics: { dirUnreadable: false, unparseableRecords: 0 } };
  }
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch (err) {
    logger.warn('jobs directory unreadable', {
      dir,
      error: err instanceof Error ? err.message : String(err),
    });
    return { jobs: [], diagnostics: { dirUnreadable: true, unparseableRecords: 0 } };
  }
  const summaries: JobSummary[] = [];
  let unparseableRecords = 0;
  for (const entry of entries) {
    const match = /^result-(.+)\.json$/.exec(entry);
    if (match === null) continue;
    const jobId = match[1];
    if (jobId === undefined) continue;
    const record = readJobResult(jobId);
    if (record === null) {
      unparseableRecords += 1;
      continue;
    }
    summaries.push(toJobSummary(record));
  }
  // Newest first — matches typical "what just happened" discovery flow.
  return {
    jobs: summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    diagnostics: { dirUnreadable: false, unparseableRecords },
  };
}

// ---------------------------------------------------------------------------
// Retention (#6224, #4976 gap 2)
// ---------------------------------------------------------------------------

/**
 * How long a job record is kept after it settles.
 *
 * Seven days. The record is the only durable evidence an async tool ran, so
 * the window trades disk against auditability (#4976 asked for a decision
 * rather than a guess): a week covers the weekly end-to-end validation cadence
 * (CLAUDE.md, "Periodic end-to-end validation"), which is the longest-lived
 * reader of a job's result, and on the machine measured in #6224, 198 of 303
 * records were older than three days — a window of days, not hours, is what
 * bounds the store. The audit chain next door is kept forever on purpose; job
 * results are not the audit chain. A constant, not an env var: no consumer has
 * asked to tune it, and a knob nobody reads is the shape #2977 removed.
 */
export const JOB_RECORD_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Minimum gap between two sweeps run from `runAsJob` in one process. A sweep
 * enumerates and parses every record, so running it on every dispatch would
 * put a directory walk on the async hot path; once an hour bounds that to the
 * scale of the guard itself.
 */
const JOB_PRUNE_SWEEP_INTERVAL_MS = 3_600_000;

/** What one retention sweep did — or, with `dryRun`, would have done. */
export interface JobPruneCounts {
  /** Terminal records older than the window, removed. */
  readonly deleted: number;
  /** `pending` records past the guard AND the window, rewritten as `failed`. */
  readonly markedAbandoned: number;
  /** Records inside the window, or `pending` records the guard still covers. */
  readonly kept: number;
  /** Record or key files that would not parse — counted, never touched. */
  readonly unreadable: number;
  /**
   * Idempotency index entries (`key-*.json`, `job-idempotency.ts`) older than
   * the window whose job record no longer exists, removed. Counted apart from
   * `deleted` because they are not records: a key that outlives its record
   * would replay a jobId `get_job_result` cannot find, and the caller could
   * never dispatch under that key again.
   */
  readonly deletedKeys: number;
}

interface PruneJobRecordsOptions {
  /** The sweep's notion of now, in epoch milliseconds. */
  readonly nowMs: number;
  /** Retention window in milliseconds; {@link JOB_RECORD_RETENTION_MS} in production. */
  readonly retentionMs: number;
  /** Count what would change and change nothing. */
  readonly dryRun?: boolean;
}

/**
 * Sweep `<NEXUS_DATA_DIR>/jobs/` (#6224, closing #4976 gap 2).
 *
 * Rules, in the order they are tested:
 *
 * - A terminal record (`complete` / `failed` / `cancelled`) whose `completedAt`
 *   — `createdAt` when a legacy record has none — is older than `retentionMs`
 *   is deleted. "Older than" is strict: a record exactly at the window is kept.
 * - A `pending` record that is abandoned ({@link isAbandonedJob}: older than the
 *   resolved guard, so no live process can own it) AND older than the window is
 *   rewritten as `failed` with `errorKind: 'abandoned'`. Never deleted: the
 *   record is the only evidence the dispatch happened. This is the ONE path
 *   that writes an abandoned verdict back; `get_job_result` keeps reporting it.
 *   A `pending` record younger than either bound is kept — the guard may still
 *   settle it, or a poller may still need to see it `pending`.
 * - A file matching `result-*.json` or `key-*.json` that fails to parse or
 *   validate is counted as `unreadable` and left in place. It may have been
 *   written by a newer build, or be mid-write by a concurrent job; deleting on
 *   "could not read" would turn a parse error into data loss.
 * - An idempotency key entry (`key-*.json`) older than the window whose job
 *   record is absent — deleted by this sweep or never written — is removed
 *   AFTER the records pass, so a key and its record leave together. A key
 *   inside the window is kept even without a record: it is registered right
 *   after the pending write, so a young dangling key may be mid-dispatch.
 *
 * The guard is resolved ONCE per sweep, not once per record.
 *
 * Empty case: an absent or empty jobs directory returns all-zero counts. A
 * directory that exists but cannot be enumerated THROWS — reporting zeros
 * there would present "could not look" as "nothing to do".
 */
export function pruneJobRecords(options: PruneJobRecordsOptions): JobPruneCounts {
  const dir = nexusDataPath('jobs');
  if (!existsSync(dir)) {
    return { deleted: 0, markedAbandoned: 0, kept: 0, unreadable: 0, deletedKeys: 0 };
  }
  // Deliberately not wrapped: an unreadable directory is the caller's problem
  // to report, not a zero.
  const entries = readdirSync(dir);
  const sweep: SweepContext = {
    nowMs: options.nowMs,
    retentionMs: options.retentionMs,
    dryRun: options.dryRun === true,
    abandonedAfter: abandonedAfterMs(),
  };
  const counts = { deleted: 0, markedAbandoned: 0, kept: 0, unreadable: 0, deletedKeys: 0 };
  /** Records this pass deleted (or, dry-run, would have) — keys check against it. */
  const removedJobIds = new Set<string>();
  const keyEntries = entries.filter((entry) => /^key-.+\.json$/.test(entry));
  for (const entry of entries) {
    const jobId = /^result-(.+)\.json$/.exec(entry)?.[1];
    if (jobId === undefined) continue;
    const verdict = sweepRecord(jobId, entry, sweep);
    counts[verdict] += 1;
    if (verdict === 'deleted') removedJobIds.add(jobId);
  }
  for (const entry of keyEntries) {
    const verdict = sweepKeyEntry(entry, removedJobIds, sweep);
    if (verdict !== null) counts[verdict] += 1;
  }
  logger.debug('Job record sweep', { dir, ...counts, dryRun: sweep.dryRun });
  return counts;
}

/** One sweep's inputs, resolved once and threaded through every verdict. */
interface SweepContext {
  readonly nowMs: number;
  readonly retentionMs: number;
  readonly dryRun: boolean;
  /** {@link abandonedAfterMs}, resolved once per sweep. */
  readonly abandonedAfter: number;
}

/** What the sweep did with one record — each maps to a {@link JobPruneCounts} key. */
type RecordVerdict = 'deleted' | 'markedAbandoned' | 'kept' | 'unreadable';

/** Apply the record rules to one `result-*.json` entry and report which fired. */
function sweepRecord(jobId: string, entry: string, sweep: SweepContext): RecordVerdict {
  const path = nexusDataPath('jobs', entry);
  const fileRecord = readJobResultFile(path, jobId, logger);
  if (fileRecord === null) return 'unreadable';
  const record = readJobResult(jobId) ?? fileRecord;
  if (record.status === 'pending') {
    const pastGuard = isAbandonedAt(record, sweep.nowMs, sweep.abandonedAfter);
    const pastWindow = isOlderThan(record.createdAt, sweep.nowMs, sweep.retentionMs);
    if (!(pastGuard && pastWindow)) return 'kept';
    if (!sweep.dryRun) persistJobRecord(path, abandonedRecord(record, sweep.nowMs));
    return 'markedAbandoned';
  }
  const settledAt = record.completedAt ?? record.createdAt;
  if (!isOlderThan(settledAt, sweep.nowMs, sweep.retentionMs)) return 'kept';
  if (!sweep.dryRun) unlinkSync(path);
  return 'deleted';
}

/**
 * Apply the key rule to one `key-*.json` entry: `deletedKeys` when it is past
 * the window and its record is gone, `unreadable` when it will not parse, and
 * `null` (no count — keys are not records, so they are never "kept") otherwise.
 */
function sweepKeyEntry(
  entry: string,
  removedJobIds: ReadonlySet<string>,
  sweep: SweepContext
): 'deletedKeys' | 'unreadable' | null {
  const path = nexusDataPath('jobs', entry);
  const indexEntry = readIndexEntry(path);
  if (indexEntry === null) return 'unreadable';
  if (!isOlderThan(indexEntry.createdAt, sweep.nowMs, sweep.retentionMs)) return null;
  const recordGone =
    removedJobIds.has(indexEntry.jobId) ||
    !candidateJobResultPaths(indexEntry.jobId).some((p) => existsSync(p));
  if (!recordGone) return null;
  if (!sweep.dryRun) unlinkSync(path);
  return 'deletedKeys';
}

/**
 * Strictly older than `windowMs`. An unparseable timestamp yields NaN, and a
 * NaN comparison is false — an age that cannot be read is never "old enough".
 */
function isOlderThan(isoTimestamp: string, nowMs: number, windowMs: number): boolean {
  return nowMs - Date.parse(isoTimestamp) > windowMs;
}

/**
 * The `failed` rewrite of an abandoned `pending` record. Every field of the
 * original survives (`createdAt`, `signalAccepted`, the tool); the original
 * producer's version moves into the message because `producerVersion` names
 * the writer that settled the record, and that is now the sweep.
 */
function abandonedRecord(record: JobResult, nowMs: number): JobResult {
  const producer = record.producerVersion ?? 'unrecorded';
  return {
    ...record,
    status: 'failed',
    completedAt: new Date(nowMs).toISOString(),
    error:
      `abandoned: pending since ${record.createdAt} under producer ${producer}; ` +
      'no process settled it within the runaway guard, and the retention sweep ' +
      'marked it failed rather than deleting the evidence',
    errorKind: 'abandoned',
    producerVersion: VERSION,
  };
}

/**
 * Epoch ms of the last sweep this process ran, per jobs directory. Keyed by
 * directory rather than a single timestamp because `NEXUS_DATA_DIR` routes
 * per-repo state (#2872), so one process can serve more than one jobs
 * directory and each deserves its own hourly sweep. Bounded by the number of
 * distinct data dirs a process touches.
 */
const lastSweepAtMsByDir = new Map<string, number>();

/**
 * Run {@link pruneJobRecords} with the production window if at least
 * {@link JOB_PRUNE_SWEEP_INTERVAL_MS} has passed since this process last swept
 * the current jobs directory (#6224). Called by `runAsJob` before every
 * pending write.
 *
 * A sweep that throws is logged and swallowed: retention must never block a
 * dispatch. The timestamp is taken BEFORE the sweep so a directory that keeps
 * failing is retried once an hour, not on every call.
 *
 * @returns The counts when a sweep ran, `null` when one was not due or failed.
 */
export function pruneJobRecordsIfDue(nowMs: number): JobPruneCounts | null {
  const dir = nexusDataPath('jobs');
  const lastSweepAtMs = lastSweepAtMsByDir.get(dir);
  if (lastSweepAtMs !== undefined && nowMs - lastSweepAtMs < JOB_PRUNE_SWEEP_INTERVAL_MS) {
    return null;
  }
  lastSweepAtMsByDir.set(dir, nowMs);
  try {
    return pruneJobRecords({ nowMs, retentionMs: JOB_RECORD_RETENTION_MS });
  } catch (err) {
    logger.warn('Job record sweep failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
