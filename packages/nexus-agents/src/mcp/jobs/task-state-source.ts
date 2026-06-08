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
import { readTaskState } from '../../context/structured-task-state.js';
import type { StructuredTaskState } from '../../context/structured-task-state-types.js';
import type { JobResult, JobStatus } from './job-result-store.js';
import { readJobResult } from './job-result-store.js';

const logger = createLogger({ component: 'task-state-source' });

/**
 * jobId-prefix → toolName. Async-mode writers mint task ids as
 * `<prefix>-<ts>-<rand>` (e.g. orchestrate's `generateTaskId` → `orch-…`).
 * Extended as each writer migrates (#3091, #3092). Unknown → `'unknown'`.
 */
const TOOL_NAME_BY_PREFIX: Readonly<Record<string, string>> = {
  orch: 'orchestrate',
  rwf: 'run_workflow',
  cv: 'consensus_vote',
  // #3726: run_dev_pipeline async jobs mint `dp-<uuid>` ids (or reuse the
  // caller's sessionId — which has no fixed prefix, so the dual-read reader
  // resolves those from the sidecar via toolName recorded at writeJobPending).
  dp: 'run_dev_pipeline',
};

/** Derive the toolName from a jobId/taskId prefix. */
export function toolNameFromJobId(jobId: string): string {
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
 * Resolve an async job's result with dual-read semantics:
 * - source toggle ON  → try the task-state log first, fall back to sidecar.
 * - source toggle OFF → sidecar only (current behavior, unchanged).
 *
 * Returns `null` only when neither source has the job. `customDir` steers
 * ONLY the task-state read (for test isolation); the sidecar `readJobResult`
 * resolves against `NEXUS_DATA_DIR` and has no per-call dir override.
 */
export function resolveJobResult(jobId: string, customDir?: string): JobResult | null {
  if (isTaskStateJobSource()) {
    const fromState = readJobResultFromTaskState(jobId, customDir);
    if (fromState !== null) {
      logger.debug('Resolved job result from task-state', { jobId, status: fromState.status });
      return fromState;
    }
  }
  return readJobResult(jobId);
}
