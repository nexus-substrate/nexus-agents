#!/usr/bin/env node
/**
 * @nexus-agents/cli
 *
 * CLI entry point for Nexus Agents MCP server.
 * Starts the server with stdio transport for communication with Claude.
 *
 * (Source: MCP Protocol 2025-11-25)
 */

import {
  startStdioServer,
  closeServer,
  registerTools,
  VERSION as MCP_VERSION,
} from '@nexus-agents/mcp';
import { createLogger, type ILogger } from '@nexus-agents/core';

export const VERSION = '0.0.1';

/**
 * Exit codes for the CLI.
 */
const EXIT_CODES = {
  SUCCESS: 0,
  SERVER_START_FAILED: 1,
  SHUTDOWN_ERROR: 2,
} as const;

/**
 * Sets up graceful shutdown handlers.
 *
 * @param cleanup - Async cleanup function to call on shutdown
 * @param logger - Logger instance
 */
function setupShutdownHandlers(cleanup: () => Promise<void>, logger: ILogger): void {
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
 * Main entry point for the Nexus Agents CLI.
 * Starts the MCP server with stdio transport.
 */
async function main(): Promise<void> {
  const logger = createLogger({ component: 'cli' });

  logger.info('Starting Nexus Agents', {
    version: VERSION,
    mcpVersion: MCP_VERSION,
    nodeVersion: process.version,
    platform: process.platform,
  });

  // Start the MCP server with stdio transport
  const serverResult = await startStdioServer({
    name: 'nexus-agents',
    version: VERSION,
    logger,
  });

  if (!serverResult.ok) {
    logger.error('Failed to start MCP server', new Error(serverResult.error.message));
    process.exit(EXIT_CODES.SERVER_START_FAILED);
  }

  const { server, logger: serverLogger } = serverResult.value;

  // Initialize tool registration infrastructure
  // Note: Individual tools (orchestrate, create_expert, run_workflow) are
  // registered separately with their specific dependencies (TechLead, factories, etc.)
  const toolInfra = registerTools(server, { logger: serverLogger });

  logger.info('MCP server started successfully', {
    availableTools: toolInfra.tools,
  });

  // Setup graceful shutdown
  setupShutdownHandlers(async () => {
    const closeResult = await closeServer(server, serverLogger);
    if (!closeResult.ok) {
      throw new Error(closeResult.error.message);
    }
  }, logger);

  // Keep process alive - stdio transport handles communication
  logger.debug('Server running, waiting for requests...');
}

// Run main if this is the entry point
main().catch((error: unknown) => {
  const logger = createLogger({ component: 'cli' });
  logger.error(
    'Fatal error during startup',
    error instanceof Error ? error : new Error(String(error))
  );
  process.exit(EXIT_CODES.SERVER_START_FAILED);
});
