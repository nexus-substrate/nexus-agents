/**
 * Tests for symbol-extractor.ts
 *
 * Validates TypeScript-compiler-API symbol extraction on real nexus-agents
 * source files. Uses the actual codebase as test fixtures — no mocks needed.
 *
 * (The header previously said "tree-sitter". There is no tree-sitter in the
 * tree; adding it for non-TS languages is #4517.)
 *
 * @module indexer/symbol-extractor.test
 */

import { afterAll, describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { extractSymbols, extractSymbolIndexResult } from './symbol-extractor.js';

/** The rendered index, failing loudly if extraction reported empty instead. */
async function indexOf(filePath: string): Promise<string> {
  const result = await extractSymbolIndexResult(filePath);
  if (result.kind !== 'index') throw new Error(`expected an index, got ${result.reason}`);
  return result.index;
}

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
      const index = await indexOf(filePath);
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
    const index = await indexOf(resolve(SRC_DIR, 'config/model-capabilities-types.ts'));
    expect(index).toContain('// ');
    expect(index).toContain('symbols');
    expect(index).toContain('CLI_NAMES');
    // Should be much shorter than full file
    expect(index.length).toBeLessThan(5000);
  });

  it('includes line numbers', async () => {
    const index = await indexOf(resolve(SRC_DIR, 'config/model-capabilities-types.ts'));
    expect(index).toMatch(/L\d+-\d+/);
  });
});

describe('#4517: an unparsed file is not an empty file', () => {
  /** Scratch roots created here, removed in afterAll — this suite does not leak (#4630). */
  const scratch: string[] = [];

  const tmp = (name: string, body: string): string => {
    const dir = mkdtempSync(join(tmpdir(), 'symext-'));
    scratch.push(dir);
    const p = join(dir, name);
    writeFileSync(p, body, 'utf-8');
    return p;
  };

  afterAll(() => {
    for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
    scratch.length = 0;
  });

  it('marks an unsupported extension as not parsed', async () => {
    const result = await extractSymbols(tmp('service.py', 'def handler():\n    return 1\n'));

    expect(result.parsed).toBe(false);
    expect(result.symbols).toEqual([]);
  });

  it('marks a supported file as parsed even when it declares nothing', async () => {
    // The #4517 case: a valid TypeScript barrel. Zero symbols is a
    // measurement here, not a failure to read.
    const result = await extractSymbols(tmp('barrel.ts', "export { a } from './a.js';\n"));

    expect(result.parsed).toBe(true);
    expect(result.symbols).toEqual([]);
  });

  it('reports unsupported and no-declarations as different reasons', async () => {
    const unsupported = await extractSymbolIndexResult(tmp('main.go', 'package main\n'));
    const barrel = await extractSymbolIndexResult(tmp('b.ts', "export { a } from './a.js';\n"));

    expect(unsupported).toEqual({ kind: 'empty', reason: 'unsupported' });
    expect(barrel).toEqual({ kind: 'empty', reason: 'no-declarations' });
  });

  it('returns the index when there are declarations', async () => {
    const result = await extractSymbolIndexResult(tmp('f.ts', 'export function go(): void {}\n'));

    expect(result.kind).toBe('index');
    if (result.kind !== 'index') return;
    expect(result.index).toContain('go');
  });
});
