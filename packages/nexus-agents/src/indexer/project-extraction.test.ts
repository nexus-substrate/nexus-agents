/**
 * nexus-agents/indexer - Project Extraction Tests (#4243)
 *
 * Regression coverage for default exclude globs: `**\/*.test.ts` and
 * `**\/*.d.ts` must actually be excluded from `extractProject` output.
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { extractProject } from './project-extraction.js';

describe('extractProject default excludes', () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir !== undefined) {
      fs.rmSync(dir, { recursive: true, force: true });
      dir = undefined;
    }
  });

  it('excludes co-located .test.ts and .d.ts files by default', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-extraction-test-'));
    const srcDir = path.join(dir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    fs.writeFileSync(path.join(srcDir, 'foo.ts'), 'export const foo = 1;\n');
    fs.writeFileSync(path.join(srcDir, 'foo.test.ts'), 'export const t = 1;\n');
    fs.writeFileSync(path.join(srcDir, 'foo.d.ts'), 'export declare const foo: number;\n');

    const result = extractProject({ rootDir: srcDir });

    const paths = result.files.map((f) => f.path);
    expect(paths).toContain('foo.ts');
    expect(paths.some((p) => p.endsWith('.test.ts'))).toBe(false);
    expect(paths.some((p) => p.endsWith('.d.ts'))).toBe(false);
  });

  it('still excludes files under node_modules', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-extraction-nm-'));
    const srcDir = path.join(dir, 'src');
    const nmDir = path.join(srcDir, 'node_modules', 'somepkg');
    fs.mkdirSync(nmDir, { recursive: true });

    fs.writeFileSync(path.join(srcDir, 'foo.ts'), 'export const foo = 1;\n');
    fs.writeFileSync(path.join(nmDir, 'index.ts'), 'export const bundled = 1;\n');

    const result = extractProject({ rootDir: srcDir });

    const paths = result.files.map((f) => f.path);
    expect(paths).toContain('foo.ts');
    expect(paths.some((p) => p.includes('node_modules'))).toBe(false);
  });
});
