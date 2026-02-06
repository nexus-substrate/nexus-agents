/**
 * Tests for export-extraction.ts
 *
 * Covers extraction of functions, classes, interfaces, types, enums,
 * variables, re-exports, deduplication, and barrel file patterns.
 */

import { describe, it, expect } from 'vitest';
import { extractExports } from './export-extraction.js';
import type { SourceFile } from 'ts-morph';

// ============================================================================
// Mock SourceFile builder
// ============================================================================

interface MockItem {
  name: string;
  isExported: boolean;
  alias?: string;
}

interface MockExportDecl {
  moduleSpecifier?: string;
  namedExports: Array<{ name: string; alias?: string }>;
}

interface MockSourceFileConfig {
  functions?: MockItem[];
  classes?: MockItem[];
  interfaces?: MockItem[];
  typeAliases?: MockItem[];
  enums?: MockItem[];
  variableStatements?: Array<{ isExported: boolean; declarations: string[] }>;
  exportDeclarations?: MockExportDecl[];
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeMockSourceFile(config: MockSourceFileConfig = {}) {
  return {
    getFunctions: () =>
      (config.functions ?? []).map((f) => ({
        isExported: () => f.isExported,
        getName: () => f.name,
      })),
    getClasses: () =>
      (config.classes ?? []).map((c) => ({
        isExported: () => c.isExported,
        getName: () => c.name,
      })),
    getInterfaces: () =>
      (config.interfaces ?? []).map((i) => ({
        isExported: () => i.isExported,
        getName: () => i.name,
      })),
    getTypeAliases: () =>
      (config.typeAliases ?? []).map((t) => ({
        isExported: () => t.isExported,
        getName: () => t.name,
      })),
    getEnums: () =>
      (config.enums ?? []).map((e) => ({
        isExported: () => e.isExported,
        getName: () => e.name,
      })),
    getVariableStatements: () =>
      (config.variableStatements ?? []).map((vs) => ({
        isExported: () => vs.isExported,
        getDeclarations: () => vs.declarations.map((d) => ({ getName: () => d })),
      })),
    getExportDeclarations: () =>
      (config.exportDeclarations ?? []).map((ed) => ({
        getModuleSpecifierValue: () => ed.moduleSpecifier,
        getNamedExports: () =>
          ed.namedExports.map((ne) => ({
            getName: () => ne.name,
            getAliasNode: () => (ne.alias !== undefined ? { getText: () => ne.alias } : undefined),
          })),
      })),
  } as unknown as SourceFile;
}

// ============================================================================
// Function and class exports
// ============================================================================

describe('extractExports - functions and classes', () => {
  it('extracts exported functions', () => {
    const sf = makeMockSourceFile({
      functions: [{ name: 'doStuff', isExported: true }],
    });
    const exports = extractExports(sf);
    expect(exports).toHaveLength(1);
    expect(exports[0]).toEqual({ name: 'doStuff', kind: 'function', isReExport: false });
  });

  it('skips non-exported functions', () => {
    const sf = makeMockSourceFile({
      functions: [{ name: 'internal', isExported: false }],
    });
    expect(extractExports(sf)).toHaveLength(0);
  });

  it('extracts exported classes', () => {
    const sf = makeMockSourceFile({
      classes: [{ name: 'MyClass', isExported: true }],
    });
    const exports = extractExports(sf);
    expect(exports[0]?.kind).toBe('class');
  });
});

// ============================================================================
// Type exports
// ============================================================================

describe('extractExports - types', () => {
  it('extracts exported interfaces', () => {
    const sf = makeMockSourceFile({
      interfaces: [{ name: 'IMyInterface', isExported: true }],
    });
    const exports = extractExports(sf);
    expect(exports[0]).toEqual({ name: 'IMyInterface', kind: 'interface', isReExport: false });
  });

  it('extracts exported type aliases', () => {
    const sf = makeMockSourceFile({
      typeAliases: [{ name: 'MyType', isExported: true }],
    });
    const exports = extractExports(sf);
    expect(exports[0]?.kind).toBe('type');
  });

  it('extracts exported enums', () => {
    const sf = makeMockSourceFile({
      enums: [{ name: 'Status', isExported: true }],
    });
    const exports = extractExports(sf);
    expect(exports[0]?.kind).toBe('enum');
  });
});

// ============================================================================
// Variable exports
// ============================================================================

describe('extractExports - variables', () => {
  it('extracts exported const variables', () => {
    const sf = makeMockSourceFile({
      variableStatements: [{ isExported: true, declarations: ['MY_CONST'] }],
    });
    const exports = extractExports(sf);
    expect(exports[0]).toEqual({ name: 'MY_CONST', kind: 'const', isReExport: false });
  });

  it('extracts multiple declarations from one statement', () => {
    const sf = makeMockSourceFile({
      variableStatements: [{ isExported: true, declarations: ['FOO', 'BAR'] }],
    });
    const exports = extractExports(sf);
    expect(exports).toHaveLength(2);
  });

  it('skips non-exported variable statements', () => {
    const sf = makeMockSourceFile({
      variableStatements: [{ isExported: false, declarations: ['private_var'] }],
    });
    expect(extractExports(sf)).toHaveLength(0);
  });
});

// ============================================================================
// Re-exports
// ============================================================================

describe('extractExports - re-exports', () => {
  it('extracts named re-exports with source module', () => {
    const sf = makeMockSourceFile({
      exportDeclarations: [
        {
          moduleSpecifier: './utils.js',
          namedExports: [{ name: 'helper' }],
        },
      ],
    });
    const exports = extractExports(sf);
    expect(exports[0]?.isReExport).toBe(true);
    expect(exports[0]?.sourceModule).toBe('./utils.js');
  });

  it('uses alias name when available', () => {
    const sf = makeMockSourceFile({
      exportDeclarations: [
        {
          moduleSpecifier: './other.js',
          namedExports: [{ name: 'original', alias: 'renamed' }],
        },
      ],
    });
    const exports = extractExports(sf);
    expect(exports[0]?.name).toBe('renamed');
  });

  it('creates wildcard entry for star re-exports', () => {
    const sf = makeMockSourceFile({
      exportDeclarations: [
        {
          moduleSpecifier: './types.js',
          namedExports: [],
        },
      ],
    });
    const exports = extractExports(sf);
    expect(exports[0]?.name).toBe('*');
    expect(exports[0]?.sourceModule).toBe('./types.js');
  });

  it('skips wildcard when no module specifier', () => {
    const sf = makeMockSourceFile({
      exportDeclarations: [
        {
          namedExports: [],
        },
      ],
    });
    // No namedExports and no moduleSpecifier → no wildcard entry
    expect(extractExports(sf)).toHaveLength(0);
  });
});

// ============================================================================
// Deduplication
// ============================================================================

describe('extractExports - deduplication', () => {
  it('deduplicates exports with same name', () => {
    const sf = makeMockSourceFile({
      functions: [{ name: 'doStuff', isExported: true }],
      exportDeclarations: [
        {
          namedExports: [{ name: 'doStuff' }],
        },
      ],
    });
    const exports = extractExports(sf);
    expect(exports).toHaveLength(1);
  });
});

// ============================================================================
// Empty source file
// ============================================================================

describe('extractExports - empty', () => {
  it('returns empty array for empty source file', () => {
    const sf = makeMockSourceFile({});
    expect(extractExports(sf)).toEqual([]);
  });
});
