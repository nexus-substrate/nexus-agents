/**
 * Tests for Component Scanner.
 * (Source: Issue #137)
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

describe('per-file test coverage (#4668)', () => {
  // `deprecate` was unreachable: `analyzeFile` hardcoded `testCoverage: null`,
  // which gated the -0.2 low-coverage penalty and left the score floor at 0.45
  // against a `deprecate` boundary of < 0.3.
  //
  // The existing regression test for this hand-builds a ComponentInfo with
  // `testCoverage: 20` — a value the real scanner never produced — so it proved
  // the evaluator's arithmetic while the feature was dead. These run against
  // scanner output instead.

  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'scanner-cov-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('reads per-file coverage from coverage-summary.json', async () => {
    const src = join(dir, 'thing.ts');
    writeFileSync(src, 'export const a = 1;\n');

    const covDir = join(dir, 'coverage');
    mkdirSync(covDir, { recursive: true });
    writeFileSync(
      join(covDir, 'coverage-summary.json'),
      JSON.stringify({ total: { lines: { pct: 50 } }, [src]: { lines: { pct: 17 } } })
    );

    const scanner = new ComponentScanner({ coverageDir: covDir });
    const inventory = await scanner.scan(dir);
    const thing = inventory.components.find((c) => c.name === 'thing');

    // 17, the file's own coverage — NOT 50, the project total. A project-wide
    // number stamped onto every file would be a fabricated per-file metric.
    expect(thing?.testCoverage).toBe(17);
  });

  it('leaves coverage NULL when no report exists — unmeasured is not 0%', async () => {
    // The condition that makes this fix safe. Coercing absence to 0 would make
    // every file without a coverage run look maximally bad and turn `deprecate`
    // from "can never fire" into "fires for the wrong reason".
    writeFileSync(join(dir, 'thing.ts'), 'export const a = 1;\n');

    const scanner = new ComponentScanner({ coverageDir: join(dir, 'nope') });
    const inventory = await scanner.scan(dir);

    expect(inventory.components[0]?.testCoverage).toBeNull();
  });

  it('leaves coverage NULL for a file absent from the report', async () => {
    writeFileSync(join(dir, 'thing.ts'), 'export const a = 1;\n');
    const covDir = join(dir, 'coverage');
    mkdirSync(covDir, { recursive: true });
    writeFileSync(
      join(covDir, 'coverage-summary.json'),
      JSON.stringify({
        total: { lines: { pct: 50 } },
        '/some/other/file.ts': { lines: { pct: 90 } },
      })
    );

    const scanner = new ComponentScanner({ coverageDir: covDir });
    const inventory = await scanner.scan(dir);

    expect(inventory.components[0]?.testCoverage).toBeNull();
  });
});
