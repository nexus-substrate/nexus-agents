/**
 * nexus-agents/mcp - Extract Symbols MCP Tool
 *
 * AST-based symbol extraction for token-efficient code retrieval.
 * Returns function, class, method, interface, type definitions from
 * TypeScript/JavaScript files — 80%+ smaller than full file reads.
 *
 * @module mcp/tools/extract-symbols-tool
 */

import { resolve } from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createLogger, formatZodError } from '../../core/index.js';
import { extractSymbols, extractSymbolIndex } from '../../indexer/symbol-extractor.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import { toolError, toolSuccess, type BaseMcpToolDeps, type ToolResult } from './tool-result.js';

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

async function extractSymbolsHandler(args: unknown, ctx: HandlerContext): Promise<ToolResult> {
  const parsed = ExtractSymbolsInputSchema.safeParse(args);
  if (!parsed.success) {
    return toolError(`Validation error: ${formatZodError(parsed.error)}`);
  }

  const { filePath, mode } = parsed.data;
  const resolvedPath = resolve(filePath);

  // Path traversal guard — restrict to cwd subtree (security audit 2026-04-10)
  const cwdRoot = resolve('.');
  if (!resolvedPath.startsWith(cwdRoot)) {
    return toolError(`Path traversal denied: path must be within ${cwdRoot}`);
  }

  try {
    if (mode === 'full') {
      const result = await extractSymbols(resolvedPath);
      return toolSuccess(
        JSON.stringify(
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
        )
      );
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
    return toolError(`Symbol extraction failed: ${e.message}`);
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
    'Extract function, class, method, interface, and type definitions ' +
    'from a TypeScript/JavaScript file. Returns a compact symbol index ' +
    '(80%+ smaller than reading the full file) for token-efficient code retrieval.';

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
    { description, inputSchema: toolSchema },
    toSdkCallback(wrapped)
  );
  logger.info('Registered extract_symbols tool');
}
