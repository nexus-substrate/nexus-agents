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
  createDefaultDeps,
} from './mcp/index.js';
// Import mock directly from source (not public API - used as fallback when no adapter)
import { createMockTechLead } from './mcp/tools/orchestrate.js';
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
  /** Policy firewall for authorization (Issue #477) */
  policyFirewall?: import('./mcp/middleware/index.js').IPolicyFirewall;
  /** Default execution mode for policy evaluation (Issue #477) */
  executionMode?: import('./mcp/middleware/index.js').ExecutionMode;
  /** Allowed paths from security config (Issue #477) */
  allowedPaths?: readonly string[];
  /** Security config for rate limiting and timeout (Issue #484) */
  securityConfig?: import('./config/index.js').SecurityConfig;
  /** Workflow config for engine settings (Issue #487) */
  workflowConfig?: import('./config/index.js').WorkflowConfig;
  /** FeedbackIntegration for closed-loop learning (Issue #490) */
  feedbackIntegration?: import('./learning/feedback-integration.js').IFeedbackIntegration;
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
  /** Policy firewall for authorization (Issue #477) */
  policyFirewall?: import('./mcp/middleware/index.js').IPolicyFirewall;
  /** Default execution mode (Issue #477) */
  executionMode?: import('./mcp/middleware/index.js').ExecutionMode;
  /** Allowed paths (Issue #477) */
  allowedPaths?: readonly string[];
  /** Security config for timeout settings (Issue #482) */
  securityConfig?: import('./config/index.js').SecurityConfig;
  /** FeedbackIntegration for closed-loop learning (Issue #490) */
  feedbackIntegration?: import('./learning/feedback-integration.js').IFeedbackIntegration;
  /** Workflow config for engine settings (Issue #487) */
  workflowConfig?: import('./config/index.js').WorkflowConfig;
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
  const wfConfig = ctx.workflowConfig;
  const engineConfig = {
    builtInTemplates: ctx.builtInTemplates,
    logger: ctx.logger,
    // Wire workflow config to engine settings (Issue #487)
    ...(wfConfig?.timeout !== undefined && { defaultTimeoutMs: wfConfig.timeout }),
    ...(wfConfig?.maxParallel !== undefined && { maxConcurrency: wfConfig.maxParallel }),
    ...(wfConfig?.templatesDir !== undefined && { templatePaths: [wfConfig.templatesDir] }),
  };
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

/** Register core routing and orchestration tools. */
function registerCoreTools(ctx: ToolRegistrationContext): void {
  registerDelegateToModelTool(ctx.server, {
    logger: ctx.logger,
    rateLimiter: ctx.rateLimiterFactory.getForTool('delegate_to_model'),
    // Wire FeedbackIntegration for closed-loop learning (Issue #490)
    ...(ctx.feedbackIntegration !== undefined && { feedbackIntegration: ctx.feedbackIntegration }),
  });

  const techLead = createTechLeadForOrchestration(ctx.modelAdapter, ctx.logger);
  registerOrchestrateTool(ctx.server, {
    techLead,
    logger: ctx.logger,
    rateLimiter: ctx.rateLimiterFactory.getForTool('orchestrate'),
    security: ctx.securityConfig,
  });
}

/** Creates tool registration context from options. */
function createToolContext(
  options: RegisterMcpToolsOptions,
  toolInfra: { logger: ILogger },
  rateLimiterFactory: ReturnType<typeof createToolRateLimiterFactory>
): ToolRegistrationContext {
  const {
    server,
    builtInTemplates,
    modelAdapter,
    policyFirewall,
    executionMode,
    allowedPaths,
    securityConfig,
    workflowConfig,
    feedbackIntegration,
  } = options;
  return {
    server,
    logger: toolInfra.logger,
    rateLimiterFactory,
    builtInTemplates,
    ...(modelAdapter !== undefined && { modelAdapter }),
    ...(policyFirewall !== undefined && { policyFirewall }),
    ...(executionMode !== undefined && { executionMode }),
    ...(allowedPaths !== undefined && { allowedPaths }),
    ...(securityConfig !== undefined && { securityConfig }),
    ...(workflowConfig !== undefined && { workflowConfig }),
    ...(feedbackIntegration !== undefined && { feedbackIntegration }),
  };
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
  const {
    server,
    logger,
    builtInTemplates,
    modelAdapter,
    policyFirewall,
    executionMode,
    securityConfig,
  } = options;
  const toolInfra = registerTools(server, { logger });

  const rateLimitConfig = securityConfig?.rateLimit;
  const perToolConfig = rateLimitConfig?.perTool;
  const rateLimitEnabled = rateLimitConfig?.enabled ?? true;
  const rateLimiterFactory = createToolRateLimiterFactory({
    enabled: rateLimitEnabled,
    ...(perToolConfig !== undefined && { perTool: perToolConfig }),
    logger: toolInfra.logger,
  });
  setGlobalToolRateLimiterFactory(rateLimiterFactory);

  const ctx = createToolContext(options, toolInfra, rateLimiterFactory);

  // Register all tool categories
  registerCoreTools(ctx);
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
    customRateLimitsConfigured: perToolConfig !== undefined,
    builtInTemplateCount: builtInTemplates.size,
    realWorkflowExecution: modelAdapter !== undefined,
    realTechLead: modelAdapter !== undefined,
    policyFirewallEnabled: policyFirewall !== undefined,
    policyMode: policyFirewall?.getMode(),
    executionMode: executionMode ?? 'read-only',
  });
}
