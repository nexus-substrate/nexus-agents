/**
 * `cancel_job` MCP tool (#3042 Stage 1b / epic #2631).
 *
 * Marks an async-mode job as cancelled. Three semantic outcomes:
 *
 * - **`cancelled`** — the job was `pending` and is now `cancelled`. This
 *   writes the durable `cancelled` record, and the terminal writers
 *   (`writeJobComplete`/`writeJobFailed`) no-op against it (#4017/#4022),
 *   so a later-settling background job can no longer silently revert the
 *   cancellation. See the IMPORTANT caveat below on what this does NOT stop.
 * - **`already_complete`** — the job is already `complete` / `failed`.
 *   The terminal record is preserved (Security flag from #3041 vote:
 *   cancel-after-complete must not rewrite history).
 * - **`already_cancelled`** — second + cancellation against the same
 *   jobId is a no-op. Idempotent for safe retry.
 *
 * **What cancel does to in-flight work (#4086).** Cancelling a `pending` job now
 * fires that job's `AbortController` (registered by `runAsJob`, threaded into the
 * job body as an `AbortSignal`). A `runAsJob`-dispatched tool that THREADS the
 * signal into its awaited operations is genuinely interrupted in this process;
 * when its `run()` rejects on abort, the terminal writers no-op against the
 * already-written `cancelled` record (#4022), so the cancellation wins. A tool that
 * IGNORES the signal still runs to completion (you cannot stop an unyielding
 * Promise from outside) — but its record stays `cancelled`. So adopting the signal
 * is per-tool and incremental; the dispatch infrastructure now makes it possible.
 * (`consensus_vote` had its own AbortSignal plumbing pre-#4086, #3038.)
 *
 * Same-process only: it does not abort work in OTHER processes (no IPC; a
 * per-process AbortController can only abort what it owns). In a multi-process
 * deployment the durable cancellation record is observable via
 * `get_job_result` / `list_jobs`, but the worker process must poll for it.
 *
 * @module mcp/tools/cancel-job-tool
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { createLogger, formatZodError } from '../../core/index.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler } from '../middleware/secure-handler.js';
import {
  toolStructuredError,
  toolSuccess,
  type BaseMcpToolDeps,
  type ToolResult,
} from './tool-result.js';
import { readJobResult, writeJobCancelled, type JobStatus } from '../jobs/job-result-store.js';
import { abortJob } from '../jobs/job-abort-registry.js';
import { getToolAnnotations } from '../tool-annotations.js';

export const CancelJobInputSchema = z.object({
  jobId: z
    .string()
    .min(1)
    .max(128)
    .describe('Job ID returned by orchestrate / run_workflow / consensus_vote in async mode'),
  reason: z
    .string()
    .max(1000)
    .optional()
    .describe('Optional human-readable note (e.g. "user clicked cancel").'),
});
export type CancelJobInput = z.infer<typeof CancelJobInputSchema>;

/** Outcome envelope. `status` discriminates the four cases. */
export interface CancelJobResponse {
  readonly jobId: string;
  /** Outcome category — see module docstring. */
  readonly outcome: 'cancelled' | 'already_complete' | 'already_cancelled' | 'unknown_job';
  /** The terminal status now on disk (after this call). Absent for `unknown_job`. */
  readonly status?: JobStatus;
  /** Human-readable explanation matching the outcome. */
  readonly message: string;
}

export type CancelJobDeps = BaseMcpToolDeps;

function cancelJobHandler(args: unknown): Promise<ToolResult> {
  const parsed = CancelJobInputSchema.safeParse(args);
  if (!parsed.success) {
    return Promise.resolve(
      toolStructuredError({
        errorCategory: 'validation',
        message: `Validation error: ${formatZodError(parsed.error)}`,
      })
    );
  }
  const { jobId, reason } = parsed.data;
  const existing = readJobResult(jobId);

  if (existing === null) {
    const response: CancelJobResponse = {
      jobId,
      outcome: 'unknown_job',
      message: `No job record found for jobId "${jobId}". The job may never have been dispatched, or the sidecar file is unreadable.`,
    };
    return Promise.resolve(toolSuccess(JSON.stringify(response, null, 2)));
  }

  if (existing.status === 'complete' || existing.status === 'failed') {
    const response: CancelJobResponse = {
      jobId,
      outcome: 'already_complete',
      status: existing.status,
      message: `Job already terminated with status "${existing.status}" — cancel is a no-op.`,
    };
    return Promise.resolve(toolSuccess(JSON.stringify(response, null, 2)));
  }

  if (existing.status === 'cancelled') {
    const response: CancelJobResponse = {
      jobId,
      outcome: 'already_cancelled',
      status: 'cancelled',
      message: 'Job is already cancelled — second cancel is an idempotent no-op.',
    };
    return Promise.resolve(toolSuccess(JSON.stringify(response, null, 2)));
  }

  // Status is 'pending' — perform the cancel.
  return Promise.resolve(
    toolSuccess(JSON.stringify(cancelPendingJob(jobId, existing.toolName, reason), null, 2))
  );
}

/**
 * Cancel a `pending` job: write the durable `cancelled` record FIRST, then abort
 * the in-flight work (#4086). When the aborted `run()` rejects, the terminal
 * writers no-op against the `cancelled` record (#4022), so the cancellation wins.
 */
function cancelPendingJob(jobId: string, toolName: string, reason?: string): CancelJobResponse {
  writeJobCancelled(jobId, toolName, reason);
  const aborted = abortJob(jobId, reason);
  return {
    jobId,
    outcome: 'cancelled',
    status: 'cancelled',
    message:
      `Job ${jobId} marked cancelled. ` +
      (aborted
        ? 'Its in-flight AbortSignal was fired — work that threads the signal stops in this process; '
        : 'No in-flight controller was registered (the job already settled or runs in another process); ') +
      'cross-process workers need to poll get_job_result to observe.',
  };
}

/** @category MCP */
export function registerCancelJobTool(server: McpServer, deps: CancelJobDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'cancel_job' });
  const toolSchema = {
    jobId: z
      .string()
      .min(1)
      .max(128)
      .describe('Job ID returned by orchestrate / run_workflow / consensus_vote in async mode'),
    reason: z
      .string()
      .max(1000)
      .optional()
      .describe('Optional human-readable note (e.g. "user clicked cancel").'),
  };

  const description =
    'Mark an async-mode job as cancelled (#3042 Stage 1b / epic #2631). Same-process ' +
    'dispatcher unwinds via AbortSignal (#3035/#3038); cross-process workers observe ' +
    'via get_job_result. Idempotent — cancel-after-complete is a no-op (preserves the ' +
    'terminal record); second cancel returns already_cancelled.';

  const secureHandler = createSecureHandler(cancelJobHandler, {
    toolName: 'cancel_job',
    rateLimiter: deps.rateLimiter,
    logger,
  });

  const timeoutMs = getToolTimeout('cancel_job', deps.security);
  const wrappedHandler = wrapToolWithTimeout('cancel_job', secureHandler, {
    timeoutMs,
    logger,
  });

  server.registerTool(
    'cancel_job',
    { description, inputSchema: toolSchema, annotations: getToolAnnotations('cancel_job') },
    toSdkCallback(wrappedHandler)
  );
  logger.info('Registered cancel_job tool');
}
