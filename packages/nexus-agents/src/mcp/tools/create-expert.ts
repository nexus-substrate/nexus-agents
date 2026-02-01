/**
 * nexus-agents/mcp - Create Expert Tool
 *
 * MCP tool for creating expert agents dynamically.
 * Supports built-in expert types: code, architecture, security, documentation, testing, devops.
 *
 * @module mcp/tools/create-expert
 * (Refactored: Issue #531 - Use createSecureHandlerFactory)
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ILogger, AgentCapability } from '../../core/index.js';
import { createLogger, formatZodError } from '../../core/index.js';
import type { RateLimiter } from '../middleware/rate-limiter.js';
import type { SecurityConfig } from '../../config/schemas.js';
import { wrapToolWithTimeout, toSdkCallback } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import {
  ExpertFactory,
  Expert,
  type BuiltInExpertType,
  BUILT_IN_EXPERTS,
} from '../../agents/index.js';

/**
 * Input schema for create_expert tool.
 */
export const CreateExpertInputSchema = z.object({
  role: z
    .enum([
      'code_expert',
      'architecture_expert',
      'security_expert',
      'documentation_expert',
      'testing_expert',
      'devops_expert',
    ])
    .describe('Expert role to create'),
  modelPreference: z.string().optional().describe('Preferred model (e.g., claude-sonnet-4)'),
});

/**
 * Type for validated create expert input.
 */
export type CreateExpertInput = z.infer<typeof CreateExpertInputSchema>;

/**
 * Expert factory interface for dependency injection.
 */
export interface IExpertFactory {
  createBuiltIn(
    type: BuiltInExpertType,
    options?: { modelOverrides?: { modelId?: string } }
  ): { ok: true; value: Expert } | { ok: false; error: Error };
}

/**
 * Dependencies for create_expert tool.
 */
export interface CreateExpertDeps {
  /** Expert factory for creating experts */
  expertFactory: IExpertFactory;
  /** Registry to track created experts */
  expertRegistry: Map<string, Expert>;
  /** Optional logger */
  logger?: ILogger;
  /** Rate limiter for throttling tool calls (required) */
  rateLimiter: RateLimiter;
  /** Security configuration (includes timeout settings - Issue #271, CVE-2026-0621) */
  security?: SecurityConfig | undefined;
}

/**
 * Response from create_expert tool.
 */
export interface CreateExpertResponse {
  /** Unique expert ID */
  expertId: string;
  /** Expert role */
  role: string;
  /** List of capabilities */
  capabilities: readonly AgentCapability[];
  /** Expert status */
  status: 'ready';
}

/**
 * Maximum number of experts allowed in the registry.
 * Prevents unbounded memory growth from expert creation.
 */
const MAX_EXPERTS = 100;

/**
 * Maps role to built-in expert type.
 */
const ROLE_TO_EXPERT_TYPE: Record<string, BuiltInExpertType> = {
  code_expert: 'code',
  architecture_expert: 'architecture',
  security_expert: 'security',
  documentation_expert: 'documentation',
  testing_expert: 'testing',
  devops_expert: 'devops',
};

/**
 * Validates the role and returns the corresponding expert type.
 */
function getExpertType(role: string): BuiltInExpertType | undefined {
  return ROLE_TO_EXPERT_TYPE[role];
}

/**
 * Builds the create expert response.
 */
function buildResponse(expert: Expert): CreateExpertResponse {
  return {
    expertId: expert.id,
    role: expert.role,
    capabilities: expert.capabilities,
    status: 'ready',
  };
}

/**
 * Creates an expert using the factory.
 */
function createExpertFromFactory(
  deps: CreateExpertDeps,
  expertType: BuiltInExpertType,
  modelPreference?: string
): { ok: true; value: Expert } | { ok: false; error: string } {
  const options =
    modelPreference !== undefined ? { modelOverrides: { modelId: modelPreference } } : undefined;

  const result = deps.expertFactory.createBuiltIn(expertType, options);

  if (!result.ok) {
    return { ok: false, error: result.error.message };
  }

  return { ok: true, value: result.value };
}

/**
 * Handles the create_expert tool execution.
 */
function handleCreateExpert(
  deps: CreateExpertDeps,
  args: CreateExpertInput
): { ok: true; value: CreateExpertResponse } | { ok: false; error: string } {
  const { role, modelPreference } = args;

  // Map role to expert type
  const expertType = getExpertType(role);
  if (expertType === undefined) {
    return { ok: false, error: `Invalid role: ${role}` };
  }

  // Create expert
  const createResult = createExpertFromFactory(deps, expertType, modelPreference);
  if (!createResult.ok) {
    return { ok: false, error: createResult.error };
  }

  const expert = createResult.value;

  // Check registry bounds to prevent unbounded memory growth
  if (deps.expertRegistry.size >= MAX_EXPERTS) {
    return {
      ok: false,
      error: `Maximum number of experts (${String(MAX_EXPERTS)}) reached. Remove unused experts first.`,
    };
  }

  // Track in registry
  deps.expertRegistry.set(expert.id, expert);

  // Log creation
  deps.logger?.info('Expert created', {
    expertId: expert.id,
    role: expert.role,
    capabilities: expert.capabilities,
  });

  return { ok: true, value: buildResponse(expert) };
}

/** MCP tool response type for create_expert */
type CreateExpertToolResponse = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

/**
 * Creates the core handler logic for create_expert tool.
 * Rate limiting is handled by createSecureHandler wrapper.
 * @param deps - Tool dependencies
 * @returns Context-aware handler function
 */
function createCreateExpertHandler(deps: CreateExpertDeps) {
  return (args: unknown, ctx: HandlerContext): Promise<CreateExpertToolResponse> => {
    // Validate input
    const validationResult = CreateExpertInputSchema.safeParse(args);
    if (!validationResult.success) {
      return Promise.resolve({
        isError: true,
        content: [
          { type: 'text', text: `Validation error: ${formatZodError(validationResult.error)}` },
        ],
      });
    }

    // Execute tool logic
    const result = handleCreateExpert(deps, validationResult.data);

    if (!result.ok) {
      return Promise.resolve({
        isError: true,
        content: [{ type: 'text', text: `Failed to create expert: ${result.error}` }],
      });
    }

    ctx.logger.debug('Expert created successfully', {
      expertId: result.value.expertId,
      role: result.value.role,
    });

    return Promise.resolve({
      content: [{ type: 'text', text: JSON.stringify(result.value, null, 2) }],
    });
  };
}

/**
 * Registers the create_expert tool with the MCP server.
 *
 * Uses createSecureHandler for standardized security middleware (Issue #531).
 * Includes timeout protection for CVE-2026-0621 mitigation (Issue #271).
 *
 * @param server - MCP server instance
 * @param deps - Tool dependencies
 */
export function registerCreateExpertTool(server: McpServer, deps: CreateExpertDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'create_expert' });
  const toolSchema = {
    role: z
      .enum([
        'code_expert',
        'architecture_expert',
        'security_expert',
        'documentation_expert',
        'testing_expert',
        'devops_expert',
      ])
      .describe('Expert role to create'),
    modelPreference: z.string().optional().describe('Preferred model (e.g., claude-sonnet-4)'),
  };

  const description =
    'Create a specialized expert agent for code, architecture, security, documentation, testing, or devops tasks';

  // Wrap handler with secure handler for rate limiting and request context (Issue #531)
  const secureHandler = createSecureHandler(createCreateExpertHandler(deps), {
    toolName: 'create_expert',
    rateLimiter: deps.rateLimiter,
    logger,
  });

  // Wrap with timeout protection (Issue #271, CVE-2026-0621)
  const timeoutMs = deps.security?.timeout?.defaultTimeoutMs;
  const wrappedHandler = wrapToolWithTimeout(
    'create_expert',
    secureHandler,
    timeoutMs !== undefined ? { timeoutMs, logger } : { logger }
  );

  server.registerTool(
    'create_expert',
    { description, inputSchema: toolSchema },
    toSdkCallback(wrappedHandler)
  );
  logger.info('Registered create_expert tool with secure handler and timeout protection');
}

/**
 * Creates default dependencies for the create_expert tool.
 *
 * @param rateLimiter - Rate limiter for throttling tool calls (required)
 * @param logger - Optional logger instance
 * @returns CreateExpertDeps with default factory and empty registry
 */
export function createDefaultDeps(rateLimiter: RateLimiter, logger?: ILogger): CreateExpertDeps {
  const deps: CreateExpertDeps = {
    expertFactory: ExpertFactory,
    expertRegistry: new Map<string, Expert>(),
    rateLimiter,
  };
  if (logger !== undefined) {
    deps.logger = logger;
  }
  return deps;
}

/**
 * Gets the list of available expert roles.
 */
export function getAvailableRoles(): string[] {
  return Object.keys(ROLE_TO_EXPERT_TYPE);
}

/**
 * Gets capabilities for a given expert role.
 */
export function getCapabilitiesForRole(role: string): readonly AgentCapability[] | undefined {
  const expertType = getExpertType(role);
  if (expertType === undefined) {
    return undefined;
  }
  return BUILT_IN_EXPERTS[expertType].capabilities;
}
