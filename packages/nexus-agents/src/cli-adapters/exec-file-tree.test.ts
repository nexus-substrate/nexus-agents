/**
 * Real-process tests for `execFileTree` (#6747): a timeout or an abort ends
 * the command AND the processes it spawned, not just the direct child.
 *
 * @module cli-adapters/exec-file-tree.test
 */

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileTree } from './exec-file-tree.js';
import { AbortError } from '../adapters/abort-utils.js';

/** Only ESRCH proves a process is gone; a zombie (dead, unreaped) counts as gone. */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
  } catch (error: unknown) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
  try {
    const stat = readFileSync(`/proc/${String(pid)}/stat`, 'utf8');
    return !stat
      .slice(stat.lastIndexOf(')') + 1)
      .trim()
      .startsWith('Z');
  } catch {
    return false;
  }
}

async function waitFor(check: () => boolean, what: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe.skipIf(process.platform !== 'linux')('execFileTree on real processes (#6747)', () => {
  let tmpDir: string;
  const pids: number[] = [];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-exec-tree-'));
  });

  afterEach(() => {
    for (const pid of pids.splice(0)) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // Already gone.
      }
    }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  /**
   * A command that spawns a grandchild which ignores SIGTERM and records its
   * PID, then waits. Returns the args for `process.execPath`.
   */
  function stubbornTreeArgs(pidFile: string): string[] {
    const grandchild =
      "process.on('SIGTERM', () => {});" +
      `require('fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));` +
      'setInterval(() => {}, 1000);';
    const parent =
      `require('child_process').spawn(process.execPath, ['-e', ${JSON.stringify(grandchild)}], { stdio: 'ignore' });` +
      'setInterval(() => {}, 1000);';
    return ['-e', parent];
  }

  async function grandchildPid(pidFile: string): Promise<number> {
    await waitFor(
      () => existsSync(pidFile) && readFileSync(pidFile, 'utf8') !== '',
      'the grandchild to start',
      10_000
    );
    const pid = Number(readFileSync(pidFile, 'utf8'));
    pids.push(pid);
    return pid;
  }

  it('resolves with stdout when the command succeeds', async () => {
    const { stdout } = await execFileTree(process.execPath, ['-e', 'process.stdout.write("hi")'], {
      timeoutMs: 10_000,
    });
    expect(stdout).toBe('hi');
  });

  it('rejects with the exit failure when the command fails', async () => {
    await expect(
      execFileTree(process.execPath, ['-e', 'process.exit(3)'], { timeoutMs: 10_000 })
    ).rejects.toThrow(/Command failed/);
  });

  it('never spawns when the signal has already fired', async () => {
    const controller = new AbortController();
    controller.abort('cancelled');
    const marker = join(tmpDir, 'ran');
    await expect(
      execFileTree(
        process.execPath,
        ['-e', `require('fs').writeFileSync(${JSON.stringify(marker)}, 'x')`],
        { timeoutMs: 10_000, signal: controller.signal }
      )
    ).rejects.toBeInstanceOf(AbortError);
    await new Promise((r) => setTimeout(r, 300));
    expect(existsSync(marker)).toBe(false);
  });

  it('an abort ends the child and a grandchild that ignores SIGTERM', async () => {
    const pidFile = join(tmpDir, 'gc.pid');
    const controller = new AbortController();
    const graceMs = 500;
    const run = execFileTree(process.execPath, stubbornTreeArgs(pidFile), {
      timeoutMs: 60_000,
      signal: controller.signal,
      graceMs,
    });
    const settled = run.catch((e: unknown) => e);
    const grandchild = await grandchildPid(pidFile);

    controller.abort('cancelled by test');
    const error = await settled;
    expect(error).toBeInstanceOf(AbortError);
    await waitFor(() => !isAlive(grandchild), 'the grandchild to die', graceMs + 3_000);
  }, 20_000);

  it('a timeout ends the tree and rejects with a timed-out error', async () => {
    const pidFile = join(tmpDir, 'gc.pid');
    const graceMs = 500;
    const settled = execFileTree(process.execPath, stubbornTreeArgs(pidFile), {
      timeoutMs: 1_500,
      graceMs,
    }).catch((e: unknown) => e);
    const grandchild = await grandchildPid(pidFile);

    const error = await settled;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/timed out after 1500ms/);
    expect(error).not.toBeInstanceOf(AbortError);
    await waitFor(() => !isAlive(grandchild), 'the grandchild to die', graceMs + 3_000);
  }, 20_000);
});
