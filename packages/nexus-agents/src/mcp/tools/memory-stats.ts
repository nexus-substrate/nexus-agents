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
import { withToolError } from '../middleware/tool-error-handler.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import {
  toolStructuredError,
  toolSuccessStructured,
  type ToolResult,
  type BaseMcpToolDeps,
} from './tool-result.js';
import { getToolMemory } from './tool-memory.js';
import { getToolAnnotations } from '../tool-annotations.js';
import { getMemoryRegistry } from 'nexus-memory';

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
});

/**
 * Type for validated memory stats input.
 */
export type MemoryStatsInput = z.infer<typeof MemoryStatsInputSchema>;

/**
 * Dependencies for memory_stats tool.
 */
export type MemoryStatsDeps = BaseMcpToolDeps;

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
 * Per-domain row from the unified MemoryRegistry (Phase 5 of #2766).
 * Surfaces every backend that registered itself with `getMemoryRegistry()`
 * so future consumers can iterate one canonical source instead of the
 * hand-maintained per-backend fields above.
 */
export interface RegistryDomainStats {
  /** Domain name (e.g., 'belief', 'agentic', 'outcomes'). */
  domain: string;
  /** Row count, or null if the backend's stats() rejected. */
  count: number | null;
  /** Error message when the backend's stats() rejected. */
  error: string | null;
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
  /**
   * Per-domain stats from the unified MemoryRegistry (Phase 5 of #2766).
   * One entry per attached backend; empty when no backend has registered.
   */
  registry: readonly RegistryDomainStats[];
  /** Timestamp of stats collection */
  collectedAt: string;
}

// ============================================================================
// Handler
// ============================================================================

/**
 * Collects statistics from all memory backends.
 */
/**
 * Read the live session counts.
 *
 * `tasksCount` and `errorsCount` were previously initialised to 0 and never
 * assigned — returned as 0 on every call, while the sibling
 * `backends.session: true` asserted the backend was up. A caller read "session
 * memory is healthy and holds 0 tasks, 0 errors", with the positive assertion
 * corroborating the fabricated zeros rather than qualifying them (#5269).
 *
 * The counts were never absent: the session episode has held `tasksCompleted`
 * and `errorsResolved` all along, they were simply not exposed mid-session.
 */
function collectSessionStats(toolMemory: ReturnType<typeof getToolMemory>): SessionStats {
  const counts = toolMemory.getSessionCounts();
  const stats: SessionStats = {
    learningsCount: 0,
    tasksCount: counts.tasksCount,
    errorsCount: counts.errorsCount,
  };

  const learnings = toolMemory.getRelevantLearnings('', 1000);
  if (learnings !== undefined) {
    stats.learningsCount = learnings.split('\n').filter((l) => l.trim() !== '').length;
  }
  return stats;
}

async function collectMemoryStats(
  input: MemoryStatsInput,
  logger: ILogger
): Promise<MemoryStatsResponse> {
  const toolMemory = getToolMemory();

  const sessionStats = collectSessionStats(toolMemory);

  // Collect belief stats — read actual count from belief backend
  const beliefStats: BeliefStats = {
    beliefsCount: toolMemory.getBeliefCount(),
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

  const registry = await collectRegistryStats(logger);
  logger.debug('Memory stats collected', { backends, registryDomains: registry.length });

  return {
    backends,
    session: sessionStats,
    belief: beliefStats,
    typed: typedStats !== undefined ? (typedStats as unknown as Record<string, unknown>) : null,
    mobimem:
      mobimemStats !== undefined ? (mobimemStats as unknown as Record<string, unknown>) : null,
    decay: decayStats,
    registry,
    collectedAt: new Date().toISOString(),
  };
}

/**
 * Iterate every domain registered with the unified MemoryRegistry and
 * call its `stats()` method. Phase 5 of #2766 attached `belief`, `agentic`,
 * `adaptive`, `typed`, `mobimem`, and `outcomes`; this is the consumer
 * side the epic was building toward — one canonical fan-out instead of
 * the per-backend `toolMemory.is*Available()` calls above.
 */
async function collectRegistryStats(logger: ILogger): Promise<readonly RegistryDomainStats[]> {
  const registry = getMemoryRegistry();
  const rows: RegistryDomainStats[] = [];
  for (const domain of registry.domains()) {
    const backend = registry.get(domain);
    if (backend === undefined) continue;
    try {
      const s = await backend.stats();
      rows.push({ domain, count: s.count, error: null });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.debug('Registry domain stats failed', { domain, error: message });
      rows.push({ domain, count: null, error: message });
    }
  }
  return rows;
}

/**
 * Core handler logic for memory_stats tool.
 */
async function memoryStatsHandler(args: unknown, ctx: HandlerContext): Promise<ToolResult> {
  // Validate input
  const validationResult = MemoryStatsInputSchema.safeParse(args);
  if (!validationResult.success) {
    return toolStructuredError({
      errorCategory: 'validation',
      message: `Validation error: ${formatZodError(validationResult.error)}`,
    });
  }

  return withToolError('Memory stats failed', ctx.logger, async () => {
    const result = await collectMemoryStats(validationResult.data, ctx.logger);
    return toolSuccessStructured(result as unknown as Record<string, unknown>);
  });
}

// ============================================================================
// Registration
// ============================================================================

/**
 * Registers the memory_stats tool with the MCP server.
 *
 * @category MCP
 * @param server - MCP server instance
 * @param deps - Tool dependencies
 */
export function registerMemoryStatsTool(server: McpServer, deps: MemoryStatsDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'memory_stats' });
  const toolSchema = {
    includeDecay: z.boolean().optional().describe('Include decay statistics (default: true)'),
  };

  const description =
    'Get memory system statistics dashboard. Shows backend availability, ' +
    'entry counts, and decay stats across all 7 memory backends.';

  // Wrap handler with secure handler for rate limiting
  const secureHandler = createSecureHandler(memoryStatsHandler, {
    toolName: 'memory_stats',
    rateLimiter: deps.rateLimiter,
    logger,
  });

  // Wrap with timeout protection
  const timeoutMs = getToolTimeout('memory_stats', deps.security);
  const wrappedHandler = wrapToolWithTimeout('memory_stats', secureHandler, { timeoutMs, logger });

  // Permissive shape from collectMemoryStats (#2340 batch 2). Backend-specific
  // stats vary by initialization state (some are nullable, some optional in CI
  // where partial init is the norm); model the envelope, not internal structure.
  const outputSchema = {
    backends: z.unknown(),
    session: z.unknown().optional(),
    belief: z.unknown().optional(),
    typed: z.unknown().optional(),
    mobimem: z.unknown().optional(),
    decay: z.unknown().optional(),
    registry: z.array(z.unknown()).optional(),
    collectedAt: z.string().optional(),
  };

  server.registerTool(
    'memory_stats',
    {
      description,
      inputSchema: toolSchema,
      outputSchema,
      annotations: getToolAnnotations('memory_stats'),
    },
    toSdkCallback(wrappedHandler)
  );
  logger.info('Registered memory_stats tool');
}
