/** Real Git isolation and artifact handoff for #6794; model/process boundaries are stubbed. */
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAgentStages } from './agent-executor.js';
import { runDevPipeline, type DevPipelineStages } from './dev-pipeline.js';
import { buildStructuredOutput } from '../mcp/tools/dev-pipeline-output.js';
import { mkdtempOutsideRepo } from '../testing/non-repo-temp-dir.js';

const mocks = vi.hoisted(() => ({ expert: vi.fn(), gate: vi.fn(), check: vi.fn(), scan: vi.fn() }));
vi.mock('./expert-bridge.js', () => ({ executeExpert: mocks.expert }));
vi.mock('../security/quality-gate.js', () => ({
  runQualityGate: mocks.gate,
  checkTypeCheck: mocks.check,
  checkLint: mocks.check,
  checkTests: mocks.check,
}));
vi.mock('./security-gate.js', () => ({ checkSecurityScan: mocks.scan }));
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
vi.mock('../context/context-retriever.js', () => ({
  getResearchInsightsForTask: () => Promise.resolve([]),
}));

let repo: string;
const git = (...args: string[]): string =>
  execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
const options = { researchOverride: 'Operator plan', qualityGate: 'blocking' } as const;

function stages(directory = repo): DevPipelineStages {
  return {
    ...createAgentStages({ scanTarget: directory }),
    plan: vi.fn().mockResolvedValue('Add a file'),
    vote: vi.fn().mockResolvedValue({ kind: 'approved', approvalPercentage: 100 }),
    decompose: vi.fn().mockResolvedValue([
      {
        id: 'one',
        title: 'Add file',
        description: 'Add file',
        assignedTo: 'coder',
        status: 'pending',
      },
    ]),
  };
}

describe('dev pipeline scratch worktree', () => {
  let tmp: string;
  let scratchRoot: string;
  let workspace: string | undefined;
  let writeChanges: boolean;
  beforeEach(() => {
    vi.clearAllMocks();
    // The vitest TMPDIR is in-repo on a short checkout path (CI); the scratch
    // must not be, or the isolation check rightly refuses the gate.
    tmp = mkdtempOutsideRepo('dev-scratch-test-');
    const fixtureRoot = join(tmp, 'repo');
    repo = join(fixtureRoot, 'packages/nexus-agents');
    mkdirSync(repo, { recursive: true });
    writeFileSync(join(fixtureRoot, 'package.json'), '{"name":"fixture","private":true}\n');
    writeFileSync(join(repo, 'package.json'), '{"name":"fixture-package","private":true}\n');
    writeFileSync(join(fixtureRoot, 'tracked.txt'), 'HEAD content\n');
    execFileSync('git', ['init', '--quiet'], { cwd: fixtureRoot, stdio: 'pipe' });
    git('config', 'user.name', 'Scratch Fixture');
    git('config', 'user.email', 'scratch@example.test');
    git('add', '--all');
    git('-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture');
    scratchRoot = join(tmp, 'scratch');
    mkdirSync(scratchRoot);
    vi.stubEnv('NEXUS_TMPDIR', scratchRoot);
    workspace = undefined;
    writeChanges = true;
    mocks.expert.mockImplementation(
      (role: string, _prompt: string, opts?: { workDir?: string }) => {
        // Refuse to write unless the explicit cwd is isolated: even the red run is safe.
        expect(opts?.workDir).toBeDefined();
        expect(opts?.workDir).not.toBe(repo);
        const cwd = opts?.workDir ?? '';
        expect(cwd.startsWith(join(scratchRoot, 'vote-'))).toBe(true);
        if (role === 'code') {
          workspace = cwd;
          if (writeChanges) {
            writeFileSync(join(cwd, 'scratch-6794.txt'), 'isolated change\n');
            writeFileSync(
              join(cwd, 'package.json'),
              readFileSync(join(cwd, 'package.json'), 'utf8') + '\n'
            );
          }
        } else {
          expect(cwd).toBe(workspace);
          if (writeChanges)
            expect(readFileSync(join(cwd, 'scratch-6794.txt'), 'utf8')).toContain('isolated');
        }
        return Promise.resolve({
          success: true,
          expertType: role,
          durationMs: 1,
          text: role === 'qa' ? 'PASS\nOK' : 'Implemented',
        });
      }
    );
    mocks.check.mockImplementation((cwd: string) => {
      expect(cwd).toBe(workspace);
      return vi.fn();
    });
    mocks.gate.mockResolvedValue({ verdict: 'pass', feedback: 'OK' });
    mocks.scan.mockImplementation((cwd: string) => {
      expect(cwd).toBe(workspace);
      return () => Promise.resolve({ verdict: 'pass', details: 'OK' });
    });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(tmp, { recursive: true, force: true });
  });

  it('hands back new and tracked file diffs at HEAD, runs QA/gates there, and leaves repo untouched', async () => {
    const before = {
      head: git('rev-parse', 'HEAD').trim(),
      diff: git('diff', 'HEAD'),
      status: git('status', '--porcelain'),
    };
    const result = await runDevPipeline('Add file', stages(), options);
    expect(result.completed).toBe(true);
    const output = buildStructuredOutput(result, false);
    expect(output['changes']).toMatchObject({
      baseSha: before.head,
      worktreeRemoved: true,
      empty: false,
      status: 'changes',
    });
    expect(output['changes']).toHaveProperty('diff', expect.stringContaining('+isolated change'));
    expect(output['changes']).toHaveProperty(
      'diff',
      expect.stringContaining('diff --git a/packages/nexus-agents/package.json')
    );
    expect(mocks.check).toHaveBeenCalledTimes(3);
    expect(mocks.scan).toHaveBeenCalledWith(workspace);
    expect(
      join(
        result.changes?.worktreePath ?? '',
        relative(git('rev-parse', '--show-toplevel').trim(), repo)
      )
    ).toBe(workspace);
    expect(existsSync(result.changes?.worktreePath ?? '')).toBe(false);
    expect(git('worktree', 'list', '--porcelain')).not.toContain(result.changes?.worktreePath);
    expect({
      head: git('rev-parse', 'HEAD').trim(),
      diff: git('diff', 'HEAD'),
      status: git('status', '--porcelain'),
    }).toEqual(before);
  });

  it('names no_changes and does not report completion when implement writes nothing', async () => {
    writeChanges = false;
    const result = await runDevPipeline('Add file', stages(), options);
    expect(result.completed).toBe(false);
    expect(buildStructuredOutput(result, false)['changes']).toMatchObject({
      diff: '',
      empty: true,
      status: 'no_changes',
      worktreeRemoved: true,
    });
    expect(existsSync(workspace ?? '')).toBe(false);
  });

  it('removes the scratch after a thrown quality gate', async () => {
    mocks.gate.mockRejectedValue(new Error('gate crashed'));
    await expect(runDevPipeline('Add file', stages(), options)).rejects.toThrow('gate crashed');
    expect(workspace).toBeDefined();
    expect(existsSync(workspace ?? '')).toBe(false);
    expect(git('worktree', 'list', '--porcelain')).not.toContain(workspace);
  });

  it('removes the scratch on a failed gate while handing back the diff', async () => {
    mocks.gate.mockResolvedValue({ verdict: 'fail', feedback: 'Broken' });
    const result = await runDevPipeline('Add file', stages(), options);
    expect(result.completed).toBe(false);
    expect(buildStructuredOutput(result, false)['changes']).toHaveProperty(
      'diff',
      expect.stringContaining('+isolated change')
    );
    expect(existsSync(workspace ?? '')).toBe(false);
  });

  it('removes the scratch when a stage times out', async () => {
    mocks.gate.mockImplementation(() => new Promise(() => {}));
    await expect(
      runDevPipeline('Add file', stages(), { ...options, stageTimeoutMs: 1000 })
    ).rejects.toThrow('qualityGate stage timed out');
    expect(workspace).toBeDefined();
    expect(existsSync(workspace ?? '')).toBe(false);
  });

  it('does not allocate a scratch in a dry run', async () => {
    const before = git('worktree', 'list', '--porcelain');
    const result = await runDevPipeline('Add file', stages(), { ...options, dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(buildStructuredOutput(result, false)['changes']).toBeUndefined();
    expect(mocks.expert).not.toHaveBeenCalled();
    expect(git('worktree', 'list', '--porcelain')).toBe(before);
  });

  it('allocates the scratch outside the repository when NEXUS_TMPDIR is inside it', async () => {
    // Production default: NEXUS_TMPDIR resolves to <repo>/.nexus-agents/tmp, the server's cwd.
    const ignored = join(repo, '.nexus-agents');
    mkdirSync(ignored, { recursive: true });
    const inRepo = mkdtempSync(join(ignored, 'scratch-root-test-'));
    try {
      vi.stubEnv('NEXUS_TMPDIR', inRepo);
      vi.stubEnv('TMPDIR', tmp);
      scratchRoot = tmp;
      const result = await runDevPipeline('Add file', stages(), options);
      expect(result.warnings ?? []).not.toContainEqual(
        expect.stringContaining('Quality gate refused')
      );
      expect(result.completed).toBe(true);
      expect(result.changes?.worktreePath.startsWith(join(tmp, 'vote-'))).toBe(true);
      expect(mocks.gate).toHaveBeenCalledTimes(1);
    } finally {
      rmSync(inRepo, { recursive: true, force: true });
    }
  });

  it('keeps a symlinked repository path inside the scratch checkout', async () => {
    const alias = join(tmp, 'repo-link');
    symlinkSync(repo, alias, 'dir');
    const result = await runDevPipeline('Add file', stages(alias), options);
    expect(result.completed).toBe(true);
    expect(result.changes?.diff).toContain('+isolated change');
    expect(existsSync(result.changes?.worktreePath ?? '')).toBe(false);
  });
});
