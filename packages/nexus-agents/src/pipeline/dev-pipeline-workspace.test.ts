/** Dependency provisioning, cleanup failures and HEAD provenance use real temporary repositories. */
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withDevPipelineWorkspace } from './dev-pipeline-workspace.js';
import type { DevPipelineResult, DevPipelineStages } from './dev-pipeline.js';
import { buildStructuredOutput } from '../mcp/tools/dev-pipeline-output.js';
import { checkLint, checkTests, checkTypeCheck } from '../security/quality-gate.js';

const mocks = vi.hoisted(() => ({
  disposeFailure: false,
  warn: vi.fn(),
  paths: [] as string[],
  indexedPaths: '',
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
          mocks.indexedPaths = execFileSync('git', ['ls-files', '-z'], {
            cwd: scratch.path,
            encoding: 'utf8',
          });
          if (mocks.disposeFailure) throw new actual.ScratchCheckoutError('dispose failed');
          scratch.dispose();
        },
      };
    },
  };
});
vi.mock('../core/index.js', async (original) => ({
  ...(await original<typeof import('../core/index.js')>()),
  createLogger: () => ({ warn: mocks.warn }),
}));

const result: DevPipelineResult = {
  completed: true,
  plan: 'Operator plan',
  tasks: [],
  voteIterations: 1,
  qaIterations: 1,
  securityPassed: true,
  warnings: ['existing warning'],
};

function boundStages(directory: string): DevPipelineStages {
  return {
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
    mocks.disposeFailure = false;
    mocks.warn.mockClear();
    mocks.paths = [];
    mocks.indexedPaths = '';
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
    for (const path of mocks.paths) {
      if (existsSync(path)) git('worktree', 'remove', '--force', path);
    }
    vi.unstubAllEnvs();
    rmSync(tmp, { recursive: true, force: true });
  });

  it('links root and tracked workspace dependencies before all real quality checks', async () => {
    const script = 'node -e "require(\'fixture-dep\')"';
    const manifest = JSON.stringify({
      name: 'fixture',
      private: true,
      packageManager: 'npm@10.0.0',
      scripts: { typecheck: script, lint: script, test: script },
    });
    for (const dir of ['', 'packages/app', 'packages/missing'])
      file(join(dir, 'package.json'), manifest);
    commit();
    for (const dir of ['', 'packages/app', 'untracked', 'node_modules/nested']) {
      file(join(dir, 'package.json'), manifest);
      file(join(dir, 'node_modules/fixture-dep/index.js'), 'module.exports = 42;\n');
    }
    const before = git('status', '--porcelain');
    const output = await withDevPipelineWorkspace(
      boundStages(join(repo, 'packages/app')),
      async (bound) => {
        const cwd = bound.implementWorkspace?.directory ?? '';
        const root = join(cwd, '../..');
        for (const dir of ['', 'packages/app']) {
          const link = join(root, dir, 'node_modules');
          expect(lstatSync(link).isSymbolicLink()).toBe(true);
          expect(realpathSync(link)).toBe(join(repo, dir, 'node_modules'));
        }
        expect(existsSync(join(root, 'untracked'))).toBe(false);
        expect(existsSync(join(root, 'packages/missing/node_modules'))).toBe(false);
        const checks = await Promise.all([
          checkTypeCheck(cwd)(),
          checkLint(cwd)(),
          checkTests(cwd)(),
        ]);
        expect(checks.map((check) => check.verdict)).toEqual(['pass', 'pass', 'pass']);
        return edit(bound);
      }
    );
    expect(buildStructuredOutput(output, false)['changes']).toHaveProperty('dependenciesLinked', 2);
    expect(output.changes?.diff).toContain('+new change');
    expect(output.changes?.diff).not.toContain('node_modules');
    expect(mocks.indexedPaths).not.toContain('node_modules');
    expect(existsSync(output.changes?.worktreePath ?? '')).toBe(false);
    for (const dir of ['', 'packages/app']) {
      expect(readFileSync(join(repo, dir, 'node_modules/fixture-dep/index.js'), 'utf8')).toContain(
        '42'
      );
    }
    expect(git('status', '--porcelain')).toBe(before);
  });

  it('links dependencies when node_modules/ is ignored without changing an empty diff', async () => {
    file('.gitignore', 'node_modules/\n');
    commit();
    file('node_modules/fixture-dep/index.js', 'module.exports = 42;\n');
    const output = await withDevPipelineWorkspace(boundStages(repo), (bound) => {
      expect(
        lstatSync(join(bound.implementWorkspace?.directory ?? '', 'node_modules')).isSymbolicLink()
      ).toBe(true);
      return Promise.resolve(result);
    });
    expect(output.changes).toMatchObject({ diff: '', dependenciesLinked: 1, empty: true });
    expect(output.warnings).toEqual(result.warnings);
  });

  it('excludes dependency links from the diff even when implementation stages them', async () => {
    file('packages/app/package.json', '{"name":"app"}\n');
    commit();
    for (const dir of ['', 'packages/app']) {
      file(join(dir, 'node_modules/fixture-dep/index.js'), 'module.exports = 42;\n');
    }
    const output = await withDevPipelineWorkspace(boundStages(repo), (bound) => {
      const cwd = bound.implementWorkspace?.directory ?? '';
      execFileSync(
        'git',
        ['add', '--intent-to-add', '--all', '--', 'node_modules', 'packages/app/node_modules'],
        { cwd }
      );
      return edit(bound);
    });
    expect(output.changes?.diff).toContain('+new change');
    expect(output.changes?.diff).not.toContain('node_modules');
  });

  it('never searches tracked package manifests inside node_modules', async () => {
    file('vendor/node_modules/dep/package.json', '{"name":"dep"}\n');
    commit();
    file('vendor/node_modules/dep/node_modules/inner/index.js', 'module.exports = 42;\n');
    const output = await withDevPipelineWorkspace(boundStages(repo), (bound) => {
      expect(
        existsSync(
          join(bound.implementWorkspace?.directory ?? '', 'vendor/node_modules/dep/node_modules')
        )
      ).toBe(false);
      return edit(bound);
    });
    expect(output.changes).toHaveProperty('dependenciesLinked', 0);
  });

  it('names zero dependencies and leaves the missing-dependency gate failure unchanged', async () => {
    file(
      'package.json',
      JSON.stringify({
        name: 'fixture',
        scripts: { typecheck: 'node -e "require(\'missing-fixture-dep\')"' },
      })
    );
    commit();
    const output = await withDevPipelineWorkspace(boundStages(repo), async (bound) => {
      const cwd = bound.implementWorkspace?.directory ?? '';
      expect(existsSync(join(cwd, 'node_modules'))).toBe(false);
      expect((await checkTypeCheck(cwd)()).verdict).toBe('fail');
      return { ...result, completed: false };
    });
    expect(output.completed).toBe(false);
    expect(output.changes).toMatchObject({ dependenciesLinked: 0, diff: '', empty: true });
    expect(output.warnings).toEqual(result.warnings);
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
