/**
 * `list_jobs` MCP tool (#3046 / epic #2631 Stage 5).
 *
 * Cross-session discovery surface for async-mode jobs. The Stage-1
 * sidecar at `<NEXUS_DATA_DIR>/jobs/result-<jobId>.json` persists each
 * job's record across server restarts; `list_jobs` walks the directory
 * and returns one summary per record (jobId, toolName, status,
 * timestamps). Result payloads are intentionally excluded — large
 * `complete` records can be 1 MiB each (per Stage 2's
 * `TASK_RESULT_MAX_BYTES` cap), and this tool is meant for discovery,
 * not retrieval. Callers fetch full records via `get_job_result(jobId)`.
 *
 * Filters: optional `toolName` (exact match) and `status`
 * (`pending | complete | failed | cancelled`). Both applied client-side
 * after the directory walk so the store stays filter-free.
 *
 * Sort order: newest `createdAt` first — matches the typical "what just
 * happened" discovery flow.
 *
 * @module mcp/tools/list-jobs-tool
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
import { JobStatusSchema, listJobs, type JobSummary } from '../jobs/job-result-store.js';
import { getToolAnnotations } from '../tool-annotations.js';

/** Hard cap on returned summaries — prevents huge directory walks blocking the response. */
const MAX_LIST_JOBS_RESULTS = 200;

export const ListJobsInputSchema = z.object({
  /**
   * Filter to jobs from a specific tool (exact match — e.g. `'orchestrate'`).
   * Omit to list every tool's jobs.
   */
  toolName: z.string().min(1).max(128).optional().describe('Filter to one tool (exact match).'),
  /**
   * Filter to jobs in a specific lifecycle state.
   * Omit to list every state.
   */
  status: JobStatusSchema.optional().describe(
    'Filter to pending | complete | failed | cancelled. Omit for all.'
  ),
  /**
   * Maximum summaries to return — capped at MAX_LIST_JOBS_RESULTS (200).
   * Newest jobs are returned first, so a smaller limit shows the most
   * recent activity.
   */
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_LIST_JOBS_RESULTS)
    .optional()
    .describe(`Max summaries to return (1-${String(MAX_LIST_JOBS_RESULTS)}, newest first).`),
});
export type ListJobsInput = z.infer<typeof ListJobsInputSchema>;

export interface ListJobsResponse {
  readonly count: number;
  readonly truncated: boolean;
  readonly jobs: readonly JobSummary[];
}

export type ListJobsDeps = BaseMcpToolDeps;

function listJobsHandler(args: unknown): Promise<ToolResult> {
  const parsed = ListJobsInputSchema.safeParse(args);
  if (!parsed.success) {
    return Promise.resolve(
      toolStructuredError({
        errorCategory: 'validation',
        message: `Validation error: ${formatZodError(parsed.error)}`,
      })
    );
  }
  const { toolName, status, limit } = parsed.data;
  // Directory walk first — the store doesn't push the filter logic down
  // because tools change shape but the store doesn't.
  const all = listJobs();
  const filtered = all.filter((j) => {
    if (toolName !== undefined && j.toolName !== toolName) return false;
    if (status !== undefined && j.status !== status) return false;
    return true;
  });
  const cap = limit ?? MAX_LIST_JOBS_RESULTS;
  const trimmed = filtered.slice(0, cap);
  const response: ListJobsResponse = {
    count: trimmed.length,
    truncated: filtered.length > trimmed.length,
    jobs: trimmed,
  };
  return Promise.resolve(toolSuccess(JSON.stringify(response, null, 2)));
}

/** @category MCP */
export function registerListJobsTool(server: McpServer, deps: ListJobsDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'list_jobs' });
  const toolSchema = {
    toolName: z.string().min(1).max(128).optional().describe('Filter to one tool (exact match).'),
    status: JobStatusSchema.optional().describe(
      'Filter to pending | complete | failed | cancelled. Omit for all.'
    ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_LIST_JOBS_RESULTS)
      .optional()
      .describe(`Max summaries to return (1-${String(MAX_LIST_JOBS_RESULTS)}, newest first).`),
  };

  const description =
    'List async-mode jobs (cross-session discovery). Returns summaries — jobId, toolName, ' +
    'status, timestamps — newest first. Filter by toolName / status / limit. Result payloads ' +
    'excluded; fetch via get_job_result(jobId). Stage 5 of epic #2631.';

  const secureHandler = createSecureHandler(listJobsHandler, {
    toolName: 'list_jobs',
    rateLimiter: deps.rateLimiter,
    logger,
  });

  const timeoutMs = getToolTimeout('list_jobs', deps.security);
  const wrappedHandler = wrapToolWithTimeout('list_jobs', secureHandler, {
    timeoutMs,
    logger,
  });

  server.registerTool(
    'list_jobs',
    { description, inputSchema: toolSchema, annotations: getToolAnnotations('list_jobs') },
    toSdkCallback(wrappedHandler)
  );
  logger.info('Registered list_jobs tool');
}
