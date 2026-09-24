/**
 * Real-process tests: a CLI and the grandchild it spawns must die with the
 * MCP server, however the server is stopped (#6680, #6701).
 *
 * A child process stands in for the server, in its own process group as the
 * MCP server is under a harness. It spawns a fake CLI through the REAL
 * `SubprocessCliAdapter`, and that CLI relaunches itself as a grandchild the
 * way gemini-cli does. The CLI stays in the server's group, so a signal to the
 * group reaches it directly; a signal to the server's PID alone reaches it
 * only through the server's shutdown path or its exit hook.
 *
 * @module cli-adapters/process-tree-kill.test
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isProcessTreeAlive,
  signalProcessTree,
  signalTrackedProcessTrees,
  trackProcessTree,
} from './process-tree-kill.js';
import { parseProcStatStartTime } from './proc-start-time.js';

/** The seam `signalProcessTree` takes for its OS operations. */
type ProcessTreeOps = NonNullable<Parameters<typeof signalProcessTree>[3]>;
/** A descendant as `signalProcessTree` records it. */
type KnownProcess = ReturnType<typeof signalProcessTree>[number];

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..');

/** Only ESRCH proves a process is gone; EPERM means it exists but is not ours. */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

async function waitFor(predicate: () => boolean, what: string, limitMs: number): Promise<void> {
  const deadline = Date.now() + limitMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

type ServerMode = 'shutdown' | 'exit' | 'none';

/**
 * The stand-in server. `shutdown` wires SIGTERM to the real graceful-shutdown
 * path with an exit seam that does NOT exit, so only the shutdown's own signal
 * can end the CLI. `exit` wires SIGTERM to `process.exit`, so only the exit
 * hook can. `none` installs no handler, so only a signal the CLI receives
 * itself can.
 */
function serverScript(pidFile: string, grandchildPidFile: string): string {
  const imp = (rel: string): string => JSON.stringify(join(SRC, rel));
  const grandchild = 'setInterval(() => {}, 1000);';
  const cliScript =
    `const g = require('child_process').spawn(process.execPath, ['-e', ${JSON.stringify(grandchild)}], { stdio: 'inherit' });` +
    `require('fs').writeFileSync(${JSON.stringify(grandchildPidFile)}, String(g.pid));` +
    `require('fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));` +
    'setInterval(() => {}, 1000);';
  return `
import { SubprocessCliAdapter } from ${imp('cli-adapters/subprocess-adapter.ts')};
import { ClaudeResponseParser } from ${imp('cli-adapters/parsers/claude-parser.ts')};
import { createGracefulShutdown } from ${imp('cli-server-lifecycle.ts')};
import { createLogger } from ${imp('core/index.ts')};

class FakeCli extends SubprocessCliAdapter {
  name = 'claude';
  version = '1.0.0';
  transientRetry = { enabled: false };
  parser = new ClaudeResponseParser();
  getCommand() {
    return { command: process.execPath, args: ['-e', ${JSON.stringify(cliScript)}] };
  }
  initialize() {
    this.initialized = true;
    return Promise.resolve();
  }
  getModelInfo() {
    return { id: 'm', name: 'm', contextWindow: 1, maxOutput: 1, costPerMillionInput: 0, costPerMillionOutput: 0 };
  }
}

const mode = process.argv[2];
if (mode === 'shutdown') {
  const shutdown = createGracefulShutdown({
    cleanup: () => Promise.resolve(),
    logger: createLogger({ component: 'fixture-server' }),
    exit: () => undefined,
  });
  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
} else if (mode === 'exit') {
  process.on('SIGTERM', () => process.exit(0));
}
setInterval(() => {}, 1000);
void new FakeCli().execute({ content: 'x' }, { timeoutMs: 60_000, allowRetry: false });
`;
}

describe.skipIf(process.platform === 'win32')('CLI process trees at server stop (#6680)', () => {
  let tmpDir: string;
  let server: ChildProcess | undefined;
  const pids: number[] = [];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-tree-kill-'));
  });

  afterEach(() => {
    for (const pid of [...pids.splice(0), server?.pid]) {
      if (pid === undefined) continue;
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // Already gone.
      }
    }
    server = undefined;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Start the server and wait for its CLI and the CLI's grandchild; returns both PIDs. */
  async function startServerWithCli(
    mode: ServerMode
  ): Promise<{ cli: number; grandchild: number }> {
    const pidFile = join(tmpDir, 'cli.pid');
    const grandchildPidFile = join(tmpDir, 'grandchild.pid');
    const script = join(tmpDir, 'server.mts');
    writeFileSync(script, serverScript(pidFile, grandchildPidFile));
    // Its own group, standing in for the MCP server's group under the harness.
    server = spawn(process.execPath, ['--import', 'tsx', script, mode], {
      cwd: join(SRC, '..'),
      detached: true,
      stdio: 'ignore',
    });
    // The CLI writes its PID after the grandchild's, so both exist once it does.
    await waitFor(
      () => existsSync(pidFile) && readFileSync(pidFile, 'utf8') !== '',
      'the CLI to start',
      30_000
    );
    const cli = Number(readFileSync(pidFile, 'utf8'));
    const grandchild = Number(readFileSync(grandchildPidFile, 'utf8'));
    pids.push(cli, grandchild);
    expect(isAlive(cli)).toBe(true);
    expect(isAlive(grandchild)).toBe(true);
    return { cli, grandchild };
  }

  function serverPid(): number {
    const pid = server?.pid;
    if (pid === undefined) throw new Error('server not started');
    return pid;
  }

  async function expectBothDead(tree: { cli: number; grandchild: number }): Promise<void> {
    await waitFor(() => !isAlive(tree.cli), `CLI pid ${String(tree.cli)} to exit`, 5_000);
    await waitFor(
      () => !isAlive(tree.grandchild),
      `grandchild pid ${String(tree.grandchild)} to exit`,
      5_000
    );
  }

  it('a SIGTERM to the server alone ends both through the graceful-shutdown path', async () => {
    const tree = await startServerWithCli('shutdown');
    process.kill(serverPid(), 'SIGTERM');
    await expectBothDead(tree);
    // The exit seam never exits: the shutdown path alone ended the tree.
    expect(isAlive(serverPid())).toBe(true);
  }, 45_000);

  it('a SIGTERM to the server alone ends both through the exit hook', async () => {
    const tree = await startServerWithCli('exit');
    process.kill(serverPid(), 'SIGTERM');
    await expectBothDead(tree);
  }, 45_000);

  it("a SIGTERM to the server's group ends both", async () => {
    const tree = await startServerWithCli('none');
    process.kill(-serverPid(), 'SIGTERM');
    await expectBothDead(tree);
  }, 45_000);

  it("a SIGKILL to the server's group ends both — no handler can run (#6701)", async () => {
    const tree = await startServerWithCli('none');
    process.kill(-serverPid(), 'SIGKILL');
    await expectBothDead(tree);
  }, 45_000);
});

/** Fields 3..21 of a stat line, so the next token is field 22 (starttime). */
const STAT_FIELDS_3_TO_21 = 'S 1 1 1 0 -1 4194304 92 0 0 0 0 0 0 0 20 0 1 0';

/**
 * A stand-in that passes the "really spawned" duck-typing, so the tree kill
 * walks it — through the seam's walk, never the real /proc.
 */
function fakeSpawnedChild(exited: boolean): ChildProcess {
  return {
    pid: 4242,
    spawnfile: 'node',
    spawnargs: ['node'],
    exitCode: exited ? 0 : null,
    signalCode: null,
    kill: vi.fn(),
  } as unknown as ChildProcess;
}

interface FakeOps extends ProcessTreeOps {
  readonly kill: ReturnType<typeof vi.fn<(pid: number, signal: NodeJS.Signals) => void>>;
  readonly collectDescendants: ReturnType<typeof vi.fn<(root: number) => number[]>>;
}

/** Linux-shaped seam ops: `startTimes` is what each PID's stat reads back now. */
function fakeOps(walk: number[], startTimes: Record<number, string>): FakeOps {
  return {
    collectDescendants: vi.fn<(root: number) => number[]>(() => walk),
    hasStartTimes: true,
    readStartTime: (pid: number) => startTimes[pid],
    isPidAlive: () => true,
    kill: vi.fn<(pid: number, signal: NodeJS.Signals) => void>(),
  };
}

describe('PID identity before signalling a tree (#6714)', () => {
  it('parses starttime after the LAST paren of a comm like "a) b (c"', () => {
    const stat = `123 (a) b (c) ${STAT_FIELDS_3_TO_21} 987654 8642560 500\n`;
    expect(parseProcStatStartTime(stat)).toBe('987654');
  });

  it('parses a plain stat line, and rejects one without a comm or a field 22', () => {
    expect(parseProcStatStartTime(`1 (init) ${STAT_FIELDS_3_TO_21} 42`)).toBe('42');
    expect(parseProcStatStartTime(`1 init ${STAT_FIELDS_3_TO_21} 42`)).toBeUndefined();
    expect(parseProcStatStartTime('1 (short) S 1 2')).toBeUndefined();
  });

  it("does not walk an exited child's PID: its reused PID's children are not signalled", () => {
    const unrelated = 9_999;
    const grandchild: KnownProcess = { pid: 777, startTime: '5' };
    const ops = fakeOps([unrelated], { [unrelated]: '100', 777: '5' });

    const tree = signalProcessTree(fakeSpawnedChild(true), 'SIGKILL', [grandchild], ops);

    expect(ops.collectDescendants).not.toHaveBeenCalled();
    expect(ops.kill).not.toHaveBeenCalledWith(unrelated, 'SIGKILL');
    // The known grandchild, still the same process, IS signalled: the test is not vacuous.
    expect(ops.kill).toHaveBeenCalledWith(777, 'SIGKILL');
    expect(tree).toEqual([grandchild]);
  });

  it('walks a running child and records each descendant with its start time', () => {
    const ops = fakeOps([501, 502], { 501: '11', 502: '12' });
    const tree = signalProcessTree(fakeSpawnedChild(false), 'SIGTERM', [], ops);
    expect(ops.kill).toHaveBeenCalledWith(501, 'SIGTERM');
    expect(tree).toEqual([
      { pid: 501, startTime: '11' },
      { pid: 502, startTime: '12' },
    ]);
  });

  it('skips a known descendant whose start time changed or can no longer be read', () => {
    const reused: KnownProcess = { pid: 601, startTime: '5' };
    const gone: KnownProcess = { pid: 602, startTime: '6' };
    const same: KnownProcess = { pid: 603, startTime: '7' };
    const ops = fakeOps([], { 601: '99', 603: '7' });

    const tree = signalProcessTree(fakeSpawnedChild(true), 'SIGKILL', [reused, gone, same], ops);

    expect(ops.kill).not.toHaveBeenCalledWith(601, 'SIGKILL');
    expect(ops.kill).not.toHaveBeenCalledWith(602, 'SIGKILL');
    expect(ops.kill).toHaveBeenCalledWith(603, 'SIGKILL');
    expect(tree).toEqual([same]);
  });

  it('a reused PID does not keep the escalation armed', () => {
    const exited = fakeSpawnedChild(true);
    const known: KnownProcess[] = [{ pid: 701, startTime: '5' }];
    expect(isProcessTreeAlive(exited, known, fakeOps([], { 701: '99' }))).toBe(false);
    expect(isProcessTreeAlive(exited, known, fakeOps([], {}))).toBe(false);
    expect(isProcessTreeAlive(exited, known, fakeOps([], { 701: '5' }))).toBe(true);
    // The empty case: an exited child with no descendants is not alive.
    expect(isProcessTreeAlive(exited, [], fakeOps([], {}))).toBe(false);
  });

  it('without start times (non-Linux) a descendant is recorded and signalled by PID alone', () => {
    const ops: FakeOps = { ...fakeOps([801], {}), hasStartTimes: false };
    const tree = signalProcessTree(fakeSpawnedChild(false), 'SIGTERM', [], ops);
    expect(tree).toEqual([{ pid: 801, startTime: undefined }]);
    expect(ops.kill).toHaveBeenCalledWith(801, 'SIGTERM');
  });
});

describe.skipIf(process.platform !== 'linux')(
  'SIGKILL escalation on real processes (#6714)',
  () => {
    let tmpDir: string;
    const pids: number[] = [];

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), 'nexus-tree-kill-'));
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

    /** A CLI stand-in that dies on SIGTERM, with a grandchild that ignores it. */
    async function spawnCliWithStubbornGrandchild(): Promise<{
      cli: ChildProcess;
      grandchild: number;
    }> {
      const grandchildPidFile = join(tmpDir, 'grandchild.pid');
      const grandchild =
        "process.on('SIGTERM', () => {});" +
        `require('fs').writeFileSync(${JSON.stringify(grandchildPidFile)}, String(process.pid));` +
        'setInterval(() => {}, 1000);';
      const cliScript =
        `require('child_process').spawn(process.execPath, ['-e', ${JSON.stringify(grandchild)}], { stdio: 'ignore' });` +
        'setInterval(() => {}, 1000);';
      const cli = spawn(process.execPath, ['-e', cliScript], { stdio: 'ignore' });
      if (cli.pid !== undefined) pids.push(cli.pid);
      await waitFor(
        () => existsSync(grandchildPidFile) && readFileSync(grandchildPidFile, 'utf8') !== '',
        'the grandchild to start',
        10_000
      );
      const pid = Number(readFileSync(grandchildPidFile, 'utf8'));
      pids.push(pid);
      return { cli, grandchild: pid };
    }

    it('SIGKILLs a grandchild that ignored the SIGTERM its parent died on', async () => {
      const { cli, grandchild } = await spawnCliWithStubbornGrandchild();
      const closed = new Promise((r) => cli.once('close', r));

      const tree = signalProcessTree(cli, 'SIGTERM', []);
      expect(tree.map((entry) => entry.pid)).toContain(grandchild);
      expect(tree.every((entry) => entry.startTime !== undefined)).toBe(true);
      await closed;
      expect(isAlive(grandchild)).toBe(true);
      expect(isProcessTreeAlive(cli, tree)).toBe(true);

      signalProcessTree(cli, 'SIGKILL', tree);
      await waitFor(() => !isAlive(grandchild), `grandchild ${String(grandchild)} to die`, 5_000);
      expect(isProcessTreeAlive(cli, tree)).toBe(false);
    }, 20_000);

    it('a shutdown after the CLI closed still reaches the grandchild (grace-window gap)', async () => {
      const { cli, grandchild } = await spawnCliWithStubbornGrandchild();
      trackProcessTree(cli);
      const closed = new Promise((r) => cli.once('close', r));

      signalProcessTree(cli, 'SIGTERM', []);
      await closed;
      expect(isAlive(grandchild)).toBe(true);

      // The server-shutdown exit hook, inside the SIGKILL grace window.
      expect(signalTrackedProcessTrees('SIGKILL')).toBe(1);
      await waitFor(() => !isAlive(grandchild), `grandchild ${String(grandchild)} to die`, 5_000);
      // Once its descendants are gone the tree is forgotten.
      expect(signalTrackedProcessTrees('SIGKILL')).toBe(0);
    }, 20_000);
  }
);
