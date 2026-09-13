/**
 * Tests for producer-without-consumer gate (#3024).
 */

import { describe, it, expect } from 'vitest';
import { execFileSync, execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import {
  classifyAddedFiles,
  classifyDeadExports,
  exportedNames,
  configPathPatterns,
  importSpecifierPatterns,
  isTestSupportFile,
  nameHasProductionUse,
  resolveComparisonBase,
} from './check-new-unused-exports.js';

describe('classifyAddedFiles', () => {
  it('classifies a new source file as needing the consumer check', () => {
    const result = classifyAddedFiles(['packages/nexus-agents/src/foo/bar.ts']);
    expect(result.newSourceFiles).toEqual(['packages/nexus-agents/src/foo/bar.ts']);
    expect(result.skipped).toEqual([]);
  });

  it('skips test files', () => {
    const result = classifyAddedFiles([
      'packages/nexus-agents/src/foo/bar.test.ts',
      'packages/nexus-agents/src/foo/bar.spec.ts',
      'packages/nexus-agents/src/__tests__/baz.ts',
    ]);
    expect(result.newSourceFiles).toEqual([]);
    expect(result.skipped).toEqual([
      'packages/nexus-agents/src/foo/bar.test.ts',
      'packages/nexus-agents/src/foo/bar.spec.ts',
      'packages/nexus-agents/src/__tests__/baz.ts',
    ]);
  });

  it('skips barrel files (index.ts and src/exports/)', () => {
    const result = classifyAddedFiles([
      'packages/nexus-agents/src/foo/index.ts',
      'packages/nexus-agents/src/exports/agents.ts',
    ]);
    expect(result.newSourceFiles).toEqual([]);
    expect(result.skipped.length).toBe(2);
  });

  it('skips .d.ts declaration files', () => {
    const result = classifyAddedFiles(['packages/nexus-agents/src/foo/bar.d.ts']);
    expect(result.newSourceFiles).toEqual([]);
    expect(result.skipped).toEqual(['packages/nexus-agents/src/foo/bar.d.ts']);
  });

  it('ignores files outside packages/nexus-agents/src/', () => {
    const result = classifyAddedFiles([
      'scripts/foo.ts',
      'docs/bar.md',
      'packages/nexus-agents/test/integration.ts',
      '.changeset/foo.md',
    ]);
    expect(result.newSourceFiles).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it('handles a mixed batch correctly', () => {
    const result = classifyAddedFiles([
      'packages/nexus-agents/src/feature/handler.ts', // source — checkable
      'packages/nexus-agents/src/feature/handler.test.ts', // skipped (test)
      'packages/nexus-agents/src/feature/index.ts', // skipped (barrel)
      'scripts/migrate.ts', // ignored (outside src)
    ]);
    expect(result.newSourceFiles).toEqual(['packages/nexus-agents/src/feature/handler.ts']);
    expect(result.skipped).toEqual([
      'packages/nexus-agents/src/feature/handler.test.ts',
      'packages/nexus-agents/src/feature/index.ts',
    ]);
  });

  it('returns empty arrays for an empty input', () => {
    const result = classifyAddedFiles([]);
    expect(result.newSourceFiles).toEqual([]);
    expect(result.skipped).toEqual([]);
  });
});

describe('isTestSupportFile (#4412)', () => {
  it('treats a helper under src/testing/ as test-support', () => {
    // Its consumers are tests by design. Requiring a *production* consumer
    // would leave "mislabel it with the no-consumer-yet marker" as the only
    // way to add a test helper — a marker promising a consumer never coming.
    expect(isTestSupportFile('packages/nexus-agents/src/testing/non-repo-temp-dir.ts')).toBe(true);
  });

  it('treats a nested helper under src/testing/ as test-support', () => {
    expect(isTestSupportFile('packages/nexus-agents/src/testing/adapters/fake-cli.ts')).toBe(true);
  });

  it('does NOT treat ordinary production code as test-support', () => {
    // The narrowness is the point: this must not become a blanket exemption.
    expect(isTestSupportFile('packages/nexus-agents/src/config/nexus-tmp-dir.ts')).toBe(false);
  });

  it('does NOT match a production file merely named like testing', () => {
    expect(isTestSupportFile('packages/nexus-agents/src/cli/testing-command.ts')).toBe(false);
  });
});

describe('configPathPatterns — a build-config path reference is a consumer', () => {
  const matches = (file: string, source: string): boolean =>
    configPathPatterns(file).some((p) => p.test(source));

  it('matches a vitest globalSetup entry naming the module by path', () => {
    // `globalSetup` / `setupFiles` name a module by PATH, not by import, so
    // the import-shaped patterns never see it. Reporting a wired-up hook as
    // having no consumer left only `@export-no-consumer-yet` as an escape —
    // a marker that promises a production consumer which already existed.
    // A gate whose opt-out requires a false statement is worse than no gate.
    expect(matches('global-setup.ts', "globalSetup: ['./src/testing/global-setup.ts'],")).toBe(
      true
    );
  });

  it('matches the same reference written with a .js extension', () => {
    expect(matches('global-setup.ts', "setupFiles: ['./src/testing/global-setup.js'],")).toBe(true);
  });

  it('does not match an unquoted mention of the name', () => {
    expect(matches('global-setup.ts', '// see src/testing/global-setup.ts for details')).toBe(
      false
    );
  });

  it('does not match a different module', () => {
    expect(matches('global-setup.ts', "globalSetup: ['./src/testing/other-setup.ts'],")).toBe(
      false
    );
  });
});

describe('importSpecifierPatterns — a dynamic import is a consumer', () => {
  const matches = (file: string, source: string): boolean =>
    importSpecifierPatterns(file).some((p) => p.test(source));

  it('matches a static import', () => {
    expect(matches('doctor-live.ts', "import { run } from './cli/doctor-live.js';")).toBe(true);
  });

  it('matches an awaited dynamic import', () => {
    // The shape this gate missed. `await import(...)` is how opt-in CLI
    // subcommands are loaded here (doctor-deep, doctor-live), so a from-only
    // pattern reported a genuinely-consumed module as dead — and a gate that
    // fires on the repo's own convention trains people to use the opt-out.
    expect(matches('doctor-live.ts', "const { run } = await import('./cli/doctor-live.js');")).toBe(
      true
    );
  });

  it('matches a bare dynamic import with no await', () => {
    expect(matches('doctor-live.ts', "void import('./cli/doctor-live.js');")).toBe(true);
  });

  it('matches a dynamic import split across lines', () => {
    expect(matches('doctor-live.ts', "await import(\n  './cli/doctor-live.js'\n)")).toBe(true);
  });

  it('matches a require for CJS interop', () => {
    expect(matches('doctor-live.ts', "const m = require('./cli/doctor-live.js');")).toBe(true);
  });

  it('does not match a different file with a similar name', () => {
    expect(matches('doctor-live.ts', "import x from './cli/doctor-deep.js';")).toBe(false);
  });

  it('does not match the bare name outside an import position', () => {
    // A mention in a comment or a string is not a consumer.
    expect(matches('doctor-live.ts', '// see cli/doctor-live.js for details')).toBe(false);
  });
});

describe('classifyDeadExports — block what this PR added, report what it inherited', () => {
  const allDead = (): boolean => true;

  it('flags an export this PR added as new', () => {
    const result = classifyDeadExports(
      'f.ts',
      'export function old(): void {}',
      'export function old(): void {}\nexport function fresh(): void {}',
      allDead
    );

    expect(result.newDead.map((d) => d.name)).toEqual(['fresh']);
  });

  it('classifies an export that already existed as pre-existing', () => {
    const result = classifyDeadExports(
      'f.ts',
      'export function old(): void {}',
      'export function old(): void {}',
      allDead
    );

    expect(result.preexistingDead.map((d) => d.name)).toEqual(['old']);
    expect(result.newDead).toEqual([]);
  });

  it('does not flag an export that has a consumer', () => {
    const result = classifyDeadExports(
      'f.ts',
      '',
      'export function used(): void {}',
      (n) => n !== 'used'
    );

    expect(result.newDead).toEqual([]);
    expect(result.preexistingDead).toEqual([]);
  });

  it('separates the two kinds in one file', () => {
    // The realistic case: you touch a file carrying old debt and add one thing.
    const result = classifyDeadExports(
      'f.ts',
      'export const a = 1;',
      'export const a = 1;\nexport const b = 2;',
      allDead
    );

    expect(result.newDead.map((d) => d.name)).toEqual(['b']);
    expect(result.preexistingDead.map((d) => d.name)).toEqual(['a']);
  });

  it('treats a brand-new file as all-new', () => {
    const result = classifyDeadExports('f.ts', '', 'export type T = string;', allDead);

    expect(result.newDead.map((d) => d.name)).toEqual(['T']);
  });
});

describe('exportedNames', () => {
  it('finds each exported declaration kind', () => {
    const src = [
      'export function f(): void {}',
      'export const c = 1;',
      'export class K {}',
      'export interface I { a: string }',
      'export type T = string;',
      'export enum E { A }',
      'export async function g(): Promise<void> {}',
    ].join('\n');

    expect(exportedNames(src).sort()).toEqual(['E', 'I', 'K', 'T', 'c', 'f', 'g']);
  });

  it('ignores a non-exported declaration', () => {
    expect(exportedNames('function hidden(): void {}')).toEqual([]);
  });

  it('ignores the word export inside a comment or string', () => {
    expect(exportedNames('// export function fake(): void {}')).toEqual([]);
  });
});

describe('nameHasProductionUse', () => {
  const read = (f: string): string => ({ 'a.ts': 'uses thing()', 'b.ts': 'nothing' })[f] ?? '';

  it('counts a reference in another production file', () => {
    expect(nameHasProductionUse('thing', 'decl.ts', ['a.ts', 'b.ts'], read)).toBe(true);
  });

  it('does not count the declaring file itself', () => {
    expect(nameHasProductionUse('thing', 'a.ts', ['a.ts'], read)).toBe(false);
  });

  it('matches on a word boundary, not a substring', () => {
    const r = (): string => 'somethingElse';
    expect(nameHasProductionUse('thing', 'd.ts', ['x.ts'], r)).toBe(false);
  });
});

describe('isTestSupportFile is not a test-file predicate', () => {
  it('does NOT classify a .test.ts file as test-support', () => {
    // The distinction that bit me: isTestSupportFile means "lives in
    // src/testing/", not "is a test". Using it to filter the production
    // haystack let a test-only import count as production use — the exact
    // blindness that disqualified knip for this job.
    expect(isTestSupportFile('packages/nexus-agents/src/cli-adapters/codex-limits.test.ts')).toBe(
      false
    );
  });

  it('classifies a src/testing/ module as test-support', () => {
    expect(isTestSupportFile('packages/nexus-agents/src/testing/adapters/mock-adapter.ts')).toBe(
      true
    );
  });
});

describe('resolveComparisonBase (#5671)', () => {
  it('asks git for the merge-base of the ref and HEAD, trimmed', () => {
    const calls: string[] = [];
    const sha = resolveComparisonBase('origin/main', (cmd) => {
      calls.push(cmd);
      return 'abc123\n';
    });
    expect(calls).toEqual(['git merge-base origin/main HEAD']);
    expect(sha).toBe('abc123');
  });
});

describe('export ratchet end to end (#5671)', () => {
  const SCRIPT = resolve(__dirname, 'check-new-unused-exports.ts');
  // #5413: the fixture repo lives under tmpdir(), so neither runner works from
  // that cwd -- npx resolves tsx from the registry on a cold runner (the exact
  // cost #5411 removed), and `pnpm exec` finds no package in that workspace.
  // Invoke the repo-local binary by absolute path instead.
  const TSX = resolve(__dirname, '..', 'node_modules', '.bin', 'tsx');

  /** A repo where main deletes a dead export AFTER the PR branched. */
  function buildFixture(): string {
    const root = mkdtempSync(join(tmpdir(), 'ratchet-'));
    const git = (...args: string[]): string =>
      execFileSync('git', args, { cwd: root, encoding: 'utf-8' });
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 'ratchet@test.local');
    git('config', 'user.name', 'ratchet');
    const src = join(root, 'packages', 'nexus-agents', 'src');
    mkdirSync(src, { recursive: true });
    const foo = join(src, 'foo.ts');
    // `bar` is dead at M0 already (pre-existing debt); `keep` has a consumer.
    writeFileSync(foo, 'export const bar = 1;\nexport const keep = 2;\n');
    writeFileSync(join(src, 'use.ts'), "import { keep } from './foo.js';\nconsole.log(keep);\n");
    git('add', '.');
    git('commit', '-q', '-m', 'M0');
    git('checkout', '-q', '-b', 'pr');
    // The PR touches foo.ts without adding or removing an export.
    writeFileSync(foo, '// touched by the PR\nexport const bar = 1;\nexport const keep = 2;\n');
    git('commit', '-q', '-am', 'pr: touch foo');
    // Meanwhile main deletes the dead export.
    git('checkout', '-q', 'main');
    writeFileSync(foo, 'export const keep = 2;\n');
    git('commit', '-q', '-am', 'main: drop bar');
    git('checkout', '-q', 'pr');
    return root;
  }

  it('does not blame the PR for an export main deleted after the branch point', () => {
    const root = buildFixture();
    try {
      let stdout = '';
      let status = 0;
      try {
        stdout = execSync(`${TSX} ${SCRIPT} main`, { cwd: root, encoding: 'utf-8' });
      } catch (err) {
        const e = err as { status?: number; stdout?: string; stderr?: string };
        status = e.status ?? 1;
        stdout = `${e.stdout ?? ''}${e.stderr ?? ''}`;
      }
      // Before the fix the file list came from the merge-base but the base
      // content came from main's tip (which lacks `bar`), so `bar` read as an
      // export this PR added with no consumer — exit 1.
      expect(status).toBe(0);
      expect(stdout).not.toMatch(/Exports added by this PR with no production consumer/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);
});

describe('working tree is part of the scan (#6139)', () => {
  const SCRIPT = resolve(__dirname, 'check-new-unused-exports.ts');
  const TSX = resolve(__dirname, '..', 'node_modules', '.bin', 'tsx');
  const SRC = join('packages', 'nexus-agents', 'src');

  interface Fixture {
    root: string;
    git: (...args: string[]) => string;
    write: (rel: string, body: string) => void;
  }

  /** A repo at M0 with one consumed module; every case builds on it. */
  function buildFixture(): Fixture {
    const root = mkdtempSync(join(tmpdir(), 'ratchet-wt-'));
    const git = (...args: string[]): string =>
      execFileSync('git', args, { cwd: root, encoding: 'utf-8' });
    const write = (rel: string, body: string): void => {
      mkdirSync(join(root, dirname(rel)), { recursive: true });
      writeFileSync(join(root, rel), body);
    };
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 'ratchet@test.local');
    git('config', 'user.name', 'ratchet');
    write(join(SRC, 'foo.ts'), 'export const keep = 2;\n');
    write(join(SRC, 'use.ts'), "import { keep } from './foo.js';\nconsole.log(keep);\n");
    git('add', '.');
    git('commit', '-q', '-m', 'M0');
    return { root, git, write };
  }

  function runGate(root: string): { status: number; output: string } {
    try {
      const stdout = execSync(`${TSX} ${SCRIPT} main`, { cwd: root, encoding: 'utf-8' });
      return { status: 0, output: stdout };
    } catch (err) {
      const e = err as { status?: number; stdout?: string; stderr?: string };
      return { status: e.status ?? 1, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
    }
  }

  const DEAD = join(SRC, 'dead.ts');

  it('detects a dead export in a staged, UNCOMMITTED new file', () => {
    // The #6139 reproduction: four PRs on 2026-09-13 ran the gate before
    // committing, saw nothing, and failed it in CI. `base...HEAD` cannot see
    // the working tree, so the pre-commit run passed for the wrong reason.
    const fx = buildFixture();
    try {
      fx.write(DEAD, 'export const dead = 1;\n');
      fx.git('add', DEAD);
      const { status, output } = runGate(fx.root);
      expect(status).toBe(1);
      expect(output).toMatch(/dead\.ts/);
      expect(output).toMatch(/scanned 1 added, 0 modified source files since main/);
    } finally {
      rmSync(fx.root, { recursive: true, force: true });
    }
  }, 60_000);

  it('detects a dead export in an UNTRACKED new file', () => {
    const fx = buildFixture();
    try {
      fx.write(DEAD, 'export const dead = 1;\n');
      const { status, output } = runGate(fx.root);
      expect(status).toBe(1);
      expect(output).toMatch(/dead\.ts/);
      expect(output).toMatch(/scanned 1 added, 0 modified source files since main/);
    } finally {
      rmSync(fx.root, { recursive: true, force: true });
    }
  }, 60_000);

  it('detects a dead export added by an UNCOMMITTED edit to an existing file', () => {
    const fx = buildFixture();
    try {
      fx.write(join(SRC, 'foo.ts'), 'export const keep = 2;\nexport const orphan = 3;\n');
      const { status, output } = runGate(fx.root);
      expect(status).toBe(1);
      expect(output).toMatch(/Exports added by this PR with no production consumer \(1\)/);
      expect(output).toMatch(/foo\.ts :: orphan/);
      expect(output).toMatch(/scanned 0 added, 1 modified source files since main/);
    } finally {
      rmSync(fx.root, { recursive: true, force: true });
    }
  }, 60_000);

  it('still detects the same dead export once the file is committed (CI shape)', () => {
    const fx = buildFixture();
    try {
      fx.git('checkout', '-q', '-b', 'pr');
      fx.write(DEAD, 'export const dead = 1;\n');
      fx.git('add', DEAD);
      fx.git('commit', '-q', '-m', 'pr: add dead');
      const { status, output } = runGate(fx.root);
      expect(status).toBe(1);
      expect(output).toMatch(/dead\.ts/);
      // On a clean tree the working-tree diff and the committed diff agree:
      // the count the gate reports is the count `base...HEAD` reports.
      const committed = fx
        .git('diff', '--name-status', '--diff-filter=A', 'main...HEAD')
        .split('\n')
        .filter((l) => l.length > 0);
      expect(committed).toHaveLength(1);
      expect(output).toMatch(/scanned 1 added, 0 modified source files since main/);
    } finally {
      rmSync(fx.root, { recursive: true, force: true });
    }
  }, 60_000);

  it('names the empty case on a clean tree instead of exiting silently', () => {
    const fx = buildFixture();
    try {
      const { status, output } = runGate(fx.root);
      expect(status).toBe(0);
      expect(output).toMatch(/scanned 0 added, 0 modified source files since main/);
      expect(output).toMatch(/no source files changed since main/);
    } finally {
      rmSync(fx.root, { recursive: true, force: true });
    }
  }, 60_000);
});
