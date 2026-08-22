/**
 * Every quality-gate check must execute in the target project (#4355).
 *
 * `runCommandCheck` called `exec(cmd, args, { timeout })` with **no `cwd`**, so
 * all four checks ran in the MCP server's own working directory. Three of them
 * partly compensated by passing `projectDir` as an argument (`--project`,
 * `eslint <dir>`, `--dir`), but `checkBuild` passed nothing at all — so
 * `pnpm build` built whatever project happened to be at the server's cwd.
 *
 * Under a global install (`npx -y nexus-agents --mode=server`) that directory
 * is arbitrary, so the build check's verdict was about an unrelated project.
 *
 * @module security/quality-gate-cwd.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const execFileMock = vi.fn();
vi.mock('node:child_process', () => ({
  execFile: (
    cmd: string,
    args: readonly string[],
    opts: unknown,
    cb: (e: unknown, r: unknown) => void
  ) => {
    execFileMock(cmd, args, opts);
    cb(null, { stdout: '', stderr: '' });
  },
}));

/**
 * A project that declares every gated script.
 *
 * Required since #4355: the checks now run the repository's OWN scripts, so a
 * directory with no package.json resolves to `unconfigured` and never execs —
 * correctly. These tests are about cwd, so they need a real project.
 */
function fixtureProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'qgate-cwd-'));
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({
      scripts: { lint: 'echo lint', typecheck: 'echo tsc', test: 'echo test', build: 'echo build' },
    }),
    'utf-8'
  );
  writeFileSync(join(dir, 'package-lock.json'), '{}', 'utf-8');
  return dir;
}

describe('quality-gate checks run in projectDir (#4355)', () => {
  let target: string;

  beforeEach(() => {
    execFileMock.mockClear();
    target = fixtureProject();
  });

  it('runs the build check inside the target project', async () => {
    const { checkBuild } = await import('./quality-gate.js');

    await checkBuild(target)();

    const opts = execFileMock.mock.calls[0]?.[2] as { cwd?: string };
    expect(opts.cwd).toBe(target);
  });

  it('runs the lint check inside the target project', async () => {
    const { checkLint } = await import('./quality-gate.js');

    await checkLint(target)();

    const opts = execFileMock.mock.calls[0]?.[2] as { cwd?: string };
    expect(opts.cwd).toBe(target);
  });

  it('runs the typecheck inside the target project', async () => {
    const { checkTypeCheck } = await import('./quality-gate.js');

    await checkTypeCheck(target)();

    const opts = execFileMock.mock.calls[0]?.[2] as { cwd?: string };
    expect(opts.cwd).toBe(target);
  });

  it('runs tests inside the target project', async () => {
    const { checkTests } = await import('./quality-gate.js');

    await checkTests(target)();

    const opts = execFileMock.mock.calls[0]?.[2] as { cwd?: string };
    expect(opts.cwd).toBe(target);
  });

  it('invokes the declared script through the lockfile manager, never npx', async () => {
    const { checkLint } = await import('./quality-gate.js');

    await checkLint(target)();

    const [cmd, args] = execFileMock.mock.calls[0] as [string, readonly string[]];
    expect(cmd).toBe('npm');
    expect(args).toEqual(['run', '--silent', 'lint']);
  });

  it('does not exec at all when the project declares no such script', async () => {
    // The #4355 report: an Oxlint repo received `npx eslint`, which downloaded
    // an unpinned ESLint and failed a project whose own lint was green.
    const { checkLint } = await import('./quality-gate.js');
    const bare = mkdtempSync(join(tmpdir(), 'qgate-bare-'));

    const result = await checkLint(bare)();

    expect(execFileMock).not.toHaveBeenCalled();
    expect(result.verdict).toBe('skip');
  });
});
