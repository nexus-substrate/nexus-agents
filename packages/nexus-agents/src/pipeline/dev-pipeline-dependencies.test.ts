/** Real offline npm workspace install, with no external packages or cache requirement. */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempOutsideRepo } from '../testing/non-repo-temp-dir.js';
import { isolatePackageManagerEnv } from '../testing/pipeline-workspace-fixture.js';
import { withDevPipelineWorkspace } from './dev-pipeline-workspace.js';
import type { DevPipelineStages } from './dev-pipeline.js';

function stages(directory: string): DevPipelineStages {
  return {
    implementWorkspace: { directory, accessMode: 'workspace-edit' },
    withWorkspace: (binding) => {
      // Fail here, with the installer's reason, before the symlink check hides it.
      expect(binding.dependencies).toEqual({ status: 'installed', manager: 'npm' });
      return stages(binding.directory);
    },
    research: vi.fn(),
    plan: vi.fn(),
    vote: vi.fn(),
    decompose: vi.fn(),
    implement: vi.fn(),
    qaReview: vi.fn(),
    securityScan: vi.fn(),
  };
}

describe('scratch dependency subprocess', () => {
  let tmp: string;
  let repo: string;
  const file = (path: string, content: string): void => {
    mkdirSync(join(repo, path, '..'), { recursive: true });
    writeFileSync(join(repo, path), content);
  };
  const git = (...args: string[]): string =>
    execFileSync('git', args, {
      cwd: repo,
      encoding: 'utf8',
      stdio: 'pipe',
    });
  beforeEach(() => {
    tmp = mkdtempOutsideRepo('scratch-install-test-');
    repo = join(tmp, 'repo');
    mkdirSync(repo);
    mkdirSync(join(tmp, 'scratch'));
    vi.stubEnv('NEXUS_TMPDIR', join(tmp, 'scratch'));
    isolatePackageManagerEnv(tmp);
    git('init', '--quiet');
    git('config', 'user.name', 'Fixture');
    git('config', 'user.email', 'fixture@example.test');
    git('config', 'commit.gpgsign', 'false');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(tmp, { recursive: true, force: true });
  });

  async function installsIntoScratch(): Promise<void> {
    file(
      'package.json',
      JSON.stringify({ name: 'fixture', private: true, workspaces: ['packages/*'] })
    );
    file(
      'packages/local/package.json',
      '{"name":"fixture-local","version":"1.0.0","main":"index.js"}'
    );
    file('packages/local/index.js', 'module.exports = "HEAD";\n');
    file(
      'package-lock.json',
      JSON.stringify({
        name: 'fixture',
        lockfileVersion: 3,
        requires: true,
        packages: {
          '': { name: 'fixture', workspaces: ['packages/*'] },
          'node_modules/fixture-local': { resolved: 'packages/local', link: true },
          'packages/local': { name: 'fixture-local', version: '1.0.0' },
        },
      })
    );
    git('add', '--all');
    git('-c', 'core.hooksPath=/dev/null', 'commit', '-m', 'workspace fixture');
    mkdirSync(join(repo, 'node_modules'));
    symlinkSync('../packages/local', join(repo, 'node_modules/fixture-local'));
    const before = readFileSync(join(repo, 'node_modules/fixture-local/index.js'));
    const status = git('status', '--porcelain');
    const output = await withDevPipelineWorkspace(stages(repo), (bound) => {
      const cwd = bound.implementWorkspace?.directory ?? '';
      expect(existsSync(join(cwd, 'node_modules/fixture-local'))).toBe(true);
      writeFileSync(
        join(cwd, 'node_modules/fixture-local/index.js'),
        'module.exports = "SCRATCH";\n'
      );
      expect(
        execFileSync(process.execPath, ['-e', 'process.stdout.write(require("fixture-local"))'], {
          cwd,
          encoding: 'utf8',
        })
      ).toBe('SCRATCH');
      return Promise.resolve({
        completed: true,
        plan: 'Plan',
        tasks: [],
        voteIterations: 1,
        qaIterations: 1,
        securityPassed: true,
      });
    });
    expect(output.changes?.dependencies).toEqual({ status: 'installed', manager: 'npm' });
    expect(output.changes?.worktreeRemoved).toBe(true);
    expect(output.changes?.diff).toContain('+module.exports = "SCRATCH";');
    expect(readFileSync(join(repo, 'node_modules/fixture-local/index.js'))).toEqual(before);
    expect(git('status', '--porcelain')).toBe(status);
  }

  it('installs offline into scratch and resolves edited workspaces without writing source dependencies', async () => {
    await installsIntoScratch();
  });

  it('ignores the config a package-manager launcher exported (#7137)', async () => {
    // What `pnpm test` exported here from `allow-scripts=…` in ~/.npmrc: npm accepts
    // that line in the file, but rejects the env form with EALLOWSCRIPTS, as a flag.
    vi.stubEnv('npm_lifecycle_event', 'test');
    vi.stubEnv('npm_execpath', '/launcher/pnpm.cjs');
    vi.stubEnv('npm_config_allow_scripts', 'fixture');
    vi.stubEnv('npm_config_globalconfig', join(tmp, 'launcher-rc'));
    await installsIntoScratch();
  });
});
