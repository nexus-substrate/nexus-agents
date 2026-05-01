/**
 * Tests for {@link writeBinShim} (#3a, child of #2301).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SHIM_BASENAME, buildShimContents, writeBinShim } from './bin-shim.js';

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-shim-test-'));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('buildShimContents', () => {
  it('begins with a node shebang', () => {
    expect(buildShimContents('/x/dist/cli.js').startsWith('#!/usr/bin/env node')).toBe(true);
  });

  it('embeds the cli entry path inside an import() call', () => {
    const contents = buildShimContents('/abs/path/to/dist/cli.js');
    expect(contents).toContain("import('/abs/path/to/dist/cli.js')");
  });

  it('emits exit handler so unhandled rejections become non-zero exit', () => {
    expect(buildShimContents('/x.js')).toContain('process.exit(1)');
  });
});

describe('writeBinShim', () => {
  it('creates the shim file with executable mode 0o755', () => {
    const binDir = path.join(tmp, 'bin');
    const result = writeBinShim({ binDir, cliEntryPath: '/x/cli.js' });
    expect(result.success).toBe(true);
    expect(result.written).toBe(true);
    expect(fs.existsSync(result.shimPath)).toBe(true);
    if (process.platform !== 'win32') {
      const mode = fs.statSync(result.shimPath).mode & 0o777;
      expect(mode).toBe(0o755);
    }
  });

  it('places the shim at <binDir>/nexus-agents', () => {
    const binDir = path.join(tmp, 'bin');
    const result = writeBinShim({ binDir, cliEntryPath: '/x/cli.js' });
    expect(result.shimPath).toBe(path.join(binDir, SHIM_BASENAME));
  });

  it('creates the bin directory if it does not exist', () => {
    const binDir = path.join(tmp, 'nested', 'deeper', 'bin');
    const result = writeBinShim({ binDir, cliEntryPath: '/x/cli.js' });
    expect(result.success).toBe(true);
    expect(fs.existsSync(binDir)).toBe(true);
  });

  it('returns alreadyMatched when re-emitting the same shim', () => {
    const binDir = path.join(tmp, 'bin');
    writeBinShim({ binDir, cliEntryPath: '/x/cli.js' });
    const r2 = writeBinShim({ binDir, cliEntryPath: '/x/cli.js' });
    expect(r2.success).toBe(true);
    expect(r2.alreadyMatched).toBe(true);
    expect(r2.written).toBe(false);
  });

  it('rewrites the shim when the cli entry path changes', () => {
    const binDir = path.join(tmp, 'bin');
    writeBinShim({ binDir, cliEntryPath: '/old.js' });
    const r2 = writeBinShim({ binDir, cliEntryPath: '/new.js' });
    expect(r2.written).toBe(true);
    expect(r2.alreadyMatched).toBe(false);
    const contents = fs.readFileSync(r2.shimPath, 'utf-8');
    expect(contents).toContain('/new.js');
    expect(contents).not.toContain('/old.js');
  });

  it('dry-run reports success without writing', () => {
    const binDir = path.join(tmp, 'bin');
    const result = writeBinShim({ binDir, cliEntryPath: '/x.js', dryRun: true });
    expect(result.success).toBe(true);
    expect(result.written).toBe(true); // logically would have written
    expect(fs.existsSync(result.shimPath)).toBe(false);
  });
});
