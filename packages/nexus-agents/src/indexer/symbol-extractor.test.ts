/**
 * Tests for symbol-extractor.ts
 *
 * Validates tree-sitter AST symbol extraction on real nexus-agents source files.
 * Uses the actual codebase as test fixtures — no mocks needed.
 *
 * @module indexer/symbol-extractor.test
 */

import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { extractSymbols, extractSymbolIndex } from './symbol-extractor.js';

const SRC_DIR = resolve(import.meta.dirname ?? '.', '..');

describe('extractSymbols', () => {
  it('extracts symbols from a real TypeScript file', async () => {
    const result = await extractSymbols(resolve(SRC_DIR, 'config/model-capabilities-types.ts'));
    expect(result.symbols.length).toBeGreaterThan(5);
    expect(result.totalChars).toBeGreaterThan(0);
    expect(result.symbolChars).toBeGreaterThan(0);

    // Should find CLI_NAMES and MODEL_IDS
    const names = result.symbols.map((s) => s.name);
    expect(names).toContain('CLI_NAMES');
    expect(names).toContain('MODEL_IDS');
  });

  it('reports significant token savings', async () => {
    const result = await extractSymbols(resolve(SRC_DIR, 'config/model-config-helpers.ts'));
    // model-config-helpers.ts is a large file — expect meaningful savings
    expect(result.savingsPercent).toBeGreaterThan(0);
    expect(result.symbols.length).toBeGreaterThan(3);
  });

  it('identifies exported vs non-exported symbols', async () => {
    const result = await extractSymbols(resolve(SRC_DIR, 'config/model-config-helpers.ts'));
    const exported = result.symbols.filter((s) => s.exported);
    expect(exported.length).toBeGreaterThan(0);
  });

  it('returns empty for non-TypeScript files', async () => {
    const result = await extractSymbols(resolve(SRC_DIR, '../package.json'));
    expect(result.symbols).toHaveLength(0);
  });

  it('extracts functions, classes, and interfaces', async () => {
    const result = await extractSymbols(resolve(SRC_DIR, 'config/model-config-helpers.ts'));
    const kinds = new Set(result.symbols.map((s) => s.kind));
    // Should have at least functions (the helper functions)
    expect(kinds.has('function') || kinds.has('variable')).toBe(true);
  });
});

describe('token savings measurement', () => {
  it('symbol index is dramatically smaller than full file', async () => {
    const files = [
      'config/model-config-helpers.ts',
      'cli-adapters/composite-router.ts',
      'consensus/engine.ts',
      'mcp/tools/index.ts',
    ];
    let totalOriginal = 0;
    let totalIndex = 0;
    for (const file of files) {
      const filePath = resolve(SRC_DIR, file);
      const result = await extractSymbols(filePath);
      const index = await extractSymbolIndex(filePath);
      totalOriginal += result.totalChars;
      totalIndex += index.length;
      expect(result.symbols.length).toBeGreaterThan(0);
    }
    const overallSavings = Math.round(100 * (1 - totalIndex / totalOriginal));
    // Symbol index (names + line numbers) should be 80%+ smaller than full files
    expect(overallSavings).toBeGreaterThan(80);
  });
});

describe('extractSymbolIndex', () => {
  it('returns compact index string', async () => {
    const index = await extractSymbolIndex(resolve(SRC_DIR, 'config/model-capabilities-types.ts'));
    expect(index).toContain('// ');
    expect(index).toContain('symbols');
    expect(index).toContain('CLI_NAMES');
    // Should be much shorter than full file
    expect(index.length).toBeLessThan(5000);
  });

  it('includes line numbers', async () => {
    const index = await extractSymbolIndex(resolve(SRC_DIR, 'config/model-capabilities-types.ts'));
    expect(index).toMatch(/L\d+-\d+/);
  });
});
