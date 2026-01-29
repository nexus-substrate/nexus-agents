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
import { createAutoAdapter } from './adapters/auto-adapter.js';
import type { IModelAdapter } from './core/index.js';
import { registerMcpTools } from './cli-server-tools.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createLogger, type ILogger } from './core/index.js';
import { VERSION } from './version.js';
import { detectMode, type ServerMode, type ModeDetectionResult } from './cli/index.js';
import { EXIT_CODES } from './cli-types.js';
import { SwarmObserver } from './observability/index.js';
import { initializeSandbox, getSandboxMode } from './security/sandbox/index.js';
import { createDefaultPolicyFirewall } from './mcp/middleware/index.js';
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
import { loadConfig, type ConfigLoadResult, type AppConfig } from './config/index.js';
import { initializeExperts } from './cli-server-experts.js';
import { initializeSkillLibrary } from './cli-server-skills.js';
import { initializeSica } from './cli-server-sica.js';

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
 */
export function validateModeOrExit(logger: ILogger, mode: ServerMode): void {
  if (mode === 'mesh') {
    logger.error('Mesh mode is not yet implemented. Use --mode=server instead.');
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

/** Gets policy values from config. */
function getPolicyValues(config?: AppConfig): {
  mode: 'enforce' | 'warn';
  defaultExec: 'read-only' | 'read-write';
} {
  const policy = config?.security?.policy;
  return { mode: policy?.policyMode ?? 'enforce', defaultExec: policy?.defaultMode ?? 'read-only' };
}

/** Gets rate limit values from config. */
function getRateLimitValues(config?: AppConfig): { enabled: boolean; rpm: number } {
  const rl = config?.security?.rateLimit;
  return { enabled: rl?.enabled ?? true, rpm: rl?.requestsPerMinute ?? 60 };
}

/**
 * Creates and configures policy firewall from config.
 * (Source: Issue #477 - Wire policy firewall to config)
 */
function createConfiguredPolicyFirewall(
  logger: ILogger,
  config?: AppConfig
): ReturnType<typeof createDefaultPolicyFirewall> {
  const policyVals = getPolicyValues(config);
  return createDefaultPolicyFirewall({ mode: policyVals.mode, logger });
}

/**
 * Logs security configuration at startup.
 * Returns the configured policy firewall for use in tool registration.
 * (Source: Issue #185 Phase 1 - Startup security logging)
 * (Source: Issue #477 - Wire policy firewall to config)
 */
export function logSecurityConfig(
  logger: ILogger,
  config?: AppConfig
): ReturnType<typeof createDefaultPolicyFirewall> {
  const policyFirewall = createConfiguredPolicyFirewall(logger, config);
  const authEnabled = process.env['NEXUS_AUTH_ENABLED'] === 'true';
  const policyVals = getPolicyValues(config);
  const rateLimitVals = getRateLimitValues(config);

  logger.info('Security configuration', {
    policyMode: policyVals.mode,
    defaultExecutionMode: policyVals.defaultExec,
    policyRuleCount: policyFirewall.getRules().length,
    authEnabled,
    authMethod: process.env['NEXUS_AUTH_METHOD'] ?? 'none',
    rateLimitEnabled: rateLimitVals.enabled,
    rateLimitRequestsPerMinute: rateLimitVals.rpm,
    allowedPaths: config?.security?.allowedPaths ?? ['./'],
  });

  if (!authEnabled) {
    logger.warn('Authentication is disabled. Set NEXUS_AUTH_ENABLED=true to enable.');
  }

  logger.debug('Policy firewall rules', {
    rules: policyFirewall.getRules().map((r) => ({ name: r.name, description: r.description })),
  });

  return policyFirewall;
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
}

/**
 * Creates the shutdown cleanup handler.
 */
function createShutdownCleanup(options: ShutdownCleanupOptions): () => Promise<void> {
  const { eventBusBridge, observer, eventContext, server, serverLogger, logger } = options;

  return async (): Promise<void> => {
    if (eventBusBridge.initialized) {
      logFinalEventBusStats(logger);
      eventBusBridge.cleanup();
    }

    recordServerShutdown(observer, eventContext);
    logFinalHealthMetrics(observer, logger);

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
 * Attempts to auto-detect a model adapter for real workflow execution.
 * Returns undefined if no adapter is available (falls back to mock).
 */
async function tryDetectModelAdapter(logger: ILogger): Promise<IModelAdapter | undefined> {
  try {
    logger.info('Auto-detecting model adapter for workflow execution');
    const result = await createAutoAdapter({ logger });
    logger.info('Model adapter detected', { source: result.source, name: result.name });
    return result.adapter;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('No model adapter available, using mock execution', { error: message });
    return undefined;
  }
}

/**
 * Initializes and registers MCP tools with the server.
 * Handles template loading, model adapter detection, and tool registration.
 *
 * @param server - MCP server instance
 * @param logger - Logger for registration messages
 * @param policyFirewall - Policy firewall for authorization
 * @param config - Application configuration
 */
async function initializeAndRegisterTools(
  server: import('@modelcontextprotocol/sdk/server/mcp.js').McpServer,
  logger: ILogger,
  policyFirewall: import('./mcp/middleware/index.js').IPolicyFirewall,
  config: import('./config/index.js').AppConfig
): Promise<void> {
  logger.info('Loading built-in workflow templates');
  const builtInTemplates = await initializeBuiltInTemplates();
  logger.info('Loaded built-in templates', { count: builtInTemplates.size });

  const modelAdapter = await tryDetectModelAdapter(logger);
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
    ...(allowedPaths !== undefined && { allowedPaths }),
    ...(modelAdapter !== undefined && { modelAdapter }),
    ...(securityConfig !== undefined && { securityConfig }),
    ...(workflowConfig !== undefined && { workflowConfig }),
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

  // TODO(Issue #485): Wire logging.format and logging.destination to logger
  // Currently only level is supported. Format (json/pretty) and destination
  // (stdout/stderr/file) require logger infrastructure changes.
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
  policyFirewall: ReturnType<typeof createDefaultPolicyFirewall>;
}> {
  // Initialize experts from configuration (Issue #486)
  const expertResult = initializeExperts({ expertConfig: config.experts, logger });
  logger.debug('Expert system initialized', {
    builtIn: expertResult.builtInCount,
    custom: expertResult.customCount,
  });

  // Initialize skill library from configuration (Issue #491)
  const skillsResult = initializeSkillLibrary({ skillsConfig: config.skills, logger });
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

  const { server, logger: serverLogger } = createAndValidateMcpServer(logger);

  // Wire observability config to SwarmObserver (Issue #493)
  const observer = initializeSwarmObserver(serverLogger, {
    maxEvents: config.observability?.swarmObserverMaxEvents,
  });
  // Wire EventBus config for A2A communication settings
  const eventBusBridge = initializeEventBus(observer, serverLogger, config.observability?.eventBus);

  await initializeAndLogSandbox(serverLogger, config.security?.sandbox);
  const policyFirewall = logSecurityConfig(serverLogger, config);
  await initializeAndRegisterTools(server, serverLogger, policyFirewall, config);

  return { server, serverLogger, observer, eventBusBridge, policyFirewall };
}

/**
 * Starts the MCP server with stdio transport.
 *
 * @param verbose - Whether to enable verbose logging
 * @param mode - Server mode (server, orchestrator, mesh)
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

  // Initialize all subsystems
  const { server, serverLogger, observer, eventBusBridge } = await initializeSubsystems(
    configResult.config,
    logger
  );

  // Connect to transport
  await connectToStdioTransport(server, logger, serverLogger);

  // Record server startup event for observability
  const eventContext = recordServerStartup(observer);

  // Setup graceful shutdown with observer and EventBus cleanup
  const cleanup = createShutdownCleanup({
    eventBusBridge,
    observer,
    eventContext,
    server,
    serverLogger,
    logger,
  });
  setupShutdownHandlers(cleanup, logger);

  logger.debug('Server running, waiting for requests...');
}
