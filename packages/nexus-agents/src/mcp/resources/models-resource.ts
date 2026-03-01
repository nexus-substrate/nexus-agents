/**
 * nexus-agents/mcp/resources - Models Resource
 *
 * Exposes the model capabilities matrix as an MCP resource.
 * Provides read-only access to all supported AI model metadata
 * including pricing, quality scores, context windows, and CLI mappings.
 *
 * @module mcp/resources/models-resource
 * (Source: Issue #1288)
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ILogger } from '../../core/index.js';
import { DEFAULT_MODEL_CAPABILITIES } from '../../config/model-capabilities.js';

/** Resource URI for the models capability matrix. */
const MODELS_RESOURCE_URI = 'nexus://models';

/** Resource name shown to MCP clients. */
const MODELS_RESOURCE_NAME = 'models';

/**
 * Builds the models resource payload from the capability matrix.
 *
 * Strips system prompts and internal-only fields, returning only
 * public metadata safe for external consumption.
 */
function buildModelsPayload(): Record<string, unknown> {
  const { version, updatedAt, models } = DEFAULT_MODEL_CAPABILITIES;
  return {
    version,
    updatedAt,
    modelCount: models.length,
    models: models.map((m) => ({
      id: m.id,
      displayName: m.displayName,
      provider: m.provider,
      contextWindow: m.contextWindow,
      maxOutputTokens: m.maxOutputTokens,
      pricing: m.pricing,
      qualityScores: m.qualityScores,
      outputModalities: m.outputModalities,
      inputModalities: m.inputModalities,
      toolCapabilities: m.toolCapabilities,
      specialFeatures: m.specialFeatures,
      cliName: m.cliName,
      cliModelName: m.cliModelName,
      notes: m.notes,
    })),
  };
}

/**
 * Registers the `nexus://models` resource with the MCP server.
 *
 * Exposes the full model capabilities matrix (13 models) as a
 * read-only JSON resource. Data is sourced from the canonical
 * `DEFAULT_MODEL_CAPABILITIES` registry.
 *
 * @param server - MCP server instance
 * @param logger - Logger for registration events
 */
export function registerModelsResource(server: McpServer, logger: ILogger): void {
  server.registerResource(
    MODELS_RESOURCE_NAME,
    MODELS_RESOURCE_URI,
    {
      description: 'AI model capabilities matrix with pricing, quality scores, and context windows',
      mimeType: 'application/json',
    },
    () => {
      logger.debug('Reading models resource');
      const payload = buildModelsPayload();
      return {
        contents: [
          {
            uri: MODELS_RESOURCE_URI,
            mimeType: 'application/json',
            text: JSON.stringify(payload, null, 2),
          },
        ],
      };
    }
  );

  logger.info('Registered models resource', { uri: MODELS_RESOURCE_URI });
}
