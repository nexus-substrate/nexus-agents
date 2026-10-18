// @export-no-consumer-yet — see #4485
/**
 * nexus-agents/mcp/sdk-facade - Helpers
 *
 * Utility and compatibility helpers for the MCP SDK v2 facade.
 *
 * @module mcp/sdk-facade/helpers
 * (Source: Epic #4485 — MCP split v2 SDK migration)
 */

import {
  McpServer,
  InMemoryTransport,
  type McpServerOptions,
  type CallToolResult,
} from '@modelcontextprotocol/server';

/**
 * Server configuration for facade-created MCP server instances.
 */
export interface FacadeServerConfig {
  /** Server name */
  readonly name: string;
  /** Server semver version */
  readonly version: string;
  /** Optional capabilities override */
  readonly capabilities?: McpServerOptions['capabilities'];
  /** Optional task store for asynchronous operations */
  readonly taskStore?: unknown;
}

/**
 * Creates a pair of linked in-memory transports for testing and internal RPC.
 *
 * @returns A tuple of `[clientTransport, serverTransport]`
 */
export function createLinkedTransports(): [InMemoryTransport, InMemoryTransport] {
  return InMemoryTransport.createLinkedPair();
}

/**
 * Instantiates an McpServer instance with default capabilities and options.
 *
 * @param config - Server identification and capabilities configuration
 * @returns Configured McpServer instance
 */
export function createCompatibleMcpServer(config: FacadeServerConfig): McpServer {
  const options: McpServerOptions = {
    capabilities: config.capabilities ?? {
      prompts: {},
      resources: {},
      tasks: {},
    },
    ...(config.taskStore !== undefined ? { taskStore: config.taskStore } : {}),
  };

  return new McpServer(
    {
      name: config.name,
      version: config.version,
    },
    options
  );
}

/**
 * Creates a standardized text CallToolResult.
 *
 * @param text - The text payload to include in content
 * @param isError - Optional error flag
 * @returns Conforming CallToolResult object
 */
export function createTextResult(text: string, isError = false): CallToolResult {
  return {
    content: [{ type: 'text', text }],
    ...(isError ? { isError: true } : {}),
  };
}
