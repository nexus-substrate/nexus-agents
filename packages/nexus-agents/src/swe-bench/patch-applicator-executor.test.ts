/**
 * Tests for patch-applicator-executor.ts
 *
 * Covers temp file management, argument building, output parsing,
 * error handling, and patch execution.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ILogger } from '../core/logger.js';

const { mockExecAsync, mockWriteFile, mockUnlink } = vi.hoisted(() => {
  const execFn = vi.fn(() => Promise.resolve({ stdout: '', stderr: '' }));
  return {
    mockExecAsync: execFn,
    mockWriteFile: vi.fn(() => Promise.resolve()),
    mockUnlink: vi.fn(() => Promise.resolve()),
  };
});

vi.mock('node:child_process', () => ({ exec: vi.fn(), execFile: vi.fn() }));
vi.mock('node:util', () => ({ promisify: () => mockExecAsync }));
vi.mock('node:fs/promises', () => ({ writeFile: mockWriteFile, unlink: mockUnlink }));
vi.mock('../core/index.js', () => ({
  getTimeProvider: () => ({ now: () => 1700000000000 }),
}));

import type { ResolvedPatchOptions } from './patch-applicator-executor.js';
import {
  MAX_OUTPUT_BUFFER,
  writeTempPatch,
  cleanupTempFile,
  buildPatchArgs,
  parseModifiedFiles,
  extractFuzzFactor,
  parseFailedFiles,
  handlePatchError,
  executePatch,
} from './patch-applicator-executor.js';

function makeOptions(overrides?: Partial<ResolvedPatchOptions>): ResolvedPatchOptions {
  return {
    workDir: '/tmp/repo',
    allowFuzz: true,
    maxFuzz: 2,
    createBackup: true,
    dryRun: false,
    stripLevel: 1,
    timeoutMs: 30000,
    ...overrides,
  };
}

function makeLogger(): ILogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => makeLogger()),
    setLevel: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockExecAsync.mockImplementation(() => Promise.resolve({ stdout: '', stderr: '' }));
  mockWriteFile.mockImplementation(() => Promise.resolve());
  mockUnlink.mockImplementation(() => Promise.resolve());
});

describe('MAX_OUTPUT_BUFFER', () => {
  it('equals 5MB', () => {
    expect(MAX_OUTPUT_BUFFER).toBe(5 * 1024 * 1024);
  });
});

describe('writeTempPatch', () => {
  it('creates file with timestamp-based name', async () => {
    const result = await writeTempPatch('patch content', '/tmp/repo');
    expect(result).toBe('/tmp/repo/.patch-1700000000000.patch');
    expect(mockWriteFile).toHaveBeenCalledWith(
      '/tmp/repo/.patch-1700000000000.patch',
      'patch content',
      'utf-8'
    );
  });

  it('uses workDir as parent directory', async () => {
    await writeTempPatch('data', '/custom/dir');
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining('/custom/dir/'),
      'data',
      'utf-8'
    );
  });
});

describe('cleanupTempFile', () => {
  it('calls unlink on the file', async () => {
    await cleanupTempFile('/tmp/repo/.patch-123.patch');
    expect(mockUnlink).toHaveBeenCalledWith('/tmp/repo/.patch-123.patch');
  });

  it('silently ignores unlink errors', async () => {
    mockUnlink.mockRejectedValueOnce(new Error('ENOENT'));
    await expect(cleanupTempFile('/nonexistent')).resolves.toBeUndefined();
  });
});

describe('buildPatchArgs', () => {
  it('includes strip level', () => {
    const args = buildPatchArgs('/tmp/p.patch', makeOptions({ stripLevel: 3 }), false);
    expect(args).toContain('-p3');
  });

  it('includes input file', () => {
    const args = buildPatchArgs('/tmp/p.patch', makeOptions(), false);
    const idx = args.indexOf('-i');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(args[idx + 1]).toBe('/tmp/p.patch');
  });

  it('includes backup flag when createBackup is true and not dryRun', () => {
    const args = buildPatchArgs(
      '/tmp/p.patch',
      makeOptions({ createBackup: true, dryRun: false }),
      false
    );
    expect(args).toContain('-b');
  });

  it('omits backup flag when dryRun is true', () => {
    const args = buildPatchArgs(
      '/tmp/p.patch',
      makeOptions({ createBackup: true, dryRun: true }),
      false
    );
    expect(args).not.toContain('-b');
  });

  it('omits backup flag when createBackup is false', () => {
    const args = buildPatchArgs('/tmp/p.patch', makeOptions({ createBackup: false }), false);
    expect(args).not.toContain('-b');
  });

  it('includes --dry-run when dryRun is true', () => {
    const args = buildPatchArgs('/tmp/p.patch', makeOptions({ dryRun: true }), false);
    expect(args).toContain('--dry-run');
  });

  it('omits --dry-run when dryRun is false', () => {
    const args = buildPatchArgs('/tmp/p.patch', makeOptions({ dryRun: false }), false);
    expect(args).not.toContain('--dry-run');
  });

  it('includes fuzz factor when allowFuzz is true', () => {
    const args = buildPatchArgs(
      '/tmp/p.patch',
      makeOptions({ allowFuzz: true, maxFuzz: 3 }),
      false
    );
    expect(args).toContain('-F3');
  });

  it('sets fuzz to 0 when allowFuzz is false', () => {
    const args = buildPatchArgs('/tmp/p.patch', makeOptions({ allowFuzz: false }), false);
    expect(args).toContain('-F0');
    expect(args).not.toContain('-F2');
  });

  it('includes reverse flag when reverse is true', () => {
    expect(buildPatchArgs('/tmp/p.patch', makeOptions(), true)).toContain('-R');
  });

  it('omits reverse flag when reverse is false', () => {
    expect(buildPatchArgs('/tmp/p.patch', makeOptions(), false)).not.toContain('-R');
  });

  it('always includes force and verbose flags', () => {
    const args = buildPatchArgs('/tmp/p.patch', makeOptions(), false);
    expect(args).toContain('-f');
    expect(args).toContain('-v');
  });

  it('builds full argument set with all options enabled', () => {
    const opts = makeOptions({
      stripLevel: 1,
      createBackup: true,
      dryRun: false,
      allowFuzz: true,
      maxFuzz: 2,
    });
    const args = buildPatchArgs('/tmp/p.patch', opts, true);
    expect(args).toEqual(['-p1', '-i', '/tmp/p.patch', '-b', '-F2', '-R', '-f', '-v']);
  });
});

describe('parseModifiedFiles', () => {
  it('extracts single file', () => {
    expect(parseModifiedFiles("patching file 'src/main.ts'")).toEqual(['src/main.ts']);
  });

  it('extracts multiple files', () => {
    const output = "patching file 'a.ts'\npatching file 'b.ts'\npatching file 'c.ts'";
    expect(parseModifiedFiles(output)).toEqual(['a.ts', 'b.ts', 'c.ts']);
  });

  it('handles unquoted file paths', () => {
    expect(parseModifiedFiles('patching file src/main.ts')).toEqual(['src/main.ts']);
  });

  it('handles double-quoted file paths', () => {
    expect(parseModifiedFiles('patching file "src/main.ts"')).toEqual(['src/main.ts']);
  });

  it('returns empty array for no matches', () => {
    expect(parseModifiedFiles('no patch output here')).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(parseModifiedFiles('')).toEqual([]);
  });
});

describe('extractFuzzFactor', () => {
  it('extracts fuzz factor from output', () => {
    expect(extractFuzzFactor('Hunk #1 succeeded at 10 with fuzz 2')).toBe(2);
  });

  it('returns undefined when no fuzz', () => {
    expect(extractFuzzFactor('Hunk #1 succeeded at 10')).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(extractFuzzFactor('')).toBeUndefined();
  });

  it('extracts first match when multiple hunks have fuzz', () => {
    const output = 'Hunk #1 succeeded at 10 with fuzz 1\nHunk #2 succeeded at 20 with fuzz 3';
    expect(extractFuzzFactor(output)).toBe(1);
  });

  it('returns undefined when output has FAILED but no fuzz', () => {
    expect(extractFuzzFactor('Hunk #1 FAILED at 10')).toBeUndefined();
  });
});

describe('parseFailedFiles', () => {
  it('extracts failed file', () => {
    expect(parseFailedFiles("patching file 'src/main.ts'\nHunk #1 FAILED at 10")).toEqual([
      'src/main.ts',
    ]);
  });

  it('returns empty when no failures', () => {
    expect(parseFailedFiles("patching file 'src/main.ts'\nHunk #1 succeeded")).toEqual([]);
  });

  it('deduplicates files with multiple failed hunks', () => {
    const output = "patching file 'a.ts'\nHunk #1 FAILED at 5\nHunk #2 FAILED at 20";
    expect(parseFailedFiles(output)).toEqual(['a.ts']);
  });

  it('returns empty for empty string', () => {
    expect(parseFailedFiles('')).toEqual([]);
  });

  it('identifies correct file per failure', () => {
    const output = [
      "patching file 'a.ts'",
      'Hunk #1 succeeded',
      "patching file 'b.ts'",
      'Hunk #1 FAILED at 3',
    ].join('\n');
    expect(parseFailedFiles(output)).toEqual(['b.ts']);
  });
});

describe('handlePatchError', () => {
  it('returns timeout error when killed is true', () => {
    const result = handlePatchError(
      { killed: true, stdout: '', stderr: '' },
      { dryRun: false, createBackup: true }
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe('Patch command timed out');
    expect(result.backupCreated).toBe(true);
  });

  it('returns partial failure when some files succeed and some fail', () => {
    const output = [
      "patching file 'ok.ts'",
      'Hunk #1 succeeded',
      "patching file 'bad.ts'",
      'Hunk #1 FAILED at 5',
    ].join('\n');
    const result = handlePatchError(
      { stdout: output, stderr: '' },
      { dryRun: false, createBackup: false }
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('Partial failure');
    expect(result.modifiedFiles).toContain('ok.ts');
    expect(result.failedFiles).toContain('bad.ts');
  });

  it('uses error message when no files modified', () => {
    const result = handlePatchError(
      { stdout: '', stderr: '', message: 'Command not found' },
      { dryRun: false, createBackup: false }
    );
    expect(result.error).toBe('Command not found');
  });

  it('falls back to generic message when no error message', () => {
    const result = handlePatchError(
      { stdout: '', stderr: '' },
      { dryRun: false, createBackup: false }
    );
    expect(result.error).toBe('Patch failed');
  });

  it('sets backupCreated false during dryRun', () => {
    const result = handlePatchError(
      { stdout: '', stderr: '', killed: true },
      { dryRun: true, createBackup: true }
    );
    expect(result.backupCreated).toBe(false);
  });

  it('combines stdout and stderr in output', () => {
    const result = handlePatchError(
      { stdout: 'out-data', stderr: 'err-data' },
      { dryRun: false, createBackup: false }
    );
    expect(result.output).toContain('out-data');
    expect(result.output).toContain('err-data');
  });

  it('handles completely empty error object', () => {
    const result = handlePatchError({}, { dryRun: false, createBackup: false });
    expect(result.success).toBe(false);
    expect(result.appliedCleanly).toBe(false);
  });
});

describe('executePatch', () => {
  it('returns success result on clean apply', async () => {
    mockExecAsync.mockImplementation(() =>
      Promise.resolve({ stdout: "patching file 'src/main.ts'\n", stderr: '' })
    );
    const result = await executePatch('/tmp/p.patch', makeOptions(), false, makeLogger());
    expect(result.success).toBe(true);
    expect(result.modifiedFiles).toContain('src/main.ts');
    expect(result.appliedCleanly).toBe(true);
  });

  it('detects fuzz factor in output', async () => {
    mockExecAsync.mockImplementation(() =>
      Promise.resolve({
        stdout: "patching file 'a.ts'\nHunk #1 succeeded at 10 with fuzz 2",
        stderr: '',
      })
    );
    const result = await executePatch('/tmp/p.patch', makeOptions(), false, makeLogger());
    expect(result.success).toBe(true);
    expect(result.fuzzFactor).toBe(2);
  });

  it('sets appliedCleanly false when output contains Hunk and FAILED', async () => {
    mockExecAsync.mockImplementation(() =>
      Promise.resolve({
        stdout: "patching file 'a.ts'\nHunk #1 FAILED at 5",
        stderr: '',
      })
    );
    const result = await executePatch('/tmp/p.patch', makeOptions(), false, makeLogger());
    expect(result.appliedCleanly).toBe(false);
  });

  it('returns error result when exec throws', async () => {
    const execErr = Object.assign(new Error('exec error'), {
      stdout: '',
      stderr: 'patch: command failed',
    });
    mockExecAsync.mockImplementation(() => Promise.reject(execErr));
    const result = await executePatch('/tmp/p.patch', makeOptions(), false, makeLogger());
    expect(result.success).toBe(false);
    expect(result.error).toBe('exec error');
  });

  it('passes correct cwd and timeout to execFile', async () => {
    const opts = makeOptions({ workDir: '/my/repo', timeoutMs: 5000 });
    await executePatch('/tmp/p.patch', opts, false, makeLogger());
    expect(mockExecAsync).toHaveBeenCalledWith(
      'patch',
      expect.any(Array),
      expect.objectContaining({ cwd: '/my/repo', timeout: 5000, maxBuffer: MAX_OUTPUT_BUFFER })
    );
  });

  it('logs the args before execution', async () => {
    const logger = makeLogger();
    await executePatch('/tmp/p.patch', makeOptions(), false, logger);
    expect(logger.debug).toHaveBeenCalledWith(
      'Executing patch command',
      expect.objectContaining({ args: expect.any(Array) })
    );
  });

  it('includes reverse flag in args when reverse is true', async () => {
    await executePatch('/tmp/p.patch', makeOptions(), true, makeLogger());
    const args = (mockExecAsync.mock.calls[0] as unknown as [string, string[]])[1];
    expect(args).toContain('-R');
  });

  it('sets backupCreated based on options', async () => {
    const result = await executePatch(
      '/tmp/p.patch',
      makeOptions({ createBackup: false }),
      false,
      makeLogger()
    );
    expect(result.backupCreated).toBe(false);
  });

  it('omits fuzzFactor from result when not present in output', async () => {
    mockExecAsync.mockImplementation(() =>
      Promise.resolve({ stdout: "patching file 'a.ts'", stderr: '' })
    );
    const result = await executePatch('/tmp/p.patch', makeOptions(), false, makeLogger());
    expect(result).not.toHaveProperty('fuzzFactor');
  });
});
