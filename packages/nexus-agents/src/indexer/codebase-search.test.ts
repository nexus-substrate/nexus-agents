/**
 * Tests for codebase-search.ts
 *
 * Uses the actual nexus-agents codebase as a test fixture.
 *
 * @module indexer/codebase-search.test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve, join } from 'node:path';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { CodebaseIndex, MAX_INDEX_MAX_DEPTH } from './codebase-search.js';

const SRC_DIR = resolve(import.meta.dirname ?? '.', '..');

describe('CodebaseIndex', () => {
  let index: CodebaseIndex;

  beforeAll(async () => {
    index = new CodebaseIndex(resolve(SRC_DIR, 'config'));
    await index.index(1);
  });

  describe('indexing', () => {
    it('indexes multiple files', () => {
      expect(index.stats.files).toBeGreaterThan(3);
    });

    it('extracts symbols from indexed files', () => {
      expect(index.stats.symbols).toBeGreaterThan(20);
    });
  });

  describe('search', () => {
    it('finds exact symbol name matches', () => {
      const results = index.search('CLI_NAMES');
      expect(results.length).toBeGreaterThan(0);
      const first = results[0];
      expect(first).toBeDefined();
      expect(first!.matchType).toBe('exact');
      expect(first!.symbol.name).toBe('CLI_NAMES');
    });

    it('finds prefix matches', () => {
      const results = index.search('CLI_');
      expect(results.length).toBeGreaterThan(0);
    });

    it('finds substring matches', () => {
      const results = index.search('Model');
      expect(results.length).toBeGreaterThan(0);
    });

    it('returns empty for non-existent symbols', () => {
      const results = index.search('xyznonexistent123');
      expect(results).toHaveLength(0);
    });

    it('respects limit parameter', () => {
      const results = index.search('Model', 3);
      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('sorts by relevance score', () => {
      const results = index.search('Model');
      for (let i = 1; i < results.length; i++) {
        const prev = results[i - 1];
        const curr = results[i];
        expect(prev).toBeDefined();
        expect(curr).toBeDefined();
        expect(prev!.score).toBeGreaterThanOrEqual(curr!.score);
      }
    });

    it('gives exported symbols a bonus', () => {
      const results = index.search('DEFAULT_MODEL');
      const exported = results.filter((r) => r.symbol.exported);
      const firstExported = exported[0];
      if (firstExported !== undefined) {
        expect(firstExported.score).toBeGreaterThan(0);
      }
    });
  });

  describe('getFileSummary', () => {
    it('returns summary for indexed file', () => {
      const files = index.listFiles();
      expect(files.length).toBeGreaterThan(0);
      const firstFile = files[0];
      expect(firstFile).toBeDefined();
      const summary = index.getFileSummary(firstFile!.path);
      expect(summary).toBeDefined();
      if (summary !== undefined) {
        expect(summary.totalLines).toBeGreaterThan(0);
      }
    });

    it('returns undefined for non-indexed file', () => {
      const summary = index.getFileSummary('nonexistent.ts');
      expect(summary).toBeUndefined();
    });
  });

  describe('listFiles', () => {
    it('lists all indexed files with counts', () => {
      const files = index.listFiles();
      expect(files.length).toBeGreaterThan(0);
      for (const f of files) {
        expect(f.path).toBeDefined();
        expect(f.symbols).toBeGreaterThanOrEqual(0);
        expect(f.lines).toBeGreaterThan(0);
      }
    });
  });
});

// ============================================================================
// maxDepth (#4243 — index(maxDepth = 4) silently truncated any file more than
// 4 directory levels below the search root, and the tool reported an
// authoritative-sounding "no symbols found" with no indication of truncation)
// ============================================================================

describe('CodebaseIndex maxDepth (#4243)', () => {
  let tmpRoot: string;
  // 5 directories deep: tmpRoot/d1/d2/d3/d4/d5/deep.ts (6 levels incl. the file).
  const MARKER_SYMBOL = 'deepFunctionMarkerXyz4243';

  beforeAll(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'codebase-search-depth-'));
    const deepDir = join(tmpRoot, 'd1', 'd2', 'd3', 'd4', 'd5');
    await mkdir(deepDir, { recursive: true });
    await writeFile(join(deepDir, 'deep.ts'), `export function ${MARKER_SYMBOL}(): void {}\n`);
  });

  afterAll(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it('finds a symbol more than 4 directory levels deep with the default maxDepth', async () => {
    const deepIndex = new CodebaseIndex(tmpRoot);
    const stats = await deepIndex.index();
    expect(stats.skippedDirs).toBe(0);
    expect(deepIndex.search(MARKER_SYMBOL).length).toBeGreaterThan(0);
  });

  it('would have silently missed the file at the old hardcoded depth of 4', async () => {
    const oldDepthIndex = new CodebaseIndex(tmpRoot);
    const stats = await oldDepthIndex.index(4);
    expect(oldDepthIndex.search(MARKER_SYMBOL)).toHaveLength(0);
    expect(stats.skippedDirs).toBeGreaterThan(0);
  });

  it('reports the skipped-directory count when maxDepth is exhausted', async () => {
    const shallowIndex = new CodebaseIndex(tmpRoot);
    const stats = await shallowIndex.index(2);
    expect(stats.skippedDirs).toBeGreaterThan(0);
    expect(shallowIndex.stats.skippedDirs).toBe(stats.skippedDirs);
    expect(shallowIndex.search(MARKER_SYMBOL)).toHaveLength(0);
  });

  it('clamps an oversized maxDepth instead of erroring', async () => {
    const clampedIndex = new CodebaseIndex(tmpRoot);
    const stats = await clampedIndex.index(MAX_INDEX_MAX_DEPTH + 1000);
    expect(stats.skippedDirs).toBe(0);
    expect(clampedIndex.search(MARKER_SYMBOL).length).toBeGreaterThan(0);
  });

  it('clamps a non-positive maxDepth to a minimum of 1', async () => {
    const zeroIndex = new CodebaseIndex(tmpRoot);
    const stats = await zeroIndex.index(0);
    expect(stats.skippedDirs).toBeGreaterThan(0);
  });
});
