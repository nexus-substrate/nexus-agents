/** Security evidence covers the complete captured patch, preserving package execution. */
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  renameSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAgentStages } from './agent-executor.js';
import { runDevPipeline, type DevPipelineResult } from './dev-pipeline.js';
import { buildStructuredOutput } from '../mcp/tools/dev-pipeline-output.js';
import type { SecurityScanInput } from '../mcp/tools/security-scan-types.js';
import { mkdtempOutsideRepo } from '../testing/non-repo-temp-dir.js';
import { hermeticGitEnv } from '../utils/hermetic-git-env.js';

const mocks = vi.hoisted(() => ({
  expert: vi.fn(),
  scan: vi.fn(),
  prepare: vi.fn(),
  osv: vi.fn(),
}));
vi.mock('./expert-bridge.js', () => ({ executeExpert: mocks.expert }));
vi.mock('../mcp/tools/security-scan.js', () => ({
  executeSecurityScan: mocks.scan,
  prepareSecurityScan: mocks.prepare,
}));
vi.mock('../security/osv-lookup.js', () => ({ queryOsvBatch: mocks.osv }));
vi.mock('../security/quality-gate.js', () => ({
  runQualityGate: () => Promise.resolve({ verdict: 'pass', feedback: 'OK' }),
  checkTypeCheck: () => vi.fn(),
  checkLint: () => vi.fn(),
  checkTests: () => vi.fn(),
}));
vi.mock('./dev-pipeline-sandbox.js', async (original) => ({
  ...(await original<typeof import('./dev-pipeline-sandbox.js')>()),
  bwrapPreflight: () => Promise.resolve({ mode: 'best-effort', reason: 'fixture fallback' }),
}));
vi.mock('./agent-executor-memory.js', () => ({
  recordLearning: vi.fn(),
  recordMemoryError: vi.fn(),
  recordRoutingExperience: vi.fn(),
  flushPipelineMemory: vi.fn(),
}));
vi.mock('./agent-executor-core.js', async (original) => ({
  ...(await original<typeof import('./agent-executor-core.js')>()),
  recordOutcome: vi.fn(),
  postProgress: vi.fn(),
}));

describe('dev pipeline security and capture scope', () => {
  let temp: string;
  let repo: string;
  let workingDir: string;
  let changedFile: string;
  let content: string;
  let implementationDir: string;
  let manifestAction: ((root: string) => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    temp = mkdtempOutsideRepo('dev-gate-scope-');
    repo = join(temp, 'repo');
    workingDir = join(repo, 'packages/app');
    mkdirSync(workingDir, { recursive: true });
    writeFileSync(join(workingDir, 'package.json'), '{"name":"fixture-app"}\n');
    mkdirSync(join(repo, 'packages/sibling'));
    writeFileSync(join(repo, 'packages/sibling/package.json'), '{"name":"sibling"}\n');
    writeFileSync(join(repo, 'shared.ts'), 'export const shared = "clean";\n');
    writeFileSync(join(workingDir, 'inside.ts'), 'export const inside = "clean";\n');
    // Unchanged findings elsewhere in the repository remain baseline debt.
    writeFileSync(join(repo, 'debt.ts'), 'export const debt = "TEST_BLOCKING";\n');
    const git = (...args: string[]): void => {
      execFileSync('git', args, { cwd: repo, env: hermeticGitEnv(), stdio: 'pipe' });
    };
    git('init', '--quiet');
    git('add', '--all');
    git(
      '-c',
      'core.hooksPath=/dev/null',
      '-c',
      'commit.gpgsign=false',
      '-c',
      'user.name=Scope Fixture',
      '-c',
      'user.email=scope@example.test',
      'commit',
      '-m',
      'fixture'
    );
    const scratchRoot = join(temp, 'scratch');
    mkdirSync(scratchRoot);
    vi.stubEnv('NEXUS_TMPDIR', scratchRoot);
    manifestAction = undefined;
    changedFile = 'shared.ts';
    content = 'export const shared = "TEST_BLOCKING";\n';
    mocks.expert.mockImplementation((role: string, _prompt: string, opts: { workDir: string }) => {
      expect(opts.workDir.startsWith(join(scratchRoot, 'vote-'))).toBe(true);
      expect(opts.workDir).toMatch(/\/packages\/app$/);
      if (role === 'code') {
        implementationDir = opts.workDir;
        mkdirSync(join(opts.workDir, '../..', changedFile, '..'), { recursive: true });
        writeFileSync(join(opts.workDir, '../..', changedFile), content);
        manifestAction?.(join(opts.workDir, '../..'));
      } else {
        expect(opts.workDir).toBe(implementationDir);
      }
      return Promise.resolve({ success: true, text: role === 'qa' ? 'PASS\nOK' : 'Implemented' });
    });
    mocks.prepare.mockResolvedValue({
      binary: '/fixture/semgrep',
      version: '1.0.0',
      rulesets: ['/fixture/rules.json'],
      flags: ['--strict'],
    });
    mocks.scan.mockImplementation((input: SecurityScanInput) => {
      const findings = ['shared.ts', 'debt.ts', 'packages/app/inside.ts', 'inside.ts']
        .map((path) => join(input.target, path))
        .filter((file) => existsSync(file) && readFileSync(file, 'utf8').includes('TEST_BLOCKING'))
        .map((file) => ({
          id: 'fixture',
          scanner: 'semgrep',
          rule: 'fixture',
          severity: 'high',
          file,
          startLine: 1,
          snippet: readFileSync(file, 'utf8').trim(),
          message: 'Blocking fixture finding',
          cweIds: [],
          confidence: 1,
        }));
      return {
        scanner: 'semgrep',
        totalFindings: findings.length,
        coverageComplete: true,
        errors: [],
        findings,
      };
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(temp, { recursive: true, force: true });
  });

  async function run(): Promise<DevPipelineResult> {
    const stages = {
      ...createAgentStages({ scanTarget: workingDir }),
      plan: vi.fn().mockResolvedValue('Update fixture'),
      vote: vi.fn().mockResolvedValue({ kind: 'approved', approvalPercentage: 100 }),
      decompose: vi.fn().mockResolvedValue([
        {
          id: 'one',
          title: 'Update fixture',
          description: 'Update fixture',
          assignedTo: 'coder',
          status: 'pending',
        },
      ]),
    };
    return runDevPipeline('Update fixture', stages, {
      researchOverride: 'Operator plan',
      qualityGate: 'blocking',
    });
  }

  it('blocks a captured change with a blocking finding outside workingDir', async () => {
    const result = await run();
    expect(result.changes).toMatchObject({
      status: 'changes',
      empty: false,
      worktreeRemoved: true,
    });
    expect(result.changes?.diff).toContain('diff --git a/shared.ts b/shared.ts');
    expect(result.changes?.diff).toContain('+export const shared = "TEST_BLOCKING";');
    expect(result).toMatchObject({ completed: false, securityPassed: false, securityRan: true });
    expect(result.securityComparison).toMatchObject({
      complete: true,
      baseCount: 1,
      worktreeCount: 2,
      introducedBlockingCount: 1,
    });
    expect(buildStructuredOutput(result, false)['security']).toMatchObject({ status: 'failed' });
    expect(mocks.scan.mock.calls[0]?.[0]).toMatchObject({
      target: expect.stringMatching(/\/base\/?$/),
    });
    expect(mocks.scan.mock.calls[1]?.[0]).toMatchObject({ target: result.changes?.worktreePath });
  });

  it('passes an inside-only clean change with no introduced blocking findings', async () => {
    changedFile = 'packages/app/inside.ts';
    content = 'export const inside = "updated";\n';
    const result = await run();
    expect(result).toMatchObject({ completed: true, securityPassed: true, securityRan: true });
    expect(result.changes).toMatchObject({
      status: 'changes',
      empty: false,
      worktreeRemoved: true,
    });
    expect(result.changes?.diff).toContain('diff --git a/packages/app/inside.ts');
    expect(result.changes?.diff).not.toContain('diff --git a/shared.ts');
    expect(result.securityComparison).toMatchObject({
      complete: true,
      introducedBlockingCount: 0,
      blockingFindings: [],
    });
    expect(buildStructuredOutput(result, false)['security']).toMatchObject({ status: 'passed' });
  });

  it('still blocks an inside-only change with an introduced blocking finding', async () => {
    changedFile = 'packages/app/inside.ts';
    content = 'export const inside = "TEST_BLOCKING";\n';
    const result = await run();
    expect(result).toMatchObject({ completed: false, securityPassed: false, securityRan: true });
    expect(result.changes?.diff).toContain('diff --git a/packages/app/inside.ts');
    expect(result.securityComparison).toMatchObject({ complete: true, introducedBlockingCount: 1 });
  });

  it.each(['package.json', 'packages/sibling/package.json'])(
    'checks the captured dependency change in %s',
    async (manifest) => {
      changedFile = manifest;
      content = '{"dependencies":{"fixture-dependency":"1.0.0"}}\n';
      mocks.osv.mockResolvedValue([
        { error: null, vulnerabilities: [{ id: 'TEST-OSV', severity: 'CRITICAL' }] },
      ]);
      const result = await run();
      expect(result.changes?.diff).toContain(`diff --git a/${manifest} b/${manifest}`);
      expect(result).toMatchObject({ completed: false, securityPassed: false, securityRan: true });
      expect(mocks.osv).toHaveBeenCalledWith(
        [{ name: 'fixture-dependency', version: '1.0.0' }],
        undefined,
        expect.any(AbortSignal)
      );
      expect(buildStructuredOutput(result, false)['security']).toMatchObject({ status: 'failed' });
    }
  );

  /** Commit a workingDir manifest so the baseline and worktree share it. */
  function commitWorkingDirManifest(manifest: string): void {
    const git = (...args: string[]): void => {
      execFileSync('git', args, { cwd: repo, env: hermeticGitEnv(), stdio: 'pipe' });
    };
    writeFileSync(join(workingDir, 'package.json'), manifest);
    git('add', '--all');
    git(
      '-c',
      'core.hooksPath=/dev/null',
      '-c',
      'commit.gpgsign=false',
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.test',
      'commit',
      '-m',
      'dependency fixture'
    );
  }

  /** OSV fixture: `flagged` dependencies carry a critical advisory, others are clean. */
  function osvFlagging(...flagged: string[]): void {
    mocks.osv.mockImplementation((deps: { name: string }[]) =>
      Promise.resolve(
        deps.map((dep) => ({
          error: null,
          vulnerabilities: flagged.includes(dep.name)
            ? [{ id: 'TEST-OSV', severity: 'CRITICAL' }]
            : [],
        }))
      )
    );
  }

  it('preserves the workingDir dependency check when no manifest changes', async () => {
    changedFile = 'packages/app/inside.ts';
    content = 'export const inside = "updated";\n';
    mocks.osv.mockResolvedValue([]);
    // The baseline and worktree contain the same manifest; only source changes.
    commitWorkingDirManifest('{"dependencies":{"safe-pkg":"1.0.0"}}\n');
    const result = await run();
    expect(result).toMatchObject({ completed: true, securityPassed: true });
    expect(result.changes?.diff).not.toContain('package.json');
    expect(mocks.osv).toHaveBeenCalledWith(
      [{ name: 'safe-pkg', version: '1.0.0' }],
      undefined,
      expect.any(AbortSignal)
    );
  });

  it('fails closed and records an unparseable changed manifest', async () => {
    changedFile = 'package.json';
    content = '{invalid json\n';
    const result = await run();
    expect(result).toMatchObject({ completed: false, securityPassed: false });
    expect(result.securityNote).toContain('package.json');
    expect(result.securityNote).toContain('manifest');
    expect(buildStructuredOutput(result, false)['securityNote']).toContain('package.json');
  });

  it.each(['package.json', 'packages/sibling/package.json'])(
    'fails closed and records an unreadable changed manifest at %s',
    async (manifest) => {
      changedFile = manifest;
      content = '{}\n';
      manifestAction = (root) => {
        rmSync(join(root, changedFile));
        symlinkSync('missing-manifest.json', join(root, changedFile));
      };
      const result = await run();
      expect(result).toMatchObject({ completed: false, securityPassed: false });
      expect(result.securityNote).toContain(manifest);
      expect(buildStructuredOutput(result, false)['securityNote']).toContain(manifest);
    }
  );

  it('checks every changed manifest, including a renamed destination', async () => {
    changedFile = 'package.json';
    content = '{"dependencies":{"safe-pkg":"1.0.0"}}\n';
    manifestAction = (root) => {
      mkdirSync(join(root, 'packages/renamed'));
      renameSync(
        join(root, 'packages/sibling/package.json'),
        join(root, 'packages/renamed/package.json')
      );
      writeFileSync(
        join(root, 'packages/renamed/package.json'),
        '{"dependencies":{"fixture-dependency":"1.0.0"}}\n'
      );
    };
    mocks.osv.mockImplementation((deps: { name: string }[]) =>
      Promise.resolve(
        deps.map((dep) => ({
          error: null,
          vulnerabilities:
            dep.name === 'fixture-dependency' ? [{ id: 'TEST-OSV', severity: 'CRITICAL' }] : [],
        }))
      )
    );
    const result = await run();
    expect(result).toMatchObject({ completed: false, securityPassed: false });
    expect(mocks.osv).toHaveBeenCalledTimes(2);
    expect(result.changes?.diff).toContain('packages/renamed/package.json');
  });

  it('ignores installed manifests outside the capture scope', async () => {
    changedFile = 'packages/app/inside.ts';
    content = 'export const inside = "updated";\n';
    manifestAction = (root) => {
      mkdirSync(join(root, 'node_modules/fixture'), { recursive: true });
      writeFileSync(join(root, 'node_modules/fixture/package.json'), '{invalid json\n');
    };
    const result = await run();
    expect(result).toMatchObject({ completed: true, securityPassed: true });
    expect(result.changes?.diff).not.toContain('node_modules');
    expect(mocks.osv).not.toHaveBeenCalled();
  });

  it('preserves dependency blocking for the selected package on an inside-only change', async () => {
    changedFile = 'packages/app/package.json';
    content = '{"name":"fixture-app","dependencies":{"fixture-dependency":"1.0.0"}}\n';
    mocks.osv.mockResolvedValue([
      {
        error: null,
        vulnerabilities: [{ id: 'TEST-OSV', severity: 'CRITICAL' }],
      },
    ]);
    const result = await run();
    expect(result.changes?.diff).toContain('diff --git a/packages/app/package.json');
    expect(result).toMatchObject({ completed: false, securityPassed: false, securityRan: true });
    expect(mocks.osv).toHaveBeenCalledWith(
      [{ name: 'fixture-dependency', version: '1.0.0' }],
      undefined,
      expect.any(AbortSignal)
    );
    expect(result.securityComparison).toMatchObject({ complete: true, introducedBlockingCount: 0 });
    expect(mocks.scan.mock.calls[1]?.[0]).toMatchObject({ target: result.changes?.worktreePath });
  });
  it.each([
    ['the lookup throws', () => mocks.osv.mockRejectedValue(new Error('lookup unavailable'))],
    [
      'every lookup errors',
      () => mocks.osv.mockResolvedValue([{ error: 'timeout', vulnerabilities: [] }]),
    ],
  ])('blocks a changed manifest whose dependency lookup fails when %s', async (_case, arrange) => {
    changedFile = 'packages/sibling/package.json';
    content = '{"dependencies":{"fixture-dependency":"1.0.0"}}\n';
    arrange();
    const result = await run();
    expect(result).toMatchObject({ completed: false, securityPassed: false, securityRan: true });
    const output = buildStructuredOutput(result, false);
    expect(output['security']).toMatchObject({ status: 'failed' });
    expect(output['securityNote']).toContain('packages/sibling/package.json');
    expect(output['securityNote']).toMatch(/lookup failed/i);
  });

  it('keeps pass-with-disclosure when the lookup fails for an unchanged workingDir manifest', async () => {
    changedFile = 'packages/app/inside.ts';
    content = 'export const inside = "updated";\n';
    commitWorkingDirManifest('{"dependencies":{"safe-pkg":"1.0.0"}}\n');
    mocks.osv.mockRejectedValue(new Error('lookup unavailable'));
    const result = await run();
    expect(result).toMatchObject({ completed: true, securityPassed: true });
    expect(mocks.osv).toHaveBeenCalledTimes(1);
  });

  it('reports partial dependency coverage on a passing run', async () => {
    changedFile = 'packages/sibling/package.json';
    const dependencies = Object.fromEntries(
      Array.from({ length: 21 }, (_, i) => [`fixture-dependency-${String(i)}`, '1.0.0'])
    );
    content = `${JSON.stringify({ dependencies })}\n`;
    osvFlagging();
    const result = await run();
    expect(result).toMatchObject({ completed: true, securityPassed: true });
    const output = buildStructuredOutput(result, false);
    expect(output['security']).toMatchObject({ status: 'passed' });
    expect(output['securityNote']).toContain('20 of 21');
  });

  it('records no coverage note when every declared dependency was checked', async () => {
    changedFile = 'packages/sibling/package.json';
    content = '{"dependencies":{"fixture-dependency":"1.0.0"}}\n';
    osvFlagging();
    const result = await run();
    expect(result).toMatchObject({ completed: true, securityPassed: true });
    expect(mocks.osv).toHaveBeenCalledTimes(1);
    expect(buildStructuredOutput(result, false)['securityNote']).toBeUndefined();
  });

  it('checks the unchanged workingDir manifest alongside an unrelated changed manifest', async () => {
    commitWorkingDirManifest('{"dependencies":{"existing-dependency":"1.0.0"}}\n');
    changedFile = 'packages/sibling/package.json';
    content = '{"dependencies":{"fixture-dependency":"1.0.0"}}\n';
    osvFlagging('existing-dependency');
    const result = await run();
    expect(result).toMatchObject({ completed: false, securityPassed: false });
    const queried = mocks.osv.mock.calls.flatMap((call) =>
      (call[0] as { name: string }[]).map((dep) => dep.name)
    );
    expect(queried.sort()).toEqual(['existing-dependency', 'fixture-dependency']);
  });

  it('checks a changed workingDir manifest once', async () => {
    changedFile = 'packages/app/package.json';
    content = '{"dependencies":{"fixture-dependency":"1.0.0"}}\n';
    osvFlagging();
    const result = await run();
    expect(result).toMatchObject({ completed: true, securityPassed: true });
    expect(mocks.osv).toHaveBeenCalledTimes(1);
  });
});
