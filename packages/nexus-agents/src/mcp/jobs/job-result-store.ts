/**
 * Job-result store for async-mode MCP tools (#3042, Stage 1 of #2631).
 *
 * Persists the final result of a background-dispatched MCP tool
 * invocation to `<NEXUS_DATA_DIR>/jobs/result-<jobId>.json`. Lets a
 * caller dispatch a long-running tool via `mode: 'async'`, receive a
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

import { existsSync, readFileSync, readdirSync, writeFileSync, chmodSync } from 'node:fs';

import { z } from 'zod';

import { createLogger } from '../../core/index.js';
import { nexusDataPath, nexusDataPathEnsure } from '../../config/nexus-data-dir.js';

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
});
export type JobResult = z.infer<typeof JobResultSchema>;

/** Resolve the sidecar path for a given jobId. */
function jobResultPath(jobId: string): string {
  // `jobs/result-<id>.json` — single segment past `jobs/` so
  // `nexusDataPathEnsure` makes the `jobs/` directory and returns
  // the file path.
  return nexusDataPathEnsure('jobs', `result-${jobId}.json`);
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

/**
 * Write the initial `pending` record for a new job. Idempotent: if a
 * record for `jobId` already exists (e.g. operator restart re-runs the
 * same idempotencyKey — Stage 1 follow-up), this is a no-op.
 *
 * Caller responsibility: generate a fresh `jobId` per call (Stage 1
 * doesn't yet deduplicate via idempotencyKey — that's #3042 follow-up).
 */
export function writeJobPending(jobId: string, toolName: string): void {
  const path = jobResultPath(jobId);
  if (existsSync(path)) {
    logger.debug('Job result file already exists — leaving in place', { jobId });
    return;
  }
  const record: JobResult = {
    v: 1,
    jobId,
    toolName,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  persistJobRecord(path, record);
  logger.debug('Wrote pending job record', { jobId, toolName });
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
export function writeJobComplete(jobId: string, toolName: string, result: unknown): void {
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
  };
  persistJobRecord(jobResultPath(jobId), record);
  logger.debug('Wrote complete job record', { jobId, toolName });
}

/**
 * Terminal `failed` status. `error` is the human-readable failure message.
 * Like {@link writeJobComplete}, a NO-OP when the job is already `cancelled`
 * (#4017) so a post-cancel failure cannot rewrite the cancellation.
 */
export function writeJobFailed(jobId: string, toolName: string, error: string): void {
  const existing = readJobResult(jobId);
  if (existing?.status === 'cancelled') {
    logger.debug('Skipping failed write — job already cancelled (preserving cancellation)', {
      jobId,
      toolName,
    });
    return;
  }
  const record: JobResult = {
    v: 1,
    jobId,
    toolName,
    status: 'failed',
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    completedAt: new Date().toISOString(),
    error,
  };
  persistJobRecord(jobResultPath(jobId), record);
  logger.debug('Wrote failed job record', { jobId, toolName, error });
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
export function writeJobCancelled(jobId: string, toolName: string, reason?: string): void {
  const record: JobResult = {
    v: 1,
    jobId,
    toolName,
    status: 'cancelled',
    createdAt: readJobResult(jobId)?.createdAt ?? new Date().toISOString(),
    completedAt: new Date().toISOString(),
    ...(reason !== undefined ? { error: reason } : {}),
  };
  persistJobRecord(jobResultPath(jobId), record);
  logger.debug('Wrote cancelled job record', { jobId, toolName, reason });
}

/**
 * Read a job-result record. Returns `null` if the jobId is unknown
 * (file doesn't exist) or unreadable (corrupt JSON, schema mismatch).
 *
 * Schema mismatch is treated as "not found" not "error" so a client
 * polling against a future-Stage record from an older nexus-agents
 * process doesn't crash — the request just looks like an unknown jobId
 * until the operator upgrades.
 */
export function readJobResult(jobId: string): JobResult | null {
  const path = nexusDataPath('jobs', `result-${jobId}.json`);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
    const parsed = JobResultSchema.safeParse(raw);
    if (!parsed.success) {
      logger.warn('Job result file failed schema check', { jobId, path });
      return null;
    }
    return parsed.data;
  } catch (err) {
    logger.warn('Job result file unreadable', {
      jobId,
      path,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
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
  };
}

export function listJobs(): JobSummary[] {
  const dir = nexusDataPath('jobs');
  if (!existsSync(dir)) return [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch (err) {
    logger.warn('jobs directory unreadable', {
      dir,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
  const summaries: JobSummary[] = [];
  for (const entry of entries) {
    const match = /^result-(.+)\.json$/.exec(entry);
    if (match === null) continue;
    const jobId = match[1];
    if (jobId === undefined) continue;
    const record = readJobResult(jobId);
    if (record === null) continue;
    summaries.push(toJobSummary(record));
  }
  // Newest first — matches typical "what just happened" discovery flow.
  return summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
