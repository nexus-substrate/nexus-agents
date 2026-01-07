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
} from './mcp/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createLogger, type ILogger } from './core/index.js';
import { VERSION } from './version.js';
import { detectMode, type ServerMode, type ModeDetectionResult } from './cli/index.js';
import { EXIT_CODES } from './cli-types.js';

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
 * Registers MCP tools with rate limiting.
 * Must be called BEFORE connecting to transport.
 */
function registerMcpTools(server: McpServer, logger: ILogger): void {
  const toolInfra = registerTools(server, { logger });

  // Register tools with shared rate limiter
  registerDelegateToModelTool(server, {
    logger: toolInfra.logger,
    rateLimiter: toolInfra.rateLimiter,
  });

  registerOrchestrateTool(server, {
    techLead: createMockTechLead(),
    logger: toolInfra.logger,
    rateLimiter: toolInfra.rateLimiter,
  });

  logger.info('Tools registered', {
    registeredTools: ['delegate_to_model', 'orchestrate'],
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

  // Setup graceful shutdown
  setupShutdownHandlers(async () => {
    const closeResult = await closeServer(server, serverLogger);
    if (!closeResult.ok) {
      throw new Error(closeResult.error.message);
    }
  }, logger);

  logger.debug('Server running, waiting for requests...');
}
