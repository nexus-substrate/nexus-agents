/**
 * Tests for await-published-tarball (#6525).
 *
 * @module scripts/await-published-tarball.test
 */

import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildTarballUrl,
  formatJobSummary,
  main,
  parseCliArgs,
  pollTarball,
  readLocalPackageVersion,
  type PollTarballResult,
} from './await-published-tarball.js';

describe('buildTarballUrl', () => {
  it('constructs correct URL for unscoped package', () => {
    const url = buildTarballUrl('nexus-agents', '8.86.0', 'https://registry.npmjs.org');
    expect(url).toBe('https://registry.npmjs.org/nexus-agents/-/nexus-agents-8.86.0.tgz');
  });

  it('constructs correct URL for scoped package', () => {
    const url = buildTarballUrl('@nexus-agents/core', '1.0.0', 'https://registry.npmjs.org');
    expect(url).toBe('https://registry.npmjs.org/@nexus-agents/core/-/core-1.0.0.tgz');
  });

  it('trims trailing slashes from registry URL', () => {
    const url = buildTarballUrl('nexus-agents', '8.86.0', 'https://registry.npmjs.org///');
    expect(url).toBe('https://registry.npmjs.org/nexus-agents/-/nexus-agents-8.86.0.tgz');
  });

  it('uses default registry when none is provided', () => {
    const url = buildTarballUrl('nexus-agents', '8.86.0');
    expect(url).toBe('https://registry.npmjs.org/nexus-agents/-/nexus-agents-8.86.0.tgz');
  });

  it('returns empty string when package or version is empty (named empty case)', () => {
    expect(buildTarballUrl('', '8.86.0')).toBe('');
    expect(buildTarballUrl('nexus-agents', '')).toBe('');
    expect(buildTarballUrl('', '')).toBe('');
  });
});

describe('parseCliArgs', () => {
  it('parses valid CLI options', () => {
    const options = parseCliArgs([
      '--package',
      'my-pkg',
      '--version',
      '1.2.3',
      '--registry',
      'https://custom.npm.org',
      '--timeout-seconds',
      '600',
      '--poll-interval-seconds',
      '5',
    ]);
    expect(options.packageName).toBe('my-pkg');
    expect(options.version).toBe('1.2.3');
    expect(options.registryUrl).toBe('https://custom.npm.org');
    expect(options.timeoutSeconds).toBe(600);
    expect(options.pollIntervalSeconds).toBe(5);
  });

  it('returns undefined for omitted options', () => {
    const options = parseCliArgs([]);
    expect(options.packageName).toBeUndefined();
    expect(options.version).toBeUndefined();
    expect(options.registryUrl).toBeUndefined();
    expect(options.timeoutSeconds).toBeUndefined();
    expect(options.pollIntervalSeconds).toBeUndefined();
  });
});

describe('formatJobSummary', () => {
  it('formats markdown for successful poll', () => {
    const result: PollTarballResult = {
      ok: true,
      durationSeconds: 120,
      attempts: 8,
      url: 'https://registry.npmjs.org/nexus-agents/-/nexus-agents-8.86.0.tgz',
    };
    const summary = formatJobSummary(result, 'nexus-agents', '8.86.0');
    expect(summary).toContain('nexus-agents@8.86.0');
    expect(summary).toContain('120s');
    expect(summary).toContain('Attempts:** 8');
    expect(summary).toContain('Available (HTTP 200)');
  });

  it('formats markdown for failed poll', () => {
    const result: PollTarballResult = {
      ok: false,
      reason: 'Timed out waiting for tarball after 1800s',
      durationSeconds: 1800,
      attempts: 120,
      lastStatus: 404,
      url: 'https://registry.npmjs.org/nexus-agents/-/nexus-agents-8.86.0.tgz',
    };
    const summary = formatJobSummary(result, 'nexus-agents', '8.86.0');
    expect(summary).toContain('nexus-agents@8.86.0');
    expect(summary).toContain('Unavailable');
    expect(summary).toContain('Timed out');
    expect(summary).toContain('Attempts:** 120');
  });
});

describe('pollTarball', () => {
  it('succeeds immediately when first fetch returns 200', async () => {
    const now = 1000;
    const result = await pollTarball({
      url: 'https://registry.npmjs.org/nexus-agents/-/nexus-agents-8.86.0.tgz',
      timeoutSeconds: 60,
      pollIntervalSeconds: 5,
      fetchFn: () => Promise.resolve({ status: 200 }),
      sleepFn: () => Promise.resolve(),
      nowFn: () => now,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.attempts).toBe(1);
      expect(result.durationSeconds).toBe(0);
    }
  });

  it('polls repeatedly until 200 is returned', async () => {
    let now = 1000;
    let callCount = 0;
    const fetchFn = (): Promise<{ status: number }> => {
      callCount += 1;
      if (callCount < 3) return Promise.resolve({ status: 404 });
      return Promise.resolve({ status: 200 });
    };
    const sleepFn = (sec: number): Promise<void> => {
      now += sec;
      return Promise.resolve();
    };

    const result = await pollTarball({
      url: 'https://registry.npmjs.org/nexus-agents/-/nexus-agents-8.86.0.tgz',
      timeoutSeconds: 60,
      pollIntervalSeconds: 5,
      fetchFn,
      sleepFn,
      nowFn: () => now,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.attempts).toBe(3);
      expect(result.durationSeconds).toBe(10);
    }
  });

  it('fails with timeout when 200 is never returned', async () => {
    let now = 1000;
    const fetchFn = (): Promise<{ status: number }> => Promise.resolve({ status: 404 });
    const sleepFn = (sec: number): Promise<void> => {
      now += sec;
      return Promise.resolve();
    };

    const result = await pollTarball({
      url: 'https://registry.npmjs.org/nexus-agents/-/nexus-agents-8.86.0.tgz',
      timeoutSeconds: 20,
      pollIntervalSeconds: 5,
      fetchFn,
      sleepFn,
      nowFn: () => now,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.attempts).toBeGreaterThanOrEqual(4);
      expect(result.lastStatus).toBe(404);
      expect(result.reason).toContain('Timed out');
    }
  });

  it('handles fetch exceptions during polling gracefully', async () => {
    let now = 1000;
    let callCount = 0;
    const fetchFn = (): Promise<{ status: number }> => {
      callCount += 1;
      if (callCount === 1) return Promise.reject(new Error('Network reset'));
      return Promise.resolve({ status: 200 });
    };
    const sleepFn = (sec: number): Promise<void> => {
      now += sec;
      return Promise.resolve();
    };

    const result = await pollTarball({
      url: 'https://registry.npmjs.org/nexus-agents/-/nexus-agents-8.86.0.tgz',
      timeoutSeconds: 30,
      pollIntervalSeconds: 5,
      fetchFn,
      sleepFn,
      nowFn: () => now,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.attempts).toBe(2);
      expect(result.durationSeconds).toBe(5);
    }
  });

  it('fails immediately when timeout is zero or negative (named empty case)', async () => {
    const result = await pollTarball({
      url: 'https://registry.npmjs.org/nexus-agents/-/nexus-agents-8.86.0.tgz',
      timeoutSeconds: 0,
      fetchFn: () => Promise.resolve({ status: 200 }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('Timeout zero or negative');
    }
  });

  it('fails immediately when URL is empty (named empty case)', async () => {
    const result = await pollTarball({
      url: '',
      timeoutSeconds: 30,
      fetchFn: () => Promise.resolve({ status: 200 }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('Empty tarball URL');
    }
  });
});

describe('readLocalPackageVersion', () => {
  it('reads version from packages/nexus-agents/package.json', () => {
    const repoRoot = process.cwd();
    const version = readLocalPackageVersion(repoRoot);
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('throws when package manifest does not exist', () => {
    expect(() => readLocalPackageVersion('/tmp/non-existent-dir-for-test')).toThrow(
      'Package manifest not found'
    );
  });
});

describe('main', () => {
  it('returns 0 and writes summary on successful poll', async () => {
    const tempSummaryFile = join(tmpdir(), `test-summary-${String(Date.now())}.md`);
    writeFileSync(tempSummaryFile, '');

    const exitCode = await main(
      ['--version', '8.86.0', '--timeout-seconds', '60'],
      { GITHUB_STEP_SUMMARY: tempSummaryFile },
      {
        pollFn: () =>
          Promise.resolve({
            ok: true,
            durationSeconds: 15,
            attempts: 2,
            url: 'https://registry.npmjs.org/nexus-agents/-/nexus-agents-8.86.0.tgz',
          }),
      }
    );

    expect(exitCode).toBe(0);
    const content = readFileSync(tempSummaryFile, 'utf8');
    expect(content).toContain('nexus-agents@8.86.0');
    expect(content).toContain('Available (HTTP 200)');
    rmSync(tempSummaryFile, { force: true });
  });

  it('returns 1 and logs error on poll failure', async () => {
    const tempSummaryFile = join(tmpdir(), `test-summary-fail-${String(Date.now())}.md`);
    writeFileSync(tempSummaryFile, '');

    const exitCode = await main(
      ['--version', '8.86.0', '--timeout-seconds', '10'],
      { GITHUB_STEP_SUMMARY: tempSummaryFile },
      {
        pollFn: () =>
          Promise.resolve({
            ok: false,
            reason: 'Timed out',
            durationSeconds: 10,
            attempts: 2,
            url: 'https://registry.npmjs.org/nexus-agents/-/nexus-agents-8.86.0.tgz',
          }),
      }
    );

    expect(exitCode).toBe(1);
    const content = readFileSync(tempSummaryFile, 'utf8');
    expect(content).toContain('Unavailable (Timed out)');
    rmSync(tempSummaryFile, { force: true });
  });
});
