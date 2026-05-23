/* eslint-disable max-lines -- Cohesive tool registration module (governance: 400-600 OK if cohesive) */
/**
 * nexus-agents CLI Server Tool Registration
 *
 * MCP tool registration and configuration.
 *
 * @module cli-server-tools
 * (Source: Extracted from cli-server.ts for file size limits)
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerPrompts } from './mcp/prompts/index.js';
import { registerResources } from './mcp/resources/index.js';
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
  registerResearchAddSourceTool,
  registerResearchDiscoverTool,
  registerResearchAnalyzeTool,
  registerResearchCatalogReviewTool,
  registerResearchSynthesizeTool,
  registerSurveyOssLandscapeTool,
  registerVendorPublishingAuditTool,
  registerCompareDataFeedsTool,
  registerMemoryQueryTool,
  registerMemoryStatsTool,
  registerMemoryWriteTool,
  registerWeatherReportTool,
  registerImprovementReviewTool,
  registerRegistryImportTool,
  registerRepoAnalyzeTool,
  registerRepoSecurityPlanTool,
  registerIssueTriageTool,
  registerRunGraphWorkflowTool,
  registerExecuteSpecTool,
  registerQueryTraceTool,
  registerQueryTaskStateTool,
  registerVerifyAuditChainTool,
  registerExtractSymbolsTool,
  registerSearchCodebaseTool,
  createDefaultDeps,
} from './mcp/index.js';
import { createMockOrchestrator } from './mcp/tools/orchestrate-types.js';
import { OrchestratorFactory } from './orchestration/orchestrator-factory.js';
import type { IOrchestrator } from './core/types/orchestrator.js';
import { registerDevPipelineTool } from './mcp/tools/dev-pipeline-tool.js';
import { registerPipelineTool } from './mcp/tools/pipeline-tool.js';

import type { Expert } from './agents/index.js';
import { createRealWorkflowEngine } from './workflows/index.js';
import type { IModelAdapter, Result, WorkflowDefinition } from './core/index.js';
import { getErrorMessage, NexusError, ErrorCode } from './core/index.js';

import { Orchestrator } from './agents/index.js';
import type { ILogger } from './core/index.js';
import { runStpaSafetyAnalysis, StpaSafetyError } from './cli-server-stpa.js';
import { getPipelinePluginRegistry } from './pipeline/core-plugins.js';
import { getPipelineEventBus } from './pipeline/event-bus.js';
import { createEventBusBridge } from './pipeline/event-bus-bridge.js';
import { createDefaultPolicyEngine } from './pipeline/policy-engine.js';
import { resolveV2Config } from './pipeline/v2-config.js';
import { UpstreamClientManager } from './mcp/gateway/upstream-client.js';
import type { UpstreamServerConfig } from './config/schemas-gateway.js';

// Re-export for public API
export { StpaSafetyError };

/**
 * Error thrown when Orchestrator is unavailable (no model adapter configured).
 * (Source: Issue #554, renamed in Issue #759)
 */
export class OrchestratorUnavailableError extends NexusError {
  constructor(message: string) {
    super(message, { code: ErrorCode.MODEL_UNAVAILABLE });
    this.name = 'OrchestratorUnavailableError';
  }
}

import {
  createToolRateLimiterFactory,
  setGlobalToolRateLimiterFactory,
} from './mcp/middleware/index.js';
import { createGatewayServerProxy, type GatewayConfig } from './mcp/gateway/index.js';
import { getSharedCliCache } from './mcp/middleware/adapter-availability.js';
import { createAnnotationsProxy } from './mcp/tools/annotation-proxy.js';
import { createToolObservabilityProxy } from './mcp/tools/tool-observability-proxy.js';

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
  /** Gateway config for tier-aware dispatch logging (Issue #896) */
  gatewayConfig?: GatewayConfig;
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
  'survey_oss_landscape',
  'vendor_publishing_audit',
  'compare_data_feeds',
  'memory_query',
  'memory_stats',
  'memory_write',
  'weather_report',
  'issue_triage',
  'run_graph_workflow',
  'execute_spec',
  'registry_import',
  'query_trace',
  'repo_analyze',
  'repo_security_plan',
  'improvement_review',
] as const;

/**
 * Environment variable to enable mock TechLead orchestration.
 * NOT RECOMMENDED for production - mock results are heuristic-based.
 * (Source: Issue #540 - Add environment variable for mock orchestration)
 */
const MOCK_ORCHESTRATION_ENV = 'NEXUS_ALLOW_MOCK_ORCHESTRATION';

/**
 * Creates the Orchestrator instance for task orchestration.
 * Uses real Orchestrator with model adapter when available.
 * (Source: Issue #442 - Wire up real orchestrator)
 * (Source: Issue #554 - Require explicit opt-in for mock)
 * (Source: Issue #540 - Add environment variable support)
 * (Source: Issue #759 - Renamed from createTechLeadForOrchestration)
 *
 * @throws {OrchestratorUnavailableError} When no adapter and mock not explicitly requested
 */
function createOrchestratorForOrchestration(
  modelAdapter: IModelAdapter | undefined,
  logger: ILogger,
  useMockTechLead?: boolean
): IOrchestrator {
  if (modelAdapter !== undefined) {
    const orchestratorAgent = new Orchestrator({ adapter: modelAdapter, logger });
    const factory = new OrchestratorFactory({
      logger,
      techLead: orchestratorAgent as unknown as {
        execute: (task: unknown) => Promise<Result<unknown, unknown>>;
      },
    });
    return factory.create('orchestrator');
  }

  // Issue #554/#540: Check both config option and environment variable
  const envMockEnabled = process.env[MOCK_ORCHESTRATION_ENV] === 'true';
  const mockEnabled = useMockTechLead === true || envMockEnabled;

  if (mockEnabled) {
    const source = envMockEnabled ? `${MOCK_ORCHESTRATION_ENV} env var` : 'config';
    logger.warn(
      `Using mock orchestrator as explicitly configured via ${source} (no real adapter available)`
    );
    return createMockOrchestrator();
  }

  throw new OrchestratorUnavailableError(
    'No model adapter available and mock orchestrator not explicitly enabled. ' +
      `Set useMockTechLead: true in config, or ${MOCK_ORCHESTRATION_ENV}=true, ` +
      'or configure an API key (ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_AI_API_KEY).'
  );
}

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
  /** Tool allowlist from security config (Issue #740) */
  toolAllowlist?: Set<string>;
}

/**
 * Checks whether a tool should be registered based on the allowlist.
 * When no allowlist is set, all tools are allowed.
 * (Source: Issue #740 - tool allowlisting)
 */
function isToolAllowed(toolName: string, allowlist?: Set<string>): boolean {
  return allowlist === undefined || allowlist.has(toolName);
}

/** Register expert tools with shared registry (Issue #661: wire security config, #808: wire adapter). */
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
  // Wire model adapter so experts can execute (Issue #808)
  if (ctx.modelAdapter !== undefined) {
    createExpertDeps.modelAdapter = ctx.modelAdapter;
  }
  registerCreateExpertTool(ctx.server, createExpertDeps);

  registerExecuteExpertTool(ctx.server, {
    expertRegistry: sharedExpertRegistry,
    logger: ctx.logger,
    rateLimiter: ctx.rateLimiterFactory.getForTool('execute_expert'),
    cliCache: getSharedCliCache(),
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
      : { ...engineConfig, useMockExecutor: true }
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
  registerResearchAddSourceTool(ctx.server, {
    ...researchDeps,
    rateLimiter: ctx.rateLimiterFactory.getForTool('research_add_source'),
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
  registerResearchSynthesizeTool(ctx.server, {
    ...researchDeps,
    rateLimiter: ctx.rateLimiterFactory.getForTool('research_synthesize'),
  });
  registerSurveyOssLandscapeTool(ctx.server, {
    ...researchDeps,
    rateLimiter: ctx.rateLimiterFactory.getForTool('survey_oss_landscape'),
  });
  registerVendorPublishingAuditTool(ctx.server, {
    ...researchDeps,
    rateLimiter: ctx.rateLimiterFactory.getForTool('vendor_publishing_audit'),
  });
  registerCompareDataFeedsTool(ctx.server, {
    ...researchDeps,
    rateLimiter: ctx.rateLimiterFactory.getForTool('compare_data_feeds'),
  });
}

/** Register memory observability tools (Issue #751, #753). */
function registerMemoryTools(ctx: ToolRegistrationContext): void {
  const memoryDeps = {
    logger: ctx.logger,
    ...(ctx.securityConfig !== undefined && { security: ctx.securityConfig }),
  };
  registerMemoryQueryTool(ctx.server, {
    ...memoryDeps,
    rateLimiter: ctx.rateLimiterFactory.getForTool('memory_query'),
  });
  registerMemoryStatsTool(ctx.server, {
    ...memoryDeps,
    rateLimiter: ctx.rateLimiterFactory.getForTool('memory_stats'),
  });
  registerMemoryWriteTool(ctx.server, {
    ...memoryDeps,
    rateLimiter: ctx.rateLimiterFactory.getForTool('memory_write'),
  });
}

/** Register core routing and orchestration tools. */
function registerCoreTools(ctx: ToolRegistrationContext): void {
  // Register delegate_to_model independently — it doesn't need a model adapter
  registerDelegateToModelTool(ctx.server, {
    logger: ctx.logger,
    rateLimiter: ctx.rateLimiterFactory.getForTool('delegate_to_model'),
    // Wire FeedbackIntegration for closed-loop learning (Issue #490)
    ...(ctx.feedbackIntegration !== undefined && { feedbackIntegration: ctx.feedbackIntegration }),
  });

  // Register orchestrate — gracefully degrade if no adapter available
  registerOrchestrateToolSafe(ctx);
}

/** Registers orchestrate tool, logging a warning if no adapter is available. */
function registerOrchestrateToolSafe(ctx: ToolRegistrationContext): void {
  try {
    // Issue #554: Pass useMockTechLead to require explicit opt-in for mock
    const orchestrator = createOrchestratorForOrchestration(
      ctx.modelAdapter,
      ctx.logger,
      ctx.useMockTechLead
    );
    registerOrchestrateTool(ctx.server, {
      orchestrator,
      logger: ctx.logger,
      rateLimiter: ctx.rateLimiterFactory.getForTool('orchestrate'),
      security: ctx.securityConfig,
      // Wire model adapter for fallback orchestration path (Issue #827)
      modelAdapter: ctx.modelAdapter,
    });
  } catch (error) {
    const message = getErrorMessage(error);
    ctx.logger.warn('Orchestrate tool unavailable — no model adapter', {
      error: message,
      hint: 'Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_AI_API_KEY in .mcp.json env',
    });
  }
}

/** Initialize upstream MCP servers and register their tools as proxies (#1498). */
async function initUpstreamServers(
  gatewayConfig: GatewayConfig | undefined,
  server: McpServer,
  logger: ILogger
): Promise<void> {
  // GatewayConfig from the proxy module may include upstreamServers when Zod-parsed
  const upstreamServers = (gatewayConfig as Record<string, unknown> | undefined)?.[
    'upstreamServers'
  ] as readonly UpstreamServerConfig[] | undefined;
  if (upstreamServers === undefined || upstreamServers.length === 0) return;

  const manager = new UpstreamClientManager(logger);
  manager.registerServers(upstreamServers);
  await manager.connectEager();

  const tools = manager.getAllTools();
  logger.info('Upstream MCP servers initialized', {
    servers: upstreamServers.length,
    tools: tools.length,
  });

  // Register each upstream tool as a proxy on our server.
  // Use z.object({}).passthrough() since upstream schemas are JSON Schema, not Zod.
  const { z } = await import('zod');
  const passthroughSchema = z.looseObject({});
  for (const tool of tools) {
    const toolName = tool.name;
    const desc = tool.description ?? `Upstream tool: ${toolName}`;
    server.registerTool(
      toolName,
      { description: desc, inputSchema: passthroughSchema },
      async (args) => {
        const upstreamResult = await manager.callTool(toolName, args);
        const text =
          upstreamResult !== null ? JSON.stringify(upstreamResult) : 'Upstream tool not found';
        return { content: [{ type: 'text' as const, text }] };
      }
    );
  }
}

/** Runs STPA analysis if enabled in options. */
function maybeRunStpaAnalysis(options: RegisterMcpToolsOptions, logger: ILogger): void {
  const enableStpa = options.enableStpaSafetyAnalysis ?? false;
  if (!enableStpa) return;

  logger.info('Running STPA safety analysis on registered tools');
  runStpaSafetyAnalysis(logger, options.failOnHighSeverityHazards ?? false);
}

/** Copies optional properties from registration options, excluding undefined values. */
function copyOptionalProps(opts: RegisterMcpToolsOptions): Partial<ToolRegistrationContext> {
  const result: Partial<ToolRegistrationContext> = {};
  if (opts.modelAdapter !== undefined) result.modelAdapter = opts.modelAdapter;
  if (opts.useMockTechLead !== undefined) result.useMockTechLead = opts.useMockTechLead;
  if (opts.policyFirewall !== undefined) result.policyFirewall = opts.policyFirewall;
  if (opts.executionMode !== undefined) result.executionMode = opts.executionMode;
  if (opts.allowedPaths !== undefined) result.allowedPaths = opts.allowedPaths;
  if (opts.securityConfig !== undefined) result.securityConfig = opts.securityConfig;
  if (opts.workflowConfig !== undefined) result.workflowConfig = opts.workflowConfig;
  if (opts.feedbackIntegration !== undefined) result.feedbackIntegration = opts.feedbackIntegration;
  return result;
}

/** Creates tool registration context from options. */
function createToolContext(
  options: RegisterMcpToolsOptions,
  toolInfra: { logger: ILogger },
  rateLimiterFactory: ReturnType<typeof createToolRateLimiterFactory>
): ToolRegistrationContext {
  return {
    server: options.server,
    logger: toolInfra.logger,
    rateLimiterFactory,
    builtInTemplates: options.builtInTemplates,
    ...copyOptionalProps(options),
    ...(options.securityConfig?.toolAllowlist !== undefined && {
      toolAllowlist: new Set(options.securityConfig.toolAllowlist),
    }),
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

/** Logs tool registration summary and allowlist status. */
function logToolRegistration(
  logger: ILogger,
  allowlist: Set<string> | undefined,
  info: {
    rateLimiterFactory: ReturnType<typeof createToolRateLimiterFactory>;
    perToolConfig: Record<string, unknown> | undefined;
    builtInTemplates: Map<string, unknown>;
    modelAdapter: unknown;
    policyFirewall: { getMode(): string } | undefined;
    executionMode: string | undefined;
  }
): void {
  const activeTools = allowlist
    ? REGISTERED_TOOLS.filter((t) => allowlist.has(t))
    : [...REGISTERED_TOOLS];
  if (allowlist !== undefined) {
    logger.info('Tool allowlist active', {
      allowed: activeTools.length,
      total: REGISTERED_TOOLS.length,
      blocked: REGISTERED_TOOLS.filter((t) => !allowlist.has(t)),
    });
  }
  logger.info('Tools registered with per-tool rate limiting', {
    registeredTools: activeTools,
    rateLimitingEnabled: info.rateLimiterFactory.isEnabled(),
    customRateLimitsConfigured: info.perToolConfig !== undefined,
    builtInTemplateCount: info.builtInTemplates.size,
    realWorkflowExecution: info.modelAdapter !== undefined,
    realTechLead: info.modelAdapter !== undefined,
    policyFirewallEnabled: info.policyFirewall !== undefined,
    policyMode: info.policyFirewall?.getMode(),
    executionMode: info.executionMode ?? 'read-only',
  });
}

/** Checks if any tools in a category are allowed. */
function isCategoryAllowed(prefix: string, allowed: (name: string) => boolean): boolean {
  return REGISTERED_TOOLS.some((t) => t.startsWith(prefix) && allowed(t));
}

/** Checks if any of the given tool names are allowed. */
function anyToolAllowed(names: readonly string[], allowed: (name: string) => boolean): boolean {
  return names.some(allowed);
}

/** Builds standard deps for standalone tool registration. */
function buildStandardDeps(
  ctx: ToolRegistrationContext,
  toolName: string
): {
  logger: ILogger;
  rateLimiter: ReturnType<ReturnType<typeof createToolRateLimiterFactory>['getForTool']>;
  security?: import('./config/index.js').SecurityConfig;
} {
  return {
    logger: ctx.logger,
    rateLimiter: ctx.rateLimiterFactory.getForTool(toolName),
    ...(ctx.securityConfig !== undefined && { security: ctx.securityConfig }),
  };
}

/** Standalone tools: single tool name → single register function. */
const STANDALONE_TOOLS: ReadonlyArray<{
  readonly name: string;
  readonly register: (server: McpServer, deps: never) => void;
}> = [
  { name: 'consensus_vote', register: registerConsensusVoteTool },
  { name: 'weather_report', register: registerWeatherReportTool },
  { name: 'improvement_review', register: registerImprovementReviewTool },
  { name: 'registry_import', register: registerRegistryImportTool },
  { name: 'repo_analyze', register: registerRepoAnalyzeTool },
  { name: 'repo_security_plan', register: registerRepoSecurityPlanTool },
  { name: 'issue_triage', register: registerIssueTriageTool },
  { name: 'run_graph_workflow', register: registerRunGraphWorkflowTool },
  { name: 'execute_spec', register: registerExecuteSpecTool },
  { name: 'list_experts', register: registerListExpertsTool },
  { name: 'query_trace', register: registerQueryTraceTool },
  { name: 'query_task_state', register: registerQueryTaskStateTool },
  { name: 'verify_audit_chain', register: registerVerifyAuditChainTool },
  { name: 'extract_symbols', register: registerExtractSymbolsTool },
  { name: 'search_codebase', register: registerSearchCodebaseTool },
  { name: 'run_dev_pipeline', register: registerDevPipelineTool },
  { name: 'run_pipeline', register: registerPipelineTool },
];

/** Registers tool categories, skipping those blocked by allowlist. (Issue #740) */
function registerToolCategories(ctx: ToolRegistrationContext): void {
  const allowlist = ctx.toolAllowlist;
  const allowed = (name: string): boolean => isToolAllowed(name, allowlist);

  if (anyToolAllowed(['delegate_to_model', 'orchestrate'], allowed)) registerCoreTools(ctx);
  if (anyToolAllowed(['create_expert', 'execute_expert'], allowed)) registerExpertTools(ctx);
  if (anyToolAllowed(['run_workflow', 'list_workflows'], allowed)) registerWorkflowTools(ctx);
  if (isCategoryAllowed('research_', allowed)) registerResearchTools(ctx);
  if (isCategoryAllowed('memory_', allowed)) registerMemoryTools(ctx);
  for (const tool of STANDALONE_TOOLS) {
    if (allowed(tool.name)) tool.register(ctx.server, buildStandardDeps(ctx, tool.name) as never);
  }
}

/** Initializes V2 Pipeline OS subsystems and logs summary. (Phases B-C, Issues #921-#922) */
function initV2PipelineSubsystems(logger: ILogger): void {
  const pluginRegistry = getPipelinePluginRegistry();
  const pipelineEventBus = getPipelineEventBus();
  const bridge = createEventBusBridge({ source: pipelineEventBus });
  const policyEngine = createDefaultPolicyEngine();
  const v2Config = resolveV2Config();
  logger.info('V2 Pipeline OS initialized', {
    plugins: pluginRegistry.listEnabled().length,
    bridged: bridge.forwarded(),
    policyRules: policyEngine.listRules().length,
    v2Mode: v2Config.mode,
    policyMode: v2Config.policyMode,
  });
}

export function registerMcpTools(options: RegisterMcpToolsOptions): void {
  const {
    server,
    logger,
    builtInTemplates,
    modelAdapter,
    policyFirewall,
    executionMode,
    securityConfig,
    gatewayConfig,
  } = options;

  // Wrap server with gateway proxy (Issue #896) → annotations proxy (Issue #993) → observability (Issue #1186)
  const gatewayServer =
    gatewayConfig !== undefined ? createGatewayServerProxy(server, gatewayConfig) : server;
  const annotatedServer = createAnnotationsProxy(gatewayServer);
  const observableServer = createToolObservabilityProxy(annotatedServer, getPipelineEventBus());

  const toolInfra = registerTools(observableServer, { logger });

  const rateLimitConfig = securityConfig?.rateLimit;
  const perToolConfig = rateLimitConfig?.perTool;
  const rateLimiterFactory = createToolRateLimiterFactory({
    enabled: rateLimitConfig?.enabled ?? true,
    ...(perToolConfig !== undefined && { perTool: perToolConfig }),
    logger: toolInfra.logger,
  });
  setGlobalToolRateLimiterFactory(rateLimiterFactory);

  initV2PipelineSubsystems(logger);

  const gatewayOptions = { ...options, server: observableServer };
  const ctx = createToolContext(gatewayOptions, toolInfra, rateLimiterFactory);
  registerToolCategories(ctx);

  // Wire upstream MCP servers from gateway config (#1498). #2960: catch
  // rejections so an upstream-init failure surfaces in logs instead of
  // becoming an unhandled rejection (silent in default mode, crash in
  // --unhandled-rejections=strict).
  void initUpstreamServers(gatewayConfig, observableServer, logger).catch((error: unknown) => {
    logger.error(
      'Upstream MCP init failed',
      error instanceof Error ? error : new Error(String(error))
    );
  });

  // Register MCP prompts and resources (Issue #1287, #1288)
  registerPrompts(observableServer, logger);
  registerResources(observableServer, logger);

  logToolRegistration(logger, ctx.toolAllowlist, {
    rateLimiterFactory,
    perToolConfig,
    builtInTemplates,
    modelAdapter,
    policyFirewall,
    executionMode,
  });

  maybeRunStpaAnalysis(options, logger);
}
