/**
 * nexus-agents/mcp - List Experts Tool
 *
 * MCP tool for discovering available expert types.
 * Provides discoverability for the create_expert tool.
 *
 * @module mcp/tools/list-experts
 * (Source: Issue #436 - Add discoverability tools)
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ILogger } from '../../core/index.js';
import { createLogger } from '../../core/index.js';
import type { RateLimiter } from '../middleware/rate-limiter.js';
import type { SecurityConfig } from '../../config/schemas.js';
import { wrapToolWithTimeout, toSdkCallback } from '../middleware/tool-wrapper.js';
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
export interface ListExpertsDeps {
  /** Optional logger */
  logger?: ILogger;
  /** Rate limiter for throttling tool calls (required) */
  rateLimiter: RateLimiter;
  /** Security configuration (includes timeout settings - Issue #271, CVE-2026-0621) */
  security?: SecurityConfig | undefined;
}

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
        description: '',
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

/** MCP tool response type */
type ListExpertsToolResponse = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

/**
 * Creates a handler function for the list_experts tool.
 * @param deps - Tool dependencies
 * @returns Handler function for the tool
 */
function createToolHandler(deps: ListExpertsDeps) {
  return (args: unknown): Promise<ListExpertsToolResponse> => {
    return Promise.resolve().then((): ListExpertsToolResponse => {
      // Rate limiting check
      const acquired = deps.rateLimiter.tryAcquire();
      if (!acquired) {
        const state = deps.rateLimiter.getState();
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Rate limit exceeded. Try again in ${String(state.nextTokenMs)}ms.`,
            },
          ],
        };
      }

      // Validate input
      const validationResult = ListExpertsInputSchema.safeParse(args);
      if (!validationResult.success) {
        const errorMessage = validationResult.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; ');
        return {
          isError: true,
          content: [{ type: 'text', text: `Validation error: ${errorMessage}` }],
        };
      }

      // Execute tool logic
      const result = handleListExperts(validationResult.data);

      deps.logger?.debug('Listed available experts', { count: result.count });

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    });
  };
}

/**
 * Registers the list_experts tool with the MCP server.
 *
 * Includes timeout protection for CVE-2026-0621 mitigation (Issue #271).
 *
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

  // Wrap handler with timeout protection (Issue #271, CVE-2026-0621)
  const handler = createToolHandler(deps);
  const timeoutMs = deps.security?.timeout?.defaultTimeoutMs;
  const wrappedHandler = wrapToolWithTimeout(
    'list_experts',
    handler,
    timeoutMs !== undefined ? { timeoutMs, logger } : { logger }
  );

  server.registerTool(
    'list_experts',
    { description, inputSchema: toolSchema },
    toSdkCallback(wrappedHandler)
  );
  logger.info('Registered list_experts tool with timeout protection');
}
