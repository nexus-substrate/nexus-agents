/**
 * Tests for Codebase Index Generator
 *
 * (Source: Issue #240)
 */

import { describe, it, expect } from 'vitest';
import type { CodebaseIndex } from './types.js';
import { SCHEMA_VERSION } from './types.js';
import {
  indexToYaml,
  indexToJson,
  generateMermaidDiagram,
  generateDiagramMarkdown,
  validateIndex,
} from './generator.js';

// Helper to create a test index
function createTestIndex(overrides: Partial<CodebaseIndex> = {}): CodebaseIndex {
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: '2026-01-12T15:30:00-05:00',
    stats: {
      totalFiles: 10,
      totalLines: 1000,
      totalExports: 50,
      moduleCount: 3,
      externalPackages: ['zod', 'yaml'],
    },
    modules: {
      core: {
        name: 'core',
        path: 'core',
        purpose: 'Types and utilities',
        files: [
          {
            path: 'core/types.ts',
            lines: 200,
            category: 'types',
            exports: [{ name: 'Result', kind: 'type', isReExport: false }],
            dependencies: [],
          },
        ],
        stats: {
          fileCount: 1,
          totalLines: 200,
          exportCount: 1,
          internalDeps: 0,
          externalDeps: 0,
        },
        dependsOn: [],
      },
      cli: {
        name: 'cli',
        path: 'cli',
        purpose: 'CLI commands',
        files: [
          {
            path: 'cli/main.ts',
            lines: 100,
            category: 'cli',
            exports: [{ name: 'run', kind: 'function', isReExport: false }],
            dependencies: [
              { specifier: '../core/types.js', isExternal: false, imports: ['Result'] },
            ],
          },
        ],
        stats: {
          fileCount: 1,
          totalLines: 100,
          exportCount: 1,
          internalDeps: 1,
          externalDeps: 0,
        },
        dependsOn: ['core'],
      },
    },
    ...overrides,
  };
}

describe('indexToYaml', () => {
  it('should generate valid YAML', () => {
    const index = createTestIndex();
    const yaml = indexToYaml(index);

    expect(yaml).toContain('schemaVersion:');
    expect(yaml).toContain('generatedAt:');
    expect(yaml).toContain('modules:');
    expect(yaml).toContain('core:');
  });

  it('should include header comment', () => {
    const index = createTestIndex();
    const yaml = indexToYaml(index);

    expect(yaml).toContain('Nexus-Agents Codebase Index');
    expect(yaml).toContain('Generated automatically');
  });
});

describe('indexToJson', () => {
  it('should generate valid JSON', () => {
    const index = createTestIndex();
    const json = indexToJson(index);

    const parsed = JSON.parse(json);
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
    expect(parsed.stats.totalFiles).toBe(10);
  });

  it('should be pretty-printed', () => {
    const index = createTestIndex();
    const json = indexToJson(index);

    expect(json).toContain('\n');
    expect(json.split('\n').length).toBeGreaterThan(5);
  });
});

describe('generateMermaidDiagram', () => {
  it('should generate valid Mermaid flowchart', () => {
    const index = createTestIndex();
    const diagram = generateMermaidDiagram(index);

    expect(diagram).toContain('```mermaid');
    expect(diagram).toContain('flowchart LR');
    expect(diagram).toContain('```');
  });

  it('should include module nodes with stats', () => {
    const index = createTestIndex();
    const diagram = generateMermaidDiagram(index);

    expect(diagram).toContain('core');
    expect(diagram).toContain('cli');
    expect(diagram).toContain('files');
    expect(diagram).toContain('lines');
  });

  it('should include dependency edges', () => {
    const index = createTestIndex();
    const diagram = generateMermaidDiagram(index);

    expect(diagram).toContain('cli --> core');
  });

  it('should sanitize module names for Mermaid', () => {
    const index = createTestIndex({
      modules: {
        'cli-adapters': {
          name: 'cli-adapters',
          path: 'cli-adapters',
          purpose: 'CLI adapters',
          files: [],
          stats: { fileCount: 0, totalLines: 0, exportCount: 0, internalDeps: 0, externalDeps: 0 },
          dependsOn: [],
        },
      },
    });
    const diagram = generateMermaidDiagram(index);

    // Hyphenated names should be converted to underscores
    expect(diagram).toContain('cli_adapters');
  });
});

describe('generateDiagramMarkdown', () => {
  it('should generate markdown document', () => {
    const index = createTestIndex();
    const markdown = generateDiagramMarkdown(index);

    expect(markdown).toContain('# Module Dependency Graph');
    expect(markdown).toContain('## Overview');
    expect(markdown).toContain('## Dependency Diagram');
    expect(markdown).toContain('## Module Details');
  });

  it('should include overview stats', () => {
    const index = createTestIndex();
    const markdown = generateDiagramMarkdown(index);

    expect(markdown).toContain('Total Modules');
    expect(markdown).toContain('Total Files');
    expect(markdown).toContain('Total Lines');
  });

  it('should include embedded Mermaid diagram', () => {
    const index = createTestIndex();
    const markdown = generateDiagramMarkdown(index);

    expect(markdown).toContain('```mermaid');
    expect(markdown).toContain('flowchart LR');
  });

  it('should include module details', () => {
    const index = createTestIndex();
    const markdown = generateDiagramMarkdown(index);

    expect(markdown).toContain('### cli');
    expect(markdown).toContain('### core');
    expect(markdown).toContain('**Purpose:**');
    expect(markdown).toContain('**Depends on:**');
  });
});

describe('validateIndex', () => {
  it('should report valid index when files match', () => {
    const index = createTestIndex();
    const currentFiles = [
      { path: 'core/types.ts', lines: 200 },
      { path: 'cli/main.ts', lines: 100 },
    ];

    const result = validateIndex(index, currentFiles);

    expect(result.valid).toBe(true);
    expect(result.missingFiles).toHaveLength(0);
    expect(result.extraFiles).toHaveLength(0);
    expect(result.modifiedFiles).toHaveLength(0);
  });

  it('should detect missing files', () => {
    const index = createTestIndex();
    const currentFiles = [
      { path: 'core/types.ts', lines: 200 },
      { path: 'cli/main.ts', lines: 100 },
      { path: 'new/file.ts', lines: 50 },
    ];

    const result = validateIndex(index, currentFiles);

    expect(result.valid).toBe(false);
    expect(result.missingFiles).toContain('new/file.ts');
  });

  it('should detect extra files in index', () => {
    const index = createTestIndex();
    const currentFiles = [
      { path: 'core/types.ts', lines: 200 },
      // cli/main.ts is missing from current files
    ];

    const result = validateIndex(index, currentFiles);

    expect(result.valid).toBe(false);
    expect(result.extraFiles).toContain('cli/main.ts');
  });

  it('should detect modified files', () => {
    const index = createTestIndex();
    const currentFiles = [
      { path: 'core/types.ts', lines: 250 }, // Changed from 200
      { path: 'cli/main.ts', lines: 100 },
    ];

    const result = validateIndex(index, currentFiles);

    expect(result.valid).toBe(false);
    expect(result.modifiedFiles).toContain('core/types.ts');
  });
});
