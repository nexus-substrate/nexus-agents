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
import { EventEmitter } from 'node:events';
import {
  isProcessTreeAlive,
  signalProcessTree,
  terminateProcessTree,
} from './process-tree-kill.js';
import { parseProcStatStartTime } from './proc-start-time.js';
import type { ICliResponseParser, ModelInfo } from './types.js';

/** The seam `signalProcessTree` takes for its OS operations. */
type ProcessTreeOps = NonNullable<Parameters<typeof signalProcessTree>[3]>;
/** A descendant as `signalProcessTree` records it. */
type KnownProcess = ReturnType<typeof signalProcessTree>[number];

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..');

/**
 * True for a zombie on Linux: dead, but not yet reaped. A container whose
 * PID 1 never reaps orphans leaves them in this state for good.
 */
function isZombie(pid: number): boolean {
  if (process.platform !== 'linux') return false;
  try {
    const stat = readFileSync(`/proc/${String(pid)}/stat`, 'utf8');
    return stat
      .slice(stat.lastIndexOf(')') + 1)
      .trim()
      .startsWith('Z');
  } catch {
    return false;
  }
}

/**
 * Only ESRCH proves a process is gone; EPERM means it exists but is not ours.
 * A zombie has already died, so it counts as gone.
 */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
  } catch (error: unknown) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
  return !isZombie(pid);
}

/**
 * A fresh copy of the module, so a test that tracks trees starts with none
 * left over from another test (the tracked set is module-global).
 */
async function freshTreeKillModule(): Promise<typeof import('./process-tree-kill.js')> {
  vi.resetModules();
  return import('./process-tree-kill.js');
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
    collectDescendantsAsync: undefined,
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

  it('reads a zombie as gone: it has died and only awaits its reaper', () => {
    const zombie = `1 (z) ${STAT_FIELDS_3_TO_21.replace(/^S/, 'Z')} 42`;
    expect(parseProcStatStartTime(zombie)).toBeUndefined();
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

  /** A tracked stand-in that the tree kill walks, then exits and closes on demand. */
  function closableChild(): { child: ChildProcess; close: () => void } {
    const child = Object.assign(new EventEmitter(), {
      pid: 4343,
      spawnfile: 'node',
      spawnargs: ['node'],
      exitCode: null as number | null,
      signalCode: null,
      kill: vi.fn(),
    });
    const close = (): void => {
      child.exitCode = 0;
      child.emit('close', 0);
    };
    return { child: child as unknown as ChildProcess, close };
  }

  it('without start times a closed tree is forgotten, so a reused PID is never SIGKILLed', async () => {
    const mod = await freshTreeKillModule();
    // PID 801 looks alive forever: without a start time, a reused PID reads the same.
    const ops: FakeOps = { ...fakeOps([801], {}), hasStartTimes: false };
    const { child, close } = closableChild();
    mod.trackProcessTree(child, ops);
    mod.signalProcessTree(child, 'SIGTERM', [], ops);
    close();

    expect(mod.signalTrackedProcessTrees('SIGKILL', ops)).toBe(0);
    expect(ops.kill).not.toHaveBeenCalledWith(801, 'SIGKILL');
  });

  it('with start times a closed tree is kept while its descendant is the same process', async () => {
    const mod = await freshTreeKillModule();
    const startTimes: Record<number, string> = { 801: '5' };
    const ops = fakeOps([801], startTimes);
    const { child, close } = closableChild();
    mod.trackProcessTree(child, ops);
    mod.signalProcessTree(child, 'SIGTERM', [], ops);
    close();

    expect(mod.signalTrackedProcessTrees('SIGKILL', ops)).toBe(1);
    expect(ops.kill).toHaveBeenCalledWith(801, 'SIGKILL');
    // Once the descendant is gone the tree is forgotten.
    delete startTimes[801];
    expect(mod.signalTrackedProcessTrees('SIGKILL', ops)).toBe(0);
  });
});

/** A spawned-looking double whose own `kill` can be inspected. */
function inspectableChild(): { child: ChildProcess; childKill: ReturnType<typeof vi.fn> } {
  const childKill = vi.fn();
  const child = Object.assign(new EventEmitter(), {
    pid: 4242,
    spawnfile: 'node',
    spawnargs: ['node'],
    exitCode: null,
    signalCode: null,
    kill: childKill,
  }) as unknown as ChildProcess;
  return { child, childKill };
}

/** Non-Linux seam ops whose async walk resolves only when `release` is called. */
function asyncOps(): { ops: FakeOps; release: (pids: number[]) => void } {
  let release: (pids: number[]) => void = () => undefined;
  const pending = new Promise<number[]>((resolve) => {
    release = resolve;
  });
  const ops: FakeOps = {
    ...fakeOps([801], {}),
    hasStartTimes: false,
    collectDescendantsAsync: vi.fn<(root: number) => Promise<number[]>>(() => pending),
  };
  return {
    ops,
    release: (pids) => {
      release(pids);
    },
  };
}

describe('asynchronous collection off Linux (#6718)', () => {
  it('collects with the async walk FIRST, and signals only once it resolves', async () => {
    const { ops, release } = asyncOps();
    const { child, childKill } = inspectableChild();

    // The escalation timer is unref'd and would only reach the fake ops.
    const pending = terminateProcessTree(child, 60_000, undefined, ops);

    expect(ops.collectDescendantsAsync).toHaveBeenCalledWith(4242);
    expect(ops.collectDescendants).not.toHaveBeenCalled();
    // Nothing is signalled while the collection is outstanding.
    expect(childKill).not.toHaveBeenCalled();
    expect(ops.kill).not.toHaveBeenCalled();

    release([901, 902]);
    await expect(pending).resolves.toEqual([
      { pid: 901, startTime: undefined },
      { pid: 902, startTime: undefined },
    ]);
    expect(childKill).toHaveBeenCalledWith('SIGTERM');
    expect(ops.kill).toHaveBeenCalledWith(901, 'SIGTERM');
    expect(ops.kill).toHaveBeenCalledWith(902, 'SIGTERM');
  });

  it('a failed async walk still signals the child, and does not reject', async () => {
    const ops: FakeOps = {
      ...fakeOps([], {}),
      hasStartTimes: false,
      collectDescendantsAsync: vi.fn<(root: number) => Promise<number[]>>(() =>
        Promise.reject(new Error('ps failed'))
      ),
    };
    const { child, childKill } = inspectableChild();

    await expect(terminateProcessTree(child, 60_000, undefined, ops)).resolves.toEqual([]);
    expect(childKill).toHaveBeenCalledWith('SIGTERM');
    expect(ops.kill).not.toHaveBeenCalled();
  });

  it('a child that exits during the async walk has its walked PIDs dropped (PID reuse)', async () => {
    const { ops, release } = asyncOps();
    const { child, childKill } = inspectableChild();

    const pending = terminateProcessTree(child, 60_000, undefined, ops);
    // Reaped while `ps` ran: the walked PIDs may now belong to a stranger's tree.
    (child as unknown as { exitCode: number }).exitCode = 0;
    release([906]);

    await expect(pending).resolves.toEqual([]);
    expect(childKill).toHaveBeenCalledWith('SIGTERM');
    // The same walk IS signalled while the child runs (the test above), so this is not vacuous.
    expect(ops.kill).not.toHaveBeenCalledWith(906, 'SIGTERM');
  });

  it('terminateProcessTree SIGTERMs only after the async walk, then escalates', async () => {
    vi.useFakeTimers();
    try {
      const { ops, release } = asyncOps();
      const { child, childKill } = inspectableChild();
      const onEscalate = vi.fn();

      const pending = terminateProcessTree(child, 1_000, onEscalate, ops);
      expect(childKill).not.toHaveBeenCalled();

      release([903]);
      await pending;
      expect(ops.kill).toHaveBeenCalledWith(903, 'SIGTERM');

      // The child never exits, so the grace timer escalates.
      await vi.advanceTimersByTimeAsync(1_001);
      expect(onEscalate).toHaveBeenCalledTimes(1);
      expect(childKill).toHaveBeenCalledWith('SIGKILL');
    } finally {
      vi.useRealTimers();
    }
  });

  it('the exit path stays synchronous: it uses the sync walk and signals before returning', async () => {
    const mod = await freshTreeKillModule();
    const { ops } = asyncOps();
    const child = Object.assign(new EventEmitter(), {
      pid: 4343,
      spawnfile: 'node',
      spawnargs: ['node'],
      exitCode: null as number | null,
      signalCode: null,
      kill: vi.fn(),
    }) as unknown as ChildProcess & { exitCode: number | null };
    mod.trackProcessTree(child, ops);
    try {
      expect(mod.signalTrackedProcessTrees('SIGKILL', ops)).toBe(1);
      expect(ops.collectDescendants).toHaveBeenCalledWith(4343);
      expect(ops.collectDescendantsAsync).not.toHaveBeenCalled();
      expect(ops.kill).toHaveBeenCalledWith(801, 'SIGKILL');
    } finally {
      // Closed without start times, the tree is forgotten, so the real exit hook skips it.
      child.exitCode = 0;
      child.emit('close', 0);
    }
  });

  it('the graceful-shutdown pass uses the async walk', async () => {
    const mod = await freshTreeKillModule();
    const { ops, release } = asyncOps();
    const child = Object.assign(new EventEmitter(), {
      pid: 4344,
      spawnfile: 'node',
      spawnargs: ['node'],
      exitCode: null as number | null,
      signalCode: null,
      kill: vi.fn(),
    }) as unknown as ChildProcess & { exitCode: number | null };
    mod.trackProcessTree(child, ops);
    try {
      const pending = mod.signalTrackedProcessTreesAsync('SIGTERM', ops);
      expect(ops.collectDescendantsAsync).toHaveBeenCalledWith(4344);
      expect(ops.kill).not.toHaveBeenCalled();
      release([904]);
      await expect(pending).resolves.toBe(1);
      expect(ops.collectDescendants).not.toHaveBeenCalled();
      expect(ops.kill).toHaveBeenCalledWith(904, 'SIGTERM');
    } finally {
      child.exitCode = 0;
      child.emit('close', 0);
    }
  });

  describe('the default seam on a mocked non-Linux platform', () => {
    const platform = Object.getOwnPropertyDescriptor(process, 'platform');
    const psOutput = '    1     0\n 4242     1\n 5001  4242\n 5002  5001\n 6000     1\n';
    const execFile = vi.fn(
      (
        _cmd: string,
        _args: readonly string[],
        _opts: unknown,
        callback: (error: Error | null, stdout: string) => void
      ) => {
        setImmediate(() => {
          callback(null, psOutput);
        });
      }
    );
    const execFileSync = vi.fn(() => psOutput);

    beforeEach(() => {
      execFile.mockClear();
      execFileSync.mockClear();
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      vi.spyOn(process, 'kill').mockImplementation(() => true);
    });

    afterEach(() => {
      if (platform !== undefined) Object.defineProperty(process, 'platform', platform);
      vi.doUnmock('node:child_process');
      vi.restoreAllMocks();
    });

    async function darwinModule(): Promise<typeof import('./process-tree-kill.js')> {
      vi.resetModules();
      vi.doMock('node:child_process', () => ({ execFile, execFileSync }));
      return import('./process-tree-kill.js');
    }

    it('the shutdown pass runs ps with execFile and a timeout, never execFileSync', async () => {
      const mod = await darwinModule();
      const child = Object.assign(new EventEmitter(), {
        pid: 4242,
        spawnfile: 'node',
        spawnargs: ['node'],
        exitCode: null as number | null,
        signalCode: null,
        kill: vi.fn(),
      }) as unknown as ChildProcess & { exitCode: number | null };
      mod.trackProcessTree(child);
      try {
        await expect(mod.signalTrackedProcessTreesAsync('SIGTERM')).resolves.toBe(1);

        expect(execFile).toHaveBeenCalledWith(
          'ps',
          ['-A', '-o', 'pid=,ppid='],
          expect.objectContaining({ timeout: 2_000 }),
          expect.any(Function)
        );
        expect(execFileSync).not.toHaveBeenCalled();
        expect(process.kill).toHaveBeenCalledWith(5001, 'SIGTERM');
        expect(process.kill).toHaveBeenCalledWith(5002, 'SIGTERM');
        expect(process.kill).not.toHaveBeenCalledWith(6000, 'SIGTERM');
      } finally {
        // Closed without start times, the tree is forgotten, so the real exit hook skips it.
        child.exitCode = 0;
        child.emit('close', 0);
      }
    });

    it('the synchronous signal (the exit hook) still uses execFileSync', async () => {
      const mod = await darwinModule();
      const { child } = inspectableChild();

      const tree = mod.signalProcessTree(child, 'SIGKILL', []);

      expect(execFileSync).toHaveBeenCalledTimes(1);
      expect(execFile).not.toHaveBeenCalled();
      expect(tree.map((entry) => entry.pid)).toEqual([5001, 5002]);
    });
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
      const mod = await freshTreeKillModule();
      const { cli, grandchild } = await spawnCliWithStubbornGrandchild();
      mod.trackProcessTree(cli);
      const closed = new Promise((r) => cli.once('close', r));

      mod.signalProcessTree(cli, 'SIGTERM', []);
      await closed;
      expect(isAlive(grandchild)).toBe(true);

      // The server-shutdown exit hook, inside the SIGKILL grace window.
      expect(mod.signalTrackedProcessTrees('SIGKILL')).toBe(1);
      await waitFor(() => !isAlive(grandchild), `grandchild ${String(grandchild)} to die`, 5_000);
      // Once its descendants are gone the tree is forgotten.
      expect(mod.signalTrackedProcessTrees('SIGKILL')).toBe(0);
    }, 20_000);

    /**
     * The REAL adapter timeout path (#6718 review): a CLI that ignores SIGTERM,
     * with a grandchild that ignores it too, must both be dead once the
     * timeout's SIGKILL grace period has passed.
     */
    async function runTimedOutCli(
      adapterModule: typeof import('./subprocess-adapter.js')
    ): Promise<void> {
      const cliPidFile = join(tmpDir, 'cli.pid');
      const grandchildPidFile = join(tmpDir, 'grandchild.pid');
      const grandchildScript =
        "process.on('SIGTERM', () => {});" +
        `require('fs').writeFileSync(${JSON.stringify(grandchildPidFile)}, String(process.pid));` +
        'setInterval(() => {}, 1000);';
      const cliScript =
        "process.on('SIGTERM', () => {});" +
        `require('child_process').spawn(process.execPath, ['-e', ${JSON.stringify(grandchildScript)}], { stdio: 'ignore' });` +
        `require('fs').writeFileSync(${JSON.stringify(cliPidFile)}, String(process.pid));` +
        'setInterval(() => {}, 1000);';

      class StubbornCli extends adapterModule.SubprocessCliAdapter {
        override readonly name = 'claude' as const;
        readonly version = '1.0.0';
        protected override readonly transientRetry = { enabled: false };
        protected readonly parser: ICliResponseParser = {
          name: 'test-parser',
          supportedVersionRange: '>=1.0.0',
          parse: (raw: string) => raw,
          extractResponse: (output: string) => output.trim() || null,
          extractUsage: () => null,
          extractSessionId: () => null,
        };
        protected getCommand(): { command: string; args: string[] } {
          return { command: process.execPath, args: ['-e', cliScript] };
        }
        override initialize(): Promise<void> {
          this.initialized = true;
          return Promise.resolve();
        }
        getModelInfo(): ModelInfo {
          return {
            id: 'm',
            name: 'm',
            contextWindow: 1,
            maxOutput: 1,
            costPerMillionInput: 0,
            costPerMillionOutput: 0,
          };
        }
      }

      const result = await new StubbornCli().execute(
        { content: 'x' },
        { timeoutMs: 2_500, allowRetry: false }
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('TIMEOUT');

      const cli = Number(readFileSync(cliPidFile, 'utf8'));
      const grandchild = Number(readFileSync(grandchildPidFile, 'utf8'));
      pids.push(cli, grandchild);
      // Both ignore SIGTERM, so each is still running right after the timeout.
      expect(isAlive(cli)).toBe(true);
      expect(isAlive(grandchild)).toBe(true);
      const limit = adapterModule.SIGKILL_GRACE_MS + 3_000;
      await waitFor(() => !isAlive(cli), `CLI ${String(cli)} to die`, limit);
      await waitFor(() => !isAlive(grandchild), `grandchild ${String(grandchild)} to die`, limit);
    }

    it('the adapter timeout path SIGKILLs a CLI and grandchild that ignore SIGTERM', async () => {
      await freshTreeKillModule();
      await runTimedOutCli(await import('./subprocess-adapter.js'));
    }, 30_000);

    // Checks only that the tree dies when the adapter is loaded as darwin.
    // That the async `ps` walk ran is the next test's check (#6718).
    it('the adapter timeout path, loaded as darwin, kills the tree', async () => {
      const platform = Object.getOwnPropertyDescriptor(process, 'platform');
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      let adapterModule: typeof import('./subprocess-adapter.js');
      try {
        vi.resetModules();
        adapterModule = await import('./subprocess-adapter.js');
      } finally {
        if (platform !== undefined) Object.defineProperty(process, 'platform', platform);
      }
      await runTimedOutCli(adapterModule);
    }, 30_000);

    it('off Linux (mocked), a real async ps walk finds and escalates the grandchild (#6718)', async () => {
      // Loaded as darwin, the default seam collects with an async `ps`, which runs for real here.
      const platform = Object.getOwnPropertyDescriptor(process, 'platform');
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      let mod: typeof import('./process-tree-kill.js');
      try {
        mod = await freshTreeKillModule();
      } finally {
        if (platform !== undefined) Object.defineProperty(process, 'platform', platform);
      }
      const { cli, grandchild } = await spawnCliWithStubbornGrandchild();

      const tree = await mod.terminateProcessTree(cli, 200);

      expect(tree).toContainEqual({ pid: grandchild, startTime: undefined });
      await waitFor(() => !isAlive(grandchild), `grandchild ${String(grandchild)} to die`, 5_000);
    }, 20_000);
  }
);
