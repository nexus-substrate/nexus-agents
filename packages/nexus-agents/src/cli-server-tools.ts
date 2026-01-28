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
  registerExecuteExpertTool,
  registerRunWorkflowTool,
  registerListExpertsTool,
  registerListWorkflowsTool,
  registerConsensusVoteTool,
  createMockTechLead,
  createDefaultDeps,
} from './mcp/index.js';
import type { Expert } from './agents/index.js';
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
  'execute_expert',
  'run_workflow',
  'list_experts',
  'list_workflows',
  'consensus_vote',
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

/** Tool registration context passed to helpers. */
interface ToolRegistrationContext {
  server: McpServer;
  logger: ILogger;
  rateLimiterFactory: ReturnType<typeof createToolRateLimiterFactory>;
  modelAdapter?: IModelAdapter;
  builtInTemplates: Map<string, WorkflowDefinition>;
}

/** Register expert tools with shared registry. */
function registerExpertTools(ctx: ToolRegistrationContext): void {
  const sharedExpertRegistry = new Map<string, Expert>();
  const createExpertDeps = createDefaultDeps(
    ctx.rateLimiterFactory.getForTool('create_expert'),
    ctx.logger
  );
  createExpertDeps.expertRegistry = sharedExpertRegistry;
  registerCreateExpertTool(ctx.server, createExpertDeps);

  registerExecuteExpertTool(ctx.server, {
    expertRegistry: sharedExpertRegistry,
    logger: ctx.logger,
    rateLimiter: ctx.rateLimiterFactory.getForTool('execute_expert'),
  });
}

/** Register workflow tools. */
function registerWorkflowTools(ctx: ToolRegistrationContext): void {
  const engineConfig = { builtInTemplates: ctx.builtInTemplates, logger: ctx.logger };
  const workflowEngine = createRealWorkflowEngine(
    ctx.modelAdapter !== undefined
      ? { ...engineConfig, modelAdapter: ctx.modelAdapter }
      : engineConfig
  );
  registerRunWorkflowTool(ctx.server, {
    workflowEngine,
    logger: ctx.logger,
    rateLimiter: ctx.rateLimiterFactory.getForTool('run_workflow'),
  });
  registerListWorkflowsTool(ctx.server, {
    logger: ctx.logger,
    workflowEngine,
    rateLimiter: ctx.rateLimiterFactory.getForTool('list_workflows'),
  });
}

/** Register consensus tools (Issue #435). */
function registerConsensusTools(ctx: ToolRegistrationContext): void {
  registerConsensusVoteTool(ctx.server, {
    logger: ctx.logger,
    rateLimiter: ctx.rateLimiterFactory.getForTool('consensus_vote'),
  });
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

  const rateLimiterFactory = createToolRateLimiterFactory({
    enabled: true,
    logger: toolInfra.logger,
  });
  setGlobalToolRateLimiterFactory(rateLimiterFactory);

  const ctx: ToolRegistrationContext = {
    server,
    logger: toolInfra.logger,
    rateLimiterFactory,
    builtInTemplates,
    ...(modelAdapter !== undefined && { modelAdapter }),
  };

  // Register core tools
  registerDelegateToModelTool(server, {
    logger: ctx.logger,
    rateLimiter: rateLimiterFactory.getForTool('delegate_to_model'),
  });

  const techLead = createTechLeadForOrchestration(modelAdapter, ctx.logger);
  registerOrchestrateTool(server, {
    techLead,
    logger: ctx.logger,
    rateLimiter: rateLimiterFactory.getForTool('orchestrate'),
  });

  // Expert, workflow, and consensus tools (Issue #437, #430, #436, #435)
  registerExpertTools(ctx);
  registerWorkflowTools(ctx);
  registerConsensusTools(ctx);
  registerListExpertsTool(server, {
    logger: ctx.logger,
    rateLimiter: rateLimiterFactory.getForTool('list_experts'),
  });

  logger.info('Tools registered with per-tool rate limiting', {
    registeredTools: [...REGISTERED_TOOLS],
    rateLimitingEnabled: rateLimiterFactory.isEnabled(),
    builtInTemplateCount: builtInTemplates.size,
    realWorkflowExecution: modelAdapter !== undefined,
    realTechLead: modelAdapter !== undefined,
  });
}
