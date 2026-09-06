/**
 * nexus-agents CLI Server
 *
 * Server startup and shutdown handling for the CLI.
 *
 * @module cli-server
 */

import {
  createServer,
  connectTransport,
  closeServer,
  type EventBusBridgeResult,
} from './mcp/index.js';
import { initializeBuiltInTemplates } from './workflows/index.js';
import { createUnifiedRegistry, type UnifiedAdapterRegistry } from './adapters/unified-registry.js';
import { MCP_TIMEOUTS } from './config/timeouts.js';
import { exitIfNestedSubprocessServer } from './cli-server-nesting-guard.js';
import { registerMcpTools } from './cli-server-tools.js';
import { parseTierOverrides, type GatewayConfig } from './mcp/gateway/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createLogger, type ILogger } from './core/index.js';
import { resolveWorkspaceRootFromClient } from './mcp/workspace-roots.js';
import { VERSION } from './version.js';
import { warnIfVersionStale } from './cli/version-check.js';
import { detectMode, type ServerMode, type ModeDetectionResult } from './cli/index.js';
import { EXIT_CODES } from './cli-types.js';
import {
  SwarmObserver,
  shutdownSwarmHealthSignals,
  shutdownFailoverSignals,
} from './observability/index.js';
import { initializeSandbox, getSandboxMode } from './security/sandbox/index.js';
import {
  initializeSwarmObserver,
  initializeEventBus,
  recordServerStartup,
  watchParentProcess,
  recordServerShutdown,
  logFinalHealthMetrics,
  logFinalEventBusStats,
  type ServerEventContext,
} from './cli-server-lifecycle.js';
import { startOrchestratorMode, type OrchestratorModeOptions } from './cli-orchestrator.js';
import {
  loadConfig,
  validateNexusEnv,
  type ConfigLoadResult,
  type AppConfig,
} from './config/index.js';
import { initializeExperts } from './cli-server-experts.js';
import { tryWireGatewayAdapters, resolveDefaultModelAdapter } from './cli-server-gateway.js';
import { initializeSkillLibrary } from './cli-server-skills.js';
import { initializeSica } from './cli-server-sica.js';
import { initializeFeedbackIntegration } from './cli-server-feedback.js';
import { initializeAuth } from './cli-server-auth.js';
import { shutdownToolMemory, configureToolMemory } from './mcp/tools/tool-memory.js';
import { shutdownExpertBridge } from './pipeline/expert-bridge.js';
import { shutdownPipelineEventBridge } from './pipeline/event-bus-bridge.js';
import { shutdownTuneStage } from './pipeline/tune-stage.js';
import { shutdownImprovementReviewScheduler } from './mcp/tools/improvement-review-scheduler.js';
import {
  initializeAuditLogger,
  shutdownAuditLogger,
  recordStartupComplete,
  recordStartupFailure,
  logSecurityConfig,
  getPolicyValues,
} from './cli-server-audit.js';
import type { AuditLogger } from './audit/index.js';

// Re-export for backward compatibility
export { type OrchestratorModeOptions } from './cli-orchestrator.js';

/**
 * Sets up graceful shutdown handlers.
 *
 * @param cleanup - Async cleanup function to call on shutdown
 * @param logger - Logger instance
 */
export function setupShutdownHandlers(cleanup: () => Promise<void>, logger: ILogger): void {
  let isShuttingDown = false;

  const handleShutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) {
      logger.debug('Shutdown already in progress, ignoring signal', { signal });
      return;
    }

    isShuttingDown = true;
    logger.info('Received shutdown signal', { signal });

    try {
      await cleanup();
      logger.info('Shutdown complete');
      process.exit(EXIT_CODES.SUCCESS);
    } catch (error) {
      logger.error(
        'Error during shutdown',
        error instanceof Error ? error : new Error(String(error))
      );
      process.exit(EXIT_CODES.SHUTDOWN_ERROR);
    }
  };

  // `handleShutdown` has an internal try/catch that calls `process.exit` on
  // both success and failure, so the chance of an unhandled rejection is
  // low. Attach `.catch` anyway — defence against future edits that might
  // throw synchronously before the try block, and to make the error path
  // explicit (#2163).
  const onSignal = (signal: string) => (): void => {
    handleShutdown(signal).catch((err: unknown) => {
      logger.error('Shutdown handler crashed', err instanceof Error ? err : new Error(String(err)));
      process.exit(EXIT_CODES.SHUTDOWN_ERROR);
    });
  };
  process.on('SIGINT', onSignal('SIGINT'));
  process.on('SIGTERM', onSignal('SIGTERM'));

  // Handle uncaught errors
  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught exception', error);
    process.exit(EXIT_CODES.SERVER_START_FAILED);
  });

  process.on('unhandledRejection', (reason: unknown) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    logger.error('Unhandled rejection', error);
    process.exit(EXIT_CODES.SERVER_START_FAILED);
  });
}

/**
 * Logs startup information and mode detection details.
 */
export function logStartupInfo(
  logger: ILogger,
  detectionResult: ModeDetectionResult,
  verbose: boolean
): void {
  logger.info('Starting Nexus Agents', {
    version: VERSION,
    mode: detectionResult.mode,
    modeSource: detectionResult.source,
    modeReason: detectionResult.reason,
    detectionTimeMs: detectionResult.detectionTimeMs.toFixed(2),
    nodeVersion: process.version,
    platform: process.platform,
  });

  if (verbose) {
    logger.debug('Mode detection signals', {
      stdinIsTty: detectionResult.signals.stdinIsTty,
      stdoutIsTty: detectionResult.signals.stdoutIsTty,
      mcpClientName: detectionResult.signals.mcpClientName,
      isCI: detectionResult.signals.isCI,
      ciPlatform: detectionResult.signals.ciPlatform,
      isContainer: detectionResult.signals.isContainer,
    });
  }
}

/**
 * Validates that the requested mode is implemented.
 * Exits with error for unimplemented modes (mesh only now).
 *
 * (Source: Issue #443 - Make unimplemented modes fail fast)
 * (Source: Issue #446 - Implement orchestrator mode)
 * (Source: Issue #932 - Remove misleading mesh claims)
 */
export function validateModeOrExit(logger: ILogger, mode: ServerMode): void {
  if (mode === 'mesh') {
    logger.error('Mesh mode is not yet implemented. Use --mode=server or --mode=orchestrator.');
    process.exit(EXIT_CODES.INVALID_ARGS);
  }
  // Orchestrator mode is now implemented (Issue #446)
}

/**
 * Loads and validates configuration from nexus-agents.yaml.
 * (Source: Issue #472 - Wire AppConfigSchema to runtime)
 */
function loadAndLogConfig(logger: ILogger): ConfigLoadResult {
  const result = loadConfig({ logger });

  if (!result.ok) {
    logger.error('Failed to load configuration', new Error(result.error.message));
    process.exit(EXIT_CODES.SERVER_START_FAILED);
  }

  const configResult = result.value;
  logger.info('Configuration loaded', {
    configPath: configResult.configPath ?? '(defaults)',
    usingDefaults: configResult.usingDefaults,
    warningCount: configResult.warnings.length,
    hasExperts: configResult.config.experts !== undefined,
    hasWorkflows: configResult.config.workflows !== undefined,
    hasSecurity: configResult.config.security !== undefined,
  });

  for (const warning of configResult.warnings) {
    logger.warn(warning);
  }

  return configResult;
}

/**
 * Options for creating the shutdown cleanup handler.
 */
interface ShutdownCleanupOptions {
  readonly eventBusBridge: EventBusBridgeResult;
  readonly observer: SwarmObserver;
  readonly eventContext: ServerEventContext;
  readonly server: McpServer;
  readonly serverLogger: ILogger;
  readonly logger: ILogger;
  /** Audit logger (if enabled) - Issue #740 Phase 2 */
  readonly auditLogger: AuditLogger | null;
}

/**
 * Creates the shutdown cleanup handler.
 */
function createShutdownCleanup(options: ShutdownCleanupOptions): () => Promise<void> {
  const { eventBusBridge, observer, eventContext, server, serverLogger, logger, auditLogger } =
    options;

  return async (): Promise<void> => {
    // Flush and close audit logger (Issue #740 Phase 2)
    await shutdownAuditLogger(auditLogger, logger);

    if (eventBusBridge.initialized) {
      logFinalEventBusStats(logger);
      eventBusBridge.cleanup();
    }

    recordServerShutdown(observer, eventContext);
    logFinalHealthMetrics(observer, logger);

    // Persist tool memory session to disk (Issue #690)
    shutdownToolMemory();

    // Cleanup the cached MCP-config tempdir (closes #2946)
    await shutdownExpertBridge();

    // Release the V2 pipeline → global event forwarder. This slot used to hold
    // `shutdownFeedbackSubscriber()`, which was an unconditional no-op: nothing
    // ever called `startFeedbackSubscriber`, because #5003's panel removed that
    // bridge on purpose. The forwarder is the subscription that WAS leaking.
    shutdownPipelineEventBridge();

    // Release the shadow TuneStage signal subscription (#3147)
    shutdownTuneStage();

    // Release the swarm-health signal poll timer (#3223)
    shutdownSwarmHealthSignals();

    // Release the adapter-failover signal subscription (#3321)
    shutdownFailoverSignals();

    // Release the scheduled improvement_review timer (#3229)
    shutdownImprovementReviewScheduler();

    const closeResult = await closeServer(server, serverLogger);
    if (!closeResult.ok) {
      throw new Error(closeResult.error.message);
    }
  };
}

/**
 * Creates the MCP server and handles creation failure.
 * Exits process with SERVER_START_FAILED if creation fails.
 *
 * @returns The server instance with server and logger properties
 */
function createAndValidateMcpServer(logger: ILogger): {
  readonly server: McpServer;
  readonly logger: ILogger;
} {
  const serverResult = createServer({
    name: 'nexus-agents',
    version: VERSION,
    logger,
  });

  if (!serverResult.ok) {
    logger.error('Failed to create MCP server', new Error(serverResult.error.message));
    process.exit(EXIT_CODES.SERVER_START_FAILED);
  }

  return serverResult.value;
}

/**
 * Initializes the sandbox for agent execution isolation.
 * Logs the sandbox configuration after initialization.
 *
 * @param logger - Logger for initialization messages
 * @param sandboxConfig - Optional sandbox configuration from security config (Issue #483)
 */
async function initializeAndLogSandbox(
  logger: ILogger,
  sandboxConfig?: import('./config/index.js').SandboxConfig
): Promise<void> {
  const sandboxResult = await initializeSandbox(sandboxConfig);
  logger.info('Sandbox initialized', {
    mode: getSandboxMode(),
    executor: sandboxResult.executor.name,
    usedFallback: sandboxResult.usedFallback,
    configuredMode: sandboxConfig?.mode ?? 'default',
  });
}

/**
 * Connects the MCP server to stdio transport.
 * Exits process with SERVER_START_FAILED if connection fails.
 */
async function connectToStdioTransport(
  server: McpServer,
  logger: ILogger,
  serverLogger: ILogger
): Promise<void> {
  // Defense-in-depth: stdio transport owns stdout for JSON-RPC frames.
  // Force stderr before the transport opens so no log line can corrupt it.
  logger.setDestination?.('stderr');
  serverLogger.setDestination?.('stderr');
  logger.info('Connecting to stdio transport');
  // Resolve the active workspace root from the client's declared MCP `roots`
  // (#3991) once the handshake completes, so per-repo `.nexus-agents/` state
  // lands in the repo being worked on rather than homedir. Set before connect
  // so the hook is in place when `notifications/initialized` arrives; fail-soft.
  server.server.oninitialized = () => {
    void resolveWorkspaceRootFromClient(server, serverLogger);
  };
  const transport = new StdioServerTransport();
  const connectResult = await connectTransport(server, transport, serverLogger);

  if (!connectResult.ok) {
    logger.error('Failed to connect MCP server', new Error(connectResult.error.message));
    process.exit(EXIT_CODES.SERVER_START_FAILED);
  }

  logger.info('MCP server started successfully');
}

/**
 * Creates the unified adapter registry with pre-computed task routing.
 * Adapter detection is still lazy (first use), but routing decisions
 * are computed once at startup from the canonical model registry.
 * (Source: Issue #1149 - Unified Adapter Registry)
 */
function createAdapterRegistry(logger: ILogger): UnifiedAdapterRegistry {
  return createUnifiedRegistry({
    logger,
    defaultCliTimeoutMs: MCP_TIMEOUTS.perTool['orchestrate'] ?? MCP_TIMEOUTS.defaultMs,
  });
}

/**
 * Builds gateway config from application config + runtime logger.
 * Converts schema-level string tier names to RequestTier enum values.
 * (Source: Issue #897)
 */
function buildGatewayConfig(config: AppConfig, logger: ILogger): GatewayConfig {
  const gatewaySection = config.gateway;
  const enabled = gatewaySection?.enabled !== false;
  const tierOverrides = parseTierOverrides(gatewaySection?.tierOverrides);
  return {
    enabled,
    logger,
    ...(tierOverrides !== undefined && { tierOverrides }),
  };
}

/**
 * Initializes and registers MCP tools with the server.
 * Handles template loading, model adapter detection, and tool registration.
 *
 * @param server - MCP server instance
 * @param logger - Logger for registration messages
 * @param policyFirewall - Policy firewall for authorization
 * @param config - Application configuration
 * @param feedbackIntegration - Optional FeedbackIntegration for closed-loop learning (Issue #490)
 */
async function initializeAndRegisterTools(
  server: import('@modelcontextprotocol/sdk/server/mcp.js').McpServer,
  logger: ILogger,
  policyFirewall: import('./mcp/middleware/index.js').IPolicyFirewall,
  config: import('./config/index.js').AppConfig,
  deps?: {
    feedbackIntegration?:
      import('./learning/feedback-integration.js').IFeedbackIntegration | undefined;
    auditLogger?: AuditLogger | null;
  }
): Promise<void> {
  const { feedbackIntegration, auditLogger } = deps ?? {};
  logger.info('Loading built-in workflow templates');
  const builtInTemplates = await initializeBuiltInTemplates();
  logger.info('Loaded built-in templates', { count: builtInTemplates.size });

  // Issue #1149: Unified registry — task routing computed at startup, detection lazy
  const adapterRegistry = createAdapterRegistry(logger);
  // #2502 (epic #2500 child 2): when the OpenAI-compat gateway is configured,
  // it becomes the default model adapter. In sandbox mode the gateway is the
  // only available channel to LLMs, so a missing or unreachable gateway is a
  // hard startup failure (see tryWireGatewayAdapter for the matrix). Outside
  // sandbox mode it's optional — falls through to the CLI-based default.
  const gatewayAdapters = await tryWireGatewayAdapters(logger);
  const modelAdapter = resolveDefaultModelAdapter(gatewayAdapters, adapterRegistry);
  const policyVals = getPolicyValues(config);
  const allowedPaths = config.security?.allowedPaths;
  const securityConfig = config.security;
  const workflowConfig = config.workflows;
  const toolsOptions = {
    server,
    logger,
    builtInTemplates,
    policyFirewall,
    executionMode: policyVals.defaultExec,
    modelAdapter,
    // Per-model gateway adapters routed to voters (#4040) — in-process, no subprocess.
    ...(gatewayAdapters !== undefined && { gatewayAdapters }),
    // Gateway middleware for tier-aware dispatch logging (Issue #896, #897)
    gatewayConfig: buildGatewayConfig(config, logger),
    ...(allowedPaths !== undefined && { allowedPaths }),
    ...(securityConfig !== undefined && { securityConfig }),
    ...(workflowConfig !== undefined && { workflowConfig }),
    ...(feedbackIntegration !== undefined && { feedbackIntegration }),
    ...(auditLogger !== null && auditLogger !== undefined && { auditLogger }),
  };
  registerMcpTools(toolsOptions);
}

/**
 * Applies logging configuration from config file.
 * (Source: Issue #485 - Wire logging config)
 */
function applyLoggingConfig(logger: ILogger, verbose: boolean, config: AppConfig): void {
  // Apply logging level from config - verbose flag takes precedence
  if (!verbose && config.logging?.level !== undefined) {
    logger.setLevel(config.logging.level);
    logger.debug('Log level set from configuration', { level: config.logging.level });
  }

  // Wire logging format (Issue #485)
  if (config.logging?.format !== undefined && logger.setFormat !== undefined) {
    logger.setFormat(config.logging.format);
    logger.debug('Log format set from configuration', { format: config.logging.format });
  }

  // Wire logging destination (Issue #485)
  if (config.logging?.destination !== undefined && logger.setDestination !== undefined) {
    logger.setDestination(config.logging.destination, config.logging.filePath);
    logger.debug('Log destination set from configuration', {
      destination: config.logging.destination,
      filePath: config.logging.filePath,
    });
  }
}

/**
 * Initializes all subsystems from configuration.
 *
 * Returns ONLY the components the caller (startServer) actually consumes
 * downstream. `policyFirewall` and `authInit` are used during tool
 * registration and auth wiring inside this function but are not referenced
 * after return — they stayed on the return shape historically and the
 * caller silently dropped them. Narrowed per #2154.
 */
async function initializeSubsystems(
  config: AppConfig,
  logger: ILogger
): Promise<{
  server: import('@modelcontextprotocol/sdk/server/mcp.js').McpServer;
  serverLogger: ILogger;
  observer: SwarmObserver;
  eventBusBridge: EventBusBridgeResult;
  auditLogger: AuditLogger | null;
}> {
  // Initialize experts from configuration (Issue #486)
  const expertResult = initializeExperts({ expertConfig: config.experts, logger });
  logger.debug('Expert system initialized', {
    builtIn: expertResult.builtInCount,
    custom: expertResult.customCount,
  });

  // #5097: memory.decay must reach the (still lazy) tool-memory singleton before
  // the skill library, whose belief promoter is the first thing that constructs
  // it. The only non-trivial outcome (already constructed) warns inside.
  configureToolMemory({ memoryConfig: config.memory, logger });

  // Initialize skill library from configuration (Issue #491)
  const skillsResult = await initializeSkillLibrary({ skillsConfig: config.skills, logger });
  logger.debug('Skill library initialization', {
    initialized: skillsResult.initialized,
    reason: skillsResult.reason,
  });

  // Initialize SICA self-improvement from configuration (Issue #492)
  const sicaResult = initializeSica({ sicaConfig: config.sica, logger });
  logger.debug('SICA initialization', {
    enabled: sicaResult.enabled,
    reason: sicaResult.reason,
  });

  // Initialize FeedbackIntegration for closed-loop learning (Issue #490)
  const feedbackResult = initializeFeedbackIntegration({ logger });
  logger.debug('FeedbackIntegration initialization', {
    initialized: feedbackResult.initialized,
    reason: feedbackResult.reason,
  });

  const { server, logger: serverLogger } = createAndValidateMcpServer(logger);

  // Wire observability config to SwarmObserver (Issue #493)
  const observer = initializeSwarmObserver(serverLogger, {
    maxEvents: config.observability?.swarmObserverMaxEvents,
  });
  // Wire EventBus config for A2A communication settings
  const eventBusBridge = initializeEventBus(observer, serverLogger, config.observability?.eventBus);

  await initializeAndLogSandbox(serverLogger, config.security?.sandbox);
  const policyFirewall = logSecurityConfig(serverLogger, config);
  const auditLogger = initializeAuditLogger(config.security, serverLogger);

  // Everything inside can throw, and a throw must reach the audit log as a
  // FAILED startup rather than leaving the earlier begin record unanswered
  // (#5577).
  await recordStartupFailure(auditLogger, 'subsystem_init', async () => {
    // Initialize authentication handler (Issue #739). Side effects only —
    // auth state is wired into the request pipeline inside initializeAuth.
    initializeAuth(config, serverLogger);
    // Pass FeedbackIntegration to tools for closed-loop learning (Issue #490)
    await initializeAndRegisterTools(server, serverLogger, policyFirewall, config, {
      feedbackIntegration: feedbackResult.feedbackIntegration,
      auditLogger,
    });
  });

  return { server, serverLogger, observer, eventBusBridge, auditLogger };
}

/**
 * Starts the MCP server with stdio transport.
 *
 * @param verbose - Whether to enable verbose logging
 * @param mode - Server mode (server or orchestrator)
 * @param modeWasExplicit - Whether mode was explicitly set via --mode flag
 * @param orchestratorOptions - Options for orchestrator mode (when mode is 'orchestrator')
 */
/**
 * Watchdog timeout for the server-mode startup sequence (#2163).
 *
 * If subsystem init, transport connect, or anything else on the path to
 * "waiting for requests" hangs past this deadline, we log and exit rather
 * than leave a zombie process. Chosen conservatively — subsystem init on
 * a fresh install has been observed ~5-8s, so 30s leaves ample headroom.
 */
const SERVER_STARTUP_TIMEOUT_MS = 30_000;

export async function startServer(
  verbose: boolean,
  mode: ServerMode,
  modeWasExplicit: boolean = false,
  orchestratorOptions?: OrchestratorModeOptions
): Promise<void> {
  const logger = createLogger({ component: 'cli' });
  if (verbose) logger.setLevel('debug');

  validateModeOrExit(logger, mode); // Fail fast for unimplemented modes (Issue #443)

  // Handle orchestrator mode separately (Issue #446)
  if (mode === 'orchestrator') {
    await startOrchestratorMode(orchestratorOptions ?? { verbose });
    return;
  }

  exitIfNestedSubprocessServer(logger); // #4033: server mode only (deadlock is stdio-bound)

  // Watchdog: if startup hangs, surface it rather than hang indefinitely
  // (#2163). Cleared once we reach "waiting for requests".
  const startupWatchdog = setTimeout(() => {
    logger.error(
      `Server startup exceeded ${String(SERVER_STARTUP_TIMEOUT_MS)}ms — aborting. ` +
        'Common causes: hung config load, blocked subsystem init, stdio transport stall.'
    );
    process.exit(EXIT_CODES.SERVER_START_FAILED);
  }, SERVER_STARTUP_TIMEOUT_MS);
  // Prevent the watchdog from keeping the process alive if everything shuts
  // down cleanly before it fires (for short-lived test harnesses).
  startupWatchdog.unref();

  logStartupInfo(logger, detectMode({ explicitMode: modeWasExplicit ? mode : undefined }), verbose);

  // Surface stale long-lived servers (#3283): best-effort, non-blocking warn if
  // the running build is behind the latest published version. Fire-and-forget —
  // never gates startup; fail-soft on offline/CI/dev.
  void warnIfVersionStale(logger);

  // Load and validate configuration (Issue #472)
  const configResult = loadAndLogConfig(logger);
  applyLoggingConfig(logger, verbose, configResult.config);

  validateNexusEnv(logger); // Warn-only env var validation (Issue #1016)

  // Initialize all subsystems
  const { server, serverLogger, observer, eventBusBridge, auditLogger } =
    await initializeSubsystems(configResult.config, logger);

  // Connect to transport
  await connectToStdioTransport(server, logger, serverLogger);

  // Record server startup event for observability
  const eventContext = recordServerStartup(observer);

  watchParentProcess(logger); // Issue #810: exit when the parent closes stdin

  // Setup graceful shutdown with observer and EventBus cleanup
  const cleanup = createShutdownCleanup({
    eventBusBridge,
    observer,
    eventContext,
    server,
    serverLogger,
    logger,
    auditLogger,
  });
  setupShutdownHandlers(cleanup, logger);

  // Startup complete — cancel the watchdog so it can't fire during request
  // handling (#2163).
  clearTimeout(startupWatchdog);
  // The startup COMPLETION record, written only here (#5577).
  recordStartupComplete(auditLogger, mode);
  logger.debug('Server running, waiting for requests...');
}
