/**
 * nexus-agents/mcp - Search Codebase MCP Tool
 *
 * Keyword search across an indexed codebase symbol table.
 * Returns matching functions, classes, methods, interfaces, and types
 * with relevance scoring and file locations.
 *
 * @module mcp/tools/search-codebase-tool
 */

import { resolve } from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createLogger, formatZodError } from '../../core/index.js';
import { CodebaseIndex } from '../../indexer/codebase-search.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import { toolError, toolSuccess, type BaseMcpToolDeps, type ToolResult } from './tool-result.js';

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
});

export type SearchCodebaseInput = z.infer<typeof SearchCodebaseInputSchema>;
export type SearchCodebaseDeps = BaseMcpToolDeps;

// ============================================================================
// Index Cache (reuse across calls for same directory)
// ============================================================================

let cachedIndex: CodebaseIndex | undefined;
let cachedDir = '';

async function getIndex(dir: string): Promise<CodebaseIndex> {
  if (cachedIndex !== undefined && cachedDir === dir) {
    return cachedIndex;
  }
  const index = new CodebaseIndex(dir);
  await index.index(4);
  cachedIndex = index;
  cachedDir = dir;
  return index;
}

// ============================================================================
// Handler
// ============================================================================

async function searchCodebaseHandler(args: unknown, ctx: HandlerContext): Promise<ToolResult> {
  const parsed = SearchCodebaseInputSchema.safeParse(args);
  if (!parsed.success) {
    return toolError(`Validation error: ${formatZodError(parsed.error)}`);
  }

  const { query, directory, limit, mode } = parsed.data;
  const dir = resolve(directory ?? process.cwd());

  try {
    const index = await getIndex(dir);

    if (mode === 'list') {
      const files = index.listFiles();
      const output = files
        .sort((a, b) => b.symbols - a.symbols)
        .map(
          (f) =>
            `${String(f.symbols).padStart(4)} symbols  ${String(f.lines).padStart(5)} lines  ${f.path}`
        )
        .join('\n');
      return toolSuccess(
        `${String(index.stats.files)} files, ${String(index.stats.symbols)} symbols indexed\n\n${output}`
      );
    }

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
    if (results.length === 0) {
      return toolSuccess(
        `No symbols matching "${query}" found in ${String(index.stats.files)} indexed files.`
      );
    }

    const output = results
      .map((r) => {
        const exp = r.symbol.exported ? 'export ' : '';
        return `[${r.matchType}] ${exp}${r.symbol.kind} ${r.symbol.name} (${r.symbol.filePath}:${String(r.symbol.startLine)})`;
      })
      .join('\n');

    return toolSuccess(`${String(results.length)} results for "${query}":\n\n${output}`);
  } catch (caught: unknown) {
    const e = caught instanceof Error ? caught : new Error(String(caught));
    ctx.logger.error('Codebase search failed', e);
    return toolError(`Search failed: ${e.message}`);
  }
}

// ============================================================================
// Registration
// ============================================================================

export function registerSearchCodebaseTool(server: McpServer, deps: SearchCodebaseDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'search_codebase' });

  const toolSchema = {
    query: z.string().min(1).max(200).describe('Search query or file path'),
    directory: z.string().max(500).optional().describe('Directory to index'),
    limit: z.number().min(1).max(50).optional().describe('Max results'),
    mode: z.enum(['search', 'summary', 'list']).optional().describe('search/summary/list'),
  };

  const description =
    'Search a codebase for functions, classes, methods, interfaces, and types. ' +
    'Builds an in-memory symbol index and supports keyword search with relevance scoring. ' +
    'Modes: search (find symbols), summary (file overview), list (all indexed files).';

  const secureHandler = createSecureHandler(searchCodebaseHandler, {
    toolName: 'search_codebase',
    rateLimiter: deps.rateLimiter,
    logger,
  });

  const timeoutMs = getToolTimeout('search_codebase', deps.security);
  const wrapped = wrapToolWithTimeout('search_codebase', secureHandler, { timeoutMs, logger });

  server.registerTool(
    'search_codebase',
    { description, inputSchema: toolSchema },
    toSdkCallback(wrapped)
  );
  logger.info('Registered search_codebase tool');
}
