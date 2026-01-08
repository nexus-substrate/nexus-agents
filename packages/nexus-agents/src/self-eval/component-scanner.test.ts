/**
 * Tests for Component Scanner.
 * (Source: Issue #137)
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { ComponentScanner, createComponentScanner, scanComponents } from './component-scanner.js';
import { join } from 'node:path';
import { mkdir, writeFile, rm } from 'node:fs/promises';

// ============================================================================
// Test Setup
// ============================================================================

const TEST_DIR = join(process.cwd(), '.test-scan-temp');

async function createTestFile(name: string, content: string): Promise<void> {
  await writeFile(join(TEST_DIR, name), content);
}

async function setupTestDir(): Promise<void> {
  await mkdir(TEST_DIR, { recursive: true });
}

async function cleanupTestDir(): Promise<void> {
  await rm(TEST_DIR, { recursive: true, force: true });
}

// ============================================================================
// Tests
// ============================================================================

describe('ComponentScanner', () => {
  beforeEach(async () => {
    await cleanupTestDir();
    await setupTestDir();
  });

  describe('scan', () => {
    it('should scan directory and return inventory', async () => {
      await createTestFile(
        'simple.ts',
        `
export function hello(): string {
  return 'hello';
}
`
      );

      const scanner = createComponentScanner();
      const inventory = await scanner.scan(TEST_DIR);

      expect(inventory.totalFiles).toBe(1);
      expect(inventory.components[0]?.name).toBe('simple');
      expect(inventory.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should extract line counts', async () => {
      await createTestFile(
        'multiline.ts',
        `
// Comment
export const a = 1;
export const b = 2;

export const c = 3;
`
      );

      const scanner = createComponentScanner();
      const inventory = await scanner.scan(TEST_DIR);

      // 5 non-blank lines (comment + 3 exports + closing consideration)
      expect(inventory.components[0]?.lines).toBeGreaterThan(0);
    });

    it('should estimate complexity', async () => {
      await createTestFile(
        'complex.ts',
        `
export function process(x: number): string {
  if (x > 0) {
    for (let i = 0; i < x; i++) {
      if (i % 2 === 0) {
        return 'even';
      }
    }
  } else {
    switch (x) {
      case -1: return 'minus one';
      case -2: return 'minus two';
      default: return 'other';
    }
  }
  return x > 10 ? 'big' : 'small';
}
`
      );

      const scanner = createComponentScanner();
      const inventory = await scanner.scan(TEST_DIR);

      // Should have high complexity due to if, for, switch, case, ternary
      expect(inventory.components[0]?.complexity).toBeGreaterThan(5);
    });

    it('should extract dependencies', async () => {
      await createTestFile(
        'with-deps.ts',
        `
import { foo } from './foo.js';
import type { Bar } from '../bar.js';
import * as utils from 'node:util';

export function test() {
  return foo();
}
`
      );

      const scanner = createComponentScanner();
      const inventory = await scanner.scan(TEST_DIR);

      const deps = inventory.components[0]?.dependencies ?? [];
      expect(deps).toContain('./foo.js');
      expect(deps).toContain('../bar.js');
      expect(deps).toContain('node:util');
    });

    it('should count exports', async () => {
      await createTestFile(
        'exports.ts',
        `
export const a = 1;
export function b() {}
export class C {}
export type D = string;
export interface E {}
export default function() {}
`
      );

      const scanner = createComponentScanner();
      const inventory = await scanner.scan(TEST_DIR);

      expect(inventory.components[0]?.exportCount).toBeGreaterThanOrEqual(5);
    });

    it('should identify test files', async () => {
      await createTestFile('code.ts', 'export const x = 1;');
      await createTestFile('code.test.ts', 'import { x } from "./code.js";');

      const scanner = createComponentScanner();
      const inventory = await scanner.scan(TEST_DIR);

      const testFile = inventory.components.find((c) => c.isTest);
      const codeFile = inventory.components.find((c) => !c.isTest);

      expect(testFile).toBeDefined();
      expect(codeFile).toBeDefined();
      expect(testFile?.name).toBe('code.test');
    });

    it('should skip test files when configured', async () => {
      await createTestFile('code.ts', 'export const x = 1;');
      await createTestFile('code.test.ts', 'import { x } from "./code.js";');

      const scanner = createComponentScanner({ skipTests: true });
      const inventory = await scanner.scan(TEST_DIR);

      expect(inventory.totalFiles).toBe(1);
      expect(inventory.components[0]?.isTest).toBe(false);
    });

    it('should only scan specified extensions', async () => {
      await createTestFile('code.ts', 'export const x = 1;');
      await writeFile(join(TEST_DIR, 'other.js'), 'const y = 2;');

      const scanner = createComponentScanner({ extensions: ['.ts'] });
      const inventory = await scanner.scan(TEST_DIR);

      expect(inventory.totalFiles).toBe(1);
      expect(inventory.components[0]?.name).toBe('code');
    });

    it('should handle empty directory', async () => {
      const scanner = createComponentScanner();
      const inventory = await scanner.scan(TEST_DIR);

      expect(inventory.totalFiles).toBe(0);
      expect(inventory.components).toHaveLength(0);
    });

    it('should scan subdirectories', async () => {
      await mkdir(join(TEST_DIR, 'sub'), { recursive: true });
      await createTestFile('root.ts', 'export const a = 1;');
      await writeFile(join(TEST_DIR, 'sub', 'nested.ts'), 'export const b = 2;');

      const scanner = createComponentScanner();
      const inventory = await scanner.scan(TEST_DIR);

      expect(inventory.totalFiles).toBe(2);
      expect(inventory.components.map((c) => c.name).sort()).toEqual(['nested', 'root']);
    });
  });

  describe('createComponentScanner', () => {
    it('should create scanner with default config', () => {
      const scanner = createComponentScanner();
      expect(scanner).toBeInstanceOf(ComponentScanner);
    });

    it('should accept custom config', () => {
      const scanner = createComponentScanner({
        extensions: ['.ts', '.tsx'],
        skipTests: true,
        maxFileSize: 500000,
      });
      expect(scanner).toBeInstanceOf(ComponentScanner);
    });
  });

  describe('scanComponents', () => {
    it('should be a convenience function for scanning', async () => {
      await createTestFile('test.ts', 'export const x = 1;');

      const inventory = await scanComponents(TEST_DIR);

      expect(inventory.totalFiles).toBe(1);
    });
  });

  // Cleanup after all tests
  afterAll(async () => {
    await cleanupTestDir();
  });
});
