/**
 * nexus-agents/mcp - MCP Server
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

import {
  getErrorMessage,
  createLogger,
  type Result,
  ok,
  err,
  type ILogger,
} from '../core/index.js';
import { VERSION } from '../version.js';
import { getTaskStore } from './task-store.js';
import { initDataDirectories } from '../cli/setup-data-dir.js';

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
    // Ensure data directories exist on first MCP server startup (#1398)
    initDataDirectories();

    logger.info('Creating MCP server', {
      name: serverName,
      version: serverVersion,
    });

    const server = new McpServer(
      {
        name: serverName,
        version: serverVersion,
      },
      {
        capabilities: {
          logging: {},
          prompts: {},
          resources: {},
          tasks: {},
        },
        taskStore: getTaskStore(),
      }
    );

    logger.debug('MCP server created successfully');

    return ok({ server, logger });
  } catch (error) {
    const errorMessage = getErrorMessage(error);
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
    const errorMessage = getErrorMessage(error);
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
/**
 * Why a stdio server needs this at all (#5231).
 *
 * A `--mode=server` process exists to answer one client over one pipe. When
 * that pipe closes the process has no possible caller, yet nothing was telling
 * it so: the SDK's `StdioServerTransport` registers only `stdin.on('data')`
 * and `stdin.on('error')` — never `'end'` or `'close'` — and reaches its own
 * `close()` only from the `_ondata` parse-error path. `startStdioServer`
 * registered nothing either.
 *
 * The result, measured on one machine: 140 resident servers holding 28.9 GB,
 * the oldest 3.9 days old, under 23 abandoned parents. Local `tsc` and
 * `eslint` were being OOM-killed and interactive sessions were crashing.
 *
 * Exported separately from {@link startStdioServer} so it can be tested
 * against a fake stream — verifying the real thing would require a test to
 * observe its own `process.exit`.
 */
export type StdioShutdownReason = 'stdin-end' | 'stdin-close';

/**
 * Calls `onShutdown` the first time the client goes away, and returns a
 * disposer that unregisters the listeners.
 *
 * Both `'end'` and `'close'` are watched: a pipe torn down abruptly emits
 * `'close'` with no preceding `'end'`, which is exactly the abandoned-parent
 * case. `'data'` and `'error'` are deliberately NOT shutdown signals — a
 * transient read error is not a departed client.
 */
export function wireStdioShutdown(
  stdin: NodeJS.EventEmitter,
  onShutdown: (reason: StdioShutdownReason) => void
): () => void {
  let fired = false;

  const fire = (reason: StdioShutdownReason) => (): void => {
    // At most once. The normal ordering is 'end' then 'close', and shutting
    // down twice would double-close the server and exit the process twice.
    if (fired) return;
    fired = true;
    onShutdown(reason);
  };

  const onEnd = fire('stdin-end');
  const onClose = fire('stdin-close');

  stdin.on('end', onEnd);
  stdin.on('close', onClose);

  return (): void => {
    stdin.off('end', onEnd);
    stdin.off('close', onClose);
  };
}

export async function startStdioServer(
  config?: ServerConfig
): Promise<Result<ServerInstance, ServerError>> {
  const serverResult = createServer(config);
  if (!serverResult.ok) {
    return serverResult;
  }

  const { server, logger } = serverResult.value;

  try {
    // Defense-in-depth: stdio transport owns stdout for JSON-RPC frames.
    logger.setDestination?.('stderr');
    logger.info('Starting stdio transport');
    const transport = new StdioServerTransport();

    const connectResult = await connectTransport(server, transport, logger);
    if (!connectResult.ok) {
      return connectResult;
    }

    // Do not outlive the client (#5231). Without this the process stays
    // resident forever once the pipe closes; see wireStdioShutdown above.
    wireStdioShutdown(process.stdin, (reason) => {
      logger.info('Client disconnected; shutting down stdio server', { reason });
      void closeServer(server, logger).finally(() => {
        process.exit(0);
      });
    });

    logger.info('MCP server running with stdio transport');
    return ok({ server, logger });
  } catch (error) {
    const errorMessage = getErrorMessage(error);
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
    const errorMessage = getErrorMessage(error);
    log.error('Failed to close server', error instanceof Error ? error : undefined);
    return err(
      createServerError('SERVER_STOP_FAILED', `Failed to close server: ${errorMessage}`, error)
    );
  }
}
