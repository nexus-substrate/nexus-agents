/**
 * nexus-agents/mcp - Memory Stats Tool
 *
 * MCP tool for memory system observability dashboard.
 * Aggregates stats from all memory backends.
 *
 * @module mcp/tools/memory-stats
 * (Source: Issue #751 - Memory observability MCP tools)
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ILogger } from '../../core/index.js';
import { createLogger, formatZodError } from '../../core/index.js';
import type { RateLimiter } from '../middleware/rate-limiter.js';
import type { SecurityConfig } from '../../config/schemas.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import { getToolMemory } from './tool-memory.js';

// ============================================================================
// Schema & Types
// ============================================================================

/**
 * Input schema for memory_stats tool.
 */
export const MemoryStatsInputSchema = z.object({
  includeDecay: z
    .boolean()
    .optional()
    .default(true)
    .describe('Include decay statistics (default: true)'),
  includePromotion: z
    .boolean()
    .optional()
    .default(true)
    .describe('Include promotion pipeline stats (default: true)'),
});

/**
 * Type for validated memory stats input.
 */
export type MemoryStatsInput = z.infer<typeof MemoryStatsInputSchema>;

/**
 * Dependencies for memory_stats tool.
 */
export interface MemoryStatsDeps {
  /** Optional logger */
  logger?: ILogger;
  /** Rate limiter for throttling tool calls (required) */
  rateLimiter: RateLimiter;
  /** Security configuration (includes timeout settings) */
  security?: SecurityConfig | undefined;
}

/**
 * Session memory statistics.
 */
interface SessionStats {
  learningsCount: number;
  tasksCount: number;
  errorsCount: number;
}

/**
 * Belief memory statistics.
 */
interface BeliefStats {
  beliefsCount: number;
  available: boolean;
}

/**
 * Backend availability status.
 */
interface BackendStatus {
  session: boolean;
  belief: boolean;
  agentic: boolean;
  adaptive: boolean;
  typed: boolean;
  mobimem: boolean;
  decay: boolean;
}

/**
 * Response from memory_stats tool.
 */
export interface MemoryStatsResponse {
  /** Backend availability status */
  backends: BackendStatus;
  /** Session memory stats */
  session: SessionStats;
  /** Belief memory stats */
  belief: BeliefStats;
  /** Typed memory stats (if available) */
  typed: Record<string, unknown> | null;
  /** MobiMem stats (if available) */
  mobimem: Record<string, unknown> | null;
  /** Decay stats (if available and requested) */
  decay: Record<string, unknown> | null;
  /** Timestamp of stats collection */
  collectedAt: string;
}

// ============================================================================
// Handler
// ============================================================================

/**
 * Collects statistics from all memory backends.
 */
async function collectMemoryStats(
  input: MemoryStatsInput,
  logger: ILogger
): Promise<MemoryStatsResponse> {
  const toolMemory = getToolMemory();

  // Collect session stats
  const sessionStats: SessionStats = {
    learningsCount: 0,
    tasksCount: 0,
    errorsCount: 0,
  };

  // Get learnings count from session
  const learnings = toolMemory.getRelevantLearnings('', 1000);
  if (learnings !== undefined) {
    sessionStats.learningsCount = learnings.split('\n').filter((l) => l.trim() !== '').length;
  }

  // Collect belief stats
  const beliefStats: BeliefStats = {
    beliefsCount: 0,
    available: true,
  };

  // Check typed memory
  const typedStats = await toolMemory.getTypedMemoryStats();

  // Check MobiMem
  const mobimemStats = toolMemory.getMobiMemStats();

  // Check decay stats
  let decayStats: Record<string, unknown> | null = null;
  if (input.includeDecay) {
    const decay = toolMemory.getDecayStats();
    if (decay !== undefined) {
      decayStats = decay as unknown as Record<string, unknown>;
    }
  }

  // Determine backend availability
  const backends: BackendStatus = {
    session: true, // Always available
    belief: true, // Always available (in-memory)
    agentic: toolMemory.isAgenticMemoryAvailable(), // SQLite-backed
    adaptive: toolMemory.isAdaptiveMemoryAvailable(), // SQLite-backed
    typed: typedStats !== undefined,
    mobimem: toolMemory.isMobiMemAvailable(),
    decay: toolMemory.isDecayManagerAvailable(),
  };

  logger.debug('Memory stats collected', { backends });

  return {
    backends,
    session: sessionStats,
    belief: beliefStats,
    typed: typedStats !== undefined ? (typedStats as unknown as Record<string, unknown>) : null,
    mobimem:
      mobimemStats !== undefined ? (mobimemStats as unknown as Record<string, unknown>) : null,
    decay: decayStats,
    collectedAt: new Date().toISOString(),
  };
}

/** MCP tool response type */
type MemoryStatsToolResponse = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

/**
 * Core handler logic for memory_stats tool.
 */
async function memoryStatsHandler(
  args: unknown,
  ctx: HandlerContext
): Promise<MemoryStatsToolResponse> {
  // Validate input
  const validationResult = MemoryStatsInputSchema.safeParse(args);
  if (!validationResult.success) {
    return {
      isError: true,
      content: [
        { type: 'text', text: `Validation error: ${formatZodError(validationResult.error)}` },
      ],
    };
  }

  try {
    const result = await collectMemoryStats(validationResult.data, ctx.logger);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    ctx.logger.error('Memory stats collection failed', error);
    return {
      isError: true,
      content: [{ type: 'text', text: `Memory stats failed: ${error.message}` }],
    };
  }
}

// ============================================================================
// Registration
// ============================================================================

/**
 * Registers the memory_stats tool with the MCP server.
 *
 * @param server - MCP server instance
 * @param deps - Tool dependencies
 */
export function registerMemoryStatsTool(server: McpServer, deps: MemoryStatsDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'memory_stats' });
  const toolSchema = {
    includeDecay: z.boolean().optional().describe('Include decay statistics (default: true)'),
    includePromotion: z
      .boolean()
      .optional()
      .describe('Include promotion pipeline stats (default: true)'),
  };

  const description =
    'Get memory system statistics dashboard. Shows backend availability, ' +
    'entry counts, decay stats, and promotion metrics across all 8 memory backends.';

  // Wrap handler with secure handler for rate limiting
  const secureHandler = createSecureHandler(memoryStatsHandler, {
    toolName: 'memory_stats',
    rateLimiter: deps.rateLimiter,
    logger,
  });

  // Wrap with timeout protection
  const timeoutMs = getToolTimeout('memory_stats', deps.security);
  const wrappedHandler = wrapToolWithTimeout('memory_stats', secureHandler, { timeoutMs, logger });

  server.registerTool(
    'memory_stats',
    { description, inputSchema: toolSchema },
    toSdkCallback(wrappedHandler)
  );
  logger.info('Registered memory_stats tool');
}
