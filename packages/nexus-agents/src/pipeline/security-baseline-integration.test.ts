import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempOutsideRepo } from '../testing/non-repo-temp-dir.js';
import { checkSecurityScan } from './security-gate.js';
import type { SecurityScanInput } from '../mcp/tools/security-scan-types.js';

const mocks = vi.hoisted(() => ({ scan: vi.fn(), prepare: vi.fn() }));
vi.mock('../mcp/tools/security-scan.js', () => ({
  executeSecurityScan: mocks.scan,
  prepareSecurityScan: mocks.prepare,
}));

describe('security baseline with real git archives (#7238)', () => {
  const repository = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
  }).trim();
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repository,
    encoding: 'utf8',
  }).trim();
  const target = join(repository, 'packages/nexus-agents');
  let scratch: string;

  beforeEach(() => {
    scratch = mkdtempOutsideRepo('baseline-scratch-');
    vi.stubEnv('NEXUS_TMPDIR', scratch);
    vi.clearAllMocks();
    mocks.prepare.mockResolvedValue({
      binary: '/pinned/semgrep',
      version: '1.0.0',
      rulesets: ['/pinned/rules.json'],
      flags: ['--strict'],
    });
    mocks.scan.mockImplementation((input: SecurityScanInput) => {
      // The base archive must actually contain the same subtree as the worktree.
      expect(existsSync(join(input.target, 'package.json'))).toBe(true);
      return {
        scanner: 'semgrep',
        totalFindings: 1,
        coverageComplete: true,
        errors: [],
        findings: [
          {
            id: 'fixture',
            scanner: 'semgrep',
            rule: 'fixture',
            severity: 'high',
            file: join(input.target, 'package.json'),
            startLine: 1,
            snippet: '{',
            message: 'fixture debt',
            cweIds: [],
            confidence: 1,
          },
        ],
      };
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(scratch, { recursive: true, force: true });
  });

  it('keeps host baseline scratch under NEXUS_TMPDIR and removes it after scanning (#7302)', async () => {
    const result = await checkSecurityScan(target, ['p/default'], {
      enableOsv: false,
      root: target,
      baseline: { sha, directory: repository },
    })();
    expect(result.verdict).toBe('pass');
    expect(mocks.scan).toHaveBeenCalledTimes(2);
    const baseTarget = mocks.scan.mock.calls[0]?.[0] as SecurityScanInput;
    expect(relative(scratch, baseTarget.target).split(sep)[0]).toMatch(/^security-baseline-/);
    expect(existsSync(baseTarget.target)).toBe(false);
    const preparedDirectory = mocks.prepare.mock.calls[0]?.[1]?.directory as string;
    expect(relative(scratch, preparedDirectory).split(sep)[0]).toMatch(/^security-baseline-/);
    expect(existsSync(preparedDirectory)).toBe(false);
  });

  it('passes unchanged debt when the pipeline working directory is a package subtree', async () => {
    const result = await checkSecurityScan(target, ['p/default'], {
      enableOsv: false,
      root: target,
      baseline: { sha, directory: repository },
    })();
    expect(result.verdict).toBe('pass');
    expect(result.comparison).toMatchObject({
      baseSha: sha,
      baseCount: 1,
      worktreeCount: 1,
      complete: true,
      introducedBlockingCount: 0,
      blockingFindings: [],
      errors: [],
    });
    const baseTarget = mocks.scan.mock.calls[0]?.[0] as SecurityScanInput;
    expect(baseTarget.target).toMatch(/\/base\/packages\/nexus-agents\/?$/);
    expect(mocks.scan.mock.calls[1]?.[0]).toMatchObject({ target });
    expect(mocks.prepare).toHaveBeenCalledTimes(1);
    expect(mocks.scan.mock.calls[0]?.[1]?.preparedScan).toBe(
      mocks.scan.mock.calls[1]?.[1]?.preparedScan
    );
  });

  it('fails closed before scanning when the pinned commit cannot be resolved', async () => {
    const result = await checkSecurityScan(target, ['p/default'], {
      enableOsv: false,
      root: target,
      baseline: { sha: 'nexus-security-fixture-missing-ref', directory: repository },
    })();
    expect(result.verdict).toBe('skip');
    expect(result.comparison).toMatchObject({
      complete: false,
      baseCount: null,
      worktreeCount: null,
      introducedBlockingCount: null,
    });
    expect(mocks.scan).not.toHaveBeenCalled();
  });
});
