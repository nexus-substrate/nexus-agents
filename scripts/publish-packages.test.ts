/**
 * Tests for the changeset publish wrapper with staged-publish error recovery (#6500).
 *
 * @module scripts/publish-packages.test
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { isStagedPublishError, parsePublishOutput, runPublish } from './publish-packages.js';

const created: string[] = [];

afterEach(() => {
  while (created.length > 0) {
    const dir = created.pop();
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  }
});

function initGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'publish-pkg-'));
  created.push(dir);
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'test'], { cwd: dir });
  writeFileSync(join(dir, 'file.txt'), 'hello', 'utf-8');
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['commit', '-qm', 'initial commit'], { cwd: dir });
  return dir;
}

const STAGED_ERROR_OUTPUT = `
🦋  info npm info nexus-agents
🦋  info npm info nexus-memory
These packages will be published as they were not found in the registry:
nexus-agents@8.83.0
1 packages are already published.
◒  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Publishing packages...

Some packages failed to publish:
nexus-agents@8.83.0
└ E409: 409 Conflict - PUT https://registry.npmjs.org/nexus-agents - Cannot publish over previously staged version "8.83.0".
🦋 Exited with code 1
`;

const GENUINE_ERROR_OUTPUT = `
Some packages failed to publish:
nexus-agents@8.83.0
└ E403: 403 Forbidden - PUT https://registry.npmjs.org/nexus-agents - You do not have permission to publish "nexus-agents".
🦋 Exited with code 1
`;

const MULTI_PACKAGE_MIXED_OUTPUT = `
Some packages failed to publish:
nexus-agents@8.83.0
└ E409: 409 Conflict - PUT https://registry.npmjs.org/nexus-agents - Cannot publish over previously staged version "8.83.0".
nexus-memory@1.0.2
└ E403: 403 Forbidden - PUT https://registry.npmjs.org/nexus-memory - You do not have permission to publish "nexus-memory".
🦋 Exited with code 1
`;

const MULTI_PACKAGE_ALL_STAGED_OUTPUT = `
Some packages failed to publish:
nexus-agents@8.83.0
└ E409: 409 Conflict - PUT https://registry.npmjs.org/nexus-agents - Cannot publish over previously staged version "8.83.0".
nexus-memory@1.0.2
└ E409: 409 Conflict - PUT https://registry.npmjs.org/nexus-memory - Cannot publish over previously staged version "1.0.2".
🦋 Exited with code 1
`;

const SUCCESS_OUTPUT = `
🦋  info npm info nexus-agents
Successfully published:
nexus-agents@8.83.0
Created git tags:
- nexus-agents@8.83.0
`;

describe('isStagedPublishError', () => {
  it('returns true for E409 with previously staged version', () => {
    expect(
      isStagedPublishError(
        'E409: 409 Conflict - PUT https://registry.npmjs.org/nexus-agents - Cannot publish over previously staged version "8.83.0".'
      )
    ).toBe(true);
  });

  it('returns true for plain "Cannot publish over previously staged version"', () => {
    expect(isStagedPublishError('Cannot publish over previously staged version 8.83.0')).toBe(true);
  });

  it('returns false for E403 forbidden', () => {
    expect(
      isStagedPublishError('E403: 403 Forbidden - You do not have permission to publish')
    ).toBe(false);
  });

  it('returns false for already published over previously published versions (not staged)', () => {
    expect(
      isStagedPublishError(
        'E403: You cannot publish over the previously published versions: 8.83.0.'
      )
    ).toBe(false);
  });

  it('returns false for empty input (named empty case)', () => {
    expect(isStagedPublishError('')).toBe(false);
  });
});

describe('parsePublishOutput', () => {
  it('extracts successful packages on clean publish', () => {
    const analysis = parsePublishOutput(SUCCESS_OUTPUT);
    expect(analysis.successfulPackages).toEqual(['nexus-agents@8.83.0']);
    expect(analysis.failedPackages).toEqual([]);
    expect(analysis.allFailuresAreStaged).toBe(false);
  });

  it('extracts staged failures and sets allFailuresAreStaged to true', () => {
    const analysis = parsePublishOutput(STAGED_ERROR_OUTPUT);
    expect(analysis.failedPackages).toEqual([
      {
        name: 'nexus-agents',
        version: '8.83.0',
        isStaged: true,
        code: 'E409',
        message:
          '409 Conflict - PUT https://registry.npmjs.org/nexus-agents - Cannot publish over previously staged version "8.83.0".',
      },
    ]);
    expect(analysis.allFailuresAreStaged).toBe(true);
  });

  it('sets allFailuresAreStaged to false on genuine failures', () => {
    const analysis = parsePublishOutput(GENUINE_ERROR_OUTPUT);
    expect(analysis.failedPackages).toEqual([
      {
        name: 'nexus-agents',
        version: '8.83.0',
        isStaged: false,
        code: 'E403',
        message:
          '403 Forbidden - PUT https://registry.npmjs.org/nexus-agents - You do not have permission to publish "nexus-agents".',
      },
    ]);
    expect(analysis.allFailuresAreStaged).toBe(false);
  });

  it('sets allFailuresAreStaged to false on mixed failures', () => {
    const analysis = parsePublishOutput(MULTI_PACKAGE_MIXED_OUTPUT);
    expect(analysis.failedPackages).toHaveLength(2);
    expect(analysis.allFailuresAreStaged).toBe(false);
  });

  it('sets allFailuresAreStaged to true when multiple packages are all staged', () => {
    const analysis = parsePublishOutput(MULTI_PACKAGE_ALL_STAGED_OUTPUT);
    expect(analysis.failedPackages).toHaveLength(2);
    expect(analysis.allFailuresAreStaged).toBe(true);
  });

  it('handles empty input gracefully (named empty case)', () => {
    const analysis = parsePublishOutput('');
    expect(analysis.successfulPackages).toEqual([]);
    expect(analysis.failedPackages).toEqual([]);
    expect(analysis.allFailuresAreStaged).toBe(false);
  });
});

describe('runPublish', () => {
  it('succeeds when runner exits 0', () => {
    const repoDir = initGitRepo();
    const result = runPublish({
      cwd: repoDir,
      runner: () => ({ status: 0, stdout: SUCCESS_OUTPUT, stderr: '' }),
    });
    expect(result.ok).toBe(true);
    expect(result.status).toBe(0);
    expect(result.treatedAsPublished).toBe(false);
  });

  it('recovers and treats as published when all failures are staged', () => {
    const repoDir = initGitRepo();
    const result = runPublish({
      cwd: repoDir,
      runner: () => ({ status: 1, stdout: '', stderr: STAGED_ERROR_OUTPUT }),
    });
    expect(result.ok).toBe(true);
    expect(result.status).toBe(0);
    expect(result.treatedAsPublished).toBe(true);
    // Verifies tag creation when tag was missing
    const tag = execFileSync('git', ['tag', '-l', 'nexus-agents@8.83.0'], {
      cwd: repoDir,
      encoding: 'utf-8',
    }).trim();
    expect(tag).toBe('nexus-agents@8.83.0');
  });

  it('preserves existing git tag without crashing when recovering staged publish', () => {
    const repoDir = initGitRepo();
    execFileSync('git', ['tag', 'nexus-agents@8.83.0'], { cwd: repoDir });
    const result = runPublish({
      cwd: repoDir,
      runner: () => ({ status: 1, stdout: '', stderr: STAGED_ERROR_OUTPUT }),
    });
    expect(result.ok).toBe(true);
    expect(result.status).toBe(0);
    expect(result.treatedAsPublished).toBe(true);
  });

  it('fails with original status when failure is not staged', () => {
    const repoDir = initGitRepo();
    const result = runPublish({
      cwd: repoDir,
      runner: () => ({ status: 1, stdout: '', stderr: GENUINE_ERROR_OUTPUT }),
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(1);
    expect(result.treatedAsPublished).toBe(false);
  });

  it('passes forward CLI arguments to the runner', () => {
    const repoDir = initGitRepo();
    let capturedArgs: readonly string[] | undefined;
    runPublish({
      args: ['--tag', 'next', '--output', 'result.json'],
      cwd: repoDir,
      runner: (args) => {
        capturedArgs = args;
        return { status: 0, stdout: SUCCESS_OUTPUT, stderr: '' };
      },
    });
    expect(capturedArgs).toEqual(['--tag', 'next', '--output', 'result.json']);
  });
});
