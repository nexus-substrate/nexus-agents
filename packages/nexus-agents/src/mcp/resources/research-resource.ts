/**
 * nexus-agents/mcp/resources - Research Resource
 *
 * Exposes the research paper registry as an MCP resource.
 * Provides read-only access to tracked papers, techniques,
 * and research statistics.
 *
 * @module mcp/resources/research-resource
 * (Source: Issue #1288)
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ILogger } from '../../core/index.js';
import { getErrorMessage } from '../../core/index.js';
import { parseRegistry } from '../../indexer/research-index/index.js';

/** Resource URI for research papers. */
const RESEARCH_RESOURCE_URI = 'nexus://research/papers';

/** Resource name shown to MCP clients. */
const RESEARCH_RESOURCE_NAME = 'research-papers';

/**
 * Builds the research resource payload by parsing the registry.
 *
 * Returns an empty papers list when the registry does not exist
 * or cannot be parsed, rather than failing the resource read.
 */
function buildResearchPayload(logger: ILogger): Record<string, unknown> {
  const result = parseRegistry();

  if (!result.ok) {
    logger.debug('Research registry not available', {
      error: result.error.message,
    });
    return {
      papers: [],
      techniques: [],
      stats: null,
      error: 'Registry not available',
    };
  }

  const index = result.value;
  return {
    schemaVersion: index.schemaVersion,
    generatedAt: index.generatedAt,
    paperCount: index.papers.length,
    techniqueCount: index.techniques.length,
    papers: index.papers.map((p) => ({
      id: p.id,
      title: p.title,
      topics: p.topics,
      arxivId: p.arxiv_id,
      url: p.url,
      reviewedDate: p.reviewed_date,
    })),
    techniques: index.techniques.map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      priority: t.priority,
      topic: t.topic,
    })),
    stats: index.stats,
  };
}

/**
 * Registers the `nexus://research/papers` resource with the MCP server.
 *
 * Exposes the research registry (papers, techniques, stats) as a
 * read-only JSON resource. Gracefully returns an empty result when
 * the registry YAML files are not present.
 *
 * @param server - MCP server instance
 * @param logger - Logger for registration events
 */
export function registerResearchResource(server: McpServer, logger: ILogger): void {
  server.registerResource(
    RESEARCH_RESOURCE_NAME,
    RESEARCH_RESOURCE_URI,
    {
      description: 'Research paper registry with papers, techniques, and statistics',
      mimeType: 'application/json',
    },
    () => {
      logger.debug('Reading research resource');
      try {
        const payload = buildResearchPayload(logger);
        return {
          contents: [
            {
              uri: RESEARCH_RESOURCE_URI,
              mimeType: 'application/json',
              text: JSON.stringify(payload, null, 2),
            },
          ],
        };
      } catch (error: unknown) {
        logger.warn('Failed to build research payload', {
          error: getErrorMessage(error),
        });
        return {
          contents: [
            {
              uri: RESEARCH_RESOURCE_URI,
              mimeType: 'application/json',
              text: JSON.stringify({ papers: [], techniques: [], stats: null }),
            },
          ],
        };
      }
    }
  );

  logger.info('Registered research resource', { uri: RESEARCH_RESOURCE_URI });
}
