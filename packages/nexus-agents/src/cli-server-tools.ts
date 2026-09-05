/* eslint-disable max-lines -- Cohesive tool registration module (governance: cohesive single-registration-surface). Holds the manifest-seeded HANDLER_TABLE (#3266): one declarative row per MCP tool, so the line count tracks the tool count by design. */
/**
 * nexus-agents CLI Server Tool Registration
 *
 * MCP tool registration and configuration. The registration surface is
 * table-driven (#3266): {@link HANDLER_TABLE} maps each canonical
 * `TOOL_MANIFEST` entry to its handler, and {@link registerToolCategories}
 * drives registration by walking the manifest in order. The manifest stays the
 * single source of truth; {@link assertHandlerManifestParity} fails loudly if
 * the table and the manifest ever disagree.
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
  registerPrReviewTool,
  registerSupplyChainTradeoffPanelTool,
  registerRegistryImportTool,
  registerRepoAnalyzeTool,
  registerRepoSecurityPlanTool,
  registerIssueTriageTool,
  registerRunGraphWorkflowTool,
  registerExecuteSpecTool,
  registerQueryTraceTool,
  registerQueryTaskStateTool,
  registerGetJobResultTool,
  registerListJobsTool,
  registerCancelJobTool,
  registerCiHealthCheckTool,
  registerRunQualityGateTool,
  registerSuggestResearchTasksTool,
  registerListAvailableModelsTool,
  registerRunTool,
  registerVerifyAuditChainTool,
  registerExtractSymbolsTool,
  registerSearchCodebaseTool,
  registerSearchUsagesTool,
  createDefaultDeps,
} from './mcp/index.js';
import { createMockOrchestrator } from './mcp/tools/orchestrate-types.js';
import { OrchestratorFactory } from './orchestration/orchestrator-factory.js';
import type { IOrchestrator } from './core/types/orchestrator.js';
import { registerDevPipelineTool } from './mcp/tools/dev-pipeline-tool.js';
import { registerPipelineTool } from './mcp/tools/pipeline-tool.js';

import type { Expert } from './agents/index.js';
import { createRealWorkflowEngine } from './workflows/index.js';
import type { IModelAdapter, WorkflowDefinition } from './core/index.js';
import { getErrorMessage, NexusError, ErrorCode } from './core/index.js';

import { Orchestrator } from './agents/index.js';
import type { ILogger } from './core/index.js';
import { runStpaSafetyAnalysis, StpaSafetyError } from './cli-server-stpa.js';
import { getPipelinePluginRegistry } from './pipeline/core-plugins.js';
import { getPipelineEventBus } from './pipeline/event-bus.js';
import { createEventBusBridge } from './pipeline/event-bus-bridge.js';
import { startTuneStage } from './pipeline/tune-stage.js';
import { configureUntrustedInputFirewall } from './dogfooding/untrusted-input-firewall.js';
import {
  getSwarmObserver,
  startSwarmHealthSignals,
  startFailoverSignals,
} from './observability/index.js';
import { startImprovementReviewScheduler } from './mcp/tools/improvement-review-scheduler.js';
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
// Imported from the module rather than the barrel: the registration tests mock
// the middleware barrel wholesale, and the staged-rollout assertion has to see
// the real registry rather than a mock that would report whatever it was told.
import {
  setGlobalPolicyFirewall,
  stagePolicyFirewallForRollout,
} from './mcp/middleware/policy-registry.js';
import { setSecureHandlerAuditLogger } from './mcp/middleware/secure-handler.js';
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
   * In-process gateway model adapters (one per discovered gateway model, #4040).
   * Threaded to consensus_vote/pr_review so voters route through the gateway
   * instead of a CLI subprocess. Omitted ⇒ voters use the CLI path.
   */
  gatewayAdapters?: readonly IModelAdapter[];
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
  /** Immutable audit sink for self-tuning routing mutations (#3323) */
  auditLogger?: import('./audit/audit-types.js').IAuditLogger;
  /** Enable STPA safety analysis during tool registration (Issue #530) */
  enableStpaSafetyAnalysis?: boolean;
  /** Fail registration if high-severity hazards are found (Issue #530) */
  failOnHighSeverityHazards?: boolean;
  /** Gateway config for tier-aware dispatch logging (Issue #896) */
  gatewayConfig?: GatewayConfig;
}

/**
 * All tools that are registered in the MCP server.
 *
 * Aliased from `REGISTERED_TOOL_NAMES` in `mcp/tools/index.ts` — the single
 * source of truth that `inject-governance.ts` reads via `extractMcpTools` and
 * syncs to `server.json` (PR #2362). As of #3597 `REGISTERED_TOOL_NAMES` is the
 * derived NAME list of the object-shaped `TOOL_MANIFEST` (`TOOL_MANIFEST.map(t =>
 * t.name)`), so `REGISTERED_TOOLS` stays a `readonly string[]` of tool names.
 * Aliased here to preserve the existing `REGISTERED_TOOLS` export consumed by
 * `tool-annotations.test.ts` and the allowlist-status logging in
 * `registerToolCategories` (Issue #2935 closes the duplicate hand-maintained array).
 */
import { REGISTERED_TOOL_NAMES } from './mcp/index.js';
import type { RegisteredToolName } from './mcp/tools/tool-manifest.js';
export const REGISTERED_TOOLS = REGISTERED_TOOL_NAMES;

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
    // Cast removed in #2944 — `OrchestratorFactoryConfig.techLead` is now
    // `OrchestratorAgentLike`, which `Orchestrator.execute(task: Task)`
    // satisfies directly via Result-covariance.
    const factory = new OrchestratorFactory({
      logger,
      techLead: orchestratorAgent,
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
  /** In-process gateway model adapters threaded to voters (#4040). */
  gatewayAdapters?: readonly IModelAdapter[];
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
  /**
   * Durable, hash-chained audit logger (#3710). Threaded so `run_dev_pipeline`'s
   * consensus→execute policy gate persists `policy.evaluated` decisions to the
   * shared store. Optional — absent on the pure-CLI path.
   */
  auditLogger?: import('./audit/audit-types.js').IAuditLogger;
}

/**
 * Checks whether a tool should be registered based on the allowlist.
 * When no allowlist is set, all tools are allowed.
 * (Source: Issue #740 - tool allowlisting)
 */
function isToolAllowed(toolName: string, allowlist?: Set<string>): boolean {
  return allowlist === undefined || allowlist.has(toolName);
}

/**
 * Per-pass resources shared by tools whose registration must wire the SAME
 * object (the expert registry shared by create/execute_expert; the workflow
 * engine shared by run/list_workflows). Lazily constructed once per
 * registration pass and memoized so each member of a group sees the identical
 * instance — behaviour-identical to the former grouped helper functions.
 */
interface SharedResources {
  expertRegistry(): Map<string, Expert>;
  workflowEngine(): ReturnType<typeof createRealWorkflowEngine>;
}

/** Builds the lazily-memoized {@link SharedResources} for one registration pass. */
function createSharedResources(ctx: ToolRegistrationContext): SharedResources {
  let experts: Map<string, Expert> | undefined;
  let engine: ReturnType<typeof createRealWorkflowEngine> | undefined;
  return {
    expertRegistry(): Map<string, Expert> {
      experts ??= new Map<string, Expert>();
      return experts;
    },
    workflowEngine(): ReturnType<typeof createRealWorkflowEngine> {
      engine ??= buildWorkflowEngine(ctx);
      return engine;
    },
  };
}

/** A tool handler resolves all deps from the pass context + shared resources. */
type ToolHandler = (ctx: ToolRegistrationContext, shared: SharedResources) => void;

// --- Grouped-tool registration (shared deps) -------------------------------

/** create_expert (Issue #661: wire security config, #808: wire adapter). */
function registerCreateExpert(ctx: ToolRegistrationContext, shared: SharedResources): void {
  const createExpertDeps = createDefaultDeps(
    ctx.rateLimiterFactory.getForTool('create_expert'),
    ctx.logger
  );
  createExpertDeps.expertRegistry = shared.expertRegistry();
  if (ctx.securityConfig !== undefined) {
    createExpertDeps.security = ctx.securityConfig;
  }
  // Wire model adapter so experts can execute (Issue #808)
  if (ctx.modelAdapter !== undefined) {
    createExpertDeps.modelAdapter = ctx.modelAdapter;
  }
  registerCreateExpertTool(ctx.server, createExpertDeps);
}

/** execute_expert — shares the create_expert registry (Issue #808). */
function registerExecuteExpert(ctx: ToolRegistrationContext, shared: SharedResources): void {
  registerExecuteExpertTool(ctx.server, {
    expertRegistry: shared.expertRegistry(),
    logger: ctx.logger,
    rateLimiter: ctx.rateLimiterFactory.getForTool('execute_expert'),
    cliCache: getSharedCliCache(),
    ...(ctx.securityConfig !== undefined && { security: ctx.securityConfig }),
    // #4097: thread the durable logger so ClawGuard AUDIT-mode violations during
    // the expert's nested tool calls are persisted to the shared hash chain.
    ...(ctx.auditLogger !== undefined && { auditLogger: ctx.auditLogger }),
  });
}

/** Builds the workflow engine shared by run_workflow + list_workflows. */
function buildWorkflowEngine(
  ctx: ToolRegistrationContext
): ReturnType<typeof createRealWorkflowEngine> {
  const wfConfig = ctx.workflowConfig;
  const engineConfig = {
    builtInTemplates: ctx.builtInTemplates,
    logger: ctx.logger,
    // Wire workflow config to engine settings (Issue #487)
    ...(wfConfig?.timeout !== undefined && { defaultTimeoutMs: wfConfig.timeout }),
    ...(wfConfig?.maxParallel !== undefined && { maxConcurrency: wfConfig.maxParallel }),
    ...(wfConfig?.templatesDir !== undefined && { templatePaths: [wfConfig.templatesDir] }),
  };
  // LISTING engine (#5116). `list_workflows` and run_workflow's template
  // resolution only call listTemplates/getTemplateByName/loadTemplate — they
  // never execute. `useMockExecutor` is passed because the #507 fail-safe
  // throws at CONSTRUCTION when nothing can execute for real, and this engine
  // must be constructible on a fresh install with no credentials. The mock
  // executor it installs is unreachable from every caller of this engine; the
  // executing engine is resolved separately, below.
  return createRealWorkflowEngine({ ...engineConfig, useMockExecutor: true });
}

/**
 * Builds the engine that actually EXECUTES workflow steps (#5116).
 *
 * Throws `WorkflowExecutionUnavailableError` when no model adapter resolved.
 * Callers MUST invoke this lazily — at `run_workflow` call time, not at tool
 * registration — because throwing during `registerMcpTools` takes down all 47
 * tools over one unconfigured adapter.
 *
 * Before #5116 this case silently became `useMockExecutor: true`, so every step
 * returned `status: 'success'` with "Executed step X with action Y" for work
 * that never ran.
 */
function buildExecutingWorkflowEngine(
  ctx: ToolRegistrationContext
): ReturnType<typeof createRealWorkflowEngine> {
  const wfConfig = ctx.workflowConfig;
  const engineConfig = {
    builtInTemplates: ctx.builtInTemplates,
    logger: ctx.logger,
    ...(wfConfig?.timeout !== undefined && { defaultTimeoutMs: wfConfig.timeout }),
    ...(wfConfig?.maxParallel !== undefined && { maxConcurrency: wfConfig.maxParallel }),
    ...(wfConfig?.templatesDir !== undefined && { templatePaths: [wfConfig.templatesDir] }),
  };
  return createRealWorkflowEngine(
    ctx.modelAdapter !== undefined
      ? { ...engineConfig, modelAdapter: ctx.modelAdapter }
      : engineConfig
  );
}

/** run_workflow — shares the workflow engine with list_workflows. */
function registerRunWorkflow(ctx: ToolRegistrationContext, shared: SharedResources): void {
  registerRunWorkflowTool(ctx.server, {
    workflowEngine: shared.workflowEngine(),
    resolveExecutionEngine: (): ReturnType<typeof createRealWorkflowEngine> =>
      buildExecutingWorkflowEngine(ctx),
    logger: ctx.logger,
    rateLimiter: ctx.rateLimiterFactory.getForTool('run_workflow'),
  });
}

/** list_workflows — shares the workflow engine with run_workflow. */
function registerListWorkflows(ctx: ToolRegistrationContext, shared: SharedResources): void {
  registerListWorkflowsTool(ctx.server, {
    logger: ctx.logger,
    workflowEngine: shared.workflowEngine(),
    rateLimiter: ctx.rateLimiterFactory.getForTool('list_workflows'),
  });
}

/**
 * consensus_vote — threads the in-process gateway adapters (#4040) so voters
 * route through the gateway instead of a CLI subprocess when one is configured.
 * Mirrors the standard deps (logger/rateLimiter/security/auditLogger) + adds
 * gatewayAdapters.
 */
function registerConsensusVote(ctx: ToolRegistrationContext): void {
  registerConsensusVoteTool(ctx.server, {
    logger: ctx.logger,
    rateLimiter: ctx.rateLimiterFactory.getForTool('consensus_vote'),
    ...(ctx.securityConfig !== undefined && { security: ctx.securityConfig }),
    ...(ctx.auditLogger !== undefined && { auditLogger: ctx.auditLogger }),
    ...(ctx.gatewayAdapters !== undefined && { gatewayAdapters: ctx.gatewayAdapters }),
  });
}

/** pr_review — threads gateway adapters (#4040) like consensus_vote. */
function registerPrReview(ctx: ToolRegistrationContext): void {
  registerPrReviewTool(ctx.server, {
    logger: ctx.logger,
    rateLimiter: ctx.rateLimiterFactory.getForTool('pr_review'),
    ...(ctx.securityConfig !== undefined && { security: ctx.securityConfig }),
    ...(ctx.auditLogger !== undefined && { auditLogger: ctx.auditLogger }),
    ...(ctx.gatewayAdapters !== undefined && { gatewayAdapters: ctx.gatewayAdapters }),
  });
}

/** run — threads gateway adapters (#4042) so the consensus strategy routes
 * voters through the gateway, matching consensus_vote/pr_review (#4040). */
function registerRun(ctx: ToolRegistrationContext): void {
  registerRunTool(ctx.server, {
    logger: ctx.logger,
    rateLimiter: ctx.rateLimiterFactory.getForTool('run'),
    ...(ctx.securityConfig !== undefined && { security: ctx.securityConfig }),
    ...(ctx.auditLogger !== undefined && { auditLogger: ctx.auditLogger }),
    ...(ctx.gatewayAdapters !== undefined && { gatewayAdapters: ctx.gatewayAdapters }),
  });
}

/** delegate_to_model — independent; does not require a model adapter. */
function registerDelegate(ctx: ToolRegistrationContext): void {
  registerDelegateToModelTool(ctx.server, {
    logger: ctx.logger,
    rateLimiter: ctx.rateLimiterFactory.getForTool('delegate_to_model'),
    // Wire FeedbackIntegration for closed-loop learning (Issue #490)
    ...(ctx.feedbackIntegration !== undefined && { feedbackIntegration: ctx.feedbackIntegration }),
  });
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
      // #4097: thread the durable logger so ClawGuard AUDIT-mode violations
      // during nested tool calls are persisted to the shared hash chain.
      ...(ctx.auditLogger !== undefined && { auditLogger: ctx.auditLogger }),
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

/** Optional registration-option keys copied verbatim into the tool context. */
const OPTIONAL_CONTEXT_KEYS = [
  'modelAdapter',
  'gatewayAdapters',
  'useMockTechLead',
  'policyFirewall',
  'executionMode',
  'allowedPaths',
  'securityConfig',
  'workflowConfig',
  'feedbackIntegration',
  'auditLogger',
] as const satisfies readonly (keyof RegisterMcpToolsOptions & keyof ToolRegistrationContext)[];

/** Copies optional properties from registration options, excluding undefined values. */
function copyOptionalProps(opts: RegisterMcpToolsOptions): Partial<ToolRegistrationContext> {
  const result: Record<string, unknown> = {};
  for (const key of OPTIONAL_CONTEXT_KEYS) {
    const value = opts[key];
    if (value !== undefined) result[key] = value;
  }
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
    executionMode: info.executionMode ?? 'read-only',
  });

  // #4888: the firewall now reaches every secure handler through the policy
  // registry, so this reports the mode it will actually apply — read off the
  // firewall after `stagePolicyFirewallForRollout` has staged it, not a
  // constant. The staging call logs the configured-vs-effective pair and the
  // opt-in; this line exists so the registration record names the mode too.
  if (info.policyFirewall !== undefined) {
    const mode = info.policyFirewall.getMode();
    // Not "all tools": upstream MCP proxies are registered with a raw handler
    // (`initUpstreamServers`), so they never reach `createSecureHandler` and the
    // firewall does not see them. Naming the covered set beats a claim a
    // spot-check would find false.
    logger.info('Policy firewall wired to locally registered tools', {
      policyMode: mode,
      denialsApplied: mode === 'enforce',
      coveredTools: activeTools.length,
      upstreamProxiesUncovered: true,
    });
  }
}

/** Builds standard deps for a tool that needs only logger + rate limiter (+ optional security). */
function buildStandardDeps(
  ctx: ToolRegistrationContext,
  toolName: string
): {
  logger: ILogger;
  rateLimiter: ReturnType<ReturnType<typeof createToolRateLimiterFactory>['getForTool']>;
  security?: import('./config/index.js').SecurityConfig;
  auditLogger?: import('./audit/audit-types.js').IAuditLogger;
} {
  return {
    logger: ctx.logger,
    rateLimiter: ctx.rateLimiterFactory.getForTool(toolName),
    ...(ctx.securityConfig !== undefined && { security: ctx.securityConfig }),
    // #3710 threaded this for `run_dev_pipeline` alone, because it was then the
    // only tool consuming a durable auditLogger. #4987 changed that: the MCP
    // `PolicyFirewall` now evaluates rules on EVERY tool, and
    // `secure-handler.ts:261` emits the policy decision only `if (pResult &&
    // config.auditLogger)`. Withholding the logger left that emit unreachable
    // for the 38 tools registered through `standardHandler` — a policy denial
    // on any of them could never reach the chain, in enforce mode or warn
    // (#4991). Threading it does not emit anything on its own; it makes the
    // existing emit reachable.
    ...(ctx.auditLogger !== undefined ? { auditLogger: ctx.auditLogger } : {}),
  };
}

/**
 * Builds a {@link ToolHandler} for a tool whose only dependency is the standard
 * logger + rate-limiter + optional security envelope built by
 * {@link buildStandardDeps}. The `as never` is the same dep-erasure the former
 * `STANDALONE_TOOLS` loop used: each `register*Tool` validates its own deps
 * shape, and these all accept the standard envelope.
 */
function standardHandler(
  name: RegisteredToolName,
  register: (server: McpServer, deps: never) => void
): ToolHandler {
  return (ctx) => {
    register(ctx.server, buildStandardDeps(ctx, name) as never);
  };
}

/**
 * Table-driven MCP tool registry, SEEDED FROM the canonical {@link TOOL_MANIFEST}
 * (#3266). One handler per manifest entry — adding a tool is now: add the
 * manifest entry (already required) + add ONE handler row here. The
 * `Record<RegisteredToolName, ToolHandler>` type makes the compiler reject any
 * row whose key is not a manifest tool, and {@link assertHandlerManifestParity}
 * fails loudly at registration if a manifest entry has no handler (or vice
 * versa). The manifest stays the single source of truth; this derives from it.
 *
 * Tools that must share a wired instance (create/execute_expert; run/
 * list_workflows) resolve it from {@link SharedResources} so the shared object
 * is identical across the group — behaviour-identical to the former grouped
 * helper functions. `orchestrate` keeps its graceful-degrade wrapper.
 */
const HANDLER_TABLE: Record<RegisteredToolName, ToolHandler> = {
  // Core routing/orchestration
  orchestrate: (ctx) => {
    registerOrchestrateToolSafe(ctx);
  },
  delegate_to_model: (ctx) => {
    registerDelegate(ctx);
  },
  // Expert lifecycle (shared registry)
  create_expert: registerCreateExpert,
  execute_expert: registerExecuteExpert,
  list_experts: standardHandler('list_experts', registerListExpertsTool),
  // Workflow (shared engine)
  run_workflow: registerRunWorkflow,
  list_workflows: registerListWorkflows,
  // Research
  research_query: standardHandler('research_query', registerResearchQueryTool),
  research_add: standardHandler('research_add', registerResearchAddTool),
  research_add_source: standardHandler('research_add_source', registerResearchAddSourceTool),
  research_discover: standardHandler('research_discover', registerResearchDiscoverTool),
  research_analyze: standardHandler('research_analyze', registerResearchAnalyzeTool),
  research_catalog_review: standardHandler(
    'research_catalog_review',
    registerResearchCatalogReviewTool
  ),
  research_synthesize: standardHandler('research_synthesize', registerResearchSynthesizeTool),
  survey_oss_landscape: standardHandler('survey_oss_landscape', registerSurveyOssLandscapeTool),
  vendor_publishing_audit: standardHandler(
    'vendor_publishing_audit',
    registerVendorPublishingAuditTool
  ),
  compare_data_feeds: standardHandler('compare_data_feeds', registerCompareDataFeedsTool),
  // Memory observability
  memory_query: standardHandler('memory_query', registerMemoryQueryTool),
  memory_stats: standardHandler('memory_stats', registerMemoryStatsTool),
  memory_write: standardHandler('memory_write', registerMemoryWriteTool),
  // Standalone tools
  consensus_vote: (ctx) => {
    registerConsensusVote(ctx);
  },
  weather_report: standardHandler('weather_report', registerWeatherReportTool),
  improvement_review: standardHandler('improvement_review', registerImprovementReviewTool),
  registry_import: standardHandler('registry_import', registerRegistryImportTool),
  repo_analyze: standardHandler('repo_analyze', registerRepoAnalyzeTool),
  repo_security_plan: standardHandler('repo_security_plan', registerRepoSecurityPlanTool),
  issue_triage: standardHandler('issue_triage', registerIssueTriageTool),
  run_graph_workflow: standardHandler('run_graph_workflow', registerRunGraphWorkflowTool),
  execute_spec: standardHandler('execute_spec', registerExecuteSpecTool),
  query_trace: standardHandler('query_trace', registerQueryTraceTool),
  query_task_state: standardHandler('query_task_state', registerQueryTaskStateTool),
  get_job_result: standardHandler('get_job_result', registerGetJobResultTool),
  list_jobs: standardHandler('list_jobs', registerListJobsTool),
  cancel_job: standardHandler('cancel_job', registerCancelJobTool),
  ci_health_check: standardHandler('ci_health_check', registerCiHealthCheckTool),
  run_quality_gate: standardHandler('run_quality_gate', registerRunQualityGateTool),
  suggest_research_tasks: standardHandler(
    'suggest_research_tasks',
    registerSuggestResearchTasksTool
  ),
  list_available_models: standardHandler('list_available_models', registerListAvailableModelsTool),
  run: (ctx) => {
    registerRun(ctx);
  },
  verify_audit_chain: standardHandler('verify_audit_chain', registerVerifyAuditChainTool),
  extract_symbols: standardHandler('extract_symbols', registerExtractSymbolsTool),
  search_codebase: standardHandler('search_codebase', registerSearchCodebaseTool),
  search_usages: standardHandler('search_usages', registerSearchUsagesTool),
  run_dev_pipeline: standardHandler('run_dev_pipeline', registerDevPipelineTool),
  run_pipeline: standardHandler('run_pipeline', registerPipelineTool),
  pr_review: (ctx) => {
    registerPrReview(ctx);
  },
  supply_chain_tradeoff_panel: standardHandler(
    'supply_chain_tradeoff_panel',
    registerSupplyChainTradeoffPanelTool
  ),
};

/**
 * Fails LOUDLY if the handler table and the manifest disagree (#3266 negative
 * guard). The `Record<RegisteredToolName, …>` type already rejects an orphan
 * handler at compile time, and a missing handler makes the literal
 * non-assignable — so this runtime check is the belt to the compiler's
 * suspenders, and the thing the parity test exercises directly. Exported for
 * the parity/negative tests.
 */
export function assertHandlerManifestParity(): void {
  const manifestNames = new Set<string>(REGISTERED_TOOL_NAMES);
  const handlerNames = new Set<string>(Object.keys(HANDLER_TABLE));
  const missing = [...manifestNames].filter((n) => !handlerNames.has(n)).sort();
  const orphan = [...handlerNames].filter((n) => !manifestNames.has(n)).sort();
  if (missing.length > 0 || orphan.length > 0) {
    const missingLabel = missing.length === 1 ? 'entry' : 'entries';
    const orphanLabel = orphan.length === 1 ? 'handler' : 'handlers';
    throw new NexusError(
      `MCP tool handler table out of sync with TOOL_MANIFEST (#3266): ` +
        `${String(missing.length)} manifest ${missingLabel} with no handler ` +
        `[${missing.join(', ')}]; ` +
        `${String(orphan.length)} ${orphanLabel} with no manifest entry ` +
        `[${orphan.join(', ')}]`,
      { code: ErrorCode.INVALID_INPUT }
    );
  }
}

/** The tool names this registry resolves — exported for the parity test (#3266). */
export const HANDLER_TABLE_TOOL_NAMES: readonly string[] = Object.keys(HANDLER_TABLE);

/**
 * Drives registration off the manifest (#3266): for each tool in
 * `TOOL_MANIFEST` order, resolve its handler and run it unless blocked by the
 * allowlist. Order matches the manifest, which matches `server.json`.
 */
function registerToolCategories(ctx: ToolRegistrationContext): void {
  assertHandlerManifestParity();
  const allowlist = ctx.toolAllowlist;
  const shared = createSharedResources(ctx);
  for (const name of REGISTERED_TOOL_NAMES) {
    if (!isToolAllowed(name, allowlist)) continue;
    HANDLER_TABLE[name](ctx, shared);
  }
}

/** Registers one pass with its audit dependency visible to secure handlers. */
function registerSecureToolCategories(ctx: ToolRegistrationContext): void {
  setSecureHandlerAuditLogger(ctx.logger, ctx.auditLogger);
  try {
    registerToolCategories(ctx);
  } finally {
    setSecureHandlerAuditLogger(ctx.logger);
  }
}

/** Initializes V2 Pipeline OS subsystems and logs summary. (Phases B-C, Issues #921-#922) */
function initV2PipelineSubsystems(
  logger: ILogger,
  auditLogger?: import('./audit/audit-types.js').IAuditLogger
): void {
  const pluginRegistry = getPipelinePluginRegistry();
  const pipelineEventBus = getPipelineEventBus();
  const bridge = createEventBusBridge({ source: pipelineEventBus });
  // #5003: the EventBus → OutcomeStore bridge is GONE. `StageFailedEvent`
  // carries no `cli`, so it hardcoded `cli: 'claude'` + `category:
  // 'code_generation'` on every stage failure — the exact fabrication
  // `agent-executor.ts` documents (#2823) and refuses by skipping the record.
  // It was also double-counting: every `emitStageEvent(…, 'failed')` there is
  // paired with its own `recordOutcome`. `agent-executor` is now the single
  // canonical outcome writer (7-voter panel, Option A, 6/6 approvers,
  // audit record #77).
  // Close the self-tuning loop's consumer side: the shadow TuneStage subscribes
  // to signal.* events on the same typed bus (#3147; #3289 Option 2). Shadow
  // mode — logs intended actions, mutates nothing. Paired with
  // shutdownTuneStage() in cli-server.ts:createShutdownCleanup. The audit sink
  // (#3323) records each enforced routing demotion to the immutable log.
  startTuneStage(pipelineEventBus, auditLogger !== undefined ? { auditLogger } : undefined);
  // #4992: the shared untrusted-input firewall mirrors trust classifications to
  // the same durable log. Without this call its events live only in an
  // in-memory trail the next call clears, and the result says so
  // (`auditSink: 'none'`).
  configureUntrustedInputFirewall(auditLogger !== undefined ? { auditLogger } : {});
  // Close the loop's final producer: poll SwarmObserver health and emit
  // signal.swarm_unhealthy for CLI-attributable bottlenecks onto the same bus
  // (#3223). Paired with shutdownSwarmHealthSignals() in
  // cli-server.ts:createShutdownCleanup.
  startSwarmHealthSignals(getSwarmObserver(), pipelineEventBus);
  // Second, higher-reliability producer: re-emit adapter.failover events (which
  // carry the exact CliName) from bus B as signal.swarm_unhealthy on bus A
  // (#3321). Paired with shutdownFailoverSignals() in cli-server.ts.
  startFailoverSignals({ pipelineBus: pipelineEventBus });
  // Scheduled improvement_review (#3229): periodically runs the review so its
  // signal.fitness_declined fires without manual invocation. Disabled by
  // default (NEXUS_IMPROVEMENT_REVIEW_INTERVAL_MS); issue-filing is a separate
  // opt-in. Paired with shutdownImprovementReviewScheduler() in cli-server.ts.
  startImprovementReviewScheduler();
  const policyEngine = createDefaultPolicyEngine();
  const v2Config = resolveV2Config();
  logger.info('V2 Pipeline OS initialized', {
    plugins: pluginRegistry.listEnabled().length,
    bridged: bridge.forwarded(),
    feedbackSubscriber: 'active',
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

  // #4888: the firewall reached only a startup log line before this — no tool's
  // deps carried it, so no policy rule was ever evaluated. Staged into warn
  // mode unless the operator opts in; see `stagePolicyFirewallForRollout`.
  if (policyFirewall !== undefined) {
    setGlobalPolicyFirewall(stagePolicyFirewallForRollout(policyFirewall, logger));
  }

  initV2PipelineSubsystems(logger, options.auditLogger);

  const gatewayOptions = { ...options, server: observableServer };
  const ctx = createToolContext(gatewayOptions, toolInfra, rateLimiterFactory);
  registerSecureToolCategories(ctx);

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
