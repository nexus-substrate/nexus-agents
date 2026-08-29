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
import { createLogger, formatZodError } from '../../core/index.js';
import { withToolError } from '../middleware/tool-error-handler.js';
import {
  toolStructuredError,
  toolSuccessStructured,
  type ToolResult,
  type BaseMcpToolDeps,
} from './tool-result.js';

import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import { getResearchStatus, findOverlaps } from '../../cli/research-helpers.js';
import { checkRejected, formatRejectionWarning } from '../../research/negative-results.js';
import { parseRegistry } from '../../indexer/research-index/index.js';
import { generateStatsJson } from '../../indexer/research-index/index.js';
import { getToolAnnotations } from '../tool-annotations.js';

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
export type ResearchQueryDeps = BaseMcpToolDeps;

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
  /**
   * A recorded rejection for the queried technique, when one exists (#4555).
   *
   * Advisory. The registry says a prior attempt failed and why; it does not
   * suppress the result, because a prior rejection is evidence to weigh, not
   * a veto.
   */
  rejectionNotice?: string;
}

// =============================================================================
// HANDLERS
// =============================================================================

/**
 * Surface a recorded rejection for `techniqueId`, if the registry holds one.
 *
 * `docs/research/registry/negative-results.yaml` exists to "prevent
 * re-researching failed implementations", and until now nothing read it —
 * maintained data with no consumer, so a technique explicitly recorded as
 * rejected was re-suggested with no warning (#4555). This is the read.
 *
 * Advisory: the rejection is attached to the response, never used to suppress
 * a result. A prior rejection is evidence to weigh, not a veto — the failure
 * mode may not apply, or the record may be stale.
 */
function rejectionNoticeFor(techniqueId: string | undefined): string | undefined {
  if (techniqueId === undefined || techniqueId === '') return undefined;
  const rejected = checkRejected(techniqueId);
  if (rejected === undefined) return undefined;
  return formatRejectionWarning(techniqueId, rejected);
}

/** Handles status action. */
async function handleStatus(input: ResearchQueryInput): Promise<ResearchQueryResponse> {
  const result = await getResearchStatus({
    techniqueId: input.techniqueId,
    status: input.status,
    format: 'json',
  });
  const rejection = rejectionNoticeFor(input.techniqueId);
  return {
    action: 'status',
    success: result.success,
    data: result,
    ...(rejection !== undefined ? { rejectionNotice: rejection } : {}),
  };
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
  const rejection = rejectionNoticeFor(input.techniqueId);
  return {
    action: 'overlap',
    success: result.success,
    data: result,
    ...(rejection !== undefined ? { rejectionNotice: rejection } : {}),
  };
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
  let data: unknown;
  try {
    data = JSON.parse(statsJson) as unknown;
  } catch {
    return {
      action: 'stats',
      success: false,
      data: { error: 'Failed to generate stats JSON' },
    };
  }
  return {
    action: 'stats',
    success: true,
    data,
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

/**
 * Creates the core handler logic for research_query tool.
 */
function createResearchQueryHandler(deps: ResearchQueryDeps) {
  return async (args: unknown, ctx: HandlerContext): Promise<ToolResult> => {
    const validationResult = ResearchQueryInputSchema.safeParse(args);
    if (!validationResult.success) {
      return toolStructuredError({
        errorCategory: 'validation',
        message: `Validation error: ${formatZodError(validationResult.error)}`,
      });
    }

    ctx.logger.debug('Executing research query', { action: validationResult.data.action });

    const logger = deps.logger ?? createLogger({ tool: 'research_query' });
    return withToolError('Research query failed', logger, async () => {
      const result = await executeQuery(validationResult.data);
      return toolSuccessStructured(result as unknown as Record<string, unknown>);
    });
  };
}

/**
 * Registers the research_query tool with the MCP server.
 *
 * @category MCP
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

  // Envelope schema (#2340). Inner `data` is intentionally `z.unknown()` —
  // the four action variants (status/overlap/stats/search) return different
  // shapes; modeling each precisely would require schema-per-action and is
  // deferred. The envelope still gives MCP clients a stable validation surface.
  const outputSchema = {
    action: z.string(),
    success: z.boolean(),
    data: z.unknown(),
    // Set by handleStatus/handleOverlap when the technique carries a recorded
    // rejection (#4555). Undeclared until #5141, which made every such call fail
    // -32602 on an SDK-validating client — the SDK applies
    // `additionalProperties: false` to any declared outputSchema.
    //
    // This hid because it is DATA-dependent, not action-dependent: the
    // round-trip check calls `action: 'stats'`, which never sets it.
    rejectionNotice: z.string().optional(),
  };

  server.registerTool(
    'research_query',
    {
      description,
      inputSchema: toolSchema,
      outputSchema,
      annotations: getToolAnnotations('research_query'),
    },
    toSdkCallback(wrappedHandler)
  );
  logger.info('Registered research_query tool with secure handler and timeout protection');
}
