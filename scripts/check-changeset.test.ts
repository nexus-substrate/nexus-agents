/**
 * Tests for the changeset-presence gate.
 *
 * @module scripts/check-changeset.test
 */

import { afterEach, describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyChange, normalizeChangeEntry, main } from './check-changeset.js';

const SCRIPT_PATH = join(dirname(fileURLToPath(import.meta.url)), 'check-changeset.ts');

const FIXTURE_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
};

function git(dir: string, ...args: string[]): string {
  const r = spawnSync('git', ['-c', 'commit.gpgsign=false', ...args], {
    cwd: dir,
    encoding: 'utf-8',
    env: FIXTURE_ENV,
  });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout.trim();
}

const TSX_CLI = fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url));

function runCheck(
  dir: string,
  base = 'main'
): { status: number | null; stdout: string; stderr: string } {
  return spawnSync(process.execPath, [TSX_CLI, SCRIPT_PATH, base], {
    cwd: dir,
    encoding: 'utf-8',
    env: FIXTURE_ENV,
  });
}

describe('normalizeChangeEntry', () => {
  it('normalizes a plain path string without status', () => {
    expect(normalizeChangeEntry('packages/nexus-agents/src/foo.ts')).toEqual({
      path: 'packages/nexus-agents/src/foo.ts',
    });
  });

  it('normalizes a tab-separated line from git diff --name-status', () => {
    expect(normalizeChangeEntry('M\tpackages/nexus-agents/src/foo.ts')).toEqual({
      status: 'M',
      path: 'packages/nexus-agents/src/foo.ts',
    });
    expect(normalizeChangeEntry('D\t.changeset/old.md')).toEqual({
      status: 'D',
      path: '.changeset/old.md',
    });
    expect(normalizeChangeEntry('A\t.changeset/new.md')).toEqual({
      status: 'A',
      path: '.changeset/new.md',
    });
  });

  it('handles rename status by taking the destination path', () => {
    expect(normalizeChangeEntry('R100\t.changeset/old.md\t.changeset/renamed.md')).toEqual({
      status: 'R100',
      path: '.changeset/renamed.md',
    });
  });

  it('normalizes space-separated status line', () => {
    expect(normalizeChangeEntry('D .changeset/old.md')).toEqual({
      status: 'D',
      path: '.changeset/old.md',
    });
  });

  it('passes through ChangedFile objects', () => {
    const obj = { path: 'packages/nexus-agents/src/index.ts', status: 'M' };
    expect(normalizeChangeEntry(obj)).toEqual(obj);
  });
});

describe('classifyChange', () => {
  it('flags shippable source with no changeset', () => {
    const result = classifyChange([
      'packages/nexus-agents/src/mcp/error-envelope.ts',
      'docs/README.md',
    ]);
    expect(result.shippable).toEqual(['packages/nexus-agents/src/mcp/error-envelope.ts']);
    expect(result.hasChangeset).toBe(false);
  });

  it('passes when a changeset accompanies shippable source', () => {
    const result = classifyChange([
      'packages/nexus-agents/src/mcp/error-envelope.ts',
      '.changeset/some-change.md',
    ]);
    expect(result.shippable).toHaveLength(1);
    expect(result.hasChangeset).toBe(true);
  });

  it('does not treat a deleted changeset as changeset presence (#7448)', () => {
    const result = classifyChange([
      'M\tpackages/nexus-agents/src/example.ts',
      'D\t.changeset/old.md',
    ]);
    expect(result.shippable).toEqual(['packages/nexus-agents/src/example.ts']);
    expect(result.hasChangeset).toBe(false);
  });

  it('does not treat a deleted changeset ChangedFile object as changeset presence (#7448)', () => {
    const result = classifyChange([
      { path: 'packages/nexus-agents/src/example.ts', status: 'M' },
      { path: '.changeset/old.md', status: 'D' },
    ]);
    expect(result.shippable).toEqual(['packages/nexus-agents/src/example.ts']);
    expect(result.hasChangeset).toBe(false);
  });

  it('passes when an added changeset accompanies shippable source even if an old changeset was deleted (#7448)', () => {
    const result = classifyChange([
      'M\tpackages/nexus-agents/src/example.ts',
      'D\t.changeset/old.md',
      'A\t.changeset/new.md',
    ]);
    expect(result.shippable).toEqual(['packages/nexus-agents/src/example.ts']);
    expect(result.hasChangeset).toBe(true);
  });

  it('requires a changeset when shippable source is deleted', () => {
    const result = classifyChange([{ path: 'packages/nexus-agents/src/example.ts', status: 'D' }]);
    expect(result.shippable).toEqual(['packages/nexus-agents/src/example.ts']);
    expect(result.hasChangeset).toBe(false);
  });

  it('does not require a changeset for test-only changes', () => {
    const result = classifyChange([
      'packages/nexus-agents/src/mcp/error-envelope.test.ts',
      'packages/nexus-agents/src/mcp/__tests__/foo.ts',
    ]);
    expect(result.shippable).toHaveLength(0);
  });

  it('does not require a changeset for .d.ts-only changes', () => {
    const result = classifyChange(['packages/nexus-agents/src/types/global.d.ts']);
    expect(result.shippable).toHaveLength(0);
  });

  it('does not require a changeset for non-src changes (docs, scripts, workflows)', () => {
    const result = classifyChange([
      'docs/README.md',
      'scripts/check-changeset.ts',
      '.github/workflows/ci.yml',
      'packages/nexus-agents/package.json',
    ]);
    expect(result.shippable).toHaveLength(0);
  });

  it('does not require a changeset for release-version consumption path (#7448)', () => {
    const result = classifyChange([
      'D\t.changeset/consumed.md',
      'M\tpackages/nexus-agents/package.json',
      'M\tpackages/nexus-agents/CHANGELOG.md',
    ]);
    expect(result.shippable).toHaveLength(0);
    expect(result.hasChangeset).toBe(false);
  });

  it('ignores the changeset README as a changeset', () => {
    const result = classifyChange(['packages/nexus-agents/src/index.ts', '.changeset/README.md']);
    expect(result.hasChangeset).toBe(false);
  });
});

describe('check-changeset gate execution in synthetic git repo (#7448)', () => {
  let dirs: string[] = [];

  function makeRepo(): string {
    const dir = mkdtempSync(join(tmpdir(), 'changeset-gate-'));
    dirs.push(dir);
    git(dir, 'init', '-b', 'main');
    mkdirSync(join(dir, 'packages/nexus-agents/src'), { recursive: true });
    mkdirSync(join(dir, '.changeset'), { recursive: true });
    writeFileSync(join(dir, 'packages/nexus-agents/src/example.ts'), 'export const a = 1;\n');
    writeFileSync(join(dir, '.changeset/old.md'), '---\n"nexus-agents": patch\n---\nold change\n');
    git(dir, 'add', '.');
    git(dir, 'commit', '-m', 'initial on main');
    return dir;
  }

  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    dirs = [];
  });

  it('fails with exit 1 when shippable source is modified and only an existing changeset is deleted (#7448)', () => {
    const dir = makeRepo();
    git(dir, 'checkout', '-b', 'fix/feature');
    writeFileSync(join(dir, 'packages/nexus-agents/src/example.ts'), 'export const a = 2;\n');
    git(dir, 'rm', '.changeset/old.md');
    git(dir, 'commit', '-am', 'modify source and delete changeset');

    const result = runCheck(dir, 'main');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Missing changeset');
  });

  it('passes with exit 0 when shippable source is modified and a new changeset is added', () => {
    const dir = makeRepo();
    git(dir, 'checkout', '-b', 'fix/feature');
    writeFileSync(join(dir, 'packages/nexus-agents/src/example.ts'), 'export const a = 2;\n');
    writeFileSync(join(dir, '.changeset/new.md'), '---\n"nexus-agents": patch\n---\nnew change\n');
    git(dir, 'add', '.');
    git(dir, 'commit', '-m', 'modify source and add new changeset');

    const result = runCheck(dir, 'main');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      'Shippable source changed (1 file(s)) and a changeset is present — OK.'
    );
  });

  it('passes with exit 0 for the intended release-version consumption path (#7448)', () => {
    const dir = makeRepo();
    writeFileSync(
      join(dir, 'packages/nexus-agents/package.json'),
      '{"name":"nexus-agents","version":"1.0.0"}\n'
    );
    writeFileSync(join(dir, 'packages/nexus-agents/CHANGELOG.md'), '# Changelog\n');
    git(dir, 'add', '.');
    git(dir, 'commit', '-m', 'add package metadata');

    git(dir, 'checkout', '-b', 'release-consumption');
    writeFileSync(
      join(dir, 'packages/nexus-agents/package.json'),
      '{"name":"nexus-agents","version":"1.0.1"}\n'
    );
    writeFileSync(join(dir, 'packages/nexus-agents/CHANGELOG.md'), '# Changelog\n\n## 1.0.1\n');
    git(dir, 'rm', '.changeset/old.md');
    git(dir, 'commit', '-am', 'chore(release): version packages');

    const result = runCheck(dir, 'main');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('No shippable source changed — changeset not required.');
  });

  it('fails with exit 1 for source-only changes without any changeset', () => {
    const dir = makeRepo();
    git(dir, 'checkout', '-b', 'fix/feature');
    writeFileSync(join(dir, 'packages/nexus-agents/src/example.ts'), 'export const a = 2;\n');
    git(dir, 'commit', '-am', 'modify source with no changeset');

    const result = runCheck(dir, 'main');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Missing changeset');
  });

  it('passes with exit 0 for test-only changes', () => {
    const dir = makeRepo();
    git(dir, 'checkout', '-b', 'fix/tests');
    writeFileSync(join(dir, 'packages/nexus-agents/src/example.test.ts'), 'test;\n');
    git(dir, 'add', '.');
    git(dir, 'commit', '-m', 'add test file');

    const result = runCheck(dir, 'main');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('No shippable source changed — changeset not required.');
  });

  it('direct main() returns 1 when shippable source is modified and only changeset is deleted', () => {
    const dir = makeRepo();
    git(dir, 'checkout', '-b', 'fix/feature');
    writeFileSync(join(dir, 'packages/nexus-agents/src/example.ts'), 'export const a = 2;\n');
    git(dir, 'rm', '.changeset/old.md');
    git(dir, 'commit', '-am', 'modify source and delete changeset');

    const exitCode = main('main', dir);
    expect(exitCode).toBe(1);
  });

  it('direct main() returns 0 when shippable source is modified and new changeset is added', () => {
    const dir = makeRepo();
    git(dir, 'checkout', '-b', 'fix/feature');
    writeFileSync(join(dir, 'packages/nexus-agents/src/example.ts'), 'export const a = 2;\n');
    writeFileSync(join(dir, '.changeset/new.md'), '---\n"nexus-agents": patch\n---\nnew change\n');
    git(dir, 'add', '.');
    git(dir, 'commit', '-m', 'modify source and add new changeset');

    const exitCode = main('main', dir);
    expect(exitCode).toBe(0);
  });

  it('direct main() returns 0 gracefully when diff fails (advisory check)', () => {
    const dir = makeRepo();
    const exitCode = main('non-existent-ref-12345', dir);
    expect(exitCode).toBe(0);
  });
});
