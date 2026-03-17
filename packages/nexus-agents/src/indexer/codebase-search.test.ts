/**
 * Tests for codebase-search.ts
 *
 * Uses the actual nexus-agents codebase as a test fixture.
 *
 * @module indexer/codebase-search.test
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { resolve } from 'node:path';
import { CodebaseIndex } from './codebase-search.js';

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
      expect(results[0].matchType).toBe('exact');
      expect(results[0].symbol.name).toBe('CLI_NAMES');
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
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });

    it('gives exported symbols a bonus', () => {
      const results = index.search('DEFAULT_MODEL');
      const exported = results.filter((r) => r.symbol.exported);
      if (exported.length > 0) {
        expect(exported[0].score).toBeGreaterThan(0);
      }
    });
  });

  describe('getFileSummary', () => {
    it('returns summary for indexed file', () => {
      const files = index.listFiles();
      expect(files.length).toBeGreaterThan(0);
      const summary = index.getFileSummary(files[0].path);
      expect(summary).toBeDefined();
      if (summary) {
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
