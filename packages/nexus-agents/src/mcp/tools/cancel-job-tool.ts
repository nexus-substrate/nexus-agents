/**
 * `cancel_job` MCP tool (#3042 Stage 1b / epic #2631).
 *
 * Marks an async-mode job as cancelled. Three semantic outcomes:
 *
 * - **`cancelled`** — the job was `pending` and is now `cancelled`. The
 *   dispatcher's in-process AbortController (from #3035/#3038 plumbing)
 *   is the source of truth for ACTUALLY stopping in-flight work in the
 *   same process; this tool's job is to write the durable cancellation
 *   record so cross-session pollers can observe it.
 * - **`already_complete`** — the job is already `complete` / `failed`.
 *   The terminal record is preserved (Security flag from #3041 vote:
 *   cancel-after-complete must not rewrite history).
 * - **`already_cancelled`** — second + cancellation against the same
 *   jobId is a no-op. Idempotent for safe retry.
 *
 * **What this tool does NOT do:** it doesn't abort in-flight work in
 * OTHER processes (no IPC; per-process AbortControllers can only abort
 * what they own). For the same-process case, every async-mode dispatcher
 * shipped in Stages 1+3+4 already pairs `tryAcquire` with `release` in
 * `finally`, so the abort signal lands on the right Promise.
 *
 * In a multi-process deployment, the durable cancellation record this
 * tool writes is observable via `get_job_result` and `list_jobs`, but
 * the worker process needs to poll for it (future work; not part of
 * this PR).
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
  writeJobCancelled(jobId, existing.toolName, reason);
  const response: CancelJobResponse = {
    jobId,
    outcome: 'cancelled',
    status: 'cancelled',
    message: `Job ${jobId} marked cancelled. In-flight work in the dispatching process aborts via AbortSignal; cross-process workers need to poll get_job_result to observe.`,
  };
  return Promise.resolve(toolSuccess(JSON.stringify(response, null, 2)));
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
