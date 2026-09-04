/**
 * Task-state job-result source (#3090 / epic #2631 Stage 2 migration).
 *
 * Adapts the Stage-2 `StructuredTaskState` surface into the Stage-1
 * `JobResult` shape so `get_job_result` (and, later, `list_jobs`) can read
 * an async job's result from the canonical task-state log instead of the
 * sidecar. This is the **reader half** of the sidecar→Stage-2 migration:
 * it is flag-gated with the sidecar as the default, so production behavior
 * is unchanged until the writer half (#3091) makes `jobId === taskId` real.
 *
 * Mapping contract (see #3090):
 * - status: `cancellation` present → `cancelled`; `stage==='complete'` →
 *   `complete`; `stage==='failed'` → `failed`; else → `pending`
 *   (`blocked` is recoverable, still in-flight).
 * - `result` ← `state.result`; `error` ← cancellation.reason (cancelled)
 *   or the most-recent blocker (failed).
 * - `toolName` ← derived from the jobId prefix (`orch-` → `orchestrate`).
 * - `createdAt` ← `state.createdAt`; `completedAt` ← `state.updatedAt` when
 *   terminal, omitted otherwise.
 *
 * @module mcp/jobs/task-state-source
 */

import { createLogger } from '../../core/index.js';
import { readTaskState, listTaskStateIds } from '../../context/structured-task-state.js';
import type { StructuredTaskState } from '../../context/structured-task-state-types.js';
import type { JobResult, JobStatus, JobSummary } from './job-result-store.js';
import { readJobResult, listJobs, toJobSummary } from './job-result-store.js';

const logger = createLogger({ component: 'task-state-source' });

/**
 * jobId-prefix → toolName. Async-mode writers mint task ids two ways:
 * - orchestrate's `generateTaskId` → `orch-<ts>-<rand>` (single-segment prefix);
 * - the `runAsJob` writers → `<prefix>-<uuid>`, where some prefixes are
 *   themselves two-segment (`job-rw-…`, `job-vote-…`). Both forms are matched by
 *   {@link toolNameFromJobId}, which tries the two-segment prefix before the
 *   single-segment one so `job-rw-…` resolves to `run_workflow` rather than
 *   colliding on `job`. Extended as each writer migrates (#3091, #3092).
 * Unknown → `'unknown'`.
 */
const TOOL_NAME_BY_PREFIX: Readonly<Record<string, string>> = {
  orch: 'orchestrate',
  // run_workflow mints `job-rw-<uuid>`; consensus_vote mints `job-vote-<uuid>`.
  // Both share the `job` first segment, so they are keyed (and matched) on the
  // two-segment prefix to stay distinct.
  'job-rw': 'run_workflow',
  'job-vote': 'consensus_vote',
  // #3726: run_dev_pipeline async jobs mint `dp-<uuid>` ids (or reuse the
  // caller's sessionId — which has no fixed prefix, so the dual-read reader
  // resolves those from the sidecar via toolName recorded at writeJobPending).
  dp: 'run_dev_pipeline',
  // #3730: run_pipeline async jobs mint `rp-<uuid>` ids (no sessionId surface).
  rp: 'run_pipeline',
  // #3731: pr_review async jobs mint `pr-<uuid>` ids (no sessionId surface).
  pr: 'pr_review',
  // #3731: supply_chain_tradeoff_panel async jobs mint `sc-<uuid>` ids.
  sc: 'supply_chain_tradeoff_panel',
  // #3732: execute_spec async jobs mint `es-<uuid>` ids (no sessionId surface).
  es: 'execute_spec',
  // #3732: run_graph_workflow async jobs mint `gw-<uuid>` ids.
  gw: 'run_graph_workflow',
  // #3732: run (execute:true) async jobs mint `rn-<uuid>` ids.
  rn: 'run',
};

/** Derive the toolName from a jobId/taskId prefix. */
export function toolNameFromJobId(jobId: string): string {
  const [first, second] = jobId.split('-');
  // Try the two-segment prefix first (e.g. `job-rw`, `job-vote`) so distinct
  // tools that share a leading segment don't collide, then the single segment.
  if (first !== undefined && second !== undefined) {
    const byTwo = TOOL_NAME_BY_PREFIX[`${first}-${second}`];
    if (byTwo !== undefined) return byTwo;
  }
  const dash = jobId.indexOf('-');
  const prefix = dash === -1 ? jobId : jobId.slice(0, dash);
  return TOOL_NAME_BY_PREFIX[prefix] ?? 'unknown';
}

/** Map a reduced task-state's stage/cancellation into a job status. */
function statusFromState(state: StructuredTaskState): JobStatus {
  if (state.cancellation !== undefined) return 'cancelled';
  if (state.stage === 'complete') return 'complete';
  if (state.stage === 'failed') return 'failed';
  return 'pending';
}

/** Most-recent blocker message, if any — used as the `error` for failed jobs. */
function lastBlockerMessage(state: StructuredTaskState): string | undefined {
  const last = state.blockers.at(-1);
  return last?.blocker;
}

/**
 * Pure mapping: `StructuredTaskState` → `JobResult`. `jobId` is the key the
 * caller polled with (== taskId once the writer half lands). Never throws.
 */
export function jobResultFromTaskState(state: StructuredTaskState, jobId: string): JobResult {
  const status = statusFromState(state);
  const isTerminal = status !== 'pending';
  const createdAt = state.createdAt ?? state.updatedAt;

  const record: JobResult = {
    v: 1,
    jobId,
    toolName: toolNameFromJobId(jobId),
    status,
    createdAt,
    ...(isTerminal ? { completedAt: state.updatedAt } : {}),
  };

  if (status === 'complete') {
    return { ...record, result: state.result };
  }
  if (status === 'cancelled') {
    const reason = state.cancellation?.reason;
    return reason !== undefined ? { ...record, error: reason } : record;
  }
  if (status === 'failed') {
    const msg = lastBlockerMessage(state);
    return msg !== undefined ? { ...record, error: msg } : record;
  }
  return record;
}

/**
 * Read an async job's result from the task-state log and map it to a
 * `JobResult`. Returns `null` when no task-state log exists for `jobId`
 * (so the caller can fall back to the sidecar). `customDir` is forwarded
 * to `readTaskState` for test isolation.
 */
export function readJobResultFromTaskState(jobId: string, customDir?: string): JobResult | null {
  const stateResult = readTaskState(jobId, customDir);
  if (!stateResult.ok) return null;
  return jobResultFromTaskState(stateResult.value, jobId);
}

/**
 * Read-source toggle for the job-result reader (#3090). Default OFF — the
 * sidecar stays authoritative until the writer half (#3091) lands, so this
 * dual-read is inert in production until explicitly enabled. Set
 * `NEXUS_JOB_RESULT_SOURCE=task_state` to prefer the task-state log.
 */
export function isTaskStateJobSource(): boolean {
  return process.env['NEXUS_JOB_RESULT_SOURCE']?.toLowerCase() === 'task_state';
}

/**
 * Which store answered a job-result read. The values are the
 * `NEXUS_JOB_RESULT_SOURCE` value set (`config/env-schema.ts`) so a caller
 * can relate the answer to the toggle that selected it.
 */
export type JobResultSource = 'sidecar' | 'task_state';

/** A resolved record tagged with the source that produced it (#5008). */
interface ResolvedJobResult {
  readonly record: JobResult;
  readonly source: JobResultSource;
}

/**
 * Resolve an async job's result with dual-read semantics, naming the source:
 * - source toggle ON  → try the task-state log first, fall back to sidecar.
 * - source toggle OFF → sidecar only (current behavior, unchanged).
 *
 * The source matters to a reader of `producerVersion` (#5008): a task-state
 * record is SYNTHESIZED by {@link jobResultFromTaskState} and never carries
 * one, so without the tag an absent version on a job a versioned build ran
 * would read as "record predates the field".
 *
 * Returns `null` only when neither source has the job. `customDir` steers
 * ONLY the task-state read (for test isolation); the sidecar `readJobResult`
 * resolves against `NEXUS_DATA_DIR` and has no per-call dir override.
 */
export function resolveJobResultWithSource(
  jobId: string,
  customDir?: string
): ResolvedJobResult | null {
  if (isTaskStateJobSource()) {
    const fromState = readJobResultFromTaskState(jobId, customDir);
    if (fromState !== null) {
      logger.debug('Resolved job result from task-state', { jobId, status: fromState.status });
      return { record: fromState, source: 'task_state' };
    }
  }
  const fromSidecar = readJobResult(jobId);
  return fromSidecar === null ? null : { record: fromSidecar, source: 'sidecar' };
}

/** {@link resolveJobResultWithSource} without the source tag. */
export function resolveJobResult(jobId: string, customDir?: string): JobResult | null {
  return resolveJobResultWithSource(jobId, customDir)?.record ?? null;
}

/**
 * Summarize every async job recorded in the task-state log (#3693). Maps each
 * `state-<taskId>.jsonl` to a {@link JobSummary} via the same Stage-2→JobResult
 * adapter the single-job reader uses; entries that don't map (no terminal
 * cancellation/stage, unreadable) are skipped. `customDir` is for test isolation.
 */
export function listJobsFromTaskState(customDir?: string): JobSummary[] {
  const summaries: JobSummary[] = [];
  for (const taskId of listTaskStateIds(customDir)) {
    const record = readJobResultFromTaskState(taskId, customDir);
    if (record !== null) summaries.push(toJobSummary(record));
  }
  return summaries;
}

/**
 * List async jobs with dual-read semantics (#3693), mirroring
 * {@link resolveJobResult}:
 * - source toggle OFF → the sidecar list only (current behavior, unchanged).
 * - source toggle ON  → the UNION of sidecar + task-state jobs, deduped by
 *   jobId with the task-state record preferred (it is the migration target).
 *
 * Unioning (rather than task-state-only) ensures no job is lost while the writer
 * half (#3091+) is still partial — sidecar-only jobs remain visible. Newest-first
 * ordering matches `listJobs()`. `customDir` steers ONLY the task-state read.
 */
export function resolveJobList(customDir?: string): JobSummary[] {
  const sidecar = listJobs();
  if (!isTaskStateJobSource()) return sidecar;
  const byId = new Map<string, JobSummary>();
  for (const summary of sidecar) byId.set(summary.jobId, summary);
  for (const summary of listJobsFromTaskState(customDir)) byId.set(summary.jobId, summary);
  return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
