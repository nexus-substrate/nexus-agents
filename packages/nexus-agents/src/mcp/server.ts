/**
 * nexus-agents/mcp - MCP Server
 *
 * Main MCP server implementation for Nexus Agents orchestration.
 * Provides factory functions to create and start the server with
 * stdio or custom transports.
 *
 * (Source: MCP Protocol 2025-11-25)
 */

import { McpServer as SdkV1McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from './sdk-types.js';
import { StdioServerTransport, type Transport } from './sdk-facade/index.js';

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
import { claimGlobalRegistry } from '../adapters/unified-registry.js';
import { initDataDirectories } from '../cli/setup-data-dir.js';
import { recordServerTransport, type McpServerTransport } from './middleware/request-context.js';
import { parseBoolEnv } from '../config/defaults-env.js';
import { beginWorkspaceRootResolution } from './workspace-roots.js';

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
type RegisterToolFn = (
  name: string,
  config: Record<string, unknown>,
  handler: (argsOrCtx: unknown, maybeCtx: unknown) => unknown
) => void;

function attachLegacyToolMethod(server: McpServer): void {
  const serverObj = server as unknown as Record<string, unknown>;
  if (typeof serverObj.tool === 'function') return;

  serverObj.tool = function (
    name: string,
    schema: unknown,
    handler: (args: Record<string, unknown>, extra: unknown) => unknown
  ): void {
    const config =
      schema !== undefined &&
      typeof schema === 'object' &&
      schema !== null &&
      Object.keys(schema).length > 0
        ? { inputSchema: schema }
        : {};
    const registerTool = (server as unknown as { registerTool: RegisterToolFn }).registerTool;
    registerTool.call(server, name, config, (argsOrCtx: unknown, maybeCtx: unknown) => {
      if (maybeCtx !== undefined) {
        return handler(argsOrCtx as Record<string, unknown>, maybeCtx);
      }
      return handler({}, argsOrCtx);
    });
  };
}

export function createServer(config?: ServerConfig): Result<ServerInstance, ServerError> {
  const serverName = config?.name ?? DEFAULT_SERVER_NAME;
  const serverVersion = config?.version ?? VERSION;
  const logger = config?.logger ?? createLogger({ component: 'mcp-server' });

  try {
    // Resolve workspace root synchronously before initializing data directories (#5166)
    beginWorkspaceRootResolution(logger);
    // Ensure data directories exist on first MCP server startup (#1398)
    initDataDirectories();

    logger.info('Creating MCP server', {
      name: serverName,
      version: serverVersion,
    });

    const serverOptions = {
      capabilities: {
        prompts: {},
        resources: {},
        tasks: {},
      },
      // Native SubstrateTaskStore cast across SDK v1 exactOptionalPropertyTypes seam
      taskStore: getTaskStore() as never,
    };

    const server = new SdkV1McpServer(
      {
        name: serverName,
        version: serverVersion,
      },
      serverOptions
    ) as unknown as McpServer;

    attachLegacyToolMethod(server);

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
 * The transport kind the server can vouch for (#6795). stdio is local-only (the
 * client spawned this process), which `deriveTrustTier` maps to tier 1.
 * Anything else is `undefined`: this tree ships no network transport, and
 * guessing one would record a tier nobody measured.
 */
function identifyTransport(transport: Transport): McpServerTransport | undefined {
  return transport instanceof StdioServerTransport ? 'stdio' : undefined;
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

  // Composition root for the adapter registry in server mode (#6012) — see the
  // matching call in cli.ts `main()`. Claimed here, before any tool handler
  // runs, so the registry's logger is chosen deliberately instead of by
  // whichever tool is invoked first.
  claimGlobalRegistry(log);

  // Record the transport BEFORE connecting (#6795): the first request can be
  // dispatched as soon as `connect` starts reading, and it must see the tier.
  // Only a transport the server can identify is recorded; any other one stays
  // unmeasured, so its requests fall to the authentication branch.
  // A child server (spawned for an expert CLI, #6795) is called by a model, not
  // the operator: its stdio caller is recorded as unmeasured, never tier 1.
  const transportKind = parseBoolEnv('NEXUS_MCP_CHILD', false)
    ? undefined
    : identifyTransport(transport);
  recordServerTransport(transportKind);
  try {
    log.info('Connecting server to transport', { transport: transportKind ?? 'unidentified' });
    await (server as unknown as SdkV1McpServer).connect(
      transport as unknown as Parameters<SdkV1McpServer['connect']>[0]
    );
    log.debug('Server connected to transport successfully');
    return ok(undefined);
  } catch (error) {
    recordServerTransport(undefined);
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
