/**
 * nexus-agents/mcp - Query Trace MCP Tool (Epic #952, Phase 5)
 *
 * Read-only MCP tool that queries execution traces from disk
 * (./runs/{runId}/trace.jsonl) written by TraceWriter.
 *
 * @module mcp/tools/query-trace-tool
 */

import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ILogger } from '../../core/index.js';
import { createLogger, formatZodError } from '../../core/index.js';
import { DEFAULT_RUNS_DIR } from '../../pipeline/pipeline-runner.js';
import type { RateLimiter } from '../middleware/rate-limiter.js';
import type { SecurityConfig } from '../../config/schemas.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';

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

export interface QueryTraceResponse {
  readonly runId: string;
  readonly events: readonly Record<string, unknown>[];
  readonly totalEvents: number;
  readonly truncated: boolean;
  readonly source: 'disk' | 'not_found';
}

// ============================================================================
// Dependencies
// ============================================================================

export interface QueryTraceDeps {
  readonly logger?: ILogger;
  readonly rateLimiter: RateLimiter;
  readonly security?: SecurityConfig | undefined;
}

// ============================================================================
// Trace Query Logic
// ============================================================================

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
    return {
      runId: input.runId,
      events: [],
      totalEvents: 0,
      truncated: false,
      source: 'not_found',
    };
  }

  try {
    const content = await readFile(tracePath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    const limit = input.limit ?? 100;

    let parsed = lines.flatMap((line) => {
      try {
        return [JSON.parse(line) as Record<string, unknown>];
      } catch {
        return []; // Skip malformed JSONL lines
      }
    });

    if (input.eventType !== undefined) {
      parsed = parsed.filter((e) => e['eventType'] === input.eventType);
    }

    const truncated = parsed.length > limit;
    const events = parsed.slice(0, limit);

    return {
      runId: input.runId,
      events,
      totalEvents: parsed.length,
      truncated,
      source: 'disk',
    };
  } catch {
    return {
      runId: input.runId,
      events: [],
      totalEvents: 0,
      truncated: false,
      source: 'not_found',
    };
  }
}

// ============================================================================
// Handler
// ============================================================================

type ToolResponse = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

function queryTraceHandler(args: unknown, ctx: HandlerContext): Promise<ToolResponse> {
  const parsed = QueryTraceInputSchema.safeParse(args);
  if (!parsed.success) {
    return Promise.resolve({
      isError: true,
      content: [
        {
          type: 'text',
          text: `Validation error: ${formatZodError(parsed.error)}`,
        },
      ],
    });
  }

  return queryTraceFromDisk(parsed.data)
    .then((result) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    }))
    .catch((caught: unknown) => {
      const e = caught instanceof Error ? caught : new Error(String(caught));
      ctx.logger.error('Trace query failed', e);
      return {
        isError: true,
        content: [{ type: 'text' as const, text: `Trace query failed: ${e.message}` }],
      };
    });
}

// ============================================================================
// Registration
// ============================================================================

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
