/**
 * nexus-agents/mcp - Query Trace MCP Tool (Epic #952, Phase 5)
 *
 * Read-only MCP tool that queries execution traces from disk
 * (./runs/{runId}/trace.jsonl) written by TraceWriter.
 *
 * @module mcp/tools/query-trace-tool
 */

import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createLogger, formatZodError } from '../../core/index.js';
import { DEFAULT_RUNS_DIR } from '../../pipeline/pipeline-runner.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import { toolError, toolSuccess, type BaseMcpToolDeps, type ToolResult } from './tool-result.js';

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
export type TraceErrorCategory = 'not_found' | 'permission_error' | 'parse_error' | 'unknown';

export interface QueryTraceResponse {
  readonly runId: string;
  readonly events: readonly Record<string, unknown>[];
  readonly totalEvents: number;
  readonly truncated: boolean;
  readonly source: 'disk' | 'not_found';
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

/** Sanitize error message: remove file paths and stack traces. */
function sanitizeErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message.replace(/\/[^\s:]+/g, '<path>');
  }
  return 'An unexpected error occurred';
}

/** Parse JSONL content into records, skipping malformed lines. */
function parseJsonlLines(content: string): Record<string, unknown>[] {
  return content
    .trim()
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as Record<string, unknown>];
      } catch {
        return []; // Skip malformed JSONL lines
      }
    });
}

const EMPTY_RESPONSE: Omit<QueryTraceResponse, 'runId'> = {
  events: [],
  totalEvents: 0,
  truncated: false,
  source: 'not_found',
};

/** Read trace events from disk for a given run_id. */
export async function queryTraceFromDisk(
  input: QueryTraceInput,
  runsDir?: string
): Promise<QueryTraceResponse> {
  const dir = runsDir ?? DEFAULT_RUNS_DIR;
  const tracePath = join(dir, input.runId, 'trace.jsonl');

  // Path traversal guard: resolved path must stay within runs directory
  const resolvedDir = resolve(dir);
  const resolvedTrace = resolve(tracePath);
  if (!resolvedTrace.startsWith(resolvedDir)) {
    return { runId: input.runId, ...EMPTY_RESPONSE };
  }

  try {
    const fileStat = await stat(tracePath);
    if (fileStat.size > MAX_TRACE_FILE_BYTES) {
      return { runId: input.runId, ...EMPTY_RESPONSE, truncated: true };
    }

    const content = await readFile(tracePath, 'utf-8');
    let parsed = parseJsonlLines(content);
    const limit = input.limit ?? 100;

    if (input.eventType !== undefined) {
      parsed = parsed.filter((e) => e['eventType'] === input.eventType);
    }

    return {
      runId: input.runId,
      events: parsed.slice(0, limit),
      totalEvents: parsed.length,
      truncated: parsed.length > limit,
      source: 'disk',
    };
  } catch (err: unknown) {
    const category = classifyTraceError(err);
    const message = sanitizeErrorMessage(err);

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
    return Promise.resolve(toolError(`Validation error: ${formatZodError(parsed.error)}`));
  }

  return queryTraceFromDisk(parsed.data)
    .then((result) => toolSuccess(JSON.stringify(result, null, 2)))
    .catch((caught: unknown) => {
      const e = caught instanceof Error ? caught : new Error(String(caught));
      ctx.logger.error('Trace query failed', e);
      return toolError(`Trace query failed: ${e.message}`);
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
    { description, inputSchema: toolSchema },
    toSdkCallback(wrappedHandler)
  );
  logger.info('Registered query_trace tool');
}
