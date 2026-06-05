/**
 * nexus-agents/mcp/resources - Available Models Resource (#3406, epic #3403).
 *
 * Exposes the LIVE, dynamically-discovered model set — what routing can actually
 * dispatch to right now — as a read-only MCP resource, complementing the static
 * `nexus://models` capability matrix. Sourced from the `AvailableModelsCache`
 * (stale-while-revalidate), populated by the discovery sources (#3404/#3405).
 *
 * Existence only — emits model ids + which source reported them; never pricing,
 * capability, or any key-presence/credential information.
 *
 * @module mcp/resources/available-models-resource
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { ILogger } from '../../core/index.js';
import { getDefaultAvailableModelsCache } from '../../config/available-models-cache.js';

const AVAILABLE_MODELS_URI = 'nexus://available-models';
const AVAILABLE_MODELS_NAME = 'available-models';

async function buildPayload(): Promise<Record<string, unknown>> {
  const all = await getDefaultAvailableModelsCache().getAll();
  const bySource = new Map<string, string[]>();
  for (const m of all) {
    const list = bySource.get(m.source) ?? [];
    list.push(m.id);
    bySource.set(m.source, list);
  }
  return {
    total: all.length,
    sources: [...bySource.entries()].map(([source, ids]) => ({
      source,
      modelCount: ids.length,
      ids,
    })),
    note: 'Live discovered model set (existence only). Empty if dynamic discovery is not enabled (NEXUS_DYNAMIC_MODELS).',
  };
}

/** Registers the read-only `nexus://available-models` resource. */
export function registerAvailableModelsResource(server: McpServer, logger: ILogger): void {
  server.registerResource(
    AVAILABLE_MODELS_NAME,
    AVAILABLE_MODELS_URI,
    {
      description:
        'Live, dynamically-discovered model set per transport (what routing can dispatch to now)',
      mimeType: 'application/json',
    },
    async () => {
      logger.debug('Reading available-models resource');
      const payload = await buildPayload();
      return {
        contents: [
          {
            uri: AVAILABLE_MODELS_URI,
            mimeType: 'application/json',
            text: JSON.stringify(payload, null, 2),
          },
        ],
      };
    }
  );
  logger.info('Registered available-models resource', { uri: AVAILABLE_MODELS_URI });
}
