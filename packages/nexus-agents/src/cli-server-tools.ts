/**
 * nexus-agents CLI Server Tool Registration
 *
 * MCP tool registration and configuration.
 *
 * @module cli-server-tools
 * (Source: Extracted from cli-server.ts for file size limits)
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  registerTools,
  registerDelegateToModelTool,
  registerOrchestrateTool,
  registerCreateExpertTool,
  registerRunWorkflowTool,
  registerListExpertsTool,
  registerListWorkflowsTool,
  createMockTechLead,
  createDefaultDeps,
} from './mcp/index.js';
import { createRealWorkflowEngine } from './workflows/index.js';
import type { IModelAdapter, WorkflowDefinition } from './core/index.js';
import { createTechLead } from './agents/index.js';
import type { ILogger } from './core/index.js';
import {
  createToolRateLimiterFactory,
  setGlobalToolRateLimiterFactory,
} from './mcp/middleware/index.js';

/**
 * Options for MCP tool registration.
 */
export interface RegisterMcpToolsOptions {
  server: McpServer;
  logger: ILogger;
  builtInTemplates: Map<string, WorkflowDefinition>;
  /** Optional model adapter for real workflow execution with expert agents */
  modelAdapter?: IModelAdapter;
}

/**
 * All tools that are registered in the MCP server.
 */
export const REGISTERED_TOOLS = [
  'delegate_to_model',
  'orchestrate',
  'create_expert',
  'run_workflow',
  'list_experts',
  'list_workflows',
] as const;

/**
 * Creates the TechLead instance for orchestration.
 * Uses real TechLead with model adapter when available, otherwise mock.
 * (Source: Issue #442 - Wire up real TechLead)
 */
function createTechLeadForOrchestration(
  modelAdapter: IModelAdapter | undefined,
  logger: ILogger
): import('./mcp/tools/orchestrate.js').ITechLead {
  if (modelAdapter !== undefined) {
    return createTechLead({ adapter: modelAdapter, logger });
  }
  return createMockTechLead();
}

/**
 * Registers MCP tools with per-tool rate limiting.
 * Must be called BEFORE connecting to transport.
 *
 * Uses ToolRateLimiterFactory to apply category-specific rate limits:
 * - orchestrate: 10 req/60s (expensive operations)
 * - delegate: 30 req/60s (model routing)
 * - workflow: 20 req/60s (workflow execution)
 * - expert: 60 req/60s (expert management)
 *
 * (Source: Issue #296 - Complete MCP tool rate limiting integration)
 * (Source: Issue #430 - Wire up real workflow engine)
 */
export function registerMcpTools(options: RegisterMcpToolsOptions): void {
  const { server, logger, builtInTemplates, modelAdapter } = options;
  const toolInfra = registerTools(server, { logger });

  // Create per-tool rate limiter factory
  const rateLimiterFactory = createToolRateLimiterFactory({
    enabled: true,
    logger: toolInfra.logger,
  });

  // Set global factory for access by other components
  setGlobalToolRateLimiterFactory(rateLimiterFactory);

  // Register tools with per-tool rate limiters
  registerDelegateToModelTool(server, {
    logger: toolInfra.logger,
    rateLimiter: rateLimiterFactory.getForTool('delegate_to_model'),
  });

  const techLead = createTechLeadForOrchestration(modelAdapter, toolInfra.logger);
  registerOrchestrateTool(server, {
    techLead,
    logger: toolInfra.logger,
    rateLimiter: rateLimiterFactory.getForTool('orchestrate'),
  });

  registerCreateExpertTool(
    server,
    createDefaultDeps(rateLimiterFactory.getForTool('create_expert'), toolInfra.logger)
  );

  // Workflow engine with real step execution when adapter available (Issue #430)
  const engineConfig = { builtInTemplates, logger: toolInfra.logger };
  const workflowEngine = createRealWorkflowEngine(
    modelAdapter !== undefined ? { ...engineConfig, modelAdapter } : engineConfig
  );
  registerRunWorkflowTool(server, {
    workflowEngine,
    logger: toolInfra.logger,
    rateLimiter: rateLimiterFactory.getForTool('run_workflow'),
  });

  // Discoverability tools (Issue #436)
  registerListExpertsTool(server, {
    logger: toolInfra.logger,
    rateLimiter: rateLimiterFactory.getForTool('list_experts'),
  });
  registerListWorkflowsTool(server, {
    logger: toolInfra.logger,
    workflowEngine,
    rateLimiter: rateLimiterFactory.getForTool('list_workflows'),
  });

  logger.info('Tools registered with per-tool rate limiting', {
    registeredTools: [...REGISTERED_TOOLS],
    rateLimitingEnabled: rateLimiterFactory.isEnabled(),
    builtInTemplateCount: builtInTemplates.size,
    realWorkflowExecution: modelAdapter !== undefined,
    realTechLead: modelAdapter !== undefined,
  });
}
