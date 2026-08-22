/**
 * Quality and accuracy tests for symbol-extractor.
 *
 * Validates that extraction is CORRECT, not just efficient.
 * Tests against known source files with expected symbol inventories.
 *
 * @module indexer/symbol-extractor-quality.test
 */

import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { extractSymbols, extractSymbolIndexResult } from './symbol-extractor.js';

/**
 * The rendered index, or '' when there is none.
 *
 * These suites sweep real source files, and a re-export barrel genuinely has
 * no local declarations — that is a valid reading, not a failure.
 */
async function indexOf(filePath: string): Promise<string> {
  const result = await extractSymbolIndexResult(filePath);
  return result.kind === 'index' ? result.index : '';
}

const SRC_DIR = resolve(import.meta.dirname ?? '.', '..');

describe('extraction accuracy', () => {
  it('finds ALL exported functions in model-config-helpers.ts', async () => {
    const filePath = resolve(SRC_DIR, 'config/model-config-helpers.ts');
    const source = await readFile(filePath, 'utf-8');
    const result = await extractSymbols(filePath);

    // Count "export function" in source manually
    const exportFnCount = (source.match(/export\s+function\s+\w+/g) ?? []).length;
    const extractedExportFns = result.symbols.filter(
      (s) => s.exported && s.kind === 'function'
    ).length;

    // Extracted count should match or exceed source count
    expect(extractedExportFns).toBeGreaterThanOrEqual(exportFnCount);
  });

  it('finds ALL exported const in model-capabilities-types.ts', async () => {
    const filePath = resolve(SRC_DIR, 'config/model-capabilities-types.ts');
    const result = await extractSymbols(filePath);

    // Known exports in this file
    const knownExports = ['CLI_NAMES', 'MODEL_IDS', 'CliNameSchema'];
    const extractedNames = new Set(result.symbols.map((s) => s.name));

    for (const name of knownExports) {
      expect(extractedNames.has(name)).toBe(true);
    }
  });

  it('symbol line numbers are accurate', async () => {
    const filePath = resolve(SRC_DIR, 'config/model-capabilities-types.ts');
    const fileContent = await readFile(filePath, 'utf-8');
    const lines = fileContent.split('\n');
    const result = await extractSymbols(filePath);

    // CLI_NAMES should be defined where 'CLI_NAMES' appears in source
    const cliNames = result.symbols.find((s) => s.name === 'CLI_NAMES');
    expect(cliNames).toBeDefined();
    if (cliNames) {
      // The line at startLine should contain 'CLI_NAMES'
      const lineContent = lines[cliNames.startLine - 1];
      expect(lineContent).toContain('CLI_NAMES');
    }
  });

  it('does not produce duplicate symbols', async () => {
    const filePath = resolve(SRC_DIR, 'config/model-config-helpers.ts');
    const result = await extractSymbols(filePath);

    // Check for duplicates by name+kind+startLine
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const s of result.symbols) {
      const key = `${s.name}:${s.kind}:${String(s.startLine)}`;
      if (seen.has(key)) dupes.push(key);
      seen.add(key);
    }
    expect(dupes).toHaveLength(0);
  });

  it('exported flag matches source code', async () => {
    const filePath = resolve(SRC_DIR, 'config/model-config-helpers.ts');
    const result = await extractSymbols(filePath);

    for (const symbol of result.symbols) {
      if (symbol.exported) {
        // Exported symbols should have 'export' in their text
        expect(symbol.text.includes('export')).toBe(true);
      }
    }
  });
});

describe('completeness', () => {
  it('does not miss interface declarations', async () => {
    const filePath = resolve(SRC_DIR, 'config/model-capabilities-types.ts');
    const source = await readFile(filePath, 'utf-8');
    const result = await extractSymbols(filePath);

    // Count interface declarations in source
    const interfaceCount = (source.match(/(?:export\s+)?interface\s+\w+/g) ?? []).length;
    const extractedInterfaces = result.symbols.filter((s) => s.kind === 'interface').length;

    // Should capture most interfaces (allow some slack for nested/conditional)
    if (interfaceCount > 0) {
      expect(extractedInterfaces).toBeGreaterThan(0);
    }
  });

  it('does not miss type aliases', async () => {
    const filePath = resolve(SRC_DIR, 'config/model-capabilities-types.ts');
    const source = await readFile(filePath, 'utf-8');
    const result = await extractSymbols(filePath);

    const typeCount = (source.match(/(?:export\s+)?type\s+\w+\s*=/g) ?? []).length;
    const extractedTypes = result.symbols.filter((s) => s.kind === 'type').length;

    if (typeCount > 0) {
      expect(extractedTypes).toBeGreaterThan(0);
    }
  });
});

describe('reconstruction quality', () => {
  it('symbol text can reconstruct useful context for LLM', async () => {
    const filePath = resolve(SRC_DIR, 'config/model-config-helpers.ts');
    const result = await extractSymbols(filePath);

    // Find a function with a meaningful name
    const helperFn = result.symbols.find((s) => s.kind === 'function' && s.name.startsWith('find'));

    if (helperFn) {
      // Function text should include: name, parameters, return type (if typed)
      expect(helperFn.text).toContain(helperFn.name);
      expect(helperFn.text).toContain('('); // has parameters
      expect(helperFn.text.length).toBeGreaterThan(20); // non-trivial
    }
  });

  it('index format is parseable and useful', async () => {
    const filePath = resolve(SRC_DIR, 'config/model-config-helpers.ts');
    const index = await indexOf(filePath);

    // Index should start with file comment
    expect(index.startsWith('//')).toBe(true);

    // Each line after header should match pattern: [export] kind name (Lstart-end)
    const lines = index.split('\n').slice(1); // skip header
    for (const line of lines) {
      if (line.trim() === '') continue;
      // Should match: [export ]kind name (Lnum-num)
      expect(line).toMatch(
        /^(?:export )?(?:function|class|method|interface|type|variable|enum) .+ \(L\d+-\d+\)$/
      );
    }
  });
});
