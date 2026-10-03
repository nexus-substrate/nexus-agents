/** Dependency provisioning, cleanup failures and HEAD provenance use real temporary repositories. */
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
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withDevPipelineWorkspace } from './dev-pipeline-workspace.js';
import type { DevPipelineResult, DevPipelineStages } from './dev-pipeline.js';
import { buildStructuredOutput } from '../mcp/tools/dev-pipeline-output.js';
import { stepBus } from '../core/step-bus.js';
import type { StepEvent } from '../core/step-events.js';
import { WORKFLOW_TIMEOUTS } from '../config/timeouts.js';
import { createAgentStages } from './agent-executor.js';
import { runDevPipeline } from './dev-pipeline.js';

const mocks = vi.hoisted(() => ({
  disposeFailure: false,
  pruneFailure: false,
  warn: vi.fn(),
  stageEvent: vi.fn(),
  paths: [] as string[],
}));
vi.mock('../cli/vote-scratch-checkout.js', async (original) => {
  const actual = await original<typeof import('../cli/vote-scratch-checkout.js')>();
  return {
    ...actual,
    createScratchCheckout: (options: Parameters<typeof actual.createScratchCheckout>[0]) => {
      const scratch = actual.createScratchCheckout(options);
      mocks.paths.push(scratch.path);
      return {
        ...scratch,
        dispose: () => {
          if (mocks.disposeFailure) throw new actual.ScratchCheckoutError('dispose failed');
          scratch.dispose();
          if (mocks.pruneFailure) throw new actual.ScratchCheckoutError('prune failed');
        },
      };
    },
  };
});
vi.mock('./agent-executor-core.js', async (original) => {
  const actual = await original<typeof import('./agent-executor-core.js')>();
  return {
    ...actual,
    emitStageEvent: (...args: Parameters<typeof actual.emitStageEvent>) => {
      mocks.stageEvent(...args);
      actual.emitStageEvent(...args);
    },
  };
});
vi.mock('../core/index.js', async (original) => {
  const actual = await original<typeof import('../core/index.js')>();
  return { ...actual, createLogger: () => ({ ...actual.createLogger(), warn: mocks.warn }) };
});

const result: DevPipelineResult = {
  completed: true,
  plan: 'Operator plan',
  tasks: [],
  voteIterations: 1,
  qaIterations: 1,
  securityPassed: true,
  warnings: ['existing warning'],
};

function boundStages(
  directory: string,
  dependencies?: NonNullable<DevPipelineResult['changes']>['dependencies']
): DevPipelineStages {
  return {
    ...createAgentStages().withWorkspace?.(directory, dependencies),
    implementWorkspace: { directory, accessMode: 'workspace-edit' },
    withWorkspace: boundStages,
    research: vi.fn(),
    plan: vi.fn(),
    vote: vi.fn(),
    decompose: vi.fn(),
    implement: vi.fn(),
    qaReview: vi.fn(),
    securityScan: vi.fn(),
  };
}

describe('dev pipeline workspace follow-up', () => {
  let tmp: string;
  let repo: string;
  let events: StepEvent[];
  const captureStep = (event: StepEvent): void => {
    events.push(event);
  };
  const git = (...args: string[]): string =>
    execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: 'pipe' });
  const file = (path: string, content: string): void => {
    mkdirSync(join(repo, path, '..'), { recursive: true });
    writeFileSync(join(repo, path), content);
  };
  const commit = (): void => {
    git('add', '--all');
    git('-c', 'core.hooksPath=/dev/null', 'commit', '-m', 'fixture');
  };
  const edit = (bound: DevPipelineStages): Promise<DevPipelineResult> => {
    writeFileSync(join(bound.implementWorkspace?.directory ?? '', 'new.txt'), 'new change\n');
    return Promise.resolve(result);
  };
  beforeEach(() => {
    events = [];
    stepBus.on('step', captureStep);
    mocks.disposeFailure = false;
    mocks.pruneFailure = false;
    mocks.warn.mockClear();
    mocks.stageEvent.mockClear();
    mocks.paths = [];
    tmp = mkdtempSync(join(tmpdir(), 'dev-workspace-test-'));
    repo = join(tmp, 'repo');
    mkdirSync(repo);
    vi.stubEnv('NEXUS_TMPDIR', tmp);
    git('init', '--quiet');
    git('config', 'user.email', 'fixture@example.test');
    git('config', 'user.name', 'Fixture');
    file('package.json', '{"name":"fixture","private":true}\n');
    file('tracked.txt', 'HEAD content\n');
    commit();
  });
  afterEach(() => {
    stepBus.off('step', captureStep);
    for (const path of mocks.paths) {
      if (existsSync(path)) git('worktree', 'remove', '--force', path);
    }
    vi.unstubAllEnvs();
    rmSync(tmp, { recursive: true, force: true });
  });

  // The installer seam builds an npm workspace layout inside the real scratch.
  // Node resolution and dependency writes are real, without requiring a warm package cache.
  const install = vi.fn(
    (
      _command: string,
      _args: string[],
      opts: {
        cwd: string;
        timeout: number;
        env: NodeJS.ProcessEnv;
      }
    ) => {
      mkdirSync(join(opts.cwd, 'node_modules/fixture-dep'), { recursive: true });
      writeFileSync(join(opts.cwd, 'node_modules/fixture-dep/index.js'), 'module.exports = 42;\n');
      return Promise.resolve();
    }
  );

  it('keeps source dependencies byte-identical when a stage writes scratch dependencies', async () => {
    file('package-lock.json', '{}\n');
    commit();
    file('node_modules/fixture-dep/index.js', 'module.exports = 42;\n');
    const before = readFileSync(join(repo, 'node_modules/fixture-dep/index.js'));
    const sourceStatus = git('status', '--porcelain');
    const output = await withDevPipelineWorkspace(
      boundStages(repo),
      (bound) => {
        const cwd = bound.implementWorkspace?.directory ?? '';
        writeFileSync(join(cwd, 'node_modules/fixture-dep/index.js'), 'scratch mutation\n');
        execFileSync('git', ['add', '--intent-to-add', '--all', '--', 'node_modules'], { cwd });
        return edit(bound);
      },
      install
    );
    expect(readFileSync(join(repo, 'node_modules/fixture-dep/index.js'))).toEqual(before);
    expect(git('status', '--porcelain')).toBe(sourceStatus);
    expect(output.changes?.dependencies).toEqual({ status: 'installed', manager: 'npm' });
    expect(output.changes?.diff).toContain('+new change');
    expect(output.changes?.diff).not.toContain('node_modules');
    expect(existsSync(output.changes?.worktreePath ?? '')).toBe(false);
  });

  it('resolves the edited scratch workspace package in a real gate process', async () => {
    file(
      'package.json',
      JSON.stringify({ name: 'fixture', private: true, workspaces: ['packages/*'] })
    );
    file('package-lock.json', '{}\n');
    file('packages/local/package.json', '{"name":"fixture-local","main":"index.js"}');
    file('packages/local/index.js', 'module.exports = "HEAD";\n');
    commit();
    mkdirSync(join(repo, 'node_modules'), { recursive: true });
    symlinkSync('../packages/local', join(repo, 'node_modules/fixture-local'));
    const workspaceInstall = async (
      command: string,
      args: string[],
      opts: Parameters<typeof install>[2]
    ): Promise<void> => {
      await install(command, args, opts);
      symlinkSync('../packages/local', join(opts.cwd, 'node_modules/fixture-local'));
    };
    const output = await withDevPipelineWorkspace(
      boundStages(repo),
      (bound) => {
        const cwd = bound.implementWorkspace?.directory ?? '';
        writeFileSync(join(cwd, 'packages/local/index.js'), 'module.exports = "SCRATCH";\n');
        expect(
          execFileSync(process.execPath, ['-e', 'process.stdout.write(require("fixture-local"))'], {
            cwd,
            encoding: 'utf8',
          })
        ).toBe('SCRATCH');
        return Promise.resolve(result);
      },
      workspaceInstall
    );
    expect(readFileSync(join(repo, 'packages/local/index.js'), 'utf8')).toContain('HEAD');
    expect(output.changes?.dependencies).toEqual({ status: 'installed', manager: 'npm' });
  });

  it.each([
    ['pnpm-lock.yaml', 'pnpm', ['install', '--frozen-lockfile', '--prefer-offline']],
    ['package-lock.json', 'npm', ['ci', '--prefer-offline']],
    ['yarn.lock', 'yarn', ['install', '--frozen-lockfile', '--prefer-offline']],
  ])(
    'provisions the HEAD %s before implementation from the scratch root',
    async (lockfile, manager, args) => {
      file(lockfile, 'HEAD lockfile\n');
      file('packages/app/package.json', '{"name":"app"}');
      commit();
      file(lockfile, 'uncommitted lockfile\n');
      const installer = vi.fn(
        async (_command: string, _args: string[], opts: Parameters<typeof install>[2]) => {
          expect(readFileSync(join(opts.cwd, lockfile), 'utf8')).toBe('HEAD lockfile\n');
          expect(opts.cwd).not.toBe(repo);
          return Promise.resolve();
        }
      );
      const output = await withDevPipelineWorkspace(
        boundStages(join(repo, 'packages/app')),
        (bound) => {
          expect(installer).toHaveBeenCalledTimes(1);
          writeFileSync(
            join(bound.implementWorkspace?.directory ?? '', '../../', lockfile),
            'edited lockfile\n'
          );
          return edit(bound);
        },
        installer
      );
      expect(installer).toHaveBeenCalledWith(
        manager,
        args,
        expect.objectContaining({
          cwd: output.changes?.worktreePath,
          timeout: WORKFLOW_TIMEOUTS.stepMs,
          env: expect.objectContaining({
            npm_config_package_import_method: 'copy',
            npm_config_enable_global_virtual_store: 'false',
            npm_config_virtual_store_dir: join(
              output.changes?.worktreePath ?? '',
              'node_modules/.pnpm'
            ),
          }),
        })
      );
      expect(output.changes?.dependencies).toEqual({ status: 'installed', manager });
    }
  );

  it.each([
    { error: new Error('offline cache miss'), mode: 'blocking' as const },
    { error: 'offline cache miss', mode: 'blocking' as const },
    { error: new Error('offline cache miss'), mode: 'advisory' as const },
  ])(
    'reports $mode install failure $error as unmeasured without rerunning implementation',
    async ({ error, mode }) => {
      file('package-lock.json', '{}\n');
      commit();
      const installer = vi.fn().mockRejectedValue(error);
      const implement = vi.fn((task: { id: string }) => {
        expect(task.id).toBe('one');
        return Promise.resolve('Implemented');
      });
      const output = await withDevPipelineWorkspace(
        boundStages(repo),
        async (bound) => {
          expect(await bound.qualityGate?.()).toMatchObject({
            passed: false,
            verdict: 'skip',
            feedback: 'Gate unmeasured: dependencies could not be provisioned: offline cache miss',
          });
          delete bound.withWorkspace;
          return runDevPipeline(
            'Task',
            {
              ...bound,
              plan: () => Promise.resolve('Plan'),
              vote: () => Promise.resolve({ kind: 'approved', approvalPercentage: 100 }),
              decompose: () =>
                Promise.resolve([
                  {
                    id: 'one',
                    title: 'One',
                    description: 'One',
                    assignedTo: 'coder',
                    status: 'pending',
                  },
                ]),
              implement,
              qaReview: () => Promise.resolve({ verdict: 'pass', feedback: 'OK', issues: [] }),
              securityScan: () =>
                Promise.resolve({ passed: true, verdict: 'pass', feedback: 'OK' }),
            },
            { researchOverride: 'Plan', qualityGate: mode }
          );
        },
        installer
      );
      expect(implement).toHaveBeenCalledTimes(1);
      expect(mocks.stageEvent).toHaveBeenCalledWith(
        'quality-gate',
        'failed',
        expect.objectContaining({ verdict: 'skip' })
      );
      expect(mocks.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('Quality gate failed'),
        expect.anything()
      );
      expect(events).toContainEqual(
        expect.objectContaining({ name: 'quality-gate', summary: 'UNMEASURED' })
      );
      expect(output.completed).toBe(false);
      expect(output.warnings).toContain(
        'Gate unmeasured: dependencies could not be provisioned: offline cache miss'
      );
      expect(output.changes?.dependencies).toEqual({
        status: 'failed',
        manager: 'npm',
        reason: 'offline cache miss',
      });
    }
  );

  it.each(['no lockfile', 'no package.json'])(
    'names status none for %s without invoking an install',
    async (missing) => {
      if (missing === 'no package.json') {
        rmSync(join(repo, 'package.json'));
        file('pnpm-lock.yaml', 'lockfile\n');
        commit();
      }
      const installer = vi.fn();
      const output = await withDevPipelineWorkspace(boundStages(repo), edit, installer);
      expect(output.changes?.dependencies).toEqual({ status: 'none' });
      expect(installer).not.toHaveBeenCalled();
    }
  );

  it('reports successful removal independently from a prune failure', async () => {
    mocks.pruneFailure = true;
    const output = await withDevPipelineWorkspace(boundStages(repo), edit);
    expect(output.changes?.worktreeRemoved).toBe(true);
    expect(output.warnings).toContainEqual(
      expect.stringContaining('Failed to prune scratch worktree registration')
    );
    expect(output.warnings).toContainEqual(expect.stringContaining('prune failed'));
    expect(output.warnings?.join(' ')).not.toContain('Leftover path');
    expect(existsSync(output.changes?.worktreePath ?? '')).toBe(false);
  });

  it('retains the diff and result when disposal fails and warns with the leftover path', async () => {
    mocks.disposeFailure = true;
    const output = await withDevPipelineWorkspace(boundStages(repo), edit);
    expect(output.completed).toBe(true);
    expect(output.changes).toMatchObject({ worktreeRemoved: false, empty: false });
    expect(output.changes?.diff).toContain('+new change');
    expect(output.plan).toBe(result.plan);
    expect(output.warnings?.[0]).toBe('existing warning');
    expect(output.warnings?.[1]).toContain(output.changes?.worktreePath);
    expect(output.warnings?.[1]).toContain('dispose failed');
    expect(existsSync(output.changes?.worktreePath ?? '')).toBe(true);
    expect(mocks.warn).toHaveBeenCalled();
    expect(buildStructuredOutput(output, false)['changes']).toHaveProperty(
      'worktreeRemoved',
      false
    );
  });

  it('preserves the original thrown error and logs a concurrent disposal failure', async () => {
    mocks.disposeFailure = true;
    const original = new Error('run crashed');
    await expect(
      withDevPipelineWorkspace(boundStages(repo), () => Promise.reject(original))
    ).rejects.toBe(original);
    expect(mocks.warn).toHaveBeenCalledWith(
      expect.stringContaining(mocks.paths[0] ?? ''),
      expect.objectContaining({ error: expect.stringContaining('dispose failed') })
    );
  });

  it('warns about modified, staged, and untracked paths while still using HEAD', async () => {
    file('.gitignore', 'ignored/\n');
    commit();
    const sha = git('rev-parse', 'HEAD').trim();
    file('tracked.txt', 'operator edits\n');
    file('staged.txt', 'staged edits\n');
    git('add', 'staged.txt');
    file('untracked\nfile.txt', 'untracked edits\n');
    file('ignored/untracked.txt', 'ignored edits\n');
    const before = git('status', '--porcelain');
    const output = await withDevPipelineWorkspace(boundStages(repo), (bound) => {
      expect(
        readFileSync(join(bound.implementWorkspace?.directory ?? '', 'tracked.txt'), 'utf8')
      ).toBe('HEAD content\n');
      return edit(bound);
    });
    expect(output.warnings).toEqual(['existing warning', expect.stringContaining(`HEAD ${sha}`)]);
    expect(output.warnings?.[1]).toContain('3 uncommitted paths were not included');
    expect(output.changes?.baseSha).toBe(sha);
    expect(output.changes?.diff).not.toContain('operator edits');
    expect(git('status', '--porcelain')).toBe(before);
  });

  it('counts a staged rename as one uncommitted path', async () => {
    git('mv', 'tracked.txt', 'renamed.txt');
    const output = await withDevPipelineWorkspace(boundStages(repo), edit);
    expect(output.warnings?.[1]).toContain('1 uncommitted paths were not included');
  });

  it('does not warn about a clean source or ignored untracked paths', async () => {
    file('.gitignore', 'ignored/\n');
    commit();
    const clean = await withDevPipelineWorkspace(boundStages(repo), edit);
    expect(clean.warnings).toEqual(result.warnings);
    file('ignored/untracked.txt', 'ignored edits\n');
    const ignored = await withDevPipelineWorkspace(boundStages(repo), edit);
    expect(ignored.warnings).toEqual(result.warnings);
  });
});
