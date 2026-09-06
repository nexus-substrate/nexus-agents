/**
 * nexus-agents/mcp - Query Trace MCP Tool (Epic #952, Phase 5)
 *
 * Read-only MCP tool that queries execution traces from disk
 * (./runs/{runId}/trace.jsonl) written by TraceWriter.
 *
 * @module mcp/tools/query-trace-tool
 */

import { readFile, stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createLogger, formatZodError } from '../../core/index.js';
import { getDefaultRunsDir } from '../../pipeline/pipeline-runner.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import {
  toolStructuredError,
  toolSuccess,
  type BaseMcpToolDeps,
  type ToolResult,
} from './tool-result.js';
import { getToolAnnotations } from '../tool-annotations.js';

// ============================================================================
// Input Schema
// ============================================================================

export const QueryTraceInputSchema = z.object({
  runId: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z0-9_-]+$/, 'runId must be alphanumeric, hyphens, or underscores')
    .describe('Run ID to query traces for'),
  eventType: z
    .string()
    .max(100)
    .regex(/^[a-zA-Z0-9._-]+$/, 'eventType must be alphanumeric with dots, hyphens, or underscores')
    .optional()
    .describe('Filter by event type'),
  limit: z.number().min(1).max(500).optional().describe('Max events to return (default: 100)'),
});

export type QueryTraceInput = z.infer<typeof QueryTraceInputSchema>;

// ============================================================================
// Response Types
// ============================================================================

/** Error categories for trace query failures. */
export type TraceErrorCategory =
  'not_found' | 'permission_error' | 'parse_error' | 'too_large' | 'unknown';

export interface QueryTraceResponse {
  readonly runId: string;
  readonly events: readonly Record<string, unknown>[];
  readonly totalEvents: number;
  readonly truncated: boolean;
  readonly source: 'disk' | 'not_found';
  /**
   * Lines the reader could not parse, omitted when none.
   *
   * `totalEvents` counts what SURVIVED `JSON.parse`, not what the file
   * contained. A partially-flushed JSONL trace — the normal failure mode for an
   * append-only file written by a process that died mid-write — used to be
   * byte-identical to a run that simply emitted fewer events. Same fix the
   * audit-chain reader got under #4787.
   */
  readonly skippedLines?: number;
  readonly errorCategory?: TraceErrorCategory;
  readonly errorMessage?: string;
}

// ============================================================================
// Dependencies
// ============================================================================

export type QueryTraceDeps = BaseMcpToolDeps;

// ============================================================================
// Trace Query Logic
// ============================================================================

/** Maximum trace file size to read (100 MB). */
const MAX_TRACE_FILE_BYTES = 100 * 1024 * 1024;

const traceLogger = createLogger({ component: 'query-trace' });

/** Classify a trace query error into a category for structured responses. */
export function classifyTraceError(err: unknown): TraceErrorCategory {
  if (err instanceof Error) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return 'not_found';
    if (code === 'EACCES' || code === 'EPERM') return 'permission_error';
    if (err.message.includes('JSON') || err instanceof SyntaxError) return 'parse_error';
  }
  return 'unknown';
}

/**
 * Build a clean, deterministic user-facing error message for a trace-query
 * failure (#2721). The previous `sanitizeErrorMessage` regex stripped paths
 * starting with `/` but left their relative-root segment exposed, producing
 * artifacts like `stat 'runs<path>'` that told the user nothing about what
 * actually went wrong. Synthesize the message from the classified category
 * instead — same approach as `query_task_state` ("No state log for task: X").
 */
function userFacingTraceError(err: unknown, runId: string): string {
  const category = classifyTraceError(err);
  switch (category) {
    case 'not_found':
      return `No trace file for runId '${runId}'`;
    case 'permission_error':
      return `Permission denied reading trace for runId '${runId}'`;
    case 'parse_error':
      return `Trace file for runId '${runId}' is malformed (invalid JSONL)`;
    default:
      return 'Failed to read trace';
  }
}

/**
 * Parse JSONL content, COUNTING the lines that could not be read.
 *
 * The count is the point. Swallowing every `SyntaxError` silently made
 * `totalEvents` a count of survivors reported as a count of events, and left
 * `parse_error` — a category this module declares and renders a message for —
 * unreachable from the disk path, because no `SyntaxError` ever escaped to
 * `classifyTraceError`.
 */
function parseJsonlLines(content: string): {
  events: Record<string, unknown>[];
  skippedLines: number;
} {
  const events: Record<string, unknown>[] = [];
  let skippedLines = 0;
  for (const line of content.trim().split('\n').filter(Boolean)) {
    try {
      events.push(JSON.parse(line) as Record<string, unknown>);
    } catch {
      skippedLines++;
    }
  }
  return { events, skippedLines };
}

const EMPTY_RESPONSE: Omit<QueryTraceResponse, 'runId'> = {
  events: [],
  totalEvents: 0,
  truncated: false,
  source: 'not_found',
};

/**
 * The response for a trace too large to read.
 *
 * NOT `EMPTY_RESPONSE`. That spreads `source: 'not_found'`, so the one case
 * where the trace certainly exists and is certainly non-empty was reported as
 * "there is no trace for this run" — with `totalEvents: 0`, a measurement never
 * taken, beside a `truncated: true` that contradicts it. `source` is the
 * existence oracle, and a consumer branching on `'not_found'` never reaches the
 * contradiction.
 */
function overSizeResponse(runId: string, sizeBytes: number): QueryTraceResponse {
  return {
    runId,
    events: [],
    totalEvents: 0,
    truncated: true,
    source: 'disk',
    errorCategory: 'too_large',
    errorMessage:
      `Trace for runId '${runId}' is ${String(sizeBytes)} bytes, over the ` +
      `${String(MAX_TRACE_FILE_BYTES)}-byte read cap; no events were read`,
  };
}

/**
 * Build the success response, disclosing any lines the reader could not parse.
 *
 * The skip count is omitted when zero, so a clean read is byte-identical to
 * what every existing consumer already saw.
 */
function readTraceResponse(
  input: QueryTraceInput,
  read: { events: Record<string, unknown>[]; skippedLines: number }
): QueryTraceResponse {
  const limit = input.limit ?? 100;
  const parsed =
    input.eventType !== undefined
      ? read.events.filter((e) => e['eventType'] === input.eventType)
      : read.events;

  return {
    runId: input.runId,
    events: parsed.slice(0, limit),
    totalEvents: parsed.length,
    truncated: parsed.length > limit,
    source: 'disk',
    ...(read.skippedLines > 0
      ? {
          skippedLines: read.skippedLines,
          errorCategory: 'parse_error' as const,
          errorMessage:
            `${String(read.skippedLines)} line(s) in the trace for runId '${input.runId}' ` +
            'could not be parsed; the events returned are what survived',
        }
      : {}),
  };
}

/** Read trace events from disk for a given run_id. */
export async function queryTraceFromDisk(
  input: QueryTraceInput,
  runsDir?: string
): Promise<QueryTraceResponse> {
  const dir = runsDir ?? getDefaultRunsDir();
  const tracePath = join(dir, input.runId, 'trace.jsonl');

  // Path traversal guard: resolved path must stay within runs directory.
  // Guards against sibling-prefix bypass (#1816): dir=/foo must not accept /foobar.
  const resolvedDir = resolve(dir);
  const resolvedTrace = resolve(tracePath);
  if (!resolvedTrace.startsWith(resolvedDir + sep) && resolvedTrace !== resolvedDir) {
    return { runId: input.runId, ...EMPTY_RESPONSE };
  }

  try {
    const fileStat = await stat(tracePath);
    if (fileStat.size > MAX_TRACE_FILE_BYTES) {
      return overSizeResponse(input.runId, fileStat.size);
    }

    const content = await readFile(tracePath, 'utf-8');
    return readTraceResponse(input, parseJsonlLines(content));
  } catch (err: unknown) {
    const category = classifyTraceError(err);
    const message = userFacingTraceError(err, input.runId);

    if (category === 'not_found') {
      traceLogger.debug('Trace file not found', { runId: input.runId });
    } else {
      traceLogger.warn('Trace query error', { runId: input.runId, category, message });
    }

    return {
      runId: input.runId,
      ...EMPTY_RESPONSE,
      errorCategory: category,
      errorMessage: message,
    };
  }
}

// ============================================================================
// Handler
// ============================================================================

function queryTraceHandler(args: unknown, ctx: HandlerContext): Promise<ToolResult> {
  const parsed = QueryTraceInputSchema.safeParse(args);
  if (!parsed.success) {
    return Promise.resolve(
      toolStructuredError({
        errorCategory: 'validation',
        message: `Validation error: ${formatZodError(parsed.error)}`,
      })
    );
  }

  return queryTraceFromDisk(parsed.data)
    .then((result) => toolSuccess(JSON.stringify(result, null, 2)))
    .catch((caught: unknown) => {
      const e = caught instanceof Error ? caught : new Error(String(caught));
      ctx.logger.error('Trace query failed', e);
      return toolStructuredError({
        errorCategory: 'internal',
        message: `Trace query failed: ${e.message}`,
      });
    });
}

// ============================================================================
// Registration
// ============================================================================

/** @category MCP */
export function registerQueryTraceTool(server: McpServer, deps: QueryTraceDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'query_trace' });
  const toolSchema = {
    runId: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[a-zA-Z0-9_-]+$/, 'runId must be alphanumeric, hyphens, or underscores')
      .describe('Run ID to query traces for'),
    eventType: z
      .string()
      .max(100)
      .regex(/^[a-zA-Z0-9._-]+$/)
      .optional()
      .describe('Filter by event type (e.g., model.called)'),
    limit: z.number().min(1).max(500).optional().describe('Max events to return (default: 100)'),
  };

  const description =
    'Query execution traces by run ID. Returns agent and model ' +
    'attribution for pipeline runs including decision paths, ' +
    'error taxonomy, and timing data.';

  const secureHandler = createSecureHandler(queryTraceHandler, {
    toolName: 'query_trace',
    rateLimiter: deps.rateLimiter,
    logger,
  });

  const timeoutMs = getToolTimeout('query_trace', deps.security);
  const wrappedHandler = wrapToolWithTimeout('query_trace', secureHandler, { timeoutMs, logger });

  server.registerTool(
    'query_trace',
    { description, inputSchema: toolSchema, annotations: getToolAnnotations('query_trace') },
    toSdkCallback(wrappedHandler)
  );
  logger.info('Registered query_trace tool');
}
