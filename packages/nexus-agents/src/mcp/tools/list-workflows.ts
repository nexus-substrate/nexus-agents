/**
 * nexus-agents/mcp - List Workflows Tool
 *
 * MCP tool for discovering available workflow templates.
 * Provides discoverability for the run_workflow tool.
 *
 * @module mcp/tools/list-workflows
 * (Source: Issue #436 - Add discoverability tools)
 * (Refactored: Issue #531 - Use createSecureHandlerFactory)
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ILogger, IWorkflowEngine } from '../../core/index.js';
import { getErrorMessage, createLogger, formatZodError } from '../../core/index.js';

import type { RateLimiter } from '../middleware/rate-limiter.js';
import type { SecurityConfig } from '../../config/schemas.js';
import { wrapToolWithTimeout, toSdkCallback } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';

/**
 * Input schema for list_workflows tool.
 */
export const ListWorkflowsInputSchema = z.object({
  category: z.string().optional().describe('Filter by category (e.g., development, security)'),
  format: z
    .enum(['full', 'names'])
    .optional()
    .default('full')
    .describe('Output format: full (with details) or names (just template names)'),
});

/**
 * Type for validated list workflows input.
 */
export type ListWorkflowsInput = z.infer<typeof ListWorkflowsInputSchema>;

/**
 * Dependencies for list_workflows tool.
 */
export interface ListWorkflowsDeps {
  /** Workflow engine for listing templates */
  workflowEngine: IWorkflowEngine;
  /** Optional logger */
  logger?: ILogger;
  /** Rate limiter for throttling tool calls (required) */
  rateLimiter: RateLimiter;
  /** Security configuration (includes timeout settings - Issue #271, CVE-2026-0621) */
  security?: SecurityConfig | undefined;
}

/**
 * Workflow information returned by list_workflows tool.
 */
export interface WorkflowInfo {
  /** Template name for run_workflow */
  name: string;
  /** Version string */
  version: string;
  /** Workflow description */
  description: string | undefined;
  /** Workflow category */
  category: string | undefined;
}

/**
 * Response from list_workflows tool.
 */
export interface ListWorkflowsResponse {
  /** List of available workflows */
  workflows: WorkflowInfo[];
  /** Total count */
  count: number;
  /** Categories found (for filtering hints) */
  categories?: string[];
}

/**
 * Handles the list_workflows tool execution.
 */
async function handleListWorkflows(
  workflowEngine: IWorkflowEngine,
  args: ListWorkflowsInput
): Promise<ListWorkflowsResponse> {
  const templates = await workflowEngine.listTemplates();

  // Filter by category if specified
  let workflows = templates.map((t) => ({
    name: t.name,
    version: t.version,
    description: t.description,
    category: t.category,
  }));

  if (args.category !== undefined) {
    workflows = workflows.filter((w) => w.category?.toLowerCase() === args.category?.toLowerCase());
  }

  // Extract unique categories
  const categories = [...new Set(templates.map((t) => t.category).filter(Boolean))] as string[];

  if (args.format === 'names') {
    return {
      workflows: workflows.map((w) => ({
        name: w.name,
        version: w.version,
        description: undefined,
        category: undefined,
      })),
      count: workflows.length,
    };
  }

  return {
    workflows,
    count: workflows.length,
    categories,
  };
}

/** MCP tool response type */
type ListWorkflowsToolResponse = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

/**
 * Creates the core handler logic for list_workflows tool.
 * Rate limiting is handled by createSecureHandler wrapper.
 * @param workflowEngine - Workflow engine for listing templates
 * @returns Context-aware handler function
 */
function createListWorkflowsHandler(workflowEngine: IWorkflowEngine) {
  return async (args: unknown, ctx: HandlerContext): Promise<ListWorkflowsToolResponse> => {
    // Validate input
    const validationResult = ListWorkflowsInputSchema.safeParse(args);
    if (!validationResult.success) {
      return {
        isError: true,
        content: [
          { type: 'text', text: `Validation error: ${formatZodError(validationResult.error)}` },
        ],
      };
    }

    try {
      // Execute tool logic
      const result = await handleListWorkflows(workflowEngine, validationResult.data);

      ctx.logger.debug('Listed available workflows', {
        count: result.count,
        category: validationResult.data.category,
      });

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      const message = getErrorMessage(error);
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to list workflows: ${message}` }],
      };
    }
  };
}

/**
 * Registers the list_workflows tool with the MCP server.
 *
 * Uses createSecureHandler for standardized security middleware (Issue #531).
 * Includes timeout protection for CVE-2026-0621 mitigation (Issue #271).
 *
 * @param server - MCP server instance
 * @param deps - Tool dependencies
 */
export function registerListWorkflowsTool(server: McpServer, deps: ListWorkflowsDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'list_workflows' });
  const toolSchema = {
    category: z.string().optional().describe('Filter by category (e.g., development, security)'),
    format: z
      .enum(['full', 'names'])
      .optional()
      .describe('Output format: full (with details) or names (just template names)'),
  };

  const description =
    'List available workflow templates that can be executed with run_workflow. ' +
    'Returns template names, versions, descriptions, and categories.';

  // Wrap handler with secure handler for rate limiting and request context (Issue #531)
  const secureHandler = createSecureHandler(createListWorkflowsHandler(deps.workflowEngine), {
    toolName: 'list_workflows',
    rateLimiter: deps.rateLimiter,
    logger,
  });

  // Wrap with timeout protection (Issue #271, CVE-2026-0621)
  const timeoutMs = deps.security?.timeout?.defaultTimeoutMs;
  const wrappedHandler = wrapToolWithTimeout(
    'list_workflows',
    secureHandler,
    timeoutMs !== undefined ? { timeoutMs, logger } : { logger }
  );

  server.registerTool(
    'list_workflows',
    { description, inputSchema: toolSchema },
    toSdkCallback(wrappedHandler)
  );
  logger.info('Registered list_workflows tool with secure handler and timeout protection');
}
