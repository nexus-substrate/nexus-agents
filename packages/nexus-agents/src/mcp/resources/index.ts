/**
 * nexus-agents/mcp/resources - MCP Resource Registration
 *
 * Aggregates all MCP resource registrations into a single entry point.
 * Resources expose read-only metadata (models, research, experts)
 * that MCP clients can discover and read.
 *
 * @module mcp/resources
 * (Source: Issue #1288)
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ILogger } from '../../core/index.js';
import { createLogger } from '../../core/index.js';
import { registerModelsResource } from './models-resource.js';
import { registerResearchResource } from './research-resource.js';
import { registerExpertsResource } from './experts-resource.js';
import { registerAvailableModelsResource } from './available-models-resource.js';

// Re-export individual registration functions for selective use
export { registerModelsResource } from './models-resource.js';
export { registerResearchResource } from './research-resource.js';
export { registerExpertsResource } from './experts-resource.js';
export { registerAvailableModelsResource } from './available-models-resource.js';

/**
 * Registers all MCP resources with the server.
 *
 * Currently registers 3 resources:
 * - `nexus://models` - AI model capabilities matrix
 * - `nexus://research/papers` - Research paper registry
 * - `nexus://experts` - Available expert agent roles
 *
 * @param server - MCP server instance
 * @param logger - Optional logger (creates default if not provided)
 */
export function registerResources(server: McpServer, logger?: ILogger): void {
  const log = logger ?? createLogger({ component: 'mcp-resources' });

  log.info('Registering MCP resources');

  registerModelsResource(server, log);
  registerResearchResource(server, log);
  registerExpertsResource(server, log);
  registerAvailableModelsResource(server, log);

  log.info('All MCP resources registered', { count: 3 });
}
