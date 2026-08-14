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

describe('quality-gate checks run in projectDir (#4355)', () => {
  beforeEach(() => {
    execFileMock.mockClear();
  });

  it('runs the build check inside the target project', async () => {
    const { checkBuild } = await import('./quality-gate.js');

    await checkBuild('/tmp/target-project')();

    const opts = execFileMock.mock.calls[0]?.[2] as { cwd?: string };
    expect(opts.cwd).toBe('/tmp/target-project');
  });

  it('runs the lint check inside the target project', async () => {
    const { checkLint } = await import('./quality-gate.js');

    await checkLint('/tmp/target-project')();

    const opts = execFileMock.mock.calls[0]?.[2] as { cwd?: string };
    expect(opts.cwd).toBe('/tmp/target-project');
  });

  it('runs the typecheck inside the target project', async () => {
    const { checkTypeCheck } = await import('./quality-gate.js');

    await checkTypeCheck('/tmp/target-project')();

    const opts = execFileMock.mock.calls[0]?.[2] as { cwd?: string };
    expect(opts.cwd).toBe('/tmp/target-project');
  });

  it('runs tests inside the target project', async () => {
    const { checkTests } = await import('./quality-gate.js');

    await checkTests('/tmp/target-project')();

    const opts = execFileMock.mock.calls[0]?.[2] as { cwd?: string };
    expect(opts.cwd).toBe('/tmp/target-project');
  });
});
