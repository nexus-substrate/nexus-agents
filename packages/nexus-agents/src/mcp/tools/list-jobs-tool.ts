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
 * Filters: optional `toolName` (exact match), `status`
 * (`pending | complete | failed | cancelled`) and `abandoned`. All applied
 * client-side after the directory walk so the store stays filter-free.
 *
 * Parity with `get_job_result` (#6726): each job's status is resolved by the
 * same precedence rule (`preferJobRecord`), and a `pending` job that has
 * outlived the runaway guard carries `abandoned: true` from the same
 * `isAbandonedJob` predicate. An abandoned job still matches
 * `status: 'pending'` — that is what its record says, and hiding it would make
 * the list disagree with the detail view in a new way — but it is flagged, and
 * `abandoned: false` filters it out for a caller that wants only live work.
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
import { isAbandonedJob, JobStatusSchema, type JobSummary } from '../jobs/job-result-store.js';
import { resolveJobListing } from '../jobs/task-state-source.js';
import { getToolAnnotations } from '../tool-annotations.js';
import { getTimeProvider } from '../../core/index.js';

/** Hard cap on returned summaries — prevents huge directory walks blocking the response. */
const MAX_LIST_JOBS_RESULTS = 200;

/** Description shared by the Zod input schema and the registered tool schema. */
const ABANDONED_FILTER_DESCRIPTION =
  'true: only abandoned jobs (pending past the runaway guard); false: exclude them. Omit for all.';

/** Flag a summary abandoned with the predicate `get_job_result` uses (#6726). */
function withAbandonedFlag(summary: JobSummary, nowMs: number): JobSummary {
  return isAbandonedJob(summary, nowMs) ? { ...summary, abandoned: true } : summary;
}

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
   * Filter on the abandoned flag (#6726): `true` keeps only abandoned jobs,
   * `false` drops them. Omit to list both. Composes with `status`.
   */
  abandoned: z.boolean().optional().describe(ABANDONED_FILTER_DESCRIPTION),
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
  /**
   * Whether the LIMIT CAP dropped entries. Deliberately narrow: it says nothing
   * about whether the underlying read was complete, which is what
   * {@link ListJobsResponse.jobsDirUnreadable} and
   * {@link ListJobsResponse.unparseableRecords} are for (#6038).
   */
  readonly truncated: boolean;
  readonly jobs: readonly JobSummary[];
  /** Present only when the jobs directory exists but could not be enumerated. */
  readonly jobsDirUnreadable?: boolean;
  /** Present only when sidecar files were found but failed to parse or validate. */
  readonly unparseableRecords?: number;
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
  const { toolName, status, abandoned, limit } = parsed.data;
  // Directory walk first — the store doesn't push the filter logic down
  // because tools change shape but the store doesn't. #3693: dual-read — with
  // NEXUS_JOB_RESULT_SOURCE=task_state this unions the Stage-2 task-state log;
  // sidecar-only by default (unchanged).
  const listing = resolveJobListing();
  const nowMs = getTimeProvider().now();
  const all = listing.jobs.map((j) => withAbandonedFlag(j, nowMs));
  const filtered = all.filter((j) => {
    if (toolName !== undefined && j.toolName !== toolName) return false;
    if (status !== undefined && j.status !== status) return false;
    if (abandoned !== undefined && (j.abandoned === true) !== abandoned) return false;
    return true;
  });
  const cap = limit ?? MAX_LIST_JOBS_RESULTS;
  const trimmed = filtered.slice(0, cap);
  const { dirUnreadable, unparseableRecords } = listing.diagnostics;
  const response: ListJobsResponse = {
    count: trimmed.length,
    truncated: filtered.length > trimmed.length,
    jobs: trimmed,
    // #6038: `truncated` describes the LIMIT CAP only, so it positively
    // asserted completeness over a silently lossy read. `count: 0,
    // truncated: false` was returned for an unreadable jobs directory and for
    // sidecars that failed schema validation alike, and a caller without the
    // jobId has nothing to cross-check against. get_job_result already hardens
    // the single-job path with `found: false`; this is its list-shaped twin.
    ...(dirUnreadable ? { jobsDirUnreadable: true } : {}),
    ...(unparseableRecords > 0 ? { unparseableRecords } : {}),
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
    abandoned: z.boolean().optional().describe(ABANDONED_FILTER_DESCRIPTION),
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
    "status, timestamps, and lastProgressAt (the body's last heartbeat, when it sent one; " +
    '#6162), and abandoned: true on a pending job past the runaway guard, as ' +
    'get_job_result reports it — newest first. Filter by toolName / status / ' +
    'abandoned / limit. Result payloads ' +
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
