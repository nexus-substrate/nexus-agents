/**
 * nexus-agents/mcp - List Experts Tool
 *
 * MCP tool for discovering available expert types.
 * Provides discoverability for the create_expert tool.
 *
 * @module mcp/tools/list-experts
 * (Source: Issue #436 - Add discoverability tools)
 * (Refactored: Issue #531 - Use createSecureHandlerFactory)
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createLogger, formatZodError } from '../../core/index.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import {
  toolError,
  toolSuccessStructured,
  type BaseMcpToolDeps,
  type ToolResult,
} from './tool-result.js';
import { BUILT_IN_EXPERTS, type BuiltInExpertType } from '../../agents/index.js';

/**
 * Input schema for list_experts tool.
 * Currently no parameters required (lists all experts).
 */
export const ListExpertsInputSchema = z.object({
  format: z
    .enum(['full', 'names'])
    .optional()
    .default('full')
    .describe('Output format: full (with details) or names (just role names)'),
});

/**
 * Type for validated list experts input.
 */
export type ListExpertsInput = z.infer<typeof ListExpertsInputSchema>;

/**
 * Dependencies for list_experts tool.
 */
export type ListExpertsDeps = BaseMcpToolDeps;

/**
 * Expert information returned by list_experts tool.
 */
export interface ExpertInfo {
  /** Role identifier for create_expert */
  role: string;
  /** Human-readable name */
  name: string;
  /** Expert description */
  description: string;
  /** List of capabilities */
  capabilities: readonly string[];
}

/**
 * Response from list_experts tool.
 */
export interface ListExpertsResponse {
  /** List of available experts */
  experts: ExpertInfo[];
  /** Total count */
  count: number;
}

/**
 * Maps expert type to role name for create_expert compatibility.
 */
const EXPERT_TYPE_TO_ROLE: Record<BuiltInExpertType, string> = {
  code: 'code_expert',
  architecture: 'architecture_expert',
  security: 'security_expert',
  documentation: 'documentation_expert',
  testing: 'testing_expert',
  devops: 'devops_expert',
  research: 'research_expert',
  pm: 'pm_expert',
  ux: 'ux_expert',
  infrastructure: 'infrastructure_expert',
  qa: 'qa_expert',
  'data-visualization': 'data_visualization_expert',
};

/**
 * Gets a brief description from the system prompt (first paragraph).
 */
function extractDescription(systemPrompt: string): string {
  // Extract the first paragraph as a description
  const firstParagraph = systemPrompt.split('\n\n')[0];
  if (firstParagraph === undefined || firstParagraph === '') {
    return 'Expert agent';
  }
  const cleaned = firstParagraph.replace(/\n/g, ' ').trim();
  // Limit to 200 chars
  if (cleaned.length > 200) {
    return cleaned.slice(0, 197) + '...';
  }
  return cleaned;
}

/**
 * Gets all available experts with their metadata.
 */
function getExpertList(): ExpertInfo[] {
  return Object.entries(BUILT_IN_EXPERTS).map(([type, config]) => ({
    role: EXPERT_TYPE_TO_ROLE[type as BuiltInExpertType],
    name: config.name,
    description: extractDescription(config.systemPrompt),
    capabilities: [...config.capabilities],
  }));
}

/**
 * Handles the list_experts tool execution.
 */
function handleListExperts(args: ListExpertsInput): ListExpertsResponse {
  const experts = getExpertList();

  if (args.format === 'names') {
    return {
      experts: experts.map((e) => ({
        role: e.role,
        name: e.name,
        description: (e.description.split('.')[0] ?? 'Expert agent') + '.',
        capabilities: [],
      })),
      count: experts.length,
    };
  }

  return {
    experts,
    count: experts.length,
  };
}

/**
 * Core handler logic for list_experts tool.
 * Rate limiting is handled by createSecureHandler wrapper.
 * @param args - Tool arguments
 * @param ctx - Handler context with request info and logger
 * @returns Tool response
 */
function listExpertsHandler(args: unknown, ctx: HandlerContext): Promise<ToolResult> {
  // Validate input
  const validationResult = ListExpertsInputSchema.safeParse(args);
  if (!validationResult.success) {
    return Promise.resolve(
      toolError(`Validation error: ${formatZodError(validationResult.error)}`)
    );
  }

  // Execute tool logic
  const result = handleListExperts(validationResult.data);

  ctx.logger.debug('Listed available experts', { count: result.count });

  const data = result as unknown as Record<string, unknown>;
  return Promise.resolve(toolSuccessStructured(data));
}

/**
 * Registers the list_experts tool with the MCP server.
 *
 * Uses createSecureHandler for standardized security middleware (Issue #531).
 * Includes timeout protection for CVE-2026-0621 mitigation (Issue #271).
 *
 * @category MCP
 * @param server - MCP server instance
 * @param deps - Tool dependencies
 */
export function registerListExpertsTool(server: McpServer, deps: ListExpertsDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'list_experts' });
  const toolSchema = {
    format: z
      .enum(['full', 'names'])
      .optional()
      .describe('Output format: full (with details) or names (just role names)'),
  };

  const description =
    'List available expert types that can be created with create_expert. ' +
    'Returns role names, descriptions, and capabilities for each expert type.';

  // Wrap handler with secure handler for rate limiting and request context (Issue #531)
  const secureHandler = createSecureHandler(listExpertsHandler, {
    toolName: 'list_experts',
    rateLimiter: deps.rateLimiter,
    logger,
  });

  // Wrap with timeout protection (Issue #271, CVE-2026-0621)
  const timeoutMs = getToolTimeout('list_experts', deps.security);
  const wrappedHandler = wrapToolWithTimeout('list_experts', secureHandler, { timeoutMs, logger });

  const outputSchema = {
    experts: z.array(
      z.object({
        role: z.string(),
        name: z.string(),
        description: z.string(),
        capabilities: z.array(z.string()),
      })
    ),
    count: z.number(),
  };

  server.registerTool(
    'list_experts',
    { description, inputSchema: toolSchema, outputSchema },
    toSdkCallback(wrappedHandler)
  );
  logger.info('Registered list_experts tool with secure handler and timeout protection');
}
