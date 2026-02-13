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
import { createResilientAdapter } from './adapters/resilient-adapter.js';
import { getStdinLifecycleMonitor } from './adapters/stdin-lifecycle.js';
import { registerMcpTools } from './cli-server-tools.js';
import { parseTierOverrides, type GatewayConfig } from './mcp/gateway/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createLogger, type ILogger } from './core/index.js';
import { VERSION } from './version.js';
import { detectMode, type ServerMode, type ModeDetectionResult } from './cli/index.js';
import { EXIT_CODES } from './cli-types.js';
import { SwarmObserver } from './observability/index.js';
import { initializeSandbox, getSandboxMode } from './security/sandbox/index.js';
import type { IPolicyFirewall } from './mcp/middleware/index.js';
import {
  initializeSwarmObserver,
  initializeEventBus,
  recordServerStartup,
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
import { initializeSkillLibrary } from './cli-server-skills.js';
import { initializeSica } from './cli-server-sica.js';
import { initializeFeedbackIntegration } from './cli-server-feedback.js';
import {
  extractRestConfig,
  startRestApiServer,
  stopRestApiServer,
  logRestApiConfig,
} from './cli-server-rest.js';
import type { RestApiServer } from './api/rest-server.js';
import { initializeAuth, type AuthInitResult } from './cli-server-auth.js';
import { shutdownToolMemory } from './mcp/tools/tool-memory.js';
import {
  initializeAuditLogger,
  shutdownAuditLogger,
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

  process.on('SIGINT', () => {
    void handleShutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void handleShutdown('SIGTERM');
  });

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
  /** REST API server (if started) - Issue #524 */
  readonly restServer: RestApiServer | null;
  /** Audit logger (if enabled) - Issue #740 Phase 2 */
  readonly auditLogger: AuditLogger | null;
}

/**
 * Creates the shutdown cleanup handler.
 */
function createShutdownCleanup(options: ShutdownCleanupOptions): () => Promise<void> {
  const {
    eventBusBridge,
    observer,
    eventContext,
    server,
    serverLogger,
    logger,
    restServer,
    auditLogger,
  } = options;

  return async (): Promise<void> => {
    // Stop REST API server first (Issue #524)
    await stopRestApiServer(restServer, logger);

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
  logger.info('Connecting to stdio transport');
  const transport = new StdioServerTransport();
  const connectResult = await connectTransport(server, transport, serverLogger);

  if (!connectResult.ok) {
    logger.error('Failed to connect MCP server', new Error(connectResult.error.message));
    process.exit(EXIT_CODES.SERVER_START_FAILED);
  }

  logger.info('MCP server started successfully');
}

/**
 * Creates a resilient model adapter with lazy detection and automatic failover.
 * Detection happens on first use, not at startup.
 * (Source: Issue #811 - Resilient model adapter architecture)
 * (Supersedes: Issue #554 - tryDetectModelAdapter one-shot detection)
 */
function createResilientModelAdapter(
  logger: ILogger
): import('./adapters/resilient-adapter-types.js').IResilientAdapter {
  return createResilientAdapter({ logger });
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
  feedbackIntegration?: import('./learning/feedback-integration.js').IFeedbackIntegration
): Promise<void> {
  logger.info('Loading built-in workflow templates');
  const builtInTemplates = await initializeBuiltInTemplates();
  logger.info('Loaded built-in templates', { count: builtInTemplates.size });

  // Issue #811: Resilient adapter — detection is lazy (first use, not startup)
  const modelAdapter = createResilientModelAdapter(logger);
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
    // Gateway middleware for tier-aware dispatch logging (Issue #896, #897)
    gatewayConfig: buildGatewayConfig(config, logger),
    ...(allowedPaths !== undefined && { allowedPaths }),
    ...(securityConfig !== undefined && { securityConfig }),
    ...(workflowConfig !== undefined && { workflowConfig }),
    ...(feedbackIntegration !== undefined && { feedbackIntegration }),
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
 * Returns the initialized components needed for server operation.
 */
async function initializeSubsystems(
  config: AppConfig,
  logger: ILogger
): Promise<{
  server: import('@modelcontextprotocol/sdk/server/mcp.js').McpServer;
  serverLogger: ILogger;
  observer: SwarmObserver;
  eventBusBridge: EventBusBridgeResult;
  policyFirewall: IPolicyFirewall;
  auditLogger: AuditLogger | null;
  authInit: AuthInitResult;
}> {
  // Initialize experts from configuration (Issue #486)
  const expertResult = initializeExperts({ expertConfig: config.experts, logger });
  logger.debug('Expert system initialized', {
    builtIn: expertResult.builtInCount,
    custom: expertResult.customCount,
  });

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

  // Initialize authentication handler (Issue #739)
  const authInit = initializeAuth(config, serverLogger);
  // Pass FeedbackIntegration to tools for closed-loop learning (Issue #490)
  await initializeAndRegisterTools(
    server,
    serverLogger,
    policyFirewall,
    config,
    feedbackResult.feedbackIntegration
  );

  return { server, serverLogger, observer, eventBusBridge, policyFirewall, auditLogger, authInit };
}

/**
 * Starts the MCP server with stdio transport.
 *
 * @param verbose - Whether to enable verbose logging
 * @param mode - Server mode (server or orchestrator)
 * @param modeWasExplicit - Whether mode was explicitly set via --mode flag
 * @param orchestratorOptions - Options for orchestrator mode (when mode is 'orchestrator')
 */
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

  const detectionResult = detectMode({ explicitMode: modeWasExplicit ? mode : undefined });
  logStartupInfo(logger, detectionResult, verbose);

  // Load and validate configuration (Issue #472)
  const configResult = loadAndLogConfig(logger);
  applyLoggingConfig(logger, verbose, configResult.config);

  validateNexusEnv(logger); // Warn-only env var validation (Issue #1016)

  // Initialize all subsystems
  const { server, serverLogger, observer, eventBusBridge, auditLogger, authInit } =
    await initializeSubsystems(configResult.config, logger);

  // Connect to transport
  await connectToStdioTransport(server, logger, serverLogger);

  // Start REST API server if enabled (Issue #524)
  const restConfig = extractRestConfig(configResult.config);
  logRestApiConfig(restConfig, logger);
  const restServer = await startRestApiServer(restConfig, logger, authInit.handler);

  // Record server startup event for observability
  const eventContext = recordServerStartup(observer);

  // Issue #810: Monitor stdin for parent process death to prevent zombie processes
  const stdinMonitor = getStdinLifecycleMonitor();
  stdinMonitor.start();
  stdinMonitor.onClose(() => {
    logger.warn('Parent process closed stdin, shutting down');
    process.exit(0);
  });

  // Setup graceful shutdown with observer, EventBus, and REST API cleanup
  const cleanup = createShutdownCleanup({
    eventBusBridge,
    observer,
    eventContext,
    server,
    serverLogger,
    logger,
    restServer,
    auditLogger,
  });
  setupShutdownHandlers(cleanup, logger);

  logger.debug('Server running, waiting for requests...');
}
