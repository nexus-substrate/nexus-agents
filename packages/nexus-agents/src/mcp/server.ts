/**
 * @nexus-agents/mcp - MCP Server
 *
 * Main MCP server implementation for Nexus Agents orchestration.
 * Provides factory functions to create and start the server with
 * stdio or custom transports.
 *
 * (Source: MCP Protocol 2025-11-25)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

import { createLogger, type Result, ok, err, type ILogger } from '../core/index.js';

import { VERSION } from './index.js';

/**
 * Server configuration options.
 */
export interface ServerConfig {
  /** Server name (default: "nexus-agents") */
  readonly name?: string;
  /** Server version (default: package version) */
  readonly version?: string;
  /** Logger instance */
  readonly logger?: ILogger;
}

/**
 * Server creation result containing the server and logger.
 */
export interface ServerInstance {
  /** The MCP server instance */
  readonly server: McpServer;
  /** The logger instance for this server */
  readonly logger: ILogger;
}

/**
 * Error type for server operations.
 */
export interface ServerError {
  code: 'SERVER_CREATION_FAILED' | 'SERVER_START_FAILED' | 'SERVER_STOP_FAILED';
  message: string;
  cause?: Error;
}

const DEFAULT_SERVER_NAME = 'nexus-agents';

/**
 * Creates a ServerError with the given code, message, and optional cause.
 */
function createServerError(
  code: ServerError['code'],
  message: string,
  error: unknown
): ServerError {
  const serverError: ServerError = { code, message };
  if (error instanceof Error) {
    serverError.cause = error;
  }
  return serverError;
}

/**
 * Creates a new MCP server instance.
 *
 * @param config - Optional server configuration
 * @returns Result containing the server instance or an error
 *
 * @example
 * ```typescript
 * const result = createServer({ name: 'my-server' });
 * if (result.ok) {
 *   const { server, logger } = result.value;
 *   // Register tools on server
 * }
 * ```
 */
export function createServer(config?: ServerConfig): Result<ServerInstance, ServerError> {
  const serverName = config?.name ?? DEFAULT_SERVER_NAME;
  const serverVersion = config?.version ?? VERSION;
  const logger = config?.logger ?? createLogger({ component: 'mcp-server' });

  try {
    logger.info('Creating MCP server', {
      name: serverName,
      version: serverVersion,
    });

    const server = new McpServer({
      name: serverName,
      version: serverVersion,
    });

    logger.debug('MCP server created successfully');

    return ok({ server, logger });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to create MCP server', error instanceof Error ? error : undefined);
    return err(
      createServerError(
        'SERVER_CREATION_FAILED',
        `Failed to create MCP server: ${errorMessage}`,
        error
      )
    );
  }
}

/**
 * Connects the server to a transport.
 *
 * @param server - The MCP server instance
 * @param transport - The transport to connect to
 * @param logger - Logger for the operation
 * @returns Result indicating success or failure
 */
export async function connectTransport(
  server: McpServer,
  transport: Transport,
  logger?: ILogger
): Promise<Result<void, ServerError>> {
  const log = logger ?? createLogger({ component: 'mcp-server' });

  try {
    log.info('Connecting server to transport');
    await server.connect(transport);
    log.debug('Server connected to transport successfully');
    return ok(undefined);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error('Failed to connect to transport', error instanceof Error ? error : undefined);
    return err(
      createServerError(
        'SERVER_START_FAILED',
        `Failed to connect to transport: ${errorMessage}`,
        error
      )
    );
  }
}

/**
 * Starts the MCP server with stdio transport.
 *
 * This is the main entry point for running the server as a standalone process.
 * The server will communicate over stdin/stdout using the MCP protocol.
 *
 * @param config - Optional server configuration
 * @returns Result indicating success or failure
 *
 * @example
 * ```typescript
 * const result = await startStdioServer();
 * if (!result.ok) {
 *   console.error('Failed to start server:', result.error.message);
 *   process.exit(1);
 * }
 * ```
 */
export async function startStdioServer(
  config?: ServerConfig
): Promise<Result<ServerInstance, ServerError>> {
  const serverResult = createServer(config);
  if (!serverResult.ok) {
    return serverResult;
  }

  const { server, logger } = serverResult.value;

  try {
    logger.info('Starting stdio transport');
    const transport = new StdioServerTransport();

    const connectResult = await connectTransport(server, transport, logger);
    if (!connectResult.ok) {
      return connectResult;
    }

    logger.info('MCP server running with stdio transport');
    return ok({ server, logger });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to start stdio server', error instanceof Error ? error : undefined);
    return err(
      createServerError(
        'SERVER_START_FAILED',
        `Failed to start stdio server: ${errorMessage}`,
        error
      )
    );
  }
}

/**
 * Gracefully closes the server connection.
 *
 * @param server - The MCP server to close
 * @param logger - Optional logger
 * @returns Result indicating success or failure
 */
export async function closeServer(
  server: McpServer,
  logger?: ILogger
): Promise<Result<void, ServerError>> {
  const log = logger ?? createLogger({ component: 'mcp-server' });

  try {
    log.info('Closing MCP server');
    await server.close();
    log.info('MCP server closed successfully');
    return ok(undefined);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error('Failed to close server', error instanceof Error ? error : undefined);
    return err(
      createServerError('SERVER_STOP_FAILED', `Failed to close server: ${errorMessage}`, error)
    );
  }
}
