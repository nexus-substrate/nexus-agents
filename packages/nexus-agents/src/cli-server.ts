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
  registerTools,
  registerDelegateToModelTool,
  registerOrchestrateTool,
  createMockTechLead,
  initializeEventBusBridge,
  getEventBusStats,
  type EventBusBridgeResult,
} from './mcp/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createLogger, type ILogger } from './core/index.js';
import { VERSION } from './version.js';
import { detectMode, type ServerMode, type ModeDetectionResult } from './cli/index.js';
import { EXIT_CODES } from './cli-types.js';
import { getSwarmObserver, SwarmObserver } from './observability/index.js';
import type { EventBusConfig } from './config/index.js';
import { initializeSandbox, getSandboxMode } from './security/sandbox/index.js';
import {
  createDefaultPolicyFirewall,
  createToolRateLimiterFactory,
  setGlobalToolRateLimiterFactory,
} from './mcp/middleware/index.js';

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

  process.on('SIGINT', () => void handleShutdown('SIGINT'));
  process.on('SIGTERM', () => void handleShutdown('SIGTERM'));

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
 * Logs warnings for unimplemented modes.
 */
export function logModeWarnings(logger: ILogger, mode: ServerMode): void {
  if (mode === 'orchestrator') {
    logger.warn('Orchestrator mode not yet implemented, falling back to server mode');
  } else if (mode === 'mesh') {
    logger.warn('Mesh mode not yet implemented, falling back to server mode');
  }
}

/**
 * Logs security configuration at startup.
 * (Source: Issue #185 Phase 1 - Startup security logging)
 */
export function logSecurityConfig(logger: ILogger): void {
  // Get policy firewall configuration
  const policyFirewall = createDefaultPolicyFirewall();
  const policyMode = policyFirewall.getMode();
  const ruleCount = policyFirewall.getRules().length;

  // Check authentication configuration (from env)
  const authEnabled = process.env['NEXUS_AUTH_ENABLED'] === 'true';
  const authMethod = process.env['NEXUS_AUTH_METHOD'] ?? 'none';

  logger.info('Security configuration', {
    policyMode,
    policyRuleCount: ruleCount,
    defaultExecutionMode: 'read-only',
    authEnabled,
    authMethod,
    deepLogSanitization: true,
    requestIdTracking: true,
  });

  // Log specific security features
  if (!authEnabled) {
    logger.warn('Authentication is disabled. Set NEXUS_AUTH_ENABLED=true to enable.');
  }

  // Log policy rules in verbose mode
  logger.debug('Policy firewall rules', {
    rules: policyFirewall.getRules().map((r) => ({
      name: r.name,
      description: r.description,
    })),
  });
}

/**
 * Initializes the global SwarmObserver for interaction tracing.
 *
 * @param logger - Logger instance
 * @returns The initialized SwarmObserver instance
 */
function initializeSwarmObserver(logger: ILogger): SwarmObserver {
  const observer = getSwarmObserver({
    maxEvents: 10000,
  });

  logger.info('SwarmObserver initialized for interaction tracing', {
    maxEvents: 10000,
  });

  return observer;
}

/**
 * Initializes the EventBus bridge for agent-to-agent communication visibility.
 * Bridges EventBus events to SwarmObserver for observability in Claude Desktop.
 *
 * @param observer - SwarmObserver instance
 * @param logger - Logger instance
 * @param config - Optional EventBus configuration
 * @returns EventBus bridge result with cleanup function
 *
 * (Source: Issue #307 - EventBus MCP integration)
 */
function initializeEventBus(
  observer: SwarmObserver,
  logger: ILogger,
  config?: EventBusConfig
): EventBusBridgeResult {
  // Check environment variable for enable/disable override
  const envEnabled = process.env['NEXUS_EVENTBUS_ENABLED'];
  const enabled = envEnabled !== undefined ? envEnabled === 'true' : (config?.enabled ?? true);

  const effectiveConfig: Partial<EventBusConfig> = {
    ...config,
    enabled,
  };

  const result = initializeEventBusBridge(observer, logger, effectiveConfig);

  if (result.initialized) {
    logger.info('EventBus bridge initialized for A2A visibility', {
      subscriptionCount: result.subscriptionCount,
      eventBusEnabled: enabled,
    });
  }

  return result;
}

/**
 * Records a server lifecycle event to the SwarmObserver.
 */
interface ServerEventContext {
  readonly traceId: string;
  readonly startupSpanId: string;
}

function recordServerStartup(observer: SwarmObserver): ServerEventContext {
  const traceId = SwarmObserver.generateTraceId();
  const startupSpanId = SwarmObserver.generateSpanId();

  observer.recordEvent({
    eventId: `startup-${startupSpanId}`,
    timestamp: new Date().toISOString(),
    agentId: 'mcp-server',
    eventType: 'task_started',
    traceId,
    spanId: startupSpanId,
    payload: {
      type: 'task',
      phase: 'started',
      taskId: traceId,
      taskDescription: 'MCP server startup',
    },
  });

  return { traceId, startupSpanId };
}

function recordServerShutdown(observer: SwarmObserver, context: ServerEventContext): void {
  const shutdownSpanId = SwarmObserver.generateSpanId();

  observer.recordEvent({
    eventId: `shutdown-${shutdownSpanId}`,
    timestamp: new Date().toISOString(),
    agentId: 'mcp-server',
    eventType: 'task_completed',
    traceId: context.traceId,
    spanId: shutdownSpanId,
    parentSpanId: context.startupSpanId,
    payload: {
      type: 'task',
      phase: 'completed',
      taskId: context.traceId,
      taskDescription: 'MCP server shutdown',
      success: true,
    },
  });
}

function logFinalHealthMetrics(observer: SwarmObserver, logger: ILogger): void {
  const healthMetrics = observer.getHealthMetrics();
  logger.info('Final swarm health metrics', {
    activeAgents: healthMetrics.activeAgents,
    totalAgents: healthMetrics.totalAgents,
    totalInteractions: healthMetrics.totalInteractions,
  });
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
      const finalStats = getEventBusStats();
      logger.info('Final EventBus statistics', {
        eventsEmitted: finalStats.eventsEmitted,
        activeSubscriptions: finalStats.activeSubscriptions,
        historySize: finalStats.historySize,
        errorCount: finalStats.errorCount,
      });
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
 */
function registerMcpTools(server: McpServer, logger: ILogger): void {
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

  registerOrchestrateTool(server, {
    techLead: createMockTechLead(),
    logger: toolInfra.logger,
    rateLimiter: rateLimiterFactory.getForTool('orchestrate'),
  });

  logger.info('Tools registered with per-tool rate limiting', {
    registeredTools: ['delegate_to_model', 'orchestrate'],
    rateLimitingEnabled: rateLimiterFactory.isEnabled(),
  });
}

/**
 * Starts the MCP server with stdio transport.
 *
 * @param verbose - Whether to enable verbose logging
 * @param mode - Server mode (server, orchestrator, mesh)
 * @param modeWasExplicit - Whether mode was explicitly set via --mode flag
 */
export async function startServer(
  verbose: boolean,
  mode: ServerMode,
  modeWasExplicit: boolean = false
): Promise<void> {
  const logger = createLogger({ component: 'cli' });

  if (verbose) {
    logger.setLevel('debug');
  }

  // Log mode detection details
  const detectionResult = detectMode({ explicitMode: modeWasExplicit ? mode : undefined });
  logStartupInfo(logger, detectionResult, verbose);
  logModeWarnings(logger, mode);

  // Create MCP server (tools must be registered BEFORE connecting)
  const serverResult = createServer({
    name: 'nexus-agents',
    version: VERSION,
    logger,
  });

  if (!serverResult.ok) {
    logger.error('Failed to create MCP server', new Error(serverResult.error.message));
    process.exit(EXIT_CODES.SERVER_START_FAILED);
  }

  const { server, logger: serverLogger } = serverResult.value;

  // Initialize SwarmObserver for interaction tracing (Issue #173)
  const observer = initializeSwarmObserver(serverLogger);

  // Initialize EventBus bridge for A2A communication visibility (Issue #307)
  const eventBusBridge = initializeEventBus(observer, serverLogger);

  // Initialize sandbox for agent execution isolation (Issue #175)
  const sandboxResult = await initializeSandbox();
  serverLogger.info('Sandbox initialized', {
    mode: getSandboxMode(),
    executor: sandboxResult.executor.name,
    usedFallback: sandboxResult.usedFallback,
  });

  // Log security configuration at startup (Issue #185)
  logSecurityConfig(serverLogger);

  // Register tools with rate limiting (must happen BEFORE connecting)
  registerMcpTools(server, serverLogger);

  // Connect to transport
  logger.info('Connecting to stdio transport');
  const transport = new StdioServerTransport();
  const connectResult = await connectTransport(server, transport, serverLogger);

  if (!connectResult.ok) {
    logger.error('Failed to connect MCP server', new Error(connectResult.error.message));
    process.exit(EXIT_CODES.SERVER_START_FAILED);
  }

  logger.info('MCP server started successfully');

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
