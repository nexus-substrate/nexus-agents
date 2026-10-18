/**
 * nexus-agents/mcp - SDK Type Seam
 *
 * Internal compatibility facade re-exporting MCP server types and annotations.
 * Shields MCP tools from upstream SDK package structure changes across the
 * v1 -> split v2 migration.
 *
 * @module mcp/sdk-types
 * (Source: Epic #4485 — MCP split v2 SDK migration Batch 1)
 */

export {
  McpServer,
  type RegisteredTool,
  type ToolCallback,
} from '@modelcontextprotocol/sdk/server/mcp.js';

export type { ToolAnnotations } from './sdk-facade/index.js';
