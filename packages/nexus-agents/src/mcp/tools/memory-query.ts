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
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import { getToolMemory, type UnifiedMemoryResult } from './tool-memory.js';
import {
  toolStructuredError,
  toolSuccessStructured,
  type ToolResult,
  type BaseMcpToolDeps,
} from './tool-result.js';
import {
  ReflectiveRetriever,
  ReflectionCache,
  isReflectiveMemoryEnabled,
  isReflectiveShadowMode,
  type ReflectionResult,
} from './reflective-retriever.js';
import type { IModelAdapter } from '../../core/index.js';
import { getGlobalRegistry } from '../../adapters/unified-registry.js';
import { getToolAnnotations } from '../tool-annotations.js';

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
export type MemoryQueryDeps = BaseMcpToolDeps;

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
  /**
   * Which backends the search could actually reach (#4999).
   *
   * `count: 0` used to be the same observation whether nothing matched or the
   * SQLite-backed stores were absent — every unavailable backend contributes
   * `[]` silently. A caller asking "do we know anything about X?" was told
   * "no" when the honest answer was "two of the four stores were not there".
   */
  searched: readonly string[];
  /** Backends skipped because they are not configured on this install. */
  unavailable: readonly string[];
}

/**
 * Which memory backends a query could reach, and which were skipped (#4999).
 *
 * `session` and `belief` are always present; the three SQLite-backed stores are
 * optional and contribute an empty result set when absent — indistinguishable,
 * before this, from "searched and found nothing".
 *
 * Exported for the coverage tests: the whole point is that the response says
 * which stores answered, so asserting it through the tool is the only check
 * that means anything.
 */
export function describeBackendCoverage(
  memory: {
    isAgenticMemoryAvailable(): boolean;
    isAdaptiveMemoryAvailable(): boolean;
    isTypedMemoryAvailable(): boolean;
  },
  source: string
): { searched: readonly string[]; unavailable: readonly string[] } {
  const optional: readonly [string, boolean][] = [
    ['agentic', memory.isAgenticMemoryAvailable()],
    ['adaptive', memory.isAdaptiveMemoryAvailable()],
    ['typed', memory.isTypedMemoryAvailable()],
  ];
  const inScope = (name: string): boolean => source === 'all' || source === name;

  const searched: string[] = [];
  const unavailable: string[] = [];
  for (const name of ['session', 'belief']) {
    if (inScope(name)) searched.push(name);
  }
  for (const [name, available] of optional) {
    if (!inScope(name)) continue;
    (available ? searched : unavailable).push(name);
  }
  return { searched, unavailable };
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

  const coverage = describeBackendCoverage(toolMemory, input.source);
  return {
    query: input.query,
    ...(expandedQuery !== undefined ? { expandedQuery } : {}),
    results,
    count: results.length,
    source: input.source,
    searched: coverage.searched,
    unavailable: coverage.unavailable,
  };
}

/**
 * Core handler logic for memory_query tool.
 */
async function memoryQueryHandler(args: unknown, ctx: HandlerContext): Promise<ToolResult> {
  // Validate input
  const validationResult = MemoryQueryInputSchema.safeParse(args);
  if (!validationResult.success) {
    return toolStructuredError({
      errorCategory: 'validation',
      message: `Validation error: ${formatZodError(validationResult.error)}`,
    });
  }

  return withToolError('Memory query failed', ctx.logger, async () => {
    const result = await executeMemoryQuery(validationResult.data, ctx.logger);
    return toolSuccessStructured(result as unknown as Record<string, unknown>);
  });
}

// ============================================================================
// Registration
// ============================================================================

/**
 * Registers the memory_query tool with the MCP server.
 *
 * @category MCP
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

  // Concrete shape from executeMemoryQuery (#2340 batch 2). Inner result rows
  // are dynamic (per-backend shape), so `results` is `z.array(z.unknown())`.
  const outputSchema = {
    query: z.string(),
    expandedQuery: z.string().optional(),
    results: z.array(z.unknown()),
    count: z.number(),
    source: z.string(),
  };

  server.registerTool(
    'memory_query',
    {
      description,
      inputSchema: toolSchema,
      outputSchema,
      annotations: getToolAnnotations('memory_query'),
    },
    toSdkCallback(wrappedHandler)
  );
  logger.info('Registered memory_query tool');
}
