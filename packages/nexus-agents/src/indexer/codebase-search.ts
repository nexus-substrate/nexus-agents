/**
 * Codebase search — keyword search across symbol indices.
 *
 * Builds an in-memory symbol index for a directory of TS/JS files,
 * then supports keyword search, file summaries, and symbol lookup.
 *
 * Inspired by Augment Code's Context Engine. Uses the existing
 * extractSymbols() function for AST parsing.
 *
 * @module indexer/codebase-search
 */

import { readdir } from 'node:fs/promises';
import { resolve, extname, relative } from 'node:path';
import {
  extractSymbols,
  SUPPORTED_EXTENSIONS,
  type CodeSymbol,
  type SymbolExtractionResult,
} from './symbol-extractor.js';

/** A symbol with its source file path. */
export interface IndexedSymbol extends CodeSymbol {
  /** Relative file path from the indexed root. */
  filePath: string;
}

/** Search result with relevance scoring. */
export interface SearchResult {
  symbol: IndexedSymbol;
  /** Relevance score (higher = better match). */
  score: number;
  /** How the query matched (exact, prefix, substring, word). */
  matchType: 'exact' | 'prefix' | 'substring' | 'word';
}

/** File summary — compact overview of a source file. */
export interface FileSummary {
  filePath: string;
  totalLines: number;
  exportedSymbols: number;
  privateSymbols: number;
  kinds: Record<string, number>;
}

/** Index statistics. */
export interface IndexStats {
  totalFiles: number;
  totalSymbols: number;
  indexedAt: string;
  /** Directories not descended into because `maxDepth` was exhausted (#4243). */
  skippedDirs: number;
}

/** Default recursion depth for `CodebaseIndex.index()` (#4243 — was hardcoded 4). */
export const DEFAULT_INDEX_MAX_DEPTH = 24;
/** Upper clamp for caller-supplied `maxDepth` to bound worst-case tree-walk cost. */
export const MAX_INDEX_MAX_DEPTH = 64;

// Score weights for different match types
const SCORE_EXACT = 20;
const SCORE_PREFIX = 10;
const SCORE_WORD = 5;
const SCORE_SUBSTRING = 2;
const SCORE_EXPORTED_BONUS = 3;

function isSourceFile(name: string): boolean {
  const ext = extname(name).toLowerCase();
  return (
    // #4640: take the list from the extractor rather than keeping a copy. The
    // two sat on opposite sides of the same decision — `extract_symbols` reaches
    // the extension gate at symbol-extractor.ts:162, while this sweep filters
    // *before* it — so a language added to SUPPORTED_EXTENSIONS was parsed by
    // one tool and silently never indexed by the other.
    SUPPORTED_EXTENSIONS.includes(ext) &&
    !name.endsWith('.test.ts') &&
    !name.endsWith('.test.tsx') &&
    !name.endsWith('.d.ts')
  );
}

/** Result of a recursive source-file walk: the files found plus a truncation signal. */
export interface FindSourceFilesResult {
  files: string[];
  /** Count of directories that were NOT descended into because maxDepth hit 0. */
  skippedDirs: number;
}

/**
 * Recursively collect TS/JS source files under `dir`, bounded by `maxDepth`,
 * skipping `node_modules`/`dist` and test/declaration files. Exported so the
 * `search_usages` tool (#4265) reuses the exact same source-file set the symbol
 * index walks — keeping the two tools' scopes apples-to-apples (DRY).
 */
export async function findSourceFiles(
  dir: string,
  maxDepth: number
): Promise<FindSourceFilesResult> {
  if (maxDepth <= 0) return { files: [], skippedDirs: 1 };
  const files: string[] = [];
  let skippedDirs = 0;
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') {
      const sub = await findSourceFiles(fullPath, maxDepth - 1);
      files.push(...sub.files);
      skippedDirs += sub.skippedDirs;
    }
    if (entry.isFile() && isSourceFile(entry.name)) {
      files.push(fullPath);
    }
  }
  return { files, skippedDirs };
}

function scoreMatch(symbolName: string, query: string): SearchResult['score'] | null {
  const nameLower = symbolName.toLowerCase();
  const queryLower = query.toLowerCase();

  if (nameLower === queryLower) return SCORE_EXACT;
  if (nameLower.startsWith(queryLower)) return SCORE_PREFIX;

  // Word boundary match (camelCase splitting)
  const words = symbolName
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[\s_-]+/);
  if (words.some((w) => w === queryLower)) return SCORE_WORD;

  if (nameLower.includes(queryLower)) return SCORE_SUBSTRING;

  return null;
}

function getMatchType(score: number): SearchResult['matchType'] {
  if (score >= SCORE_EXACT) return 'exact';
  if (score >= SCORE_PREFIX) return 'prefix';
  if (score >= SCORE_WORD) return 'word';
  return 'substring';
}

/** In-memory codebase symbol index. */
export class CodebaseIndex {
  private readonly symbols: IndexedSymbol[] = [];
  private readonly fileResults = new Map<string, SymbolExtractionResult>();
  private readonly rootDir: string;
  private skippedDirs = 0;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  /**
   * Index all TS/JS source files in the directory.
   *
   * `maxDepth` is clamped to `[1, MAX_INDEX_MAX_DEPTH]` so a caller-supplied
   * value can't force an unbounded tree-walk (#4243).
   */
  async index(maxDepth: number = DEFAULT_INDEX_MAX_DEPTH): Promise<IndexStats> {
    const clampedDepth = Math.min(Math.max(maxDepth, 1), MAX_INDEX_MAX_DEPTH);
    const { files, skippedDirs } = await findSourceFiles(this.rootDir, clampedDepth);
    this.skippedDirs = skippedDirs;

    for (const file of files) {
      const result = await extractSymbols(file);
      const relPath = relative(this.rootDir, file);
      this.fileResults.set(relPath, result);

      for (const symbol of result.symbols) {
        this.symbols.push({ ...symbol, filePath: relPath });
      }
    }

    return {
      totalFiles: files.length,
      totalSymbols: this.symbols.length,
      indexedAt: new Date().toISOString(),
      skippedDirs,
    };
  }

  /** Search symbols by keyword. Returns top N results sorted by relevance. */
  search(query: string, limit = 20): SearchResult[] {
    const results: SearchResult[] = [];

    for (const symbol of this.symbols) {
      const baseScore = scoreMatch(symbol.name, query);
      if (baseScore === null) continue;

      const bonus = symbol.exported ? SCORE_EXPORTED_BONUS : 0;
      results.push({
        symbol,
        score: baseScore + bonus,
        matchType: getMatchType(baseScore),
      });
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /** Get a compact summary of a file's symbols. */
  getFileSummary(filePath: string): FileSummary | undefined {
    const result = this.fileResults.get(filePath);
    if (result === undefined) return undefined;

    const kinds: Record<string, number> = {};
    let exported = 0;
    let priv = 0;

    for (const s of result.symbols) {
      kinds[s.kind] = (kinds[s.kind] ?? 0) + 1;
      if (s.exported) exported++;
      else priv++;
    }

    return {
      filePath,
      totalLines: result.totalLines,
      exportedSymbols: exported,
      privateSymbols: priv,
      kinds,
    };
  }

  /** List all indexed files with symbol counts. */
  listFiles(): Array<{ path: string; symbols: number; lines: number }> {
    return [...this.fileResults.entries()].map(([path, result]) => ({
      path,
      symbols: result.symbols.length,
      lines: result.totalLines,
    }));
  }

  /** Get index statistics. */
  get stats(): { files: number; symbols: number; skippedDirs: number } {
    return {
      files: this.fileResults.size,
      symbols: this.symbols.length,
      skippedDirs: this.skippedDirs,
    };
  }
}
