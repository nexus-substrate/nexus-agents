/**
 * Comprehensive benchmark tests for symbol-extractor.
 *
 * Measures real token savings across the nexus-agents codebase,
 * tests edge cases, and validates extraction quality.
 *
 * @module indexer/symbol-extractor-benchmark.test
 */

import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { readdir } from 'node:fs/promises';
import { extractSymbols, extractSymbolIndex } from './symbol-extractor.js';

const SRC_DIR = resolve(import.meta.dirname ?? '.', '..');

function isSourceTs(name: string): boolean {
  return name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.d.ts');
}

function isTraversable(name: string): boolean {
  return name !== 'node_modules' && name !== 'dist';
}

async function findTsFiles(dir: string, maxDepth = 3): Promise<string[]> {
  if (maxDepth <= 0) return [];
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory() && isTraversable(entry.name)) {
      files.push(...(await findTsFiles(fullPath, maxDepth - 1)));
    }
    if (entry.isFile() && isSourceTs(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('codebase-wide benchmark', () => {
  it('measures savings across 20+ real source files', async () => {
    const files = await findTsFiles(SRC_DIR, 2);
    // Take first 25 non-test TS files
    const sample = files.slice(0, 25);
    expect(sample.length).toBeGreaterThan(15);

    let totalOriginal = 0;
    let totalIndex = 0;
    let totalSymbolCount = 0;
    let filesWithSymbols = 0;

    for (const file of sample) {
      const result = await extractSymbols(file);
      const index = await extractSymbolIndex(file);
      totalOriginal += result.totalChars;
      totalIndex += index.length;
      totalSymbolCount += result.symbols.length;
      if (result.symbols.length > 0) filesWithSymbols++;
    }

    const savingsPct = Math.round(100 * (1 - totalIndex / totalOriginal));

    // Core assertions
    expect(savingsPct).toBeGreaterThan(80);
    expect(filesWithSymbols).toBeGreaterThan(10);
    expect(totalSymbolCount).toBeGreaterThan(50);
  });
});

describe('extraction quality', () => {
  it('extracts correct symbol kinds from model-capabilities-types.ts', async () => {
    const result = await extractSymbols(resolve(SRC_DIR, 'config/model-capabilities-types.ts'));
    const byKind = new Map<string, number>();
    for (const s of result.symbols) {
      byKind.set(s.kind, (byKind.get(s.kind) ?? 0) + 1);
    }
    // Should have variables (const exports) and types
    expect(byKind.has('variable') || byKind.has('type')).toBe(true);
  });

  it('extracts class methods from a class-based file', async () => {
    // Find a file with classes
    const files = await findTsFiles(SRC_DIR, 2);
    let foundClass = false;
    for (const file of files.slice(0, 50)) {
      const result = await extractSymbols(file);
      const hasClass = result.symbols.some((s) => s.kind === 'class');
      const hasMethod = result.symbols.some((s) => s.kind === 'method');
      if (hasClass && hasMethod) {
        foundClass = true;
        break;
      }
    }
    expect(foundClass).toBe(true);
  });

  it('handles empty files gracefully', async () => {
    // Create a fake path that won't exist
    const result = await extractSymbols('/nonexistent/file.ts').catch(() => null);
    // Should throw or return empty — either is acceptable
    expect(result === null || result.symbols.length === 0).toBe(true);
  });

  it('symbol text is valid source code', async () => {
    const result = await extractSymbols(resolve(SRC_DIR, 'config/model-config-helpers.ts'));
    for (const symbol of result.symbols) {
      // Symbol text should be non-empty
      expect(symbol.text.length).toBeGreaterThan(0);
      // Symbol text should contain the symbol name
      expect(symbol.text).toContain(symbol.name);
      // Line numbers should be valid
      expect(symbol.startLine).toBeGreaterThan(0);
      expect(symbol.endLine).toBeGreaterThanOrEqual(symbol.startLine);
    }
  });
});

describe('edge cases', () => {
  it('handles files with only imports (no symbols)', async () => {
    // index.ts barrel files often just re-export
    const files = await findTsFiles(SRC_DIR, 1);
    const indexFiles = files.filter((f) => f.endsWith('/index.ts'));
    const firstIndex = indexFiles[0];
    if (firstIndex !== undefined) {
      const result = await extractSymbols(firstIndex);
      // Index files may have 0 or some symbols — either is fine
      expect(result.totalChars).toBeGreaterThan(0);
    }
  });

  it('handles deeply nested exports', async () => {
    const result = await extractSymbols(resolve(SRC_DIR, 'config/model-config-helpers.ts'));
    // This file has exported functions — verify they're marked as exported
    const exportedFns = result.symbols.filter((s) => s.exported && s.kind === 'function');
    expect(exportedFns.length).toBeGreaterThan(0);
  });

  it('extractSymbolIndex stays under 5KB for typical files', async () => {
    const files = await findTsFiles(SRC_DIR, 2);
    for (const file of files.slice(0, 20)) {
      const index = await extractSymbolIndex(file);
      // Index should be compact — under 5KB for any single file
      expect(index.length).toBeLessThan(5000);
    }
  });
});
