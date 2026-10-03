/** Real repository and process regressions for pipeline-owned subprocess isolation. */
import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempOutsideRepo } from '../testing/non-repo-temp-dir.js';
import type { DevPipelineResult, DevPipelineStages } from './dev-pipeline.js';
import { withDevPipelineWorkspace } from './dev-pipeline-workspace.js';

// These regressions exercise the retained best-effort defenses explicitly.
vi.mock('./dev-pipeline-sandbox.js', async (original) => ({
  ...(await original<typeof import('./dev-pipeline-sandbox.js')>()),
  bwrapPreflight: () => Promise.resolve({ mode: 'best-effort', reason: 'fixture fallback' }),
}));

const mocks = vi.hoisted(() => ({ warn: vi.fn(), creationFailure: false, disposalFailure: false }));
vi.mock('../core/index.js', async (original) => {
  const actual = await original<typeof import('../core/index.js')>();
  return { ...actual, createLogger: () => ({ ...actual.createLogger(), warn: mocks.warn }) };
});
vi.mock('../config/timeouts.js', async (original) => {
  const actual = await original<typeof import('../config/timeouts.js')>();
  return { ...actual, WORKFLOW_TIMEOUTS: { ...actual.WORKFLOW_TIMEOUTS, stepMs: 300 } };
});
vi.mock('../cli/vote-scratch-checkout.js', async (original) => {
  const actual = await original<typeof import('../cli/vote-scratch-checkout.js')>();
  return {
    ...actual,
    createScratchCheckout: (options: Parameters<typeof actual.createScratchCheckout>[0]) => {
      if (mocks.creationFailure) {
        appendFileSync(join(options.repoRoot, '.git/config'), '\n[fixture]\n changed = true\n');
        throw new Error('forced creation failure');
      }
      const scratch = actual.createScratchCheckout(options);
      return {
        ...scratch,
        dispose: () => {
          scratch.dispose();
          if (mocks.disposalFailure) throw new Error('forced prune failure');
        },
      };
    },
  };
});
const result: DevPipelineResult = {
  completed: true,
  plan: 'Plan',
  tasks: [],
  voteIterations: 1,
  qaIterations: 1,
  securityPassed: true,
};
const stages = (directory: string): DevPipelineStages => ({
  implementWorkspace: { directory, accessMode: 'workspace-edit' },
  withWorkspace: (binding) => stages(binding.directory),
  research: vi.fn(),
  plan: vi.fn(),
  vote: vi.fn(),
  decompose: vi.fn(),
  implement: vi.fn(),
  qaReview: vi.fn(),
  securityScan: vi.fn(),
});

describe('hermetic pipeline subprocesses', () => {
  let root: string;
  let repo: string;
  let scratchRoot: string;
  const git = (...args: string[]): string =>
    execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: 'pipe' });
  const edit = (bound: DevPipelineStages): Promise<DevPipelineResult> => {
    writeFileSync(join(bound.implementWorkspace?.directory ?? '', 'new.txt'), 'new change\n');
    return Promise.resolve(result);
  };
  beforeEach(() => {
    mocks.warn.mockReset();
    mocks.creationFailure = false;
    mocks.disposalFailure = false;
    root = mkdtempOutsideRepo('hermetic-pipeline-');
    repo = join(root, 'repo');
    scratchRoot = join(root, 'scratch');
    mkdirSync(repo);
    mkdirSync(scratchRoot);
    vi.stubEnv('NEXUS_TMPDIR', scratchRoot);
    git('init', '--quiet');
    git('config', 'user.name', 'Fixture');
    git('config', 'user.email', 'fixture@example.test');
    writeFileSync(join(repo, 'package.json'), '{"name":"fixture","private":true}\n');
    writeFileSync(join(repo, 'package-lock.json'), '{}\n');
    git('add', '--all');
    git('-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    const pids = join(root, 'installer-pids');
    if (existsSync(pids)) {
      for (const pid of readFileSync(pids, 'utf8').trim().split('\n')) {
        try {
          process.kill(Number(pid), 'SIGKILL');
        } catch {
          /* Already ended by the timeout. */
        }
      }
    }
    rmSync(root, { recursive: true, force: true });
  });

  it('leaves the SOURCE index bytes unchanged with inherited GIT_INDEX_FILE and captures new files', async () => {
    const indexPath = join(repo, '.git/index');
    const before = readFileSync(indexPath);
    vi.stubEnv('GIT_INDEX_FILE', indexPath);
    const output = await withDevPipelineWorkspace(stages(repo), edit, vi.fn());
    expect(readFileSync(indexPath)).toEqual(before);
    expect(output.changes?.diff).toContain('new.txt');
    expect(output.changes?.diff).toContain('+new change');
    expect(output.changes?.worktreeRemoved).toBe(true);
  });

  it('preserves source index bytes and mtime when tracked file stats are stale', async () => {
    const indexPath = join(repo, '.git/index');
    const trackedPath = join(repo, 'package.json');
    const staleTime = new Date(Date.now() + 10_000);
    utimesSync(trackedPath, staleTime, staleTime);
    vi.stubEnv('GIT_OPTIONAL_LOCKS', '1');
    const before = readFileSync(indexPath);
    const beforeMtime = statSync(indexPath, { bigint: true }).mtimeNs;

    const output = await withDevPipelineWorkspace(stages(repo), edit, vi.fn());

    expect(readFileSync(indexPath)).toEqual(before);
    expect(statSync(indexPath, { bigint: true }).mtimeNs).toBe(beforeMtime);
    expect(output.changes?.worktreeRemoved).toBe(true);
    // Positive control: ordinary status really refreshes this fixture's stat cache.
    git('status', '--porcelain');
    expect(readFileSync(indexPath)).not.toEqual(before);
  });

  it.each(['npm', 'pnpm'])(
    'pins %s install directories despite inherited npm config redirects',
    async (manager) => {
      if (manager === 'pnpm') {
        rmSync(join(repo, 'package-lock.json'));
        writeFileSync(join(repo, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n');
        git('add', '--all');
        git(
          '-c',
          'core.hooksPath=/dev/null',
          '-c',
          'commit.gpgsign=false',
          'commit',
          '-m',
          'pnpm fixture'
        );
      }
      const redirects = [
        'modules_dir',
        'virtual_store_dir',
        'lockfile_dir',
        'dir',
        'global_dir',
        'prefix',
      ];
      for (const name of redirects) vi.stubEnv(`npm_config_${name}`, join(repo, name));
      vi.stubEnv('npm_config_store_dir', join(root, 'shared-store'));
      let received: { cwd: string; env: NodeJS.ProcessEnv } | undefined;
      const install = vi.fn(
        (_command: string, _args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }) => {
          received = options;
          return Promise.resolve();
        }
      );

      const output = await withDevPipelineWorkspace(stages(repo), edit, install);

      expect(install).toHaveBeenCalledOnce();
      expect(output.changes?.dependencies).toEqual({ status: 'installed', manager });
      if (received === undefined) throw new Error('Installer was not called');
      expect(received.env['npm_config_modules_dir']).toBe('node_modules');
      expect(received.env['npm_config_virtual_store_dir']).toBe(
        join(received.cwd, 'node_modules/.pnpm')
      );
      for (const name of ['lockfile_dir', 'dir', 'global_dir', 'prefix']) {
        expect(received.env).not.toHaveProperty(`npm_config_${name}`);
      }
      expect(received.env['npm_config_store_dir']).toBe(join(root, 'shared-store'));
      expect(received.env['npm_config_package_import_method']).toBe('copy');
      expect(received.cwd).not.toBe(repo);
    }
  );

  it('removes repository-local git env from the dependency install environment', async () => {
    vi.stubEnv('GIT_DIR', join(repo, '.git'));
    vi.stubEnv('GIT_CONFIG_COUNT', '1');
    vi.stubEnv('GIT_CONFIG_KEY_0', 'fixture.injected');
    vi.stubEnv('GIT_CONFIG_VALUE_0', 'true');
    const install = vi.fn(
      async (_command: string, _args: string[], options: { env: NodeJS.ProcessEnv }) => {
        for (const name of [
          'GIT_DIR',
          'GIT_CONFIG_COUNT',
          'GIT_CONFIG_KEY_0',
          'GIT_CONFIG_VALUE_0',
        ]) {
          expect(options.env).not.toHaveProperty(name);
        }
        expect(options.env['HUSKY']).toBe('0');
        return Promise.resolve();
      }
    );
    const output = await withDevPipelineWorkspace(stages(repo), edit, install);
    expect(install).toHaveBeenCalledOnce();
    expect(output.changes?.dependencies.status).toBe('installed');
  });

  it('disables the source post-checkout hook during pipeline allocation', async () => {
    const marker = join(root, 'hook-marker');
    const hook = join(repo, '.git/hooks/post-checkout');
    writeFileSync(hook, `#!/bin/sh\ntouch '${marker}'\nexit 1\n`);
    chmodSync(hook, 0o755);
    const output = await withDevPipelineWorkspace(stages(repo), edit, vi.fn());
    expect(existsSync(marker)).toBe(false);
    expect(output.changes?.worktreeRemoved).toBe(true);
    expect(output.completed).toBe(true);
  });

  it('reports shared config changes on a forced creation failure without a leftover path', async () => {
    mocks.creationFailure = true;
    await expect(withDevPipelineWorkspace(stages(repo), edit, vi.fn())).rejects.toThrow(
      'forced creation failure'
    );
    expect(mocks.warn).toHaveBeenCalledWith(expect.stringContaining('shared git config'));
    expect(readdirSync(scratchRoot)).toEqual([]);
  });

  it.each([false, true])(
    'kills a real installer process tree on timeout (detached grandchild: %s)',
    async (detached) => {
      const marker = join(root, 'late-marker');
      const started = join(root, 'grandchild-started');
      const recordPid = `require('node:fs').appendFileSync(${JSON.stringify(join(root, 'installer-pids'))}, String(process.pid) + String.fromCharCode(10)); `;
      const grandchild = `${recordPid}require('node:fs').writeFileSync(${JSON.stringify(started)}, 'started'); setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'escaped'), 1500);`;
      const child = `${recordPid}require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(grandchild)}], { detached: ${String(detached)}, stdio: 'ignore' }); setInterval(() => {}, 1000);`;
      const installer = join(root, 'npm');
      writeFileSync(
        installer,
        `#!${process.execPath}\n${recordPid}require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(child)}], { stdio: 'ignore' }); setInterval(() => {}, 1000);\n`
      );
      chmodSync(installer, 0o755);
      vi.stubEnv('PATH', `${root}:${process.env['PATH'] ?? ''}`);
      const output = await withDevPipelineWorkspace(stages(repo), edit);
      expect(output.changes?.dependencies).toMatchObject({
        status: 'failed',
        reason: expect.stringMatching(/timed out|killed|Command failed/),
      });
      expect(existsSync(started)).toBe(true); // Prove the grandchild actually ran.
      expect(output.changes?.worktreeRemoved).toBe(true);
      await delay(1800);
      expect(existsSync(marker)).toBe(false);
    }
  );

  it.each(['config', 'disposal'])(
    'preserves the original run error when %s warning logging throws',
    async (warning) => {
      const original = new Error('original run error');
      mocks.warn.mockImplementation(() => {
        throw new Error('logger failed');
      });
      mocks.disposalFailure = warning === 'disposal';
      await expect(
        withDevPipelineWorkspace(
          stages(repo),
          () => {
            if (warning === 'config')
              appendFileSync(join(repo, '.git/config'), '\n[fixture]\n changed = true\n');
            throw original;
          },
          vi.fn()
        )
      ).rejects.toBe(original);
      expect(mocks.warn).toHaveBeenCalled();
      expect(readdirSync(scratchRoot)).toEqual([]);
    }
  );

  it('returns a successful result with warnings even when cleanup warning logging throws', async () => {
    mocks.disposalFailure = true;
    mocks.warn.mockImplementation(() => {
      throw new Error('logger failed');
    });
    const output = await withDevPipelineWorkspace(
      stages(repo),
      async (bound) => {
        appendFileSync(join(repo, '.git/config'), '\n[fixture]\n changed = true\n');
        return edit(bound);
      },
      vi.fn()
    );
    expect(output.completed).toBe(true);
    expect(output.warnings).toContainEqual(expect.stringContaining('forced prune failure'));
    expect(output.warnings).toContainEqual(expect.stringContaining('shared git config'));
    expect(output.changes?.worktreeRemoved).toBe(true);
  });
});
