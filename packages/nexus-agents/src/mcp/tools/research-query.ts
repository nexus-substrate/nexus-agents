/**
 * nexus-agents/mcp - Research Query Tool
 *
 * MCP tool for querying the research registry.
 * Wraps existing CLI helpers: getResearchStatus(), findOverlaps(), generateStatsJson().
 *
 * @module mcp/tools/research-query
 * (Source: Research System Enhancement - Phase 1A)
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ILogger } from '../../core/index.js';
import { getErrorMessage, createLogger, formatZodError } from '../../core/index.js';

import type { RateLimiter } from '../middleware/rate-limiter.js';
import type { SecurityConfig } from '../../config/schemas.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import { getResearchStatus, findOverlaps } from '../../cli/research-helpers.js';
import { parseRegistry } from '../../indexer/research-index/index.js';
import { generateStatsJson } from '../../indexer/research-index/index.js';

// =============================================================================
// SCHEMAS
// =============================================================================

/**
 * Input schema for research_query tool.
 */
export const ResearchQueryInputSchema = z.object({
  action: z
    .enum(['status', 'overlap', 'stats', 'search'])
    .describe(
      'Query action: status (technique status), overlap (find related techniques), stats (registry statistics), search (text search)'
    ),
  techniqueId: z.string().optional().describe('Technique ID for status/overlap queries'),
  query: z.string().optional().describe('Search query string for search action'),
  status: z
    .enum(['implemented', 'planned', 'not-started', 'rejected', 'all'])
    .optional()
    .default('all')
    .describe('Filter by technique status (for status action)'),
  threshold: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .default(0.3)
    .describe('Overlap threshold (0-1) for overlap action'),
});

/**
 * Type for validated research query input.
 */
export type ResearchQueryInput = z.infer<typeof ResearchQueryInputSchema>;

// =============================================================================
// DEPS
// =============================================================================

/**
 * Dependencies for research_query tool.
 */
export interface ResearchQueryDeps {
  /** Optional logger */
  logger?: ILogger;
  /** Rate limiter for throttling tool calls (required) */
  rateLimiter: RateLimiter;
  /** Security configuration (includes timeout settings) */
  security?: SecurityConfig | undefined;
}

// =============================================================================
// RESPONSE
// =============================================================================

/**
 * Response from research_query tool.
 */
export interface ResearchQueryResponse {
  /** Action that was performed */
  action: string;
  /** Whether the query succeeded */
  success: boolean;
  /** Query results */
  data: unknown;
}

// =============================================================================
// HANDLERS
// =============================================================================

/** Handles status action. */
async function handleStatus(input: ResearchQueryInput): Promise<ResearchQueryResponse> {
  const result = await getResearchStatus({
    techniqueId: input.techniqueId,
    status: input.status,
    format: 'json',
  });
  return { action: 'status', success: result.success, data: result };
}

/** Handles overlap action. */
async function handleOverlap(input: ResearchQueryInput): Promise<ResearchQueryResponse> {
  if (input.techniqueId === undefined || input.techniqueId === '') {
    return {
      action: 'overlap',
      success: false,
      data: { error: 'techniqueId is required for overlap action' },
    };
  }
  const result = await findOverlaps({
    techniqueId: input.techniqueId,
    threshold: input.threshold,
    format: 'json',
  });
  return { action: 'overlap', success: result.success, data: result };
}

/** Handles stats action. */
function handleStats(): ResearchQueryResponse {
  const registryPath = `${process.cwd()}/docs/research/registry`;
  const result = parseRegistry({ registryPath });
  if (!result.ok) {
    return {
      action: 'stats',
      success: false,
      data: { error: `Failed to parse registry: ${result.error.message}` },
    };
  }
  const statsJson = generateStatsJson(result.value);
  return {
    action: 'stats',
    success: true,
    data: JSON.parse(statsJson) as unknown,
  };
}

/** Handles search action. */
async function handleSearch(input: ResearchQueryInput): Promise<ResearchQueryResponse> {
  if (input.query === undefined || input.query === '') {
    return {
      action: 'search',
      success: false,
      data: { error: 'query is required for search action' },
    };
  }
  const queryLower = input.query.toLowerCase();
  const result = await getResearchStatus({
    status: 'all',
    format: 'json',
  });
  if (!result.success) {
    return { action: 'search', success: false, data: result };
  }
  const matches = result.techniques.filter(
    (t) =>
      t.name.toLowerCase().includes(queryLower) ||
      t.id.toLowerCase().includes(queryLower) ||
      t.topic.toLowerCase().includes(queryLower)
  );
  return {
    action: 'search',
    success: true,
    data: { query: input.query, matches, matchCount: matches.length },
  };
}

/** Routes to the correct action handler. */
async function executeQuery(input: ResearchQueryInput): Promise<ResearchQueryResponse> {
  switch (input.action) {
    case 'status':
      return handleStatus(input);
    case 'overlap':
      return handleOverlap(input);
    case 'stats':
      return handleStats();
    case 'search':
      return handleSearch(input);
  }
}

// =============================================================================
// MCP TOOL
// =============================================================================

/** MCP tool response type */
type ResearchQueryToolResponse = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

/**
 * Creates the core handler logic for research_query tool.
 */
function createResearchQueryHandler(deps: ResearchQueryDeps) {
  return async (args: unknown, ctx: HandlerContext): Promise<ResearchQueryToolResponse> => {
    const validationResult = ResearchQueryInputSchema.safeParse(args);
    if (!validationResult.success) {
      return {
        isError: true,
        content: [
          { type: 'text', text: `Validation error: ${formatZodError(validationResult.error)}` },
        ],
      };
    }

    ctx.logger.debug('Executing research query', { action: validationResult.data.action });

    try {
      const result = await executeQuery(validationResult.data);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      const message = getErrorMessage(error);
      const logger = deps.logger ?? createLogger({ tool: 'research_query' });
      logger.error('Research query failed', error instanceof Error ? error : new Error(message));
      return {
        isError: true,
        content: [{ type: 'text', text: `Research query failed: ${message}` }],
      };
    }
  };
}

/**
 * Registers the research_query tool with the MCP server.
 *
 * @param server - MCP server instance
 * @param deps - Tool dependencies
 */
export function registerResearchQueryTool(server: McpServer, deps: ResearchQueryDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'research_query' });
  const toolSchema = {
    action: z
      .enum(['status', 'overlap', 'stats', 'search'])
      .describe('Query action: status, overlap, stats, or search'),
    techniqueId: z.string().optional().describe('Technique ID for status/overlap queries'),
    query: z.string().optional().describe('Search query string for search action'),
    status: z
      .enum(['implemented', 'planned', 'not-started', 'rejected', 'all'])
      .optional()
      .describe('Filter by technique status'),
    threshold: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe('Overlap threshold (0-1) for overlap action'),
  };

  const description =
    'Query the research registry for technique status, overlaps, statistics, or text search. ' +
    'Provides read-only access to the research tracking system.';

  const secureHandler = createSecureHandler(createResearchQueryHandler(deps), {
    toolName: 'research_query',
    rateLimiter: deps.rateLimiter,
    logger,
  });

  const timeoutMs = getToolTimeout('research_query', deps.security);
  const wrappedHandler = wrapToolWithTimeout('research_query', secureHandler, {
    timeoutMs,
    logger,
  });

  server.registerTool(
    'research_query',
    { description, inputSchema: toolSchema },
    toSdkCallback(wrappedHandler)
  );
  logger.info('Registered research_query tool with secure handler and timeout protection');
}
