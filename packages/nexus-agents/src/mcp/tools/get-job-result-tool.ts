/**
 * `get_job_result` MCP tool (#3042, Stage 1 of epic #2631).
 *
 * Read-only companion to `orchestrate({ mode: 'async' })`: returns the
 * job-result record written by the background dispatch. Callers poll
 * until `status !== 'pending'` and then read `result` (on `complete`)
 * or `error` (on `failed` / `cancelled`).
 *
 * Stage 2 (#3043) will migrate the result inline to `StructuredTaskState`
 * and `query_task_state` will return the same payload; this tool is
 * the Stage-1 surface that lets async-mode ship before the schema
 * migration lands.
 *
 * @module mcp/tools/get-job-result-tool
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
import { isAbandonedJob, type JobResult } from '../jobs/job-result-store.js';
import { resolveJobResult } from '../jobs/task-state-source.js';
import { getToolAnnotations } from '../tool-annotations.js';
import { getTimeProvider } from '../../core/index.js';

export const GetJobResultInputSchema = z.object({
  jobId: z.string().min(1).max(128).describe('Job ID returned by orchestrate({ mode: "async" })'),
});
export type GetJobResultInput = z.infer<typeof GetJobResultInputSchema>;

/**
 * Response envelope. `found: false` means the jobId is unknown (or the
 * sidecar file is unreadable / future-schema). `found: true` carries
 * the full record — caller branches on `record.status`.
 */
export interface GetJobResultResponse {
  readonly jobId: string;
  readonly found: boolean;
  readonly record?: JobResult;
  /**
   * Set when a `pending` record has outlived the runaway guard that bounds
   * every job body (#4976), so no live process can still be working on it.
   *
   * The record itself is left saying `pending` — it is evidence of what was
   * observed, and rewriting it on read would destroy that. This field is the
   * qualifier a poller needs to stop waiting.
   */
  readonly abandoned?: boolean;
  readonly errorMessage?: string;
}

export type GetJobResultDeps = BaseMcpToolDeps;

/**
 * Exported for the abandoned-job seam test (#4976): the secure-handler and
 * timeout wrappers around it are SDK plumbing, and asserting through them
 * tests the wrappers rather than this response.
 */
export function getJobResultHandler(args: unknown): Promise<ToolResult> {
  const parsed = GetJobResultInputSchema.safeParse(args);
  if (!parsed.success) {
    return Promise.resolve(
      toolStructuredError({
        errorCategory: 'validation',
        message: `Validation error: ${formatZodError(parsed.error)}`,
      })
    );
  }
  // #3090: dual-read — prefers the Stage-2 task-state log when
  // NEXUS_JOB_RESULT_SOURCE=task_state, else the Stage-1 sidecar (default).
  const record = resolveJobResult(parsed.data.jobId);
  if (record === null) {
    const response: GetJobResultResponse = {
      jobId: parsed.data.jobId,
      found: false,
      errorMessage:
        'Unknown jobId, or the result source is unreadable (corrupt / future schema). ' +
        'Re-check the jobId returned by the async-mode dispatch.',
    };
    return Promise.resolve(toolSuccess(JSON.stringify(response, null, 2)));
  }
  const abandoned = isAbandonedJob(record, getTimeProvider().now());
  const response: GetJobResultResponse = {
    jobId: parsed.data.jobId,
    found: true,
    record,
    ...(abandoned
      ? {
          abandoned: true,
          errorMessage:
            'This job has been `pending` longer than the maximum a job body can run, ' +
            'so the process that owned it is gone. Nothing will settle it — dispatch again.',
        }
      : {}),
  };
  return Promise.resolve(toolSuccess(JSON.stringify(response, null, 2)));
}

/** @category MCP */
export function registerGetJobResultTool(server: McpServer, deps: GetJobResultDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'get_job_result' });
  const toolSchema = {
    jobId: z.string().min(1).max(128).describe('Job ID returned by orchestrate({ mode: "async" })'),
  };

  const description =
    'Read the result of an async-mode tool invocation by jobId. Returns ' +
    'the structured record (status, result | error, timestamps). Poll until ' +
    'status !== "pending". Stage-1 of epic #2631 — Stage 2 will fold this ' +
    'into query_task_state once StructuredTaskState gains the result field.';

  const secureHandler = createSecureHandler(getJobResultHandler, {
    toolName: 'get_job_result',
    rateLimiter: deps.rateLimiter,
    logger,
  });

  const timeoutMs = getToolTimeout('get_job_result', deps.security);
  const wrappedHandler = wrapToolWithTimeout('get_job_result', secureHandler, {
    timeoutMs,
    logger,
  });

  server.registerTool(
    'get_job_result',
    { description, inputSchema: toolSchema, annotations: getToolAnnotations('get_job_result') },
    toSdkCallback(wrappedHandler)
  );
  logger.info('Registered get_job_result tool');
}
