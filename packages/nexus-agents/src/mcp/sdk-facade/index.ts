// @export-no-consumer-yet — see #4485
/**
 * nexus-agents/mcp/sdk-facade
 *
 * Internal compatibility facade bridging MCP SDK v1 and split v2 packages
 * (@modelcontextprotocol/core, @modelcontextprotocol/server, @modelcontextprotocol/client).
 *
 * This provides a single unified entry point for server, client, transport, and
 * core types, shielding nexus-agents internals during the multi-phase v2 migration.
 *
 * @module mcp/sdk-facade
 * (Source: Epic #4485 — MCP split v2 SDK migration)
 */

// ============================================================================
// Server & protocol types re-exports (@modelcontextprotocol/server)
// ============================================================================

export {
  McpServer,
  InMemoryTransport,
  isCallToolResult,
  type RegisteredTool,
  type ToolCallback,
  type McpServerOptions,
  type ServerOptions,
  type Transport,
  type TransportSendOptions,
  // Protocol types
  type CallToolRequest,
  type CallToolResult,
  type Tool,
  type ToolAnnotations,
  type Prompt,
  type Resource,
  type CancelledNotification,
  type ProgressNotification,
  type JSONRPCMessage,
  type JSONRPCRequest,
  type JSONRPCResponse,
  type JSONRPCNotification,
  type JSONRPCErrorResponse,
} from '@modelcontextprotocol/server';

// Stdio server transport (@modelcontextprotocol/server/stdio)
export { StdioServerTransport, serveStdio } from '@modelcontextprotocol/server/stdio';

// ============================================================================
// Client re-exports (@modelcontextprotocol/client)
// ============================================================================

export { Client, type ClientOptions } from '@modelcontextprotocol/client';

// Stdio client transport (@modelcontextprotocol/client/stdio)
export {
  StdioClientTransport,
  getDefaultEnvironment,
  DEFAULT_INHERITED_ENV_VARS,
} from '@modelcontextprotocol/client/stdio';

// ============================================================================
// Core schemas (@modelcontextprotocol/core)
// ============================================================================

export {
  // Tool schemas
  CallToolRequestSchema,
  CallToolResultSchema,
  CompatibilityCallToolResultSchema,
  // Prompt & resource schemas
  GetPromptRequestSchema,
  GetPromptResultSchema,
  ListPromptsRequestSchema,
  ListPromptsResultSchema,
  ReadResourceRequestSchema,
  ReadResourceResultSchema,
  ListResourcesRequestSchema,
  ListResourcesResultSchema,
  // Notification schemas
  CancelledNotificationSchema,
  ProgressNotificationSchema,
} from '@modelcontextprotocol/core';

// ============================================================================
// Facade helpers
// ============================================================================

export {
  createLinkedTransports,
  createCompatibleMcpServer,
  createTextResult,
  type FacadeServerConfig,
} from './helpers.js';
