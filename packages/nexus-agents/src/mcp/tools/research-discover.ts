/* eslint-disable max-lines -- 404 lines, cohesive single-tool module per governance */
/**
 * nexus-agents/mcp - Research Discover Tool
 *
 * MCP tool for discovering new research papers and repos from external sources.
 * Searches arXiv, GitHub, and other sources for relevant research.
 *
 * @module mcp/tools/research-discover
 * (Source: Research System Enhancement - Phase 1C)
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ILogger } from '../../core/index.js';
import { getErrorMessage, createLogger, formatZodError } from '../../core/index.js';
import { normalizeTopicToCanonical } from '../../research/topic-aliases.js';
import { withToolError } from '../middleware/tool-error-handler.js';
import { toolError, toolSuccess, type ToolResult, type BaseMcpToolDeps } from './tool-result.js';

import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import { loadPapersRegistry } from '../../cli/research-helpers.js';
import {
  discoverGitHubRepos,
  discoverGoogleAI,
  discoverMetaFAIR,
  discoverMicrosoftResearch,
  discoverDeepMind,
  discoverArxiv,
} from '../../cli/research-helpers-sources.js';
import {
  discoverSemanticScholar,
  discoverPapersWithCode,
  discoverOpenAlex,
} from '../../cli/research-helpers-sources-academic.js';
import { getToolMemory } from './tool-memory.js';
import {
  getOutcomeStore,
  categorizeOutcomeErrorMessage,
} from '../../orchestration/outcomes/index.js';
import { DEFAULT_CLI } from '../../config/model-capabilities-types.js';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Maximum results to return per source. */
const MAX_RESULTS_PER_SOURCE = 20;

/** Default relevance threshold when filtering is enabled. */
const DEFAULT_RELEVANCE_THRESHOLD = 0.3;

// =============================================================================
// TYPES
// =============================================================================

/** Source type for discovery. */
export type DiscoverySource =
  | 'arxiv'
  | 'github'
  | 'google_ai'
  | 'meta_fair'
  | 'microsoft'
  | 'deepmind'
  | 'semantic_scholar'
  | 'papers_with_code'
  | 'openalex'
  | 'all';

/** A discovered research item. */
export interface DiscoveredItem {
  /** Source type */
  source: string;
  /** Item title */
  title: string;
  /** URL to the item */
  url: string;
  /** Brief description */
  description: string;
  /** Whether this item already exists in the registry */
  alreadyInRegistry: boolean;
  /** Discovery date */
  discoveredAt: string;
  /** Relevance score (0-1) relative to the search topic */
  relevanceScore?: number;
}

// =============================================================================
// SCHEMAS
// =============================================================================

/**
 * Input schema for research_discover tool.
 */
export const ResearchDiscoverInputSchema = z.object({
  topic: z
    .string()
    .min(1)
    .max(200)
    .describe('Research topic to search for (e.g., "multi-agent orchestration")'),
  source: z
    .enum([
      'arxiv',
      'github',
      'google_ai',
      'meta_fair',
      'microsoft',
      'deepmind',
      'semantic_scholar',
      'papers_with_code',
      'openalex',
      'all',
    ])
    .optional()
    .default('all')
    .describe(
      'Source to search: arxiv, github, google_ai, meta_fair, microsoft, deepmind, semantic_scholar, papers_with_code, openalex, or all'
    ),
  maxResults: z
    .number()
    .min(1)
    .max(MAX_RESULTS_PER_SOURCE)
    .optional()
    .default(10)
    .describe('Maximum results to return'),
  sinceDate: z
    .string()
    .optional()
    .describe('Only return results after this date (YYYY-MM-DD format)'),
  relevanceThreshold: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .default(DEFAULT_RELEVANCE_THRESHOLD)
    .describe(
      'Minimum relevance score (0-1) to include in results. Higher values filter more aggressively.'
    ),
});

/**
 * Type for validated research discover input.
 */
export type ResearchDiscoverInput = z.infer<typeof ResearchDiscoverInputSchema>;

// =============================================================================
// DEPS
// =============================================================================

/**
 * Dependencies for research_discover tool.
 */
export type ResearchDiscoverDeps = BaseMcpToolDeps;

// =============================================================================
// RESPONSE
// =============================================================================

/**
 * Response from research_discover tool.
 */
export interface ResearchDiscoverResponse {
  /** Topic that was searched */
  topic: string;
  /** Sources queried */
  sourcesQueried: string[];
  /** Sources that failed during discovery */
  failedSources: string[];
  /** Discovered items */
  items: DiscoveredItem[];
  /** Total items found (before filtering) */
  totalFound: number;
  /** Items already in registry (filtered out) */
  alreadyInRegistry: number;
  /** New items not yet in registry */
  newItems: number;
  /** Items filtered out by relevance threshold */
  filteredByRelevance: number;
}

// =============================================================================
// DISCOVERY PROVIDERS
// =============================================================================

/** Gets existing arXiv IDs from the registry. */
async function getExistingArxivIds(): Promise<Set<string>> {
  const result = await loadPapersRegistry();
  if (!result.ok) return new Set();
  return new Set(Object.keys(result.value.papers));
}

/** Extract arXiv ID from a URL string. */
function extractArxivId(url: string): string {
  return url.match(/(\d{4}\.\d{4,5})/)?.[1] ?? '';
}

/** Converts source provider results to DiscoveredItems. */
function toDiscoveredItems(
  sources: Array<{
    source: string;
    title: string;
    url: string;
    description: string;
    discoveredAt: string;
  }>
): DiscoveredItem[] {
  return sources.map((s) => ({
    source: s.source,
    title: s.title,
    url: s.url,
    description: s.description,
    alreadyInRegistry: false,
    discoveredAt: s.discoveredAt,
  }));
}

/** Result of an extended source query — distinguishes API failure from zero results. */
interface ExtendedSourceResult {
  items: DiscoveredItem[];
  failed: boolean;
}

/** Discovers from extended sources using the source providers. */
async function discoverFromExtendedSource(
  source: string,
  topic: string,
  maxResults: number,
  logger: ILogger,
  sinceDate?: string
): Promise<ExtendedSourceResult> {
  let result;
  switch (source) {
    case 'google_ai':
      result = await discoverGoogleAI(topic, maxResults, sinceDate);
      break;
    case 'meta_fair':
      result = await discoverMetaFAIR(topic, maxResults, sinceDate);
      break;
    case 'microsoft':
      result = await discoverMicrosoftResearch(topic, maxResults, sinceDate);
      break;
    case 'deepmind':
      result = await discoverDeepMind(topic, maxResults, sinceDate);
      break;
    case 'semantic_scholar':
      result = await discoverSemanticScholar(topic, maxResults);
      break;
    case 'papers_with_code':
      result = await discoverPapersWithCode(topic, maxResults);
      break;
    case 'openalex':
      result = await discoverOpenAlex(topic, maxResults);
      break;
    default:
      return { items: [], failed: true };
  }
  if (!result.ok) {
    logger.warn(`${source} discovery failed`, {
      source,
      errorCode: result.error.code,
      error: result.error.message,
    });
    return { items: [], failed: true };
  }
  return { items: toDiscoveredItems(result.value), failed: false };
}

// =============================================================================
// RELEVANCE SCORING
// =============================================================================

/**
 * Computes a relevance score (0-1) for a discovered item relative to the search topic.
 * Uses keyword matching against title and description, with title matches weighted higher.
 *
 * Exported for testability.
 */
export function computeRelevanceScore(item: DiscoveredItem, topic: string): number {
  const keywords = topic
    .toLowerCase()
    .split(/[\s,;+\-/]+/)
    .filter((w) => w.length >= 3);

  if (keywords.length === 0) return 1.0; // No keywords to filter against

  const titleLower = item.title.toLowerCase();
  const descLower = item.description.toLowerCase();

  let titleMatches = 0;
  let descMatches = 0;

  for (const keyword of keywords) {
    if (titleLower.includes(keyword)) titleMatches++;
    if (descLower.includes(keyword)) descMatches++;
  }

  // Title matches worth 2x, description matches worth 1x
  const weightedMatches = titleMatches * 2 + descMatches;
  const maxPossible = keywords.length * 3; // 2 (title) + 1 (desc) per keyword

  return Math.min(1.0, weightedMatches / maxPossible);
}

/** Scores and filters items by relevance, returning sorted results. Exported for testability. */
export function filterByRelevance(
  items: DiscoveredItem[],
  topic: string,
  threshold: number
): DiscoveredItem[] {
  const scored = items.map((item) => ({
    ...item,
    relevanceScore: computeRelevanceScore(item, topic),
  }));

  return scored
    .filter((item) => item.relevanceScore >= threshold)
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
}

// =============================================================================
// ORCHESTRATION
// =============================================================================

/** Mark arXiv items that already exist in registry. */
function markExistingItems(items: DiscoveredItem[], existingIds: Set<string>): void {
  for (const item of items) {
    if (item.source !== 'arxiv') continue;
    const arxivId = extractArxivId(item.url);
    if (arxivId !== '') item.alreadyInRegistry = existingIds.has(`arxiv-${arxivId}`);
  }
}

/**
 * arXiv-based org sources that no longer have author filters.
 * When `source: 'all'`, these are skipped because they'd return identical
 * results to the main `arxiv` source (arXiv doesn't support affiliation search).
 * When queried individually, they still work via a single arXiv call.
 */
const ARXIV_ORG_SOURCES = new Set(['google_ai', 'meta_fair', 'microsoft', 'deepmind']);

/** Independent academic sources with their own APIs. */
const INDEPENDENT_SOURCES = ['semantic_scholar', 'papers_with_code', 'openalex'] as const;

/** Accumulated query results. */
interface QueryAccumulator {
  sources: string[];
  failedSources: string[];
  items: DiscoveredItem[];
}

/** Query a single extended source and accumulate results. */
async function queryExtendedSource(
  src: string,
  input: ResearchDiscoverInput,
  logger: ILogger,
  acc: QueryAccumulator
): Promise<void> {
  acc.sources.push(src);
  try {
    const result = await discoverFromExtendedSource(
      src,
      input.topic,
      input.maxResults,
      logger,
      input.sinceDate
    );
    if (result.failed) acc.failedSources.push(src);
    acc.items = acc.items.concat(result.items);
  } catch (error: unknown) {
    acc.failedSources.push(src);
    logger.warn('Source discovery failed', { source: src, error: getErrorMessage(error) });
  }
}

/** Query all requested sources and collect items. */
async function queryAllSources(
  input: ResearchDiscoverInput,
  logger: ILogger
): Promise<QueryAccumulator> {
  const acc: QueryAccumulator = { sources: [], failedSources: [], items: [] };
  const isAll = input.source === 'all';
  const shouldQuery = (src: string): boolean => isAll || input.source === src;

  if (shouldQuery('arxiv')) {
    acc.sources.push('arxiv');
    const r = await discoverArxiv(input.topic, input.maxResults, input.sinceDate);
    if (r.ok) acc.items = acc.items.concat(toDiscoveredItems(r.value));
    else {
      acc.failedSources.push('arxiv');
      logger.warn('arxiv discovery failed', { error: r.error.message });
    }
  }

  // Org sources: skip when 'all' (identical to arxiv); query individually
  for (const src of ARXIV_ORG_SOURCES) {
    if (!isAll && input.source === src) await queryExtendedSource(src, input, logger, acc);
  }

  if (shouldQuery('github')) {
    acc.sources.push('github');
    const r = await discoverGitHubRepos(input.topic, input.maxResults);
    if (r.ok) acc.items = acc.items.concat(toDiscoveredItems(r.value));
    else {
      acc.failedSources.push('github');
      logger.warn('github discovery failed', { error: r.error.message });
    }
  }

  for (const src of INDEPENDENT_SOURCES) {
    if (shouldQuery(src)) await queryExtendedSource(src, input, logger, acc);
  }
  return acc;
}

/** Runs discovery across selected sources. */
async function executeDiscovery(
  rawInput: ResearchDiscoverInput,
  logger: ILogger
): Promise<ResearchDiscoverResponse> {
  // Normalize topic to canonical form (Issue #1576 Wave 4)
  const input: ResearchDiscoverInput = {
    ...rawInput,
    topic: normalizeTopicToCanonical(rawInput.topic),
  };
  const existingIds = await getExistingArxivIds();
  const {
    sources: sourcesToQuery,
    failedSources,
    items: allItems,
  } = await queryAllSources(input, logger);
  markExistingItems(allItems, existingIds);

  const totalFound = allItems.length;
  const inRegistry = allItems.filter((i) => i.alreadyInRegistry).length;

  // Apply relevance filtering to remove off-topic results
  const threshold = input.relevanceThreshold;
  const relevantItems = filterByRelevance(
    allItems.filter((i) => !i.alreadyInRegistry),
    input.topic,
    threshold
  ).slice(0, input.maxResults);

  const filteredOut = totalFound - inRegistry - relevantItems.length;
  if (filteredOut > 0) {
    logger.debug('Filtered out irrelevant results', {
      threshold,
      filteredOut,
      remaining: relevantItems.length,
    });
  }

  return {
    topic: input.topic,
    sourcesQueried: sourcesToQuery,
    failedSources,
    items: relevantItems,
    totalFound,
    alreadyInRegistry: inRegistry,
    newItems: relevantItems.length,
    filteredByRelevance: filteredOut,
  };
}

// =============================================================================
// Memory Recording (Issue #753)
// =============================================================================

/** Records successful research discovery. Best-effort. */
function recordDiscoverySuccess(topic: string, newItems: number, sources: string[]): void {
  try {
    const memory = getToolMemory();
    memory.recordLearning({
      pattern: `Research discovery: ${String(newItems)} new items for "${topic}"`,
      context: `sources=${sources.join(',')}`,
      confidence: 0.7,
      source: 'research-discover',
    });
    void memory.runPromotionPipeline().catch((error: unknown) => {
      createLogger({ tool: 'research-discover' }).warn('Promotion pipeline failed', { error });
    });
  } catch (error: unknown) {
    createLogger({ tool: 'research-discover' }).warn('Failed to record successful discovery', {
      error: getErrorMessage(error),
      topic,
    });
  }
}

/** Records discovery outcome (success or failure) to the outcome store. Best-effort. */
function recordDiscoveryOutcome(success: boolean, durationMs: number, errorMsg?: string): void {
  try {
    if (!success && errorMsg !== undefined) {
      const memory = getToolMemory();
      memory.recordError({
        error: `Research discovery failed: ${errorMsg.slice(0, 150)}`,
        solution: 'Check network access and source availability',
        filePattern: 'mcp/tools/research-discover',
      });
    }
    const store = getOutcomeStore();
    store.append({
      id: `research-discover-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`,
      cli: DEFAULT_CLI,
      category: 'research',
      model: 'research-discover',
      success,
      durationMs,
      timestamp: new Date().toISOString(),
      source: 'manual',
      ...(!success && errorMsg !== undefined
        ? {
            failureCategory: categorizeOutcomeErrorMessage(errorMsg),
            errorMessage: errorMsg.slice(0, 500),
          }
        : {}),
    });
  } catch (storeErr: unknown) {
    createLogger({ tool: 'research-discover' }).debug(
      'Failed to record discovery outcome to store',
      {
        error: storeErr instanceof Error ? storeErr.message : String(storeErr),
      }
    );
  }
}

// =============================================================================
// MCP TOOL
// =============================================================================

/**
 * Creates the core handler logic for research_discover tool.
 */
function createResearchDiscoverHandler(deps: ResearchDiscoverDeps) {
  return async (args: unknown, ctx: HandlerContext): Promise<ToolResult> => {
    const validationResult = ResearchDiscoverInputSchema.safeParse(args);
    if (!validationResult.success) {
      return toolError(`Validation error: ${formatZodError(validationResult.error)}`);
    }

    ctx.logger.debug('Discovering research', {
      topic: validationResult.data.topic,
      source: validationResult.data.source,
    });

    const logger = deps.logger ?? createLogger({ tool: 'research_discover' });
    const startMs = Date.now();
    const response = await withToolError('Discovery failed', logger, async () => {
      const result = await executeDiscovery(validationResult.data, logger);
      recordDiscoverySuccess(result.topic, result.newItems, result.sourcesQueried);
      return toolSuccess(JSON.stringify(result, null, 2));
    });
    const durationMs = Date.now() - startMs;
    if (response.isError === true) {
      const errorText = response.content[0]?.text ?? 'unknown error';
      recordDiscoveryOutcome(false, durationMs, errorText);
    } else {
      recordDiscoveryOutcome(true, durationMs);
    }
    return response;
  };
}

/**
 * Registers the research_discover tool with the MCP server.
 *
 * @category MCP
 * @param server - MCP server instance
 * @param deps - Tool dependencies
 */
export function registerResearchDiscoverTool(server: McpServer, deps: ResearchDiscoverDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'research_discover' });
  const toolSchema = {
    topic: z.string().min(1).max(200).describe('Research topic to search for'),
    source: z
      .enum([
        'arxiv',
        'github',
        'google_ai',
        'meta_fair',
        'microsoft',
        'deepmind',
        'semantic_scholar',
        'papers_with_code',
        'openalex',
        'all',
      ])
      .optional()
      .describe('Source to search'),
    maxResults: z.number().min(1).max(MAX_RESULTS_PER_SOURCE).optional().describe('Max results'),
    sinceDate: z.string().optional().describe('Only results after this date (YYYY-MM-DD)'),
    relevanceThreshold: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe('Minimum relevance score (0-1) to include results. Higher = stricter filtering.'),
  };

  const description =
    'Discover new research papers and repositories from external sources. ' +
    'Searches arXiv, GitHub, and other sources. Filters out items already in the registry.';

  const secureHandler = createSecureHandler(createResearchDiscoverHandler(deps), {
    toolName: 'research_discover',
    rateLimiter: deps.rateLimiter,
    logger,
  });

  const timeoutMs = getToolTimeout('research_discover', deps.security);
  const wrappedHandler = wrapToolWithTimeout('research_discover', secureHandler, {
    timeoutMs,
    logger,
  });

  server.registerTool(
    'research_discover',
    { description, inputSchema: toolSchema },
    toSdkCallback(wrappedHandler)
  );
  logger.info('Registered research_discover tool with secure handler and timeout protection');
}
