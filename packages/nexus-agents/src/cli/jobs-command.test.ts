/**
 * Tests for `nexus-agents jobs prune` (#6224, #4976 gap 2).
 *
 * Real temp directories, not fs mocks: the contract under test is what the
 * sweep leaves on disk, and a mock would only prove the mock was called.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { handleJobsCommand } from './jobs-command.js';
import { EXIT_CODES, type ParsedCliArgs } from '../cli-types.js';
import { nexusDataPath, resetNexusDataDirCache } from '../config/nexus-data-dir.js';
import { JOB_RECORD_RETENTION_MS, readJobResult } from '../mcp/jobs/job-result-store.js';

/**
 * Minimal `ParsedCliArgs` for the handler — the same cast-based fixture shape
 * `cli-commands-handlers-complex.test.ts` uses; the handler reads only
 * `subcommand` and `options.dryRun`.
 */
function args(subcommand: string | undefined, dryRun = false): ParsedCliArgs {
  return {
    command: 'jobs',
    ...(subcommand === undefined ? {} : { subcommand }),
    options: { dryRun },
    positionals: ['jobs', ...(subcommand === undefined ? [] : [subcommand])],
  } as unknown as ParsedCliArgs;
}

describe('handleJobsCommand (#6224)', () => {
  let tmpDir: string;
  let stdout: string[];
  const originalDataDir = process.env['NEXUS_DATA_DIR'];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-jobs-cmd-test-'));
    process.env['NEXUS_DATA_DIR'] = tmpDir;
    resetNexusDataDirCache();
    stdout = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      stdout.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = originalDataDir;
    resetNexusDataDirCache();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function seedSettled(jobId: string, msAgo: number): string {
    const path = nexusDataPath('jobs', `result-${jobId}.json`);
    mkdirSync(nexusDataPath('jobs'), { recursive: true });
    writeFileSync(
      path,
      JSON.stringify({
        v: 1,
        jobId,
        toolName: 'orchestrate',
        status: 'complete',
        createdAt: new Date(Date.now() - msAgo - 1_000).toISOString(),
        completedAt: new Date(Date.now() - msAgo).toISOString(),
        result: { ok: true },
      })
    );
    return path;
  }

  it('names the empty case: no jobs dir prunes nothing, prints zero counts, exits 0', () => {
    expect(existsSync(nexusDataPath('jobs'))).toBe(false);

    const result = handleJobsCommand(args('prune'));

    expect(result.exitCode).toBe(EXIT_CODES.SUCCESS);
    const out = stdout.join('');
    expect(out).toContain('deleted: 0');
    expect(out).toContain('markedAbandoned: 0');
    expect(out).toContain('kept: 0');
    expect(out).toContain('unreadable: 0');
    expect(out).toContain('deletedKeys: 0');
  });

  it('prune deletes expired terminal records and prints the counts', () => {
    const expired = seedSettled('expired', JOB_RECORD_RETENTION_MS + 60_000);
    const fresh = seedSettled('fresh', 60_000);

    const result = handleJobsCommand(args('prune'));

    expect(result.exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(existsSync(expired)).toBe(false);
    expect(existsSync(fresh)).toBe(true);
    const out = stdout.join('');
    expect(out).toContain('deleted: 1');
    expect(out).toContain('kept: 1');
  });

  it('prune --dry-run prints the same counts and changes nothing', () => {
    const expired = seedSettled('expired', JOB_RECORD_RETENTION_MS + 60_000);

    const result = handleJobsCommand(args('prune', true));

    expect(result.exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(existsSync(expired)).toBe(true);
    expect(readJobResult('expired')?.status).toBe('complete');
    const out = stdout.join('');
    expect(out).toContain('dry run');
    expect(out).toContain('deleted: 1');
  });

  it('a missing or unknown subcommand prints usage and exits INVALID_ARGS', () => {
    expect(handleJobsCommand(args(undefined)).exitCode).toBe(EXIT_CODES.INVALID_ARGS);
    expect(handleJobsCommand(args('list')).exitCode).toBe(EXIT_CODES.INVALID_ARGS);
    expect(stdout.join('')).toContain('jobs prune');
  });

  it('a jobs path that cannot be enumerated is a failure, not a zero', () => {
    writeFileSync(nexusDataPath('jobs'), 'not a directory');

    const result = handleJobsCommand(args('prune'));

    expect(result.exitCode).not.toBe(EXIT_CODES.SUCCESS);
    expect(stdout.join('')).not.toContain('deleted: 0');
  });
});
