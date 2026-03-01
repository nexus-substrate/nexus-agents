/**
 * nexus-agents/mcp/resources - Experts Resource
 *
 * Exposes the available expert roles and their capabilities
 * as an MCP resource. Provides read-only access to expert
 * metadata without exposing system prompts.
 *
 * @module mcp/resources/experts-resource
 * (Source: Issue #1288)
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ILogger } from '../../core/index.js';
import { getAvailableRoles, getCapabilitiesForRole } from '../tools/create-expert.js';
import { BUILT_IN_EXPERTS } from '../../agents/index.js';

/** Resource URI for expert roles. */
const EXPERTS_RESOURCE_URI = 'nexus://experts';

/** Resource name shown to MCP clients. */
const EXPERTS_RESOURCE_NAME = 'experts';

/**
 * Builds the experts resource payload from the built-in registry.
 *
 * Includes role names, display names, and capabilities but
 * excludes system prompts (which are internal implementation details).
 */
function buildExpertsPayload(): Record<string, unknown> {
  const roles = getAvailableRoles();

  const experts = roles.map((role) => {
    const capabilities = getCapabilitiesForRole(role);
    // Extract the expert type key from the role (e.g., 'code_expert' -> 'code')
    const typeKey = role.replace('_expert', '');
    const expertEntries = BUILT_IN_EXPERTS as Record<string, { name: string; id: string }>;
    const config = expertEntries[typeKey] as { name: string; id: string } | undefined;

    return {
      role,
      name: config?.name ?? role,
      id: config?.id ?? role,
      capabilities: capabilities ?? [],
    };
  });

  return {
    expertCount: experts.length,
    experts,
  };
}

/**
 * Registers the `nexus://experts` resource with the MCP server.
 *
 * Exposes the list of available expert roles (10 built-in experts)
 * with their names, descriptions, and capabilities as a read-only
 * JSON resource.
 *
 * @param server - MCP server instance
 * @param logger - Logger for registration events
 */
export function registerExpertsResource(server: McpServer, logger: ILogger): void {
  server.registerResource(
    EXPERTS_RESOURCE_NAME,
    EXPERTS_RESOURCE_URI,
    {
      description: 'Available expert agent roles with capabilities',
      mimeType: 'application/json',
    },
    () => {
      logger.debug('Reading experts resource');
      const payload = buildExpertsPayload();
      return {
        contents: [
          {
            uri: EXPERTS_RESOURCE_URI,
            mimeType: 'application/json',
            text: JSON.stringify(payload, null, 2),
          },
        ],
      };
    }
  );

  logger.info('Registered experts resource', { uri: EXPERTS_RESOURCE_URI });
}
