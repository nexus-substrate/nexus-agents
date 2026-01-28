/**
 * nexus-agents/mcp - Tools
 *
 * MCP tool implementations for the Nexus Agents server.
 *
 * (Source: MCP Protocol 2025-11-25)
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { ILogger } from '../../core/index.js';

import { createMcpLogger } from '../middleware/logging.js';
import { RateLimiter, createDefaultRateLimiter } from '../middleware/rate-limiter.js';

// Tool implementations
export {
  registerCreateExpertTool,
  createDefaultDeps,
  getAvailableRoles,
  getCapabilitiesForRole,
  CreateExpertInputSchema,
  type CreateExpertInput,
  type CreateExpertDeps,
  type CreateExpertResponse,
  type IExpertFactory,
} from './create-expert.js';

export {
  registerRunWorkflowTool,
  createMockWorkflowEngine,
  RunWorkflowInputSchema,
  type RunWorkflowDeps,
  type RunWorkflowInput,
  type WorkflowToolResult,
  type StepResultSummary,
  type DryRunResult,
} from './run-workflow.js';

export {
  registerOrchestrateTool,
  createMockTechLead,
  OrchestrateInputSchema,
  OrchestrateOutputSchema,
  OrchestrationError,
  type OrchestrateInput,
  type OrchestrateOutput,
  type OrchestrateDeps,
  type ITechLead,
  type IExpertFactory as IOrchestrateExpertFactory,
} from './orchestrate.js';

export {
  registerDelegateToModelTool,
  DelegateInputSchema,
  DelegateOutputSchema,
  MODEL_CAPABILITIES,
  type DelegateInput,
  type DelegateOutput,
  type DelegateDeps,
  type CapabilityProfile,
  type PreferredCapability,
} from './delegate-to-model.js';

export {
  registerListExpertsTool,
  ListExpertsInputSchema,
  type ListExpertsInput,
  type ListExpertsDeps,
  type ListExpertsResponse,
  type ExpertInfo,
} from './list-experts.js';

export {
  registerListWorkflowsTool,
  ListWorkflowsInputSchema,
  type ListWorkflowsInput,
  type ListWorkflowsDeps,
  type ListWorkflowsResponse,
  type WorkflowInfo,
} from './list-workflows.js';

export {
  registerExecuteExpertTool,
  ExecuteExpertInputSchema,
  type ExecuteExpertInput,
  type ExecuteExpertDeps,
  type ExecuteExpertResponse,
} from './execute-expert.js';

/**
 * Options for tool registration.
 */
export interface ToolRegistrationOptions {
  /** Logger instance for tool operations */
  readonly logger?: ILogger;
  /** Rate limiter for tool calls */
  readonly rateLimiter?: RateLimiter;
}

/**
 * Result of tool registration.
 */
export interface ToolRegistrationResult {
  /** Names of registered tools */
  readonly tools: readonly string[];
  /** Logger used for tool operations */
  readonly logger: ILogger;
  /** Rate limiter used for tool calls */
  readonly rateLimiter: RateLimiter;
}

/**
 * Registers all Nexus Agents tools on the MCP server.
 *
 * This function provides infrastructure and logging for tool registration.
 * Individual tools require their specific dependencies and should be
 * registered using their respective register functions:
 *
 * - `registerOrchestrateTool(server, { techLead, logger, rateLimiter })`
 * - `registerCreateExpertTool(server, { expertFactory, expertRegistry, logger, rateLimiter })`
 * - `registerRunWorkflowTool(server, { workflowEngine, logger, rateLimiter })`
 *
 * **Important:** Pass the `rateLimiter` from the result to each tool's register
 * function to enable rate limiting. Without it, tools will not be rate limited.
 *
 * @param server - The MCP server to register tools on
 * @param options - Optional configuration for tool registration
 * @returns Registration result with shared resources (logger, rate limiter)
 *
 * @example
 * ```typescript
 * const serverResult = createServer();
 * if (serverResult.ok) {
 *   const { server, logger } = serverResult.value;
 *   const { rateLimiter } = registerTools(server, { logger });
 *
 *   // Register individual tools with their dependencies and rate limiter
 *   registerOrchestrateTool(server, { techLead, logger, rateLimiter });
 *   registerCreateExpertTool(server, { expertFactory, expertRegistry, logger, rateLimiter });
 *   registerRunWorkflowTool(server, { workflowEngine, logger, rateLimiter });
 * }
 * ```
 */
export function registerTools(
  server: McpServer,
  options?: ToolRegistrationOptions
): ToolRegistrationResult {
  const logger = options?.logger ?? createMcpLogger({ component: 'tools' });
  const rateLimiter = options?.rateLimiter ?? createDefaultRateLimiter('mcp-tools', logger);

  logger.info('Tool registration infrastructure initialized');

  // Note: Individual tools are registered separately with their specific dependencies.
  // The available tools are:
  // - orchestrate: Task orchestration with TechLead agent
  // - create_expert: Dynamic expert agent creation
  // - run_workflow: Workflow template execution
  // - delegate_to_model: Capability-matched task routing (Phase 1 CLI integration)
  //
  // Use the exported register functions with appropriate dependencies.

  // Reference server to avoid unused parameter warning
  void server;

  return {
    tools: [
      'orchestrate',
      'create_expert',
      'execute_expert',
      'run_workflow',
      'delegate_to_model',
      'list_experts',
      'list_workflows',
    ],
    logger,
    rateLimiter,
  };
}

/**
 * MCP tool content types.
 */
export interface TextContent {
  readonly type: 'text';
  readonly text: string;
}

/**
 * MCP tool result.
 */
export interface ToolResult {
  readonly content: readonly TextContent[];
  readonly isError?: boolean;
}

/**
 * Creates a successful tool result.
 *
 * @param text - The result text
 * @returns A ToolResult with the text content
 */
export function toolSuccess(text: string): ToolResult {
  return {
    content: [{ type: 'text', text }],
  };
}

/**
 * Creates an error tool result.
 *
 * @param message - The error message
 * @returns A ToolResult with isError set to true
 */
export function toolError(message: string): ToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
  };
}
