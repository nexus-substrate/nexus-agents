/**
 * nexus-agents/mcp - Extract Symbols MCP Tool
 *
 * AST-based symbol extraction for token-efficient code retrieval.
 * Returns function, class, method, interface, type definitions from
 * TypeScript/JavaScript files — 80%+ smaller than full file reads.
 *
 * @module mcp/tools/extract-symbols-tool
 */

import { resolve, sep } from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createLogger, formatZodError } from '../../core/index.js';
import { extractSymbols, extractSymbolIndex } from '../../indexer/symbol-extractor.js';
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

export const ExtractSymbolsInputSchema = z.object({
  filePath: z
    .string()
    .min(1)
    .max(500)
    .describe('Path to TypeScript/JavaScript file to extract symbols from'),
  mode: z
    .enum(['index', 'full'])
    .optional()
    .describe('index: names+lines only (minimal tokens). full: includes source text.'),
});

export type ExtractSymbolsInput = z.infer<typeof ExtractSymbolsInputSchema>;

// ============================================================================
// Dependencies
// ============================================================================

export type ExtractSymbolsDeps = BaseMcpToolDeps;

// ============================================================================
// Handler
// ============================================================================

/** Serialize a full symbol-extraction result to the tool's JSON shape. */
function buildFullSymbolOutput(result: Awaited<ReturnType<typeof extractSymbols>>): string {
  return JSON.stringify(
    {
      filePath: result.filePath,
      totalLines: result.totalLines,
      totalChars: result.totalChars,
      symbolChars: result.symbolChars,
      savingsPercent: result.savingsPercent,
      symbols: result.symbols.map((s) => ({
        name: s.name,
        kind: s.kind,
        startLine: s.startLine,
        endLine: s.endLine,
        exported: s.exported,
        text: s.text,
      })),
    },
    null,
    2
  );
}

async function extractSymbolsHandler(args: unknown, ctx: HandlerContext): Promise<ToolResult> {
  const parsed = ExtractSymbolsInputSchema.safeParse(args);
  if (!parsed.success) {
    return toolStructuredError({
      errorCategory: 'validation',
      message: `Validation error: ${formatZodError(parsed.error)}`,
    });
  }

  const { filePath, mode } = parsed.data;
  const resolvedPath = resolve(filePath);

  // Path traversal guard — restrict to cwd subtree. The `+ sep` is
  // load-bearing: a sibling directory whose name starts with the cwd
  // basename (`/home/u/projEVIL` for cwd `/home/u/proj`) bypasses a bare
  // startsWith. Match security/safe-path.ts.
  const cwdRoot = resolve('.');
  if (resolvedPath !== cwdRoot && !resolvedPath.startsWith(cwdRoot + sep)) {
    return toolStructuredError({
      errorCategory: 'permission',
      message: `Path traversal denied: path must be within ${cwdRoot}`,
    });
  }

  try {
    if (mode === 'full') {
      return toolSuccess(buildFullSymbolOutput(await extractSymbols(resolvedPath)));
    }

    // Default: index mode (minimal tokens)
    const index = await extractSymbolIndex(resolvedPath);
    if (index === '') {
      return toolSuccess('No symbols found (file may not be TypeScript/JavaScript)');
    }
    return toolSuccess(index);
  } catch (caught: unknown) {
    const e = caught instanceof Error ? caught : new Error(String(caught));
    ctx.logger.error('Symbol extraction failed', e);
    return toolStructuredError({
      errorCategory: 'internal',
      message: `Symbol extraction failed: ${e.message}`,
    });
  }
}

// ============================================================================
// Testing exports (#2159)
// ============================================================================

/** Test-only surface — do not import in production code. */
export const _testing = {
  /** Raw handler for unit testing (bypasses secure-handler + timeout middleware). */
  extractSymbolsHandler,
};

// ============================================================================
// Registration
// ============================================================================

/** @category MCP */
export function registerExtractSymbolsTool(server: McpServer, deps: ExtractSymbolsDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'extract_symbols' });

  const toolSchema = {
    filePath: z.string().min(1).max(500).describe('Path to TypeScript/JavaScript file'),
    mode: z
      .enum(['index', 'full'])
      .optional()
      .describe('index (default): names+lines. full: includes source text'),
  };

  const description =
    'Parse a SINGLE TypeScript/JavaScript file with the TypeScript compiler API and return its structural AST symbols. ' +
    'Use when you need the structure of one file — function/class/method/interface/type definitions. ' +
    'Not a cross-file search; for that use `search_codebase`. ' +
    'Output is 80%+ smaller than reading the full file.';

  const secureHandler = createSecureHandler(extractSymbolsHandler, {
    toolName: 'extract_symbols',
    rateLimiter: deps.rateLimiter,
    logger,
  });

  const timeoutMs = getToolTimeout('extract_symbols', deps.security);
  const wrapped = wrapToolWithTimeout('extract_symbols', secureHandler, {
    timeoutMs,
    logger,
  });

  server.registerTool(
    'extract_symbols',
    { description, inputSchema: toolSchema, annotations: getToolAnnotations('extract_symbols') },
    toSdkCallback(wrapped)
  );
  logger.info('Registered extract_symbols tool');
}
