/**
 * Tests for the tool-output consistency lint (#2653).
 *
 * @module scripts/check-tool-output-consistency.test
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  findTimestampNumberFields,
  scanToolFiles,
  scanToolFilesWithCoverage,
} from './check-tool-output-consistency.js';

describe('findTimestampNumberFields', () => {
  it('flags a timestamp field typed as z.number() inside an outputSchema', () => {
    const src = [
      'const outputSchema = {',
      '  success: z.boolean(),',
      '  createdAt: z.number(),',
      '};',
    ].join('\n');
    const v = findTimestampNumberFields(src, 'tool.ts');
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ field: 'createdAt', line: 3 });
  });

  it('flags a timestamp field typed as number inside a *Response interface', () => {
    const src = [
      'export interface FooResponse {',
      '  status: string;',
      '  reviewedDate: number;',
      '}',
    ].join('\n');
    const v = findTimestampNumberFields(src, 'tool.ts');
    expect(v).toHaveLength(1);
    expect(v[0]?.field).toBe('reviewedDate');
  });

  it('does NOT flag timestamp-as-number in an internal (non-output) type', () => {
    // The exact false-positive pattern from reflective-retriever.ts /
    // scanner-registry-fetcher.ts: an internal LRU cache entry.
    const src = [
      'interface CacheEntry {',
      '  manifest: Manifest;',
      '  fetchedAt: number;',
      '  timestamp: number;',
      '}',
    ].join('\n');
    expect(findTimestampNumberFields(src, 'tool.ts')).toEqual([]);
  });

  it('does NOT flag an ISO-string timestamp in an output schema', () => {
    const src = ['const outputSchema = {', '  createdAt: z.string(),', '};'].join('\n');
    expect(findTimestampNumberFields(src, 'tool.ts')).toEqual([]);
  });

  it('does NOT flag a duration field (durationMs is legitimately numeric)', () => {
    const src = [
      'const outputSchema = {',
      '  durationMs: z.number(),',
      '  totalTime: z.number(),',
      '};',
    ].join('\n');
    // `*Time` is deliberately excluded — durations are numeric.
    expect(findTimestampNumberFields(src, 'tool.ts')).toEqual([]);
  });

  it('flags inside the output region only, not a sibling internal type', () => {
    const src = [
      'interface CacheEntry { timestamp: number; }',
      'export interface ToolResponse {',
      '  publishedAt: z.number(),',
      '}',
    ].join('\n');
    const v = findTimestampNumberFields(src, 'tool.ts');
    expect(v).toHaveLength(1);
    expect(v[0]?.field).toBe('publishedAt');
  });
});

describe('scanToolFiles reports its own coverage (#5261-class)', () => {
  /**
   * `scanToolFiles` opened with `if (!existsSync(TOOLS_DIR)) return [];` and
   * `main` passed on `violations.length === 0`. A moved or renamed tools
   * directory therefore printed
   *
   *   Tool output consistency OK — no timestamp-as-number fields.
   *
   * and exited 0 from the required `lint` job, having inspected nothing. The
   * success line carried no path, no count, and no file list, so a zero-file
   * run was indistinguishable from a clean run over every tool.
   *
   * A check that cannot fail is not a check. The scan now reports what it
   * covered, and an empty or absent directory is an error rather than a pass.
   */
  function box(): string {
    return mkdtempSync(join(tmpdir(), 'tool-output-'));
  }

  it('reports the directory as missing rather than returning a clean result', () => {
    const dir = box();
    try {
      const result = scanToolFilesWithCoverage(join(dir, 'does-not-exist'));
      expect(result.dirMissing).toBe(true);
      expect(result.scanned).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports zero scanned for a present but empty directory', () => {
    // Distinct from the case above, and the more likely one: the directory
    // survives a refactor while the files move out from under it.
    const dir = box();
    try {
      mkdirSync(join(dir, 'tools'));
      const result = scanToolFilesWithCoverage(join(dir, 'tools'));
      expect(result.dirMissing).toBe(false);
      expect(result.scanned).toBe(0);
      expect(result.violations).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('counts the tool files it actually inspected, excluding tests', () => {
    const dir = box();
    try {
      const tools = join(dir, 'tools');
      mkdirSync(tools);
      writeFileSync(join(tools, 'alpha.ts'), 'export const a = 1;\n');
      writeFileSync(join(tools, 'beta.ts'), 'export const b = 2;\n');
      // Neither of these is a tool file; both must be excluded from the count,
      // or the count would certify coverage the scan never had.
      writeFileSync(join(tools, 'alpha.test.ts'), 'export const t = 3;\n');
      writeFileSync(join(tools, 'README.md'), 'not typescript\n');

      const result = scanToolFilesWithCoverage(tools);
      expect(result.scanned).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('still finds violations, and reports them alongside the count', () => {
    // The pair that stops the count from being the only thing tested: a
    // scanner that counted files but stopped detecting would pass every
    // assertion above.
    const dir = box();
    try {
      const tools = join(dir, 'tools');
      mkdirSync(tools);
      writeFileSync(
        join(tools, 'bad.ts'),
        'const outputSchema = {\n  createdAt: z.number(),\n};\n'
      );

      const result = scanToolFilesWithCoverage(tools);
      expect(result.scanned).toBe(1);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]).toMatchObject({ field: 'createdAt' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('scans a non-zero number of files at the real production path', () => {
    // The regression guard that matters. Every test above uses a fixture
    // directory, so all of them would stay green if the hardcoded production
    // TOOLS_DIR stopped resolving. This one exercises the default.
    const result = scanToolFilesWithCoverage();
    expect(result.dirMissing).toBe(false);
    expect(result.scanned).toBeGreaterThan(0);
  });
});

describe('scanToolFiles stays a faithful view of the coverage-aware scan', () => {
  it('returns exactly the violations the coverage-aware scan reports', () => {
    // `inject-governance.ts` still consumes this shape. If the two ever
    // diverged, the governance run and the lint would disagree about the same
    // tree while both reported success.
    expect(scanToolFiles()).toEqual(scanToolFilesWithCoverage().violations);
  });
});
