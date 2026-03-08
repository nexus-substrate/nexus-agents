/**
 * nexus-agents/mcp - Memory Query Tool
 *
 * MCP tool for unified memory search across all backends.
 * Exposes ToolMemoryManager.queryAll() as an MCP tool.
 *
 * @module mcp/tools/memory-query
 * (Source: Issue #751 - Memory observability MCP tools)
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ILogger } from '../../core/index.js';
import { createLogger, formatZodError } from '../../core/index.js';
import { withToolError } from '../middleware/tool-error-handler.js';
import type { RateLimiter } from '../middleware/rate-limiter.js';
import type { SecurityConfig } from '../../config/schemas.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import { getToolMemory, type UnifiedMemoryResult } from './tool-memory.js';
import { toolError, toolSuccess, type ToolResult } from './tool-result.js';
import {
  ReflectiveRetriever,
  ReflectionCache,
  isReflectiveMemoryEnabled,
  isReflectiveShadowMode,
  type ReflectionResult,
} from './reflective-retriever.js';
import type { IModelAdapter } from '../../core/index.js';
import { getGlobalRegistry } from '../../adapters/unified-registry.js';

// ============================================================================
// Schema & Types
// ============================================================================

/**
 * Input schema for memory_query tool.
 */
export const MemoryQueryInputSchema = z.object({
  query: z.string().min(1).max(500).describe('Search query to match against memory contents'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .default(10)
    .describe('Maximum results to return (default: 10, max: 50)'),
  source: z
    .enum(['session', 'belief', 'agentic', 'typed', 'adaptive', 'all'])
    .optional()
    .default('all')
    .describe('Filter by memory source (default: all)'),
});

/**
 * Type for validated memory query input.
 */
export type MemoryQueryInput = z.infer<typeof MemoryQueryInputSchema>;

/**
 * Dependencies for memory_query tool.
 */
export interface MemoryQueryDeps {
  /** Optional logger */
  logger?: ILogger;
  /** Rate limiter for throttling tool calls (required) */
  rateLimiter: RateLimiter;
  /** Security configuration (includes timeout settings) */
  security?: SecurityConfig | undefined;
}

/**
 * Response from memory_query tool.
 */
export interface MemoryQueryResponse {
  /** Query that was executed */
  query: string;
  /** LLM-expanded query when reflective memory rewrites it (Issue #1397 Gap 1). */
  expandedQuery?: string;
  /** Results from memory search */
  results: readonly UnifiedMemoryResult[];
  /** Total results returned */
  count: number;
  /** Source filter applied */
  source: string;
}

// ============================================================================
// Handler
// ============================================================================

/** Shared reflection cache (persists across tool calls). */
let reflectionCache: ReflectionCache | undefined;

/** Shared adapter for reflection (lazy-initialized). */
let reflectionAdapter: IModelAdapter | undefined;

/**
 * Get or create the reflective retriever.
 * Returns undefined if reflection is disabled or adapter unavailable.
 */
function getReflectiveRetriever(logger: ILogger): ReflectiveRetriever | undefined {
  const enabled = isReflectiveMemoryEnabled();
  const shadow = isReflectiveShadowMode();
  if (!enabled && !shadow) return undefined;

  if (reflectionAdapter === undefined) {
    try {
      const registry = getGlobalRegistry({ logger });
      reflectionAdapter = registry.getDefault();
    } catch {
      logger.warn('No adapter for reflection, using keyword retrieval');
      return undefined;
    }
  }

  reflectionCache ??= new ReflectionCache();

  return new ReflectiveRetriever({
    adapter: reflectionAdapter,
    logger,
    shadowMode: shadow,
    cache: reflectionCache,
  });
}

/** Resolve effective query via optional reflective enhancement. */
async function resolveReflection(
  query: string,
  logger: ILogger
): Promise<{ effectiveQuery: string; expandedQuery?: string; reflection?: ReflectionResult }> {
  const retriever = getReflectiveRetriever(logger);
  if (retriever === undefined) return { effectiveQuery: query };

  const reflection = await retriever.enhance(query);
  const reflected = reflection.reflected;
  const effectiveQuery = reflected ? reflection.keywords.join(' ') : query;
  const expanded = reflected && effectiveQuery !== query ? effectiveQuery : undefined;

  return {
    effectiveQuery,
    ...(expanded !== undefined ? { expandedQuery: expanded } : {}),
    reflection,
  };
}

/**
 * Handles the memory_query tool execution.
 * Optionally uses MemR3 reflective enhancement when enabled.
 */
async function executeMemoryQuery(
  input: MemoryQueryInput,
  logger: ILogger
): Promise<MemoryQueryResponse> {
  const toolMemory = getToolMemory();
  const { effectiveQuery, expandedQuery, reflection } = await resolveReflection(
    input.query,
    logger
  );

  const results = await toolMemory.queryBySource(input.source, effectiveQuery, input.limit);

  logger.debug('Memory query executed', {
    query: input.query,
    effectiveQuery: effectiveQuery !== input.query ? effectiveQuery : undefined,
    resultCount: results.length,
    source: input.source,
    reflectionSource: reflection?.source,
    reflectionDurationMs: reflection?.durationMs,
  });

  return {
    query: input.query,
    ...(expandedQuery !== undefined ? { expandedQuery } : {}),
    results,
    count: results.length,
    source: input.source,
  };
}

/**
 * Core handler logic for memory_query tool.
 */
async function memoryQueryHandler(args: unknown, ctx: HandlerContext): Promise<ToolResult> {
  // Validate input
  const validationResult = MemoryQueryInputSchema.safeParse(args);
  if (!validationResult.success) {
    return toolError(`Validation error: ${formatZodError(validationResult.error)}`);
  }

  return withToolError('Memory query failed', ctx.logger, async () => {
    const result = await executeMemoryQuery(validationResult.data, ctx.logger);
    return toolSuccess(JSON.stringify(result, null, 2));
  });
}

// ============================================================================
// Registration
// ============================================================================

/**
 * Registers the memory_query tool with the MCP server.
 *
 * @param server - MCP server instance
 * @param deps - Tool dependencies
 */
export function registerMemoryQueryTool(server: McpServer, deps: MemoryQueryDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'memory_query' });
  const toolSchema = {
    query: z.string().min(1).max(500).describe('Search query to match against memory contents'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum results to return (default: 10, max: 50)'),
    source: z
      .enum(['session', 'belief', 'agentic', 'typed', 'adaptive', 'all'])
      .optional()
      .describe('Filter by memory source (default: all)'),
  };

  const description =
    'Query across all memory backends (session, belief, agentic, adaptive, typed) with unified results. ' +
    'Returns memories matching the query with source attribution and relevance scores.';

  // Wrap handler with secure handler for rate limiting
  const secureHandler = createSecureHandler(memoryQueryHandler, {
    toolName: 'memory_query',
    rateLimiter: deps.rateLimiter,
    logger,
  });

  // Wrap with timeout protection
  const timeoutMs = getToolTimeout('memory_query', deps.security);
  const wrappedHandler = wrapToolWithTimeout('memory_query', secureHandler, { timeoutMs, logger });

  server.registerTool(
    'memory_query',
    { description, inputSchema: toolSchema },
    toSdkCallback(wrappedHandler)
  );
  logger.info('Registered memory_query tool');
}
