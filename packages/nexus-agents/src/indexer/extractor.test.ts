/**
 * Tests for Codebase Index Extractor
 *
 * (Source: Issue #240)
 */

import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import {
  detectFileCategory,
  extractExports,
  extractDependencies,
  extractDescription,
  extractFileEntry,
} from './extractor.js';

// Helper to create a source file for testing
function createSourceFile(
  content: string,
  fileName = 'test.ts'
): ReturnType<Project['createSourceFile']> {
  const project = new Project({ useInMemoryFileSystem: true });
  return project.createSourceFile(fileName, content);
}

describe('detectFileCategory', () => {
  it('should detect test files', () => {
    const sourceFile = createSourceFile('export const x = 1;', 'foo.test.ts');
    expect(detectFileCategory('foo.test.ts', sourceFile)).toBe('test');
  });

  it('should detect spec files as tests', () => {
    const sourceFile = createSourceFile('export const x = 1;', 'foo.spec.ts');
    expect(detectFileCategory('foo.spec.ts', sourceFile)).toBe('test');
  });

  it('should detect index files', () => {
    const sourceFile = createSourceFile('export * from "./types.js";', 'index.ts');
    expect(detectFileCategory('index.ts', sourceFile)).toBe('index');
  });

  it('should detect type definition files by name', () => {
    const sourceFile = createSourceFile('export type Foo = string;', 'foo-types.ts');
    expect(detectFileCategory('foo-types.ts', sourceFile)).toBe('types');
  });

  it('should detect CLI commands', () => {
    const sourceFile = createSourceFile('export function run() {}', 'cli/my-command.ts');
    expect(detectFileCategory('cli/my-command.ts', sourceFile)).toBe('cli');
  });

  it('should detect command files', () => {
    const sourceFile = createSourceFile('export function run() {}', 'foo-command.ts');
    expect(detectFileCategory('foo-command.ts', sourceFile)).toBe('cli');
  });

  it('should detect config files', () => {
    const sourceFile = createSourceFile('export const config = {};', 'config/app.ts');
    expect(detectFileCategory('config/app.ts', sourceFile)).toBe('config');
  });

  it('should detect types files by content', () => {
    const sourceFile = createSourceFile(
      `
      export interface Foo { bar: string; }
      export type Baz = number;
    `,
      'models.ts'
    );
    expect(detectFileCategory('models.ts', sourceFile)).toBe('types');
  });

  it('should detect utility files', () => {
    const sourceFile = createSourceFile('export function helper() {}', 'string-helpers.ts');
    expect(detectFileCategory('string-helpers.ts', sourceFile)).toBe('util');
  });

  it('should default to implementation', () => {
    const sourceFile = createSourceFile(
      `
      export class Service {
        run() { return 1; }
      }
    `,
      'service.ts'
    );
    expect(detectFileCategory('service.ts', sourceFile)).toBe('implementation');
  });
});

describe('extractExports', () => {
  it('should extract exported functions', () => {
    const sourceFile = createSourceFile(`
      export function myFunction() { return 1; }
    `);
    const exports = extractExports(sourceFile);
    expect(exports).toHaveLength(1);
    expect(exports[0]).toEqual({
      name: 'myFunction',
      kind: 'function',
      isReExport: false,
    });
  });

  it('should extract exported classes', () => {
    const sourceFile = createSourceFile(`
      export class MyClass {}
    `);
    const exports = extractExports(sourceFile);
    expect(exports).toHaveLength(1);
    expect(exports[0]).toEqual({
      name: 'MyClass',
      kind: 'class',
      isReExport: false,
    });
  });

  it('should extract exported interfaces', () => {
    const sourceFile = createSourceFile(`
      export interface IService { run(): void; }
    `);
    const exports = extractExports(sourceFile);
    expect(exports).toHaveLength(1);
    expect(exports[0]).toEqual({
      name: 'IService',
      kind: 'interface',
      isReExport: false,
    });
  });

  it('should extract exported types', () => {
    const sourceFile = createSourceFile(`
      export type MyType = string | number;
    `);
    const exports = extractExports(sourceFile);
    expect(exports).toHaveLength(1);
    expect(exports[0]).toEqual({
      name: 'MyType',
      kind: 'type',
      isReExport: false,
    });
  });

  it('should extract exported constants', () => {
    const sourceFile = createSourceFile(`
      export const MY_CONST = 42;
    `);
    const exports = extractExports(sourceFile);
    expect(exports).toHaveLength(1);
    expect(exports[0]).toEqual({
      name: 'MY_CONST',
      kind: 'const',
      isReExport: false,
    });
  });

  it('should extract exported enums', () => {
    const sourceFile = createSourceFile(`
      export enum Status { Active, Inactive }
    `);
    const exports = extractExports(sourceFile);
    expect(exports).toHaveLength(1);
    expect(exports[0]).toEqual({
      name: 'Status',
      kind: 'enum',
      isReExport: false,
    });
  });

  it('should extract re-exports with source module', () => {
    const sourceFile = createSourceFile(`
      export { foo, bar } from './other.js';
    `);
    const exports = extractExports(sourceFile);
    expect(exports).toHaveLength(2);
    expect(exports[0]).toMatchObject({
      name: 'foo',
      isReExport: true,
      sourceModule: './other.js',
    });
  });

  it('should extract star re-exports', () => {
    const sourceFile = createSourceFile(`
      export * from './types.js';
    `);
    const exports = extractExports(sourceFile);
    expect(exports).toHaveLength(1);
    expect(exports[0]).toEqual({
      name: '*',
      kind: 'unknown',
      isReExport: true,
      sourceModule: './types.js',
    });
  });

  it('should handle mixed exports', () => {
    const sourceFile = createSourceFile(`
      export const x = 1;
      export function foo() {}
      export { bar } from './other.js';
    `);
    const exports = extractExports(sourceFile);
    expect(exports).toHaveLength(3);
  });

  it('should not include non-exported declarations', () => {
    const sourceFile = createSourceFile(`
      const private1 = 1;
      function private2() {}
      export const public1 = 2;
    `);
    const exports = extractExports(sourceFile);
    expect(exports).toHaveLength(1);
    expect(exports[0]?.name).toBe('public1');
  });
});

describe('extractDependencies', () => {
  it('should extract named imports', () => {
    const sourceFile = createSourceFile(`
      import { foo, bar } from './module.js';
    `);
    const deps = extractDependencies(sourceFile);
    expect(deps).toHaveLength(1);
    expect(deps[0]).toEqual({
      specifier: './module.js',
      isExternal: false,
      imports: ['foo', 'bar'],
    });
  });

  it('should extract default imports', () => {
    const sourceFile = createSourceFile(`
      import MyClass from './my-class.js';
    `);
    const deps = extractDependencies(sourceFile);
    expect(deps).toHaveLength(1);
    expect(deps[0]).toEqual({
      specifier: './my-class.js',
      isExternal: false,
      imports: ['MyClass'],
    });
  });

  it('should extract namespace imports', () => {
    const sourceFile = createSourceFile(`
      import * as utils from './utils.js';
    `);
    const deps = extractDependencies(sourceFile);
    expect(deps).toHaveLength(1);
    expect(deps[0]).toEqual({
      specifier: './utils.js',
      isExternal: false,
      imports: ['* as utils'],
    });
  });

  it('should identify external npm packages', () => {
    const sourceFile = createSourceFile(`
      import { z } from 'zod';
    `);
    const deps = extractDependencies(sourceFile);
    expect(deps).toHaveLength(1);
    expect(deps[0]).toEqual({
      specifier: 'zod',
      isExternal: true,
      imports: ['z'],
    });
  });

  it('should identify node built-ins', () => {
    const sourceFile = createSourceFile(`
      import * as path from 'node:path';
    `);
    const deps = extractDependencies(sourceFile);
    expect(deps).toHaveLength(1);
    expect(deps[0]?.isExternal).toBe(true);
  });

  it('should deduplicate imports from same module', () => {
    const sourceFile = createSourceFile(`
      import { foo } from './module.js';
      import { bar } from './module.js';
    `);
    const deps = extractDependencies(sourceFile);
    // First import wins due to deduplication
    expect(deps).toHaveLength(1);
  });

  it('should handle type-only imports', () => {
    const sourceFile = createSourceFile(`
      import type { MyType } from './types.js';
    `);
    const deps = extractDependencies(sourceFile);
    expect(deps).toHaveLength(1);
    expect(deps[0]?.specifier).toBe('./types.js');
  });
});

describe('extractDescription', () => {
  it('should extract JSDoc description', () => {
    const sourceFile = createSourceFile(`
/**
 * This is a test module.
 * It does something useful.
 */

export const x = 1;
    `);
    const desc = extractDescription(sourceFile);
    expect(desc).toBe('This is a test module');
  });

  it('should skip JSDoc tags', () => {
    const sourceFile = createSourceFile(`
/**
 * Module description here.
 * @module test
 * @author Someone
 */

export const x = 1;
    `);
    const desc = extractDescription(sourceFile);
    expect(desc).toBe('Module description here');
  });

  it('should return undefined for files without JSDoc', () => {
    const sourceFile = createSourceFile(`
export const x = 1;
    `);
    const desc = extractDescription(sourceFile);
    expect(desc).toBeUndefined();
  });

  it('should truncate long descriptions', () => {
    const longText = 'A '.repeat(100);
    const sourceFile = createSourceFile(`
/**
 * ${longText}
 */

export const x = 1;
    `);
    const desc = extractDescription(sourceFile);
    expect(desc?.length).toBeLessThanOrEqual(153); // 150 + '...'
  });
});

describe('extractFileEntry', () => {
  it('should extract complete file metadata', () => {
    const sourceFile = createSourceFile(
      `
/**
 * Test service implementation.
 */

import { z } from 'zod';
import type { Config } from './types.js';

export class TestService {
  run(): void {}
}

export const VERSION = '1.0.0';
    `,
      '/project/test-service.ts'
    );

    const entry = extractFileEntry(sourceFile, '/project', true);

    expect(entry.path).toBe('test-service.ts');
    expect(entry.lines).toBeGreaterThan(0);
    expect(entry.category).toBe('implementation');
    expect(entry.exports).toHaveLength(2);
    expect(entry.dependencies).toHaveLength(2);
    expect(entry.description).toBe('Test service implementation');
  });

  it('should handle files with no exports', () => {
    const sourceFile = createSourceFile(
      `
      const x = 1;
      function internal() {}
    `,
      '/project/internal.ts'
    );

    const entry = extractFileEntry(sourceFile, '/project', true);
    expect(entry.exports).toHaveLength(0);
  });

  it('should handle files with no imports', () => {
    const sourceFile = createSourceFile(
      `
      export const x = 1;
    `,
      '/project/standalone.ts'
    );

    const entry = extractFileEntry(sourceFile, '/project', true);
    expect(entry.dependencies).toHaveLength(0);
  });

  it('should respect extractDescriptions option', () => {
    const sourceFile = createSourceFile(
      `
/**
 * Has a description.
 */
export const x = 1;
    `,
      '/project/described.ts'
    );

    const withDesc = extractFileEntry(sourceFile, '/project', true);
    const withoutDesc = extractFileEntry(sourceFile, '/project', false);

    expect(withDesc.description).toBeDefined();
    expect(withoutDesc.description).toBeUndefined();
  });
});
