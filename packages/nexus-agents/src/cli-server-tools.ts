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
  registerResearchQueryTool,
  registerResearchAddTool,
  registerResearchDiscoverTool,
  registerResearchAnalyzeTool,
  registerResearchCatalogReviewTool,
  createDefaultDeps,
} from './mcp/index.js';
// Import mock directly from source (not public API - used as fallback when no adapter)
import { createMockTechLead } from './mcp/tools/orchestrate.js';
import type { Expert } from './agents/index.js';
import { createRealWorkflowEngine } from './workflows/index.js';
import type { IModelAdapter, WorkflowDefinition } from './core/index.js';
import { createTechLead } from './agents/index.js';
import type { ILogger } from './core/index.js';
import { NexusError, ErrorCode } from './core/index.js';
import { runStpaSafetyAnalysis, StpaSafetyError } from './cli-server-stpa.js';

// Re-export for public API
export { StpaSafetyError };

/**
 * Error thrown when TechLead orchestration is unavailable.
 * (Source: Issue #554 - Fix silent mock TechLead fallback)
 */
export class TechLeadUnavailableError extends NexusError {
  constructor(message: string) {
    super(message, { code: ErrorCode.MODEL_UNAVAILABLE });
    this.name = 'TechLeadUnavailableError';
  }
}
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
  /**
   * Explicitly allow mock TechLead when no model adapter is available.
   * If false or undefined, an error is thrown when no adapter is detected.
   * (Source: Issue #554 - Fix silent mock TechLead fallback)
   */
  useMockTechLead?: boolean;
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
  /** Enable STPA safety analysis during tool registration (Issue #530) */
  enableStpaSafetyAnalysis?: boolean;
  /** Fail registration if high-severity hazards are found (Issue #530) */
  failOnHighSeverityHazards?: boolean;
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
  'research_query',
  'research_add',
  'research_discover',
  'research_analyze',
  'research_catalog_review',
] as const;

/**
 * Environment variable to enable mock TechLead orchestration.
 * NOT RECOMMENDED for production - mock results are heuristic-based.
 * (Source: Issue #540 - Add environment variable for mock orchestration)
 */
const MOCK_ORCHESTRATION_ENV = 'NEXUS_ALLOW_MOCK_ORCHESTRATION';

/**
 * Creates the TechLead instance for orchestration.
 * Uses real TechLead with model adapter when available.
 * (Source: Issue #442 - Wire up real TechLead)
 * (Source: Issue #554 - Require explicit opt-in for mock TechLead)
 * (Source: Issue #540 - Add environment variable support)
 *
 * @throws {TechLeadUnavailableError} When no adapter and mock not explicitly requested
 */
/* eslint-disable @typescript-eslint/no-deprecated -- Intentional: backwards compat, will migrate to IOrchestrator (Issue #595) */
function createTechLeadForOrchestration(
  modelAdapter: IModelAdapter | undefined,
  logger: ILogger,
  useMockTechLead?: boolean
): import('./mcp/tools/orchestrate.js').ITechLead {
  if (modelAdapter !== undefined) {
    return createTechLead({ adapter: modelAdapter, logger });
  }

  // Issue #554/#540: Check both config option and environment variable
  const envMockEnabled = process.env[MOCK_ORCHESTRATION_ENV] === 'true';
  const mockEnabled = useMockTechLead === true || envMockEnabled;

  if (mockEnabled) {
    const source = envMockEnabled ? `${MOCK_ORCHESTRATION_ENV} env var` : 'config';
    logger.warn(
      `Using mock TechLead as explicitly configured via ${source} (no real adapter available)`
    );
    return createMockTechLead();
  }

  throw new TechLeadUnavailableError(
    'No model adapter available and mock TechLead not explicitly enabled. ' +
      `Set useMockTechLead: true in config, or ${MOCK_ORCHESTRATION_ENV}=true, ` +
      'or configure an API key (ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_AI_API_KEY).'
  );
}
/* eslint-enable @typescript-eslint/no-deprecated */

/** Tool registration context passed to helpers. */
interface ToolRegistrationContext {
  server: McpServer;
  logger: ILogger;
  rateLimiterFactory: ReturnType<typeof createToolRateLimiterFactory>;
  modelAdapter?: IModelAdapter;
  builtInTemplates: Map<string, WorkflowDefinition>;
  /** Allow mock TechLead when no adapter (Issue #554) */
  useMockTechLead?: boolean;
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

/** Register expert tools with shared registry (Issue #661: wire security config). */
function registerExpertTools(ctx: ToolRegistrationContext): void {
  const sharedExpertRegistry = new Map<string, Expert>();
  const createExpertDeps = createDefaultDeps(
    ctx.rateLimiterFactory.getForTool('create_expert'),
    ctx.logger
  );
  createExpertDeps.expertRegistry = sharedExpertRegistry;
  if (ctx.securityConfig !== undefined) {
    createExpertDeps.security = ctx.securityConfig;
  }
  registerCreateExpertTool(ctx.server, createExpertDeps);

  registerExecuteExpertTool(ctx.server, {
    expertRegistry: sharedExpertRegistry,
    logger: ctx.logger,
    rateLimiter: ctx.rateLimiterFactory.getForTool('execute_expert'),
    ...(ctx.securityConfig !== undefined && { security: ctx.securityConfig }),
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

/** Register consensus tools (Issue #435, Issue #662: wire security config for timeout). */
function registerConsensusTools(ctx: ToolRegistrationContext): void {
  registerConsensusVoteTool(ctx.server, {
    logger: ctx.logger,
    rateLimiter: ctx.rateLimiterFactory.getForTool('consensus_vote'),
    ...(ctx.securityConfig !== undefined && { security: ctx.securityConfig }),
  });
}

/** Register research tools (research system enhancement). */
function registerResearchTools(ctx: ToolRegistrationContext): void {
  const researchDeps = {
    logger: ctx.logger,
    ...(ctx.securityConfig !== undefined && { security: ctx.securityConfig }),
  };
  registerResearchQueryTool(ctx.server, {
    ...researchDeps,
    rateLimiter: ctx.rateLimiterFactory.getForTool('research_query'),
  });
  registerResearchAddTool(ctx.server, {
    ...researchDeps,
    rateLimiter: ctx.rateLimiterFactory.getForTool('research_add'),
  });
  registerResearchDiscoverTool(ctx.server, {
    ...researchDeps,
    rateLimiter: ctx.rateLimiterFactory.getForTool('research_discover'),
  });
  registerResearchAnalyzeTool(ctx.server, {
    ...researchDeps,
    rateLimiter: ctx.rateLimiterFactory.getForTool('research_analyze'),
  });
  registerResearchCatalogReviewTool(ctx.server, {
    ...researchDeps,
    rateLimiter: ctx.rateLimiterFactory.getForTool('research_catalog_review'),
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

  // Issue #554: Pass useMockTechLead to require explicit opt-in for mock
  const techLead = createTechLeadForOrchestration(
    ctx.modelAdapter,
    ctx.logger,
    ctx.useMockTechLead
  );
  registerOrchestrateTool(ctx.server, {
    techLead,
    logger: ctx.logger,
    rateLimiter: ctx.rateLimiterFactory.getForTool('orchestrate'),
    security: ctx.securityConfig,
  });
}

/** Runs STPA analysis if enabled in options. */
function maybeRunStpaAnalysis(options: RegisterMcpToolsOptions, logger: ILogger): void {
  const enableStpa = options.enableStpaSafetyAnalysis ?? false;
  if (!enableStpa) return;

  logger.info('Running STPA safety analysis on registered tools');
  runStpaSafetyAnalysis(logger, options.failOnHighSeverityHazards ?? false);
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
    useMockTechLead,
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
    ...(useMockTechLead !== undefined && { useMockTechLead }),
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
  registerResearchTools(ctx);
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

  // Run STPA safety analysis if enabled (Issue #530)
  maybeRunStpaAnalysis(options, logger);
}
