/**
 * nexus-agents/mcp - Search Codebase MCP Tool
 *
 * Keyword search across an indexed codebase symbol table.
 * Returns matching functions, classes, methods, interfaces, and types
 * with relevance scoring and file locations.
 *
 * @module mcp/tools/search-codebase-tool
 */

import { resolve, sep } from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createLogger, formatZodError, getTimeProvider } from '../../core/index.js';
import {
  CodebaseIndex,
  DEFAULT_INDEX_MAX_DEPTH,
  MAX_INDEX_MAX_DEPTH,
  type SearchResult,
} from '../../indexer/codebase-search.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import {
  toolStructuredError,
  toolSuccess,
  type BaseMcpToolDeps,
  type ToolResult,
} from './tool-result.js';
import { getToolAnnotations } from '../tool-annotations.js';

// ============================================================================
// Input Schema
// ============================================================================

export const SearchCodebaseInputSchema = z.object({
  query: z.string().min(1).max(200).describe('Search query (symbol name, keyword, or pattern)'),
  directory: z
    .string()
    .min(1)
    .max(500)
    .optional()
    .describe('Directory to search (default: current working directory)'),
  limit: z.number().min(1).max(50).optional().describe('Max results (default: 20)'),
  mode: z
    .enum(['search', 'summary', 'list'])
    .optional()
    .describe('search: find symbols. summary: file overview. list: list indexed files.'),
  maxDepth: z
    .number()
    .int()
    .min(1)
    .max(MAX_INDEX_MAX_DEPTH)
    .optional()
    .describe(
      `Max directory depth to index below "directory" (default: ${String(DEFAULT_INDEX_MAX_DEPTH)}, clamped to ${String(MAX_INDEX_MAX_DEPTH)}). Raise this if results seem incomplete for a deeply nested tree.`
    ),
});

export type SearchCodebaseInput = z.infer<typeof SearchCodebaseInputSchema>;
export type SearchCodebaseDeps = BaseMcpToolDeps;

// ============================================================================
// Index Cache (closes #2970 — race + unbounded retention)
// ============================================================================
//
// Previously this was a single `cachedIndex` / `cachedDir` pair. Two bugs:
//
// 1. Race: two concurrent MCP `search_codebase` calls both missed the cache
//    and each `await index.index(4)` — a seconds-long tree-walk + AST
//    extraction over every TS/JS file. The loser's work was thrown away.
//
// 2. Unbounded retention with stale results: the index (~50,000 symbols ×
//    ~200 bytes) was kept for the life of the MCP server with no TTL, no
//    LRU, no file-watcher invalidation. Memory grew + search results went
//    stale after the user's first `git pull` / file edit.
//
// Replaced with a small LRU+TTL bounded by directory count, plus an inflight
// map that coalesces concurrent indexing of the same dir.

/** Max number of indexed directories retained simultaneously. */
const MAX_CACHED_DIRS = 3;
/** Cached indexes expire after this many ms; next call re-indexes from disk. */
const INDEX_TTL_MS = 15 * 60 * 1000;

interface CachedIndexEntry {
  readonly index: CodebaseIndex;
  readonly expiresAt: number;
  /** The maxDepth the cached index was built with — see staleness check below. */
  readonly maxDepth: number;
}

const indexCache = new Map<string, CachedIndexEntry>();
const inflightIndex = new Map<string, Promise<CodebaseIndex>>();

function getFromCache(dir: string, maxDepth: number): CodebaseIndex | undefined {
  const entry = indexCache.get(dir);
  if (entry === undefined) return undefined;
  if (entry.expiresAt <= getTimeProvider().now()) {
    indexCache.delete(dir);
    return undefined;
  }
  // A cached index built with a SHALLOWER depth than now requested would
  // silently reintroduce the truncation this cache-staleness check exists to
  // prevent (#4243) — treat it as a miss so the deeper walk actually runs.
  if (entry.maxDepth < maxDepth) {
    indexCache.delete(dir);
    return undefined;
  }
  // Refresh LRU position: delete then re-insert moves it to MRU.
  indexCache.delete(dir);
  indexCache.set(dir, entry);
  return entry.index;
}

function putInCache(dir: string, index: CodebaseIndex, maxDepth: number): void {
  indexCache.set(dir, { index, expiresAt: getTimeProvider().now() + INDEX_TTL_MS, maxDepth });
  while (indexCache.size > MAX_CACHED_DIRS) {
    // Map iteration is insertion order, so the first key is the LRU candidate.
    const lruKey = indexCache.keys().next().value;
    if (lruKey === undefined) break;
    indexCache.delete(lruKey);
  }
}

async function getIndex(dir: string, maxDepth: number): Promise<CodebaseIndex> {
  const cached = getFromCache(dir, maxDepth);
  if (cached !== undefined) return cached;

  // Coalesce: if another caller is already indexing this dir, await their result.
  // Note: coalescing is keyed by dir only, not maxDepth — a concurrent request
  // for a deeper walk than the in-flight one may receive a shallower result.
  // Narrow race window (rare on repeat calls); the TTL/staleness check above
  // is what prevents it from persisting past the in-flight call.
  const inflight = inflightIndex.get(dir);
  if (inflight !== undefined) return inflight;

  const promise = (async (): Promise<CodebaseIndex> => {
    const index = new CodebaseIndex(dir);
    await index.index(maxDepth);
    putInCache(dir, index, maxDepth);
    return index;
  })().finally(() => {
    inflightIndex.delete(dir);
  });
  inflightIndex.set(dir, promise);
  return promise;
}

// ============================================================================
// Helpers
// ============================================================================

/** Resolve and validate directory against path traversal. */
function resolveSearchDir(directory: string | undefined): { dir: string } | { error: string } {
  const dir = resolve(directory ?? process.cwd());
  // The `+ sep` is load-bearing: a sibling directory whose name starts with
  // the cwd basename (`/home/u/projEVIL` for cwd `/home/u/proj`) bypasses a
  // bare startsWith. Match security/safe-path.ts.
  const cwdRoot = resolve('.');
  if (dir !== cwdRoot && !dir.startsWith(cwdRoot + sep)) {
    return { error: `Path traversal denied: directory must be within ${cwdRoot}` };
  }
  return { dir };
}

/**
 * A note appended whenever the tree-walk hit `maxDepth` before finishing —
 * makes truncation visible instead of a silently-incomplete index (#4243).
 */
function skippedDirsNote(index: CodebaseIndex): string {
  const { skippedDirs } = index.stats;
  if (skippedDirs === 0) return '';
  return `\n\nNote: ${String(skippedDirs)} subdirector${skippedDirs === 1 ? 'y was' : 'ies were'} not indexed because maxDepth was exhausted. Pass a larger maxDepth (up to ${String(MAX_INDEX_MAX_DEPTH)}) to include them.`;
}

/** Format default search-mode output — handles both the empty and non-empty cases. */
function formatSearchOutput(index: CodebaseIndex, query: string, results: SearchResult[]): string {
  if (results.length === 0) {
    return `No symbols matching "${query}" found in ${String(index.stats.files)} indexed files.${skippedDirsNote(index)}`;
  }

  const output = results
    .map((r) => {
      const exp = r.symbol.exported ? 'export ' : '';
      return `[${r.matchType}] ${exp}${r.symbol.kind} ${r.symbol.name} (${r.symbol.filePath}:${String(r.symbol.startLine)})`;
    })
    .join('\n');

  return `${String(results.length)} results for "${query}":\n\n${output}${skippedDirsNote(index)}`;
}

/** Format list mode output. */
function formatListOutput(index: CodebaseIndex): string {
  const files = index.listFiles();
  const output = files
    .sort((a, b) => b.symbols - a.symbols)
    .map(
      (f) =>
        `${String(f.symbols).padStart(4)} symbols  ${String(f.lines).padStart(5)} lines  ${f.path}`
    )
    .join('\n');
  return `${String(index.stats.files)} files, ${String(index.stats.symbols)} symbols indexed\n\n${output}${skippedDirsNote(index)}`;
}

// ============================================================================
// Handler
// ============================================================================

async function searchCodebaseHandler(args: unknown, ctx: HandlerContext): Promise<ToolResult> {
  const parsed = SearchCodebaseInputSchema.safeParse(args);
  if (!parsed.success) {
    return toolStructuredError({
      errorCategory: 'validation',
      message: `Validation error: ${formatZodError(parsed.error)}`,
    });
  }

  const { query, directory, limit, mode, maxDepth } = parsed.data;
  const dirResult = resolveSearchDir(directory);
  if ('error' in dirResult) {
    // resolveSearchDir only fails on a path-traversal denial.
    return toolStructuredError({ errorCategory: 'permission', message: dirResult.error });
  }

  try {
    const index = await getIndex(dirResult.dir, maxDepth ?? DEFAULT_INDEX_MAX_DEPTH);

    if (mode === 'list') return toolSuccess(formatListOutput(index));

    if (mode === 'summary') {
      const summary = index.getFileSummary(query);
      if (summary === undefined) {
        return toolSuccess(
          `File "${query}" not found in index. Use mode=list to see indexed files.`
        );
      }
      return toolSuccess(JSON.stringify(summary, null, 2));
    }

    // Default: search mode
    const results = index.search(query, limit ?? 20);
    return toolSuccess(formatSearchOutput(index, query, results));
  } catch (caught: unknown) {
    const e = caught instanceof Error ? caught : new Error(String(caught));
    ctx.logger.error('Codebase search failed', e);
    return toolStructuredError({
      errorCategory: 'internal',
      message: `Search failed: ${e.message}`,
    });
  }
}

// ============================================================================
// Testing exports (#2159)
// ============================================================================

/** Test-only surface — do not import in production code. */
export const _testing = {
  /** Raw handler for unit testing (bypasses secure-handler + timeout middleware). */
  searchCodebaseHandler,
  /** Exposes the shared dir-validation + resolution logic. */
  resolveSearchDir,
  /** Clears the LRU index cache and any inflight promises so tests can start fresh. */
  clearIndexCache: (): void => {
    indexCache.clear();
    inflightIndex.clear();
  },
  /** Inspect the LRU for tests. */
  getCachedDirs: (): readonly string[] => [...indexCache.keys()],
  /** Inspect inflight indexing for tests. */
  getInflightDirs: (): readonly string[] => [...inflightIndex.keys()],
};

// ============================================================================
// Registration
// ============================================================================

/** @category MCP */
export function registerSearchCodebaseTool(server: McpServer, deps: SearchCodebaseDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'search_codebase' });

  const toolSchema = {
    query: z.string().min(1).max(200).describe('Search query or file path'),
    directory: z.string().max(500).optional().describe('Directory to index'),
    limit: z.number().min(1).max(50).optional().describe('Max results'),
    mode: z.enum(['search', 'summary', 'list']).optional().describe('search/summary/list'),
    maxDepth: z
      .number()
      .int()
      .min(1)
      .max(MAX_INDEX_MAX_DEPTH)
      .optional()
      .describe(
        `Max directory depth to index (default: ${String(DEFAULT_INDEX_MAX_DEPTH)}, clamped to ${String(MAX_INDEX_MAX_DEPTH)})`
      ),
  };

  const description =
    'Cross-file search across an index of declared symbol NAMES in the working directory — ' +
    'declarations only (functions, classes, methods, interfaces, types); NOT usages, call-sites, ' +
    'comments, or string/text content. Builds an in-memory symbol index and ranks matches with ' +
    'relevance scoring. Use when you need to find where a symbol is DECLARED across MANY files. ' +
    'For the AST of a single file, use `extract_symbols` instead. ' +
    'Modes: search (find by keyword), summary (per-file overview), list (all indexed files).';

  const secureHandler = createSecureHandler(searchCodebaseHandler, {
    toolName: 'search_codebase',
    rateLimiter: deps.rateLimiter,
    logger,
  });

  const timeoutMs = getToolTimeout('search_codebase', deps.security);
  const wrapped = wrapToolWithTimeout('search_codebase', secureHandler, { timeoutMs, logger });

  server.registerTool(
    'search_codebase',
    { description, inputSchema: toolSchema, annotations: getToolAnnotations('search_codebase') },
    toSdkCallback(wrapped)
  );
  logger.info('Registered search_codebase tool');
}
