/**
 * nexus-agents/mcp - Extract Symbols MCP Tool
 *
 * AST-based symbol extraction for token-efficient code retrieval.
 * Returns function, class, method, interface, type definitions from
 * TypeScript/JavaScript files — 80%+ smaller than full file reads.
 *
 * @module mcp/tools/extract-symbols-tool
 */

import { extname, resolve, sep } from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createLogger, formatZodError } from '../../core/index.js';
import {
  extractSymbols,
  extractSymbolIndexResult,
  SUPPORTED_EXTENSIONS,
  type EmptyIndexReason,
  type CodeSymbol,
} from '../../indexer/symbol-extractor.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import { recordToolRefusal } from '../../core/task-analysis/tool-refusal-gap.js';
import {
  toolStructuredError,
  toolSuccess,
  type BaseMcpToolDeps,
  type ToolResult,
} from './tool-result.js';
import { getToolAnnotations } from '../tool-annotations.js';

// ============================================================================
// Full-mode output cap (#4253)
// ============================================================================

/**
 * Default total-chars budget for full-mode symbol source text. Before this,
 * full mode dumped every matched symbol's entire source text with no cap —
 * a large file or large match set could blow a token budget with no
 * backpressure. Overridable per call via the `maxChars` input field.
 */
export const DEFAULT_EXTRACT_MAX_CHARS = 20_000;

/** Default cap on the number of symbols emitted in full mode (#4253). Overridable via `maxSymbols`. */
export const DEFAULT_EXTRACT_MAX_SYMBOLS = 200;

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
  maxChars: z
    .number()
    .int()
    .positive()
    .max(1_000_000)
    .optional()
    .describe(
      `full mode only: cap on total emitted symbol source chars (default ${String(DEFAULT_EXTRACT_MAX_CHARS)}). Excess is truncated and reported, never silently dropped.`
    ),
  maxSymbols: z
    .number()
    .int()
    .positive()
    .max(10_000)
    .optional()
    .describe(
      `full mode only: cap on number of symbols emitted (default ${String(DEFAULT_EXTRACT_MAX_SYMBOLS)}).`
    ),
});

export type ExtractSymbolsInput = z.infer<typeof ExtractSymbolsInputSchema>;

// ============================================================================
// Dependencies
// ============================================================================

export type ExtractSymbolsDeps = BaseMcpToolDeps;

// ============================================================================
// Handler
// ============================================================================

/** A symbol as rendered in the full-mode JSON payload. */
interface OutputSymbol {
  name: string;
  kind: CodeSymbol['kind'];
  startLine: number;
  endLine: number;
  exported: boolean;
  text: string;
}

/** Outcome of applying the full-mode output cap (#4253). */
interface CappedSymbols {
  symbols: OutputSymbol[];
  omittedSymbols: number;
  omittedChars: number;
  truncated: boolean;
}

function toOutputSymbol(s: CodeSymbol, text?: string): OutputSymbol {
  return {
    name: s.name,
    kind: s.kind,
    startLine: s.startLine,
    endLine: s.endLine,
    exported: s.exported,
    text: text ?? s.text,
  };
}

function sumChars(symbols: readonly CodeSymbol[]): number {
  return symbols.reduce((sum, s) => sum + s.text.length, 0);
}

/** Truncate a symbol's text to `remaining` chars, appending a reported ellipsis marker. */
function truncateSymbolText(s: CodeSymbol, remaining: number): OutputSymbol {
  const kept = s.text.slice(0, Math.max(0, remaining));
  const omittedChars = s.text.length - kept.length;
  return toOutputSymbol(s, `${kept}\n… [truncated: ${String(omittedChars)} more chars omitted]`);
}

/**
 * Running-budget pass over an already symbol-count-capped list — helper for
 * {@link capSymbols}. Emits symbols until `maxChars` is exhausted; the symbol
 * that would overflow the budget is truncated (not dropped) with an ellipsis
 * marker, and every symbol after it is counted as omitted.
 */
function applyCharBudget(
  symbols: readonly CodeSymbol[],
  maxChars: number
): { symbols: OutputSymbol[]; omittedCount: number; omittedChars: number } {
  const out: OutputSymbol[] = [];
  let used = 0;
  for (let i = 0; i < symbols.length; i++) {
    const s = symbols[i];
    if (s === undefined) break;
    const remaining = maxChars - used;
    if (remaining <= 0) {
      const rest = symbols.slice(i);
      return { symbols: out, omittedCount: rest.length, omittedChars: sumChars(rest) };
    }
    if (s.text.length > remaining) {
      out.push(truncateSymbolText(s, remaining));
      const rest = symbols.slice(i + 1);
      return {
        symbols: out,
        omittedCount: rest.length,
        omittedChars: s.text.length - remaining + sumChars(rest),
      };
    }
    out.push(toOutputSymbol(s));
    used += s.text.length;
  }
  return { symbols: out, omittedCount: 0, omittedChars: 0 };
}

/**
 * Cap full-mode symbol output to a total char budget and symbol count
 * (#4253). Previously full mode emitted every matched symbol's entire source
 * text with no limit — a large file/large match set could blow a token
 * budget with no backpressure. Symbols beyond `maxSymbols`, or beyond the
 * running `maxChars` budget, are omitted (the boundary symbol is truncated
 * with a reported ellipsis marker instead of silently dropped); the omitted
 * count/chars are always returned so callers see backpressure, not a silent cut.
 */
function capSymbols(
  all: readonly CodeSymbol[],
  maxChars: number,
  maxSymbols: number
): CappedSymbols {
  const kept = all.slice(0, Math.max(0, maxSymbols));
  const countOmitted = all.slice(kept.length);
  const budgeted = applyCharBudget(kept, maxChars);

  const omittedSymbols = countOmitted.length + budgeted.omittedCount;
  const omittedChars = sumChars(countOmitted) + budgeted.omittedChars;
  return {
    symbols: budgeted.symbols,
    omittedSymbols,
    omittedChars,
    truncated: omittedSymbols > 0,
  };
}

/** Serialize a full symbol-extraction result to the tool's JSON shape, applying the output cap (#4253). */
function buildFullSymbolOutput(
  result: Awaited<ReturnType<typeof extractSymbols>>,
  maxChars: number,
  maxSymbols: number
): string {
  const capped = capSymbols(result.symbols, maxChars, maxSymbols);
  const payload: Record<string, unknown> = {
    filePath: result.filePath,
    totalLines: result.totalLines,
    totalChars: result.totalChars,
    symbolChars: result.symbolChars,
    savingsPercent: result.savingsPercent,
    symbols: capped.symbols,
  };
  if (capped.truncated) {
    payload['truncated'] = true;
    payload['omittedSymbols'] = capped.omittedSymbols;
    payload['omittedChars'] = capped.omittedChars;
    payload['maxChars'] = maxChars;
    payload['maxSymbols'] = maxSymbols;
  }
  return JSON.stringify(payload, null, 2);
}

async function extractSymbolsHandler(args: unknown, ctx: HandlerContext): Promise<ToolResult> {
  const parsed = ExtractSymbolsInputSchema.safeParse(args);
  if (!parsed.success) {
    return toolStructuredError({
      errorCategory: 'validation',
      message: `Validation error: ${formatZodError(parsed.error)}`,
    });
  }

  const { filePath, mode, maxChars, maxSymbols } = parsed.data;
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
      const output = buildFullSymbolOutput(
        await extractSymbols(resolvedPath),
        maxChars ?? DEFAULT_EXTRACT_MAX_CHARS,
        maxSymbols ?? DEFAULT_EXTRACT_MAX_SYMBOLS
      );
      return toolSuccess(output);
    }

    // Default: index mode (minimal tokens)
    // #4517: report WHICH of the two empty cases this is. The old single
    // message guessed "file may not be TypeScript/JavaScript" for both, and
    // sent a reader hunting a file-type problem on a valid .ts barrel whose
    // 20 exports were all re-exports declaring nothing locally.
    const result = await extractSymbolIndexResult(resolvedPath);
    if (result.kind === 'empty') {
      // #4651: an `unsupported` result is a tool that ran and declined work it
      // cannot do — real, agent-chosen demand for a capability we lack. Record
      // it so the frequency is measurable (#4517 gates a tree-sitter dependency
      // on exactly this number). Recorded HERE and not in the extractor: this
      // is the boundary an agent actually asks across, so internal callers and
      // the search_codebase sweep — which pre-filters by extension and never
      // reaches the gate — cannot inflate the count.
      //
      // `no-declarations` is deliberately NOT recorded. The file parsed fine
      // and genuinely declares nothing; that is a measured zero, not a missing
      // capability, and conflating them would make the count meaningless.
      recordRefusalIfUnsupported(result.reason, resolvedPath);
      return toolSuccess(emptyIndexMessage(result.reason, resolvedPath));
    }
    return toolSuccess(result.index);
  } catch (caught: unknown) {
    const e = caught instanceof Error ? caught : new Error(String(caught));
    ctx.logger.error('Symbol extraction failed', e);
    return toolStructuredError({
      errorCategory: 'internal',
      message: `Symbol extraction failed: ${e.message}`,
    });
  }
}

/**
 * Record a tool-refusal capability gap when the file could not be parsed (#4651).
 *
 * `unsupported` is a tool that ran and declined work it cannot do — real,
 * agent-chosen demand for a capability we lack, and what #4517 gates a
 * tree-sitter dependency on. `no-declarations` is deliberately NOT recorded:
 * the file parsed fine and genuinely declares nothing, which is a measured
 * zero rather than a missing capability. Conflating them makes the count
 * meaningless — the same distinction #4534 drew in the user-facing message.
 *
 * Recorded at this boundary rather than in the extractor because this is where
 * an agent actually asks. Internal callers and the `search_codebase` sweep —
 * which pre-filters by extension and never reaches the gate — cannot inflate it.
 */
function recordRefusalIfUnsupported(reason: EmptyIndexReason, resolvedPath: string): void {
  if (reason !== 'unsupported') return;
  const ext = extname(resolvedPath).toLowerCase();
  recordToolRefusal(
    {
      tool: 'extract_symbols',
      capability: ext,
      suggestion:
        `extract_symbols parses ${SUPPORTED_EXTENSIONS.join(', ')} only. ` +
        `Supporting ${ext === '' ? 'extensionless files' : ext} needs a parser for it.`,
    },
    { goal: `extract_symbols ${resolvedPath}` }
  );
}

/**
 * Explain an empty index in terms of what was actually determined (#4517).
 *
 * `unsupported` is an absence of measurement — the file was never parsed, so
 * nothing is claimed about its contents. `no-declarations` is a measurement:
 * the file parsed and declares nothing locally. Naming the re-export case
 * matters because it is the common one and it looks like a failure otherwise.
 */
function emptyIndexMessage(reason: EmptyIndexReason, filePath: string): string {
  if (reason === 'unsupported') {
    const ext = extname(filePath).toLowerCase();
    const shown = ext === '' ? '(no extension)' : ext;
    return (
      `Not parsed: extract_symbols cannot read ${shown} files. ` +
      `Supported: ${SUPPORTED_EXTENSIONS.join(', ')}. ` +
      `This says nothing about whether the file contains symbols.`
    );
  }
  return (
    'Parsed successfully; no local declarations found. ' +
    'A re-export barrel (`export { X } from ...`) reports zero symbols because ' +
    're-exports declare nothing locally.'
  );
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
    maxChars: z
      .number()
      .int()
      .positive()
      .max(1_000_000)
      .optional()
      .describe(
        `full mode only: cap on total emitted symbol source chars (default ${String(DEFAULT_EXTRACT_MAX_CHARS)})`
      ),
    maxSymbols: z
      .number()
      .int()
      .positive()
      .max(10_000)
      .optional()
      .describe(
        `full mode only: cap on number of symbols emitted (default ${String(DEFAULT_EXTRACT_MAX_SYMBOLS)})`
      ),
  };

  const description =
    'Parse a SINGLE TypeScript/JavaScript file with the TypeScript compiler API and return its structural AST symbols. ' +
    'Use when you need the structure of one file — function/class/method/interface/type definitions. ' +
    'Not a cross-file search; for that use `search_codebase`. ' +
    'Output is 80%+ smaller than reading the full file. ' +
    `Full mode caps total emitted source at ${String(DEFAULT_EXTRACT_MAX_CHARS)} chars / ${String(DEFAULT_EXTRACT_MAX_SYMBOLS)} symbols by default (override via maxChars/maxSymbols); truncation is reported, never silent.`;

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
