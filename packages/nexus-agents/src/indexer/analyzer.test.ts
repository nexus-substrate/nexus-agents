/**
 * Tests for Codebase Index Analyzer
 *
 * (Source: Issue #240)
 */

import { describe, it, expect } from 'vitest';
import type { FileEntry } from './types.js';
import {
  detectModulePurpose,
  groupFilesByModule,
  extractExternalPackages,
  computeModuleStats,
  detectModuleDependencies,
  analyzeModules,
  computeIndexStats,
  buildIndex,
} from './analyzer.js';

// Helper to create test file entries
function createFileEntry(overrides: Partial<FileEntry>): FileEntry {
  return {
    path: 'test.ts',
    lines: 100,
    category: 'implementation',
    exports: [],
    dependencies: [],
    ...overrides,
  };
}

describe('detectModulePurpose', () => {
  it('should return known purpose for core module', () => {
    const purpose = detectModulePurpose('core', []);
    expect(purpose).toBe('Types, Result<T,E>, errors, logger');
  });

  it('should return known purpose for cli module', () => {
    const purpose = detectModulePurpose('cli', []);
    expect(purpose).toBe('CLI interface, mode detection, commands');
  });

  it('should generate purpose from file descriptions', () => {
    const files = [
      createFileEntry({ description: 'Handles authentication' }),
      createFileEntry({ description: 'Manages sessions' }),
    ];
    const purpose = detectModulePurpose('auth', files);
    expect(purpose).toBe('Handles authentication; Manages sessions');
  });

  it('should fallback to generic purpose for unknown module', () => {
    const purpose = detectModulePurpose('custom-module', []);
    expect(purpose).toBe('custom-module module');
  });
});

describe('groupFilesByModule', () => {
  it('should group files by top-level directory', () => {
    const files = [
      createFileEntry({ path: 'core/types.ts' }),
      createFileEntry({ path: 'core/errors.ts' }),
      createFileEntry({ path: 'adapters/claude.ts' }),
    ];

    const grouped = groupFilesByModule(files);

    expect(grouped.size).toBe(2);
    expect(grouped.get('core')).toHaveLength(2);
    expect(grouped.get('adapters')).toHaveLength(1);
  });

  it('should put root-level files in root module', () => {
    const files = [createFileEntry({ path: 'index.ts' }), createFileEntry({ path: 'cli.ts' })];

    const grouped = groupFilesByModule(files);

    expect(grouped.size).toBe(1);
    expect(grouped.get('root')).toHaveLength(2);
  });
});

describe('extractExternalPackages', () => {
  it('should extract unique external package names', () => {
    const files = [
      createFileEntry({
        dependencies: [
          { specifier: 'zod', isExternal: true, imports: ['z'] },
          { specifier: 'yaml', isExternal: true, imports: ['parse'] },
        ],
      }),
      createFileEntry({
        dependencies: [{ specifier: 'zod', isExternal: true, imports: ['object'] }],
      }),
    ];

    const packages = extractExternalPackages(files);

    expect(packages).toEqual(['yaml', 'zod']);
  });

  it('should handle scoped packages', () => {
    const files = [
      createFileEntry({
        dependencies: [
          { specifier: '@modelcontextprotocol/sdk', isExternal: true, imports: [] },
          { specifier: '@types/node', isExternal: true, imports: [] },
        ],
      }),
    ];

    const packages = extractExternalPackages(files);

    expect(packages).toContain('@modelcontextprotocol/sdk');
    expect(packages).toContain('@types/node');
  });

  it('should include node: built-ins', () => {
    const files = [
      createFileEntry({
        dependencies: [
          { specifier: 'node:path', isExternal: true, imports: [] },
          { specifier: 'node:fs', isExternal: true, imports: [] },
        ],
      }),
    ];

    const packages = extractExternalPackages(files);

    expect(packages).toContain('node:fs');
    expect(packages).toContain('node:path');
  });

  it('should ignore internal dependencies', () => {
    const files = [
      createFileEntry({
        dependencies: [
          { specifier: './types.js', isExternal: false, imports: [] },
          { specifier: '../core/index.js', isExternal: false, imports: [] },
        ],
      }),
    ];

    const packages = extractExternalPackages(files);

    expect(packages).toHaveLength(0);
  });
});

describe('computeModuleStats', () => {
  it('should compute correct statistics', () => {
    const files = [
      createFileEntry({
        lines: 100,
        exports: [{ name: 'foo', kind: 'function', isReExport: false }],
        dependencies: [
          { specifier: 'zod', isExternal: true, imports: [] },
          { specifier: './types.js', isExternal: false, imports: [] },
        ],
      }),
      createFileEntry({
        lines: 50,
        exports: [
          { name: 'bar', kind: 'class', isReExport: false },
          { name: 'baz', kind: 'const', isReExport: false },
        ],
        dependencies: [{ specifier: './utils.js', isExternal: false, imports: [] }],
      }),
    ];

    const stats = computeModuleStats(files);

    expect(stats.fileCount).toBe(2);
    expect(stats.totalLines).toBe(150);
    expect(stats.exportCount).toBe(3);
    expect(stats.externalDeps).toBe(1);
    expect(stats.internalDeps).toBe(2);
  });

  it('should handle empty module', () => {
    const stats = computeModuleStats([]);

    expect(stats.fileCount).toBe(0);
    expect(stats.totalLines).toBe(0);
    expect(stats.exportCount).toBe(0);
  });
});

describe('detectModuleDependencies', () => {
  it('should detect dependencies on other modules', () => {
    const files = [
      createFileEntry({
        path: 'agents/expert.ts',
        dependencies: [
          { specifier: '../core/types.js', isExternal: false, imports: [] },
          { specifier: '../adapters/claude.js', isExternal: false, imports: [] },
        ],
      }),
    ];

    const allModules = new Set(['agents', 'core', 'adapters']);
    const deps = detectModuleDependencies('agents', files, allModules);

    expect(deps).toContain('core');
    expect(deps).toContain('adapters');
  });

  it('should not include self-dependencies', () => {
    const files = [
      createFileEntry({
        path: 'core/index.ts',
        dependencies: [{ specifier: './types.js', isExternal: false, imports: [] }],
      }),
    ];

    const allModules = new Set(['core']);
    const deps = detectModuleDependencies('core', files, allModules);

    expect(deps).not.toContain('core');
  });

  it('should ignore external dependencies', () => {
    const files = [
      createFileEntry({
        path: 'core/index.ts',
        dependencies: [{ specifier: 'zod', isExternal: true, imports: [] }],
      }),
    ];

    const allModules = new Set(['core']);
    const deps = detectModuleDependencies('core', files, allModules);

    expect(deps).toHaveLength(0);
  });
});

describe('analyzeModules', () => {
  it('should create module entries with correct structure', () => {
    const files = [
      createFileEntry({ path: 'core/types.ts', lines: 200 }),
      createFileEntry({ path: 'core/errors.ts', lines: 100 }),
      createFileEntry({ path: 'cli/main.ts', lines: 50 }),
    ];

    const modules = analyzeModules(files);

    expect(modules.size).toBe(2);

    const coreModule = modules.get('core');
    expect(coreModule?.name).toBe('core');
    expect(coreModule?.stats.fileCount).toBe(2);
    expect(coreModule?.stats.totalLines).toBe(300);
  });
});

describe('computeIndexStats', () => {
  it('should aggregate stats across all modules', () => {
    const files = [
      createFileEntry({
        path: 'core/types.ts',
        lines: 200,
        exports: [{ name: 'Type', kind: 'type', isReExport: false }],
        dependencies: [{ specifier: 'zod', isExternal: true, imports: [] }],
      }),
      createFileEntry({
        path: 'cli/main.ts',
        lines: 100,
        exports: [{ name: 'run', kind: 'function', isReExport: false }],
      }),
    ];

    const modules = analyzeModules(files);
    const stats = computeIndexStats(modules);

    expect(stats.totalFiles).toBe(2);
    expect(stats.totalLines).toBe(300);
    expect(stats.totalExports).toBe(2);
    expect(stats.moduleCount).toBe(2);
    expect(stats.externalPackages).toContain('zod');
  });
});

describe('buildIndex', () => {
  it('should build a complete codebase index', () => {
    const files = [
      createFileEntry({
        path: 'core/types.ts',
        lines: 200,
        exports: [{ name: 'Result', kind: 'type', isReExport: false }],
      }),
    ];

    const index = buildIndex(files);

    expect(index.schemaVersion).toBe('1.0');
    expect(index.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(index.stats.totalFiles).toBe(1);
    expect(index.modules['core']).toBeDefined();
  });

  it('should handle empty file list', () => {
    const index = buildIndex([]);

    expect(index.schemaVersion).toBe('1.0');
    expect(index.stats.totalFiles).toBe(0);
    expect(index.stats.moduleCount).toBe(0);
  });
});
