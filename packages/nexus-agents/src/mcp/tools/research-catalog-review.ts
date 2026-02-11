/**
 * nexus-agents/mcp - Research Catalog Review Tool
 *
 * MCP tool for reviewing auto-cataloged research references.
 * Actions: list, approve, dismiss, flush.
 *
 * @module mcp/tools/research-catalog-review
 * (Source: Research System Enhancement - Phase 5)
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ILogger } from '../../core/index.js';
import { getErrorMessage, createLogger, formatZodError } from '../../core/index.js';

import type { RateLimiter } from '../middleware/rate-limiter.js';
import type { SecurityConfig } from '../../config/schemas.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import { getAutoCatalog } from './research-auto-catalog.js';
import { addResearchPaper, paperExists } from '../../cli/research-helpers.js';
import { createResearchIssue, formatResearchIssueBody } from '../../cli/research-helpers-issues.js';

// =============================================================================
// SCHEMAS
// =============================================================================

/**
 * Input schema for research_catalog_review tool.
 */
export const ResearchCatalogReviewInputSchema = z.object({
  action: z
    .enum(['list', 'approve', 'dismiss', 'flush'])
    .describe(
      'Action: list (show pending), approve (add to registry), dismiss (remove), flush (clear all)'
    ),
  identifier: z
    .string()
    .optional()
    .describe('Reference identifier for approve/dismiss actions (arXiv ID or GitHub URL)'),
  topic: z.string().optional().describe('Topic to assign when approving an arXiv paper'),
  createIssue: z
    .boolean()
    .optional()
    .default(false)
    .describe('When approving, also create a GitHub issue for the paper'),
});

/**
 * Type for validated catalog review input.
 */
export type ResearchCatalogReviewInput = z.infer<typeof ResearchCatalogReviewInputSchema>;

// =============================================================================
// DEPS
// =============================================================================

/**
 * Dependencies for research_catalog_review tool.
 */
export interface ResearchCatalogReviewDeps {
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
 * Response from research_catalog_review tool.
 */
export interface ResearchCatalogReviewResponse {
  /** Action that was performed */
  action: string;
  /** Whether the action succeeded */
  success: boolean;
  /** Human-readable message */
  message: string;
  /** Data payload */
  data?: unknown;
}

// =============================================================================
// HANDLERS
// =============================================================================

/** Handle list action. */
function handleList(): ResearchCatalogReviewResponse {
  const catalog = getAutoCatalog();
  const pending = catalog.getPending();
  return {
    action: 'list',
    success: true,
    message: `${String(pending.length)} pending references`,
    data: { pending, count: pending.length },
  };
}

/** Approve an arXiv paper reference. */
async function approveArxivRef(
  identifier: string,
  topic: string | undefined,
  shouldCreateIssue: boolean,
  logger: ILogger
): Promise<ResearchCatalogReviewResponse> {
  const catalog = getAutoCatalog();
  const exists = await paperExists(identifier);
  if (exists) {
    catalog.markReviewed(identifier);
    return { action: 'approve', success: true, message: `Paper ${identifier} already in registry` };
  }
  const result = await addResearchPaper({ arxivId: identifier, topic, dryRun: false });
  catalog.markReviewed(identifier);
  if (!result.success) {
    return { action: 'approve', success: false, message: `Failed: ${result.message}` };
  }

  logger.info('Approved paper', { paperId: result.paperId });

  // Optionally create a GitHub issue for the approved paper
  if (shouldCreateIssue) {
    const body = formatResearchIssueBody([
      {
        title: result.title,
        source: 'arxiv',
        url: `https://arxiv.org/abs/${identifier}`,
        description: result.message,
        relevance: 'high',
      },
    ]);
    const issueResult = await createResearchIssue({
      title: `research: ${result.title}`,
      body,
      labels: ['research', 'discovered'],
    });
    if (issueResult.ok) {
      return {
        action: 'approve',
        success: true,
        message: `Added: ${result.title} | Issue: ${issueResult.value.url}`,
        data: { ...result, issueUrl: issueResult.value.url },
      };
    }
    logger.warn('Issue creation failed after approve', { error: issueResult.error.message });
  }

  return { action: 'approve', success: true, message: `Added: ${result.title}`, data: result };
}

/** Handle approve action. */
async function handleApprove(
  input: ResearchCatalogReviewInput,
  logger: ILogger
): Promise<ResearchCatalogReviewResponse> {
  if (input.identifier === undefined || input.identifier === '') {
    return { action: 'approve', success: false, message: 'identifier is required' };
  }
  const catalog = getAutoCatalog();
  const ref = catalog.getAll().find((r) => r.identifier === input.identifier);
  if (ref === undefined) {
    return {
      action: 'approve',
      success: false,
      message: `Reference "${input.identifier}" not found`,
    };
  }
  if (ref.type === 'arxiv') {
    return approveArxivRef(ref.identifier, input.topic, input.createIssue, logger);
  }
  catalog.markReviewed(ref.identifier);
  return { action: 'approve', success: true, message: `Reviewed: ${ref.identifier}` };
}

/** Handle dismiss action. */
function handleDismiss(input: ResearchCatalogReviewInput): ResearchCatalogReviewResponse {
  if (input.identifier === undefined || input.identifier === '') {
    return {
      action: 'dismiss',
      success: false,
      message: 'identifier is required for dismiss action',
    };
  }

  const catalog = getAutoCatalog();
  const dismissed = catalog.dismiss(input.identifier);
  return {
    action: 'dismiss',
    success: dismissed,
    message: dismissed
      ? `Dismissed reference: ${input.identifier}`
      : `Reference "${input.identifier}" not found`,
  };
}

/** Handle flush action. */
function handleFlush(): ResearchCatalogReviewResponse {
  const catalog = getAutoCatalog();
  const count = catalog.getAll().length;
  catalog.flush();
  return {
    action: 'flush',
    success: true,
    message: `Flushed ${String(count)} references from catalog`,
  };
}

/** Routes to the correct action handler. */
async function executeCatalogReview(
  input: ResearchCatalogReviewInput,
  logger: ILogger
): Promise<ResearchCatalogReviewResponse> {
  switch (input.action) {
    case 'list':
      return handleList();
    case 'approve':
      return handleApprove(input, logger);
    case 'dismiss':
      return handleDismiss(input);
    case 'flush':
      return handleFlush();
  }
}

// =============================================================================
// MCP TOOL
// =============================================================================

/** MCP tool response type */
type CatalogReviewToolResponse = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

/**
 * Creates the core handler logic for research_catalog_review tool.
 */
function createCatalogReviewHandler(deps: ResearchCatalogReviewDeps) {
  return async (args: unknown, ctx: HandlerContext): Promise<CatalogReviewToolResponse> => {
    const validationResult = ResearchCatalogReviewInputSchema.safeParse(args);
    if (!validationResult.success) {
      return {
        isError: true,
        content: [
          { type: 'text', text: `Validation error: ${formatZodError(validationResult.error)}` },
        ],
      };
    }

    ctx.logger.debug('Catalog review', { action: validationResult.data.action });

    try {
      const logger = deps.logger ?? createLogger({ tool: 'research_catalog_review' });
      const result = await executeCatalogReview(validationResult.data, logger);

      if (!result.success) {
        return {
          isError: true,
          content: [{ type: 'text', text: result.message }],
        };
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      const message = getErrorMessage(error);
      return {
        isError: true,
        content: [{ type: 'text', text: `Catalog review failed: ${message}` }],
      };
    }
  };
}

/**
 * Registers the research_catalog_review tool with the MCP server.
 *
 * @param server - MCP server instance
 * @param deps - Tool dependencies
 */
export function registerResearchCatalogReviewTool(
  server: McpServer,
  deps: ResearchCatalogReviewDeps
): void {
  const logger = deps.logger ?? createLogger({ tool: 'research_catalog_review' });
  const toolSchema = {
    action: z
      .enum(['list', 'approve', 'dismiss', 'flush'])
      .describe('Action to perform on cataloged references'),
    identifier: z.string().optional().describe('Reference identifier for approve/dismiss'),
    topic: z.string().optional().describe('Topic for approved papers'),
    createIssue: z.boolean().optional().describe('Create GitHub issue when approving'),
  };

  const description =
    'Review auto-cataloged research references found during tool execution. ' +
    'List pending references, approve them for registry addition, dismiss, or clear all.';

  const secureHandler = createSecureHandler(createCatalogReviewHandler(deps), {
    toolName: 'research_catalog_review',
    rateLimiter: deps.rateLimiter,
    logger,
  });

  const timeoutMs = getToolTimeout('research_catalog_review', deps.security);
  const wrappedHandler = wrapToolWithTimeout('research_catalog_review', secureHandler, {
    timeoutMs,
    logger,
  });

  server.registerTool(
    'research_catalog_review',
    { description, inputSchema: toolSchema },
    toSdkCallback(wrappedHandler)
  );
  logger.info('Registered research_catalog_review tool');
}
