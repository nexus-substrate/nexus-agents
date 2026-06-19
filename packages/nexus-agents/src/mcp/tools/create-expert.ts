/**
 * nexus-agents/mcp - Create Expert Tool
 *
 * MCP tool for creating expert agents dynamically.
 * Supports built-in expert types: code, architecture, security, documentation, testing, devops, research, pm, ux.
 *
 * @module mcp/tools/create-expert
 * (Refactored: Issue #531 - Use createSecureHandlerFactory)
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ILogger, AgentCapability } from '../../core/index.js';
import { createLogger, formatZodError } from '../../core/index.js';
import {
  toolStructuredError,
  toolSuccess,
  type ToolResult,
  type BaseMcpToolDeps,
} from './tool-result.js';
import type { RateLimiter } from '../middleware/rate-limiter.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import {
  ExpertFactory,
  Expert,
  type BuiltInExpertType,
  BUILT_IN_EXPERTS,
} from '../../agents/index.js';
import type { ICliDetectionCache } from '../../cli-adapters/cli-detection-cache.js';
import { requireAdapterAvailable } from '../middleware/adapter-availability.js';
import type { IModelAdapter } from '../../core/index.js';
import { getToolAnnotations } from '../tool-annotations.js';
import {
  resolveAdapterForModelPreference,
  resolveAdapterForRole,
} from './create-expert-routing.js';
import { recordExpertCreated, recordExpertError } from './create-expert-recording.js';

/**
 * Canonical, single-source list of roles `create_expert` can create.
 *
 * This is the ONE place a creatable role is added or removed. Both the exported
 * {@link CreateExpertInputSchema} and the runtime `toolSchema` registered with
 * the MCP server derive their `role` enum from this list, so the schema MCP
 * clients see can never drift from the exported one (was #3978: the registered
 * enum had silently dropped `data_visualization_expert`). A parity test in
 * `create-expert.test.ts` enforces set-equality across all three.
 *
 * This is a deliberate, curated SUBSET of the full configured expert roster
 * (see `BUILT_IN_EXPERTS` / `EXPERT_TYPE_TO_ROLE` in expert-config.ts). Every
 * entry here MUST be a real configured built-in expert; not every configured
 * expert is exposed for ad-hoc creation (e.g. `qa_expert` is configured but not
 * listed here). Each role below maps to a `BuiltInExpertType` via
 * {@link ROLE_TO_EXPERT_TYPE}.
 */
export const CREATE_EXPERT_ROLES = [
  'code_expert',
  'architecture_expert',
  'security_expert',
  'documentation_expert',
  'testing_expert',
  'devops_expert',
  'research_expert',
  'pm_expert',
  'ux_expert',
  'infrastructure_expert',
  'data_visualization_expert',
] as const;

/**
 * Input schema for create_expert tool.
 */
export const CreateExpertInputSchema = z.object({
  role: z.enum(CREATE_EXPERT_ROLES).describe('Expert role to create'),
  modelPreference: z
    .string()
    .max(100)
    .optional()
    .describe('Preferred model (e.g., claude-sonnet-4)'),
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
export interface CreateExpertDeps extends BaseMcpToolDeps {
  /** Expert factory for creating experts */
  expertFactory: IExpertFactory;
  /** Registry to track created experts */
  expertRegistry: Map<string, Expert>;
  /** Optional CLI detection cache for checking available CLIs (Issue #747) */
  cliCache?: ICliDetectionCache;
  /** Model adapter for expert execution (Issue #808) */
  modelAdapter?: import('../../core/index.js').IModelAdapter;
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
  research_expert: 'research',
  pm_expert: 'pm',
  ux_expert: 'ux',
  infrastructure_expert: 'infrastructure',
  qa_expert: 'qa',
  data_visualization_expert: 'data-visualization',
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
  modelPreference?: string,
  role?: string
): { ok: true; value: Expert } | { ok: false; error: string } {
  const logger = deps.logger ?? createLogger({ tool: 'create_expert' });
  const options: Record<string, unknown> = {};
  if (modelPreference !== undefined) {
    options.modelOverrides = { modelId: modelPreference };
  }
  // Wire model adapter:
  // 1. Explicit modelPreference → resolve to CLI adapter (Issue #827)
  // 2. No preference → auto-route via specialization matrix (Issue #858)
  // 3. Fallback → deps.modelAdapter
  let adapter: IModelAdapter | undefined;
  if (modelPreference !== undefined) {
    adapter = resolveAdapterForModelPreference(modelPreference, deps.modelAdapter, logger);
  } else if (role !== undefined) {
    adapter = resolveAdapterForRole(role, deps.modelAdapter, logger);
  } else {
    adapter = deps.modelAdapter;
  }
  if (adapter !== undefined) {
    options.adapter = adapter;
  }

  const factoryOptions = Object.keys(options).length > 0 ? options : undefined;
  const result = deps.expertFactory.createBuiltIn(expertType, factoryOptions);

  if (!result.ok) {
    return { ok: false, error: result.error.message };
  }

  return { ok: true, value: result.value };
}

/**
 * Handles the create_expert tool execution.
 * (Issue #747 - Now async to support CLI detection)
 */
async function handleCreateExpert(
  deps: CreateExpertDeps,
  args: CreateExpertInput
): Promise<{ ok: true; value: CreateExpertResponse } | { ok: false; error: string }> {
  const { role, modelPreference } = args;

  // Map role to expert type
  const expertType = getExpertType(role);
  if (expertType === undefined) {
    return { ok: false, error: `Invalid role: ${role}` };
  }

  // Validate adapter availability before expert creation (Issue #656, #747, #749)
  const adapterError = await requireAdapterAvailable(deps.cliCache);
  if (adapterError !== undefined) {
    return { ok: false, error: adapterError };
  }

  // Create expert (pass role for auto-routing when no modelPreference given)
  const createResult = createExpertFromFactory(deps, expertType, modelPreference, role);
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
type CreateExpertToolResponse = ToolResult;

/**
 * Creates the core handler logic for create_expert tool.
 * Rate limiting is handled by createSecureHandler wrapper.
 * @param deps - Tool dependencies
 * @returns Context-aware handler function
 */
function createCreateExpertHandler(deps: CreateExpertDeps) {
  return async (args: unknown, ctx: HandlerContext): Promise<CreateExpertToolResponse> => {
    // Validate input
    const validationResult = CreateExpertInputSchema.safeParse(args);
    if (!validationResult.success) {
      return toolStructuredError({
        errorCategory: 'validation',
        message: `Validation error: ${formatZodError(validationResult.error)}`,
      });
    }

    // Execute tool logic (now async for CLI detection - Issue #747)
    const result = await handleCreateExpert(deps, validationResult.data);

    if (!result.ok) {
      recordExpertError(validationResult.data.role, result.error);
      // #3624: creation is not a model execution — no OutcomeStore row.
      return toolStructuredError({
        errorCategory: 'internal',
        message: `Failed to create expert: ${result.error}`,
      });
    }

    recordExpertCreated(result.value.role, result.value.expertId);

    ctx.logger.info('Expert created', {
      expertId: result.value.expertId,
      role: result.value.role,
      model: validationResult.data.modelPreference ?? 'default',
    });

    return toolSuccess(JSON.stringify(result.value, null, 2));
  };
}

/**
 * Registers the create_expert tool with the MCP server.
 *
 * Uses createSecureHandler for standardized security middleware (Issue #531).
 * Includes timeout protection for CVE-2026-0621 mitigation (Issue #271).
 *
 * @category MCP
 * @param server - MCP server instance
 * @param deps - Tool dependencies
 */
export function registerCreateExpertTool(server: McpServer, deps: CreateExpertDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'create_expert' });
  const toolSchema = {
    // Derived from the single-source CREATE_EXPERT_ROLES so the registered enum
    // can never drift from the exported CreateExpertInputSchema (#3978).
    role: z.enum(CREATE_EXPERT_ROLES).describe('Expert role to create'),
    modelPreference: z
      .string()
      .max(100)
      .optional()
      .describe('Preferred model (e.g., claude-sonnet-4)'),
  };

  const description =
    'Create a specialized expert agent for code, architecture, security, documentation, testing, devops, research, product management, UX, infrastructure, or data visualization tasks';

  // Wrap handler with secure handler for rate limiting and request context (Issue #531)
  const secureHandler = createSecureHandler(createCreateExpertHandler(deps), {
    toolName: 'create_expert',
    rateLimiter: deps.rateLimiter,
    logger,
  });

  // Wrap with timeout protection (Issue #271, CVE-2026-0621, Issue #661)
  const timeoutMs = getToolTimeout('create_expert', deps.security);
  const wrappedHandler = wrapToolWithTimeout('create_expert', secureHandler, { timeoutMs, logger });

  server.registerTool(
    'create_expert',
    { description, inputSchema: toolSchema, annotations: getToolAnnotations('create_expert') },
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
  return {
    expertFactory: ExpertFactory,
    expertRegistry: new Map<string, Expert>(),
    rateLimiter,
    ...(logger !== undefined ? { logger } : {}),
  };
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
