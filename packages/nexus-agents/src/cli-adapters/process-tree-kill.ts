/**
 * Signal a CLI subprocess together with the processes it spawned (#6680).
 *
 * A CLI can relaunch itself as a child (gemini-cli does unless
 * `GEMINI_CLI_NO_RELAUNCH` is set), so signalling only the spawned PID left
 * the real worker running as an orphan after a cancel or a timeout. These
 * helpers collect the child's descendant PIDs first, then signal the child
 * and exactly those PIDs, never a process group. The CLI stays in the
 * server's process group, so a harness that kills that group, even with
 * SIGKILL, still reaches every CLI process as it did before.
 *
 * Descendants are read from `/proc/<pid>/task/<tid>/children` on Linux and
 * from `ps -A -o pid=,ppid=` on other POSIX systems. Where neither works
 * (Windows) only the direct child is signalled.
 *
 * PID reuse (#6714): a PID is only a name, and the kernel hands it out again
 * once its process is reaped. So the fresh walk is skipped once the child has
 * exited (Node reaps it at once, freeing its PID), and on Linux each
 * descendant is recorded with its start time (`/proc/<pid>/stat` field 22)
 * and re-verified before every later signal or liveness check; a mismatch or
 * an unreadable stat means the process is gone and the PID is skipped. Other
 * platforms expose no start time cheaply, so there a descendant is recorded
 * without one and signalled by PID alone, as before.
 *
 * @module cli-adapters/process-tree-kill
 */

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import type { ChildProcess } from 'node:child_process';
import { readProcStartTime } from './proc-start-time.js';

/** Upper bound on descendants collected, so a fork bomb cannot stall the walk. */
const MAX_DESCENDANTS = 1_000;

/**
 * True for a child `spawn` actually started. Duck-typed on the fields only a
 * real spawn sets: a test double lacks them, so its made-up PID is never
 * walked or signalled.
 */
function isSpawnedProcess(child: ChildProcess): boolean {
  return (
    typeof child.pid === 'number' &&
    typeof child.spawnfile === 'string' &&
    Array.isArray(child.spawnargs)
  );
}

/** Direct children of `pid` from `/proc` (Linux), or undefined when unreadable. */
function procChildren(pid: number): number[] | undefined {
  try {
    const tasks = readdirSync(`/proc/${String(pid)}/task`);
    const kids: number[] = [];
    for (const tid of tasks) {
      const raw = readFileSync(`/proc/${String(pid)}/task/${tid}/children`, 'utf8');
      for (const token of raw.split(/\s+/)) {
        const kid = Number(token);
        if (token !== '' && Number.isInteger(kid)) kids.push(kid);
      }
    }
    return kids;
  } catch {
    return undefined;
  }
}

/** A `ppid → children` map from `ps` (non-Linux POSIX), or undefined when unavailable. */
function psChildMap(): Map<number, number[]> | undefined {
  if (process.platform === 'win32') return undefined;
  try {
    const out = execFileSync('ps', ['-A', '-o', 'pid=,ppid='], {
      encoding: 'utf8',
      timeout: 2_000,
    });
    const map = new Map<number, number[]>();
    for (const line of out.split('\n')) {
      const [pidText, ppidText] = line.trim().split(/\s+/);
      const pid = Number(pidText);
      const ppid = Number(ppidText);
      if (!Number.isInteger(pid) || !Number.isInteger(ppid)) continue;
      map.set(ppid, [...(map.get(ppid) ?? []), pid]);
    }
    return map;
  } catch {
    return undefined;
  }
}

/**
 * Every descendant PID of `root`, breadth-first. Empty when the platform
 * offers no way to list them.
 */
function collectDescendants(root: number): number[] {
  const useProc = process.platform === 'linux' && procChildren(root) !== undefined;
  const psMap = useProc ? undefined : psChildMap();
  const childrenOf = (pid: number): number[] =>
    (useProc ? procChildren(pid) : psMap?.get(pid)) ?? [];
  const seen = new Set<number>([root]);
  const out: number[] = [];
  const queue = [root];
  while (queue.length > 0 && out.length < MAX_DESCENDANTS) {
    const pid = queue.shift() as number;
    for (const kid of childrenOf(pid)) {
      if (seen.has(kid)) continue;
      seen.add(kid);
      out.push(kid);
      queue.push(kid);
    }
  }
  return out;
}

/** Only ESRCH proves a process is gone; EPERM means it exists but is not ours. */
function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

/**
 * A descendant as it was when collected. `startTime` is REQUIRED so every
 * producer has to decide it: the `/proc/<pid>/stat` start time on Linux, or
 * `undefined` where the platform offers none, which means "signal by PID
 * alone" (#6714).
 */
interface KnownProcess {
  readonly pid: number;
  readonly startTime: string | undefined;
}

/** The OS operations the tree kill performs; a seam so tests can stage PID reuse. */
interface ProcessTreeOps {
  /** Every descendant PID of `root`, or empty when they cannot be listed. */
  readonly collectDescendants: (root: number) => number[];
  /** True when start times are available at all (Linux). */
  readonly hasStartTimes: boolean;
  /** The start time of `pid` now, or undefined when it cannot be read (gone). */
  readonly readStartTime: (pid: number) => string | undefined;
  readonly isPidAlive: (pid: number) => boolean;
  readonly kill: (pid: number, signal: NodeJS.Signals) => void;
}

const defaultOps: ProcessTreeOps = {
  collectDescendants,
  hasStartTimes: process.platform === 'linux',
  readStartTime: readProcStartTime,
  isPidAlive,
  kill: (pid, signal) => {
    process.kill(pid, signal);
  },
};

/**
 * Record each PID with its start time. On Linux a PID whose stat cannot be
 * read has already exited and is dropped; elsewhere none has a start time.
 */
function identify(pids: readonly number[], ops: ProcessTreeOps): KnownProcess[] {
  if (!ops.hasStartTimes) return pids.map((pid) => ({ pid, startTime: undefined }));
  const out: KnownProcess[] = [];
  for (const pid of pids) {
    const startTime = ops.readStartTime(pid);
    if (startTime !== undefined) out.push({ pid, startTime });
  }
  return out;
}

/**
 * True while `known` is still the process that was collected. A recorded
 * start time must read back identically; without one (non-Linux) only
 * whether the PID exists can be checked.
 */
function isSameProcess(known: KnownProcess, ops: ProcessTreeOps): boolean {
  if (known.startTime === undefined) return ops.isPidAlive(known.pid);
  return ops.readStartTime(known.pid) === known.startTime;
}

/** The first entry recorded for each PID, in order. */
function uniqueByPid(entries: readonly KnownProcess[]): KnownProcess[] {
  const byPid = new Map<number, KnownProcess>();
  for (const entry of entries) {
    if (!byPid.has(entry.pid)) byPid.set(entry.pid, entry);
  }
  return [...byPid.values()];
}

function hasExited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

/**
 * CLI process trees still running, so server shutdown can end them (#6680).
 *
 * The CLIs share the server's process group, so a signal to the whole group
 * reaches them directly. A signal to the server's PID alone does not: the
 * shutdown path SIGTERMs these trees instead, and a synchronous `exit` hook
 * SIGKILLs whatever is left.
 */
const liveTrees = new Map<ChildProcess, KnownProcess[]>();
let exitHookInstalled = false;

/**
 * Signal the child and its descendants. The descendants are collected before
 * anything is signalled — once a parent dies its children are reparented and
 * can no longer be found through it — and merged with `known`, the set an
 * earlier call collected, so a SIGKILL escalation still reaches a grandchild
 * whose parent exited on the SIGTERM.
 *
 * Once the child has exited its PID may already belong to another process, so
 * no fresh walk is made and only `known` is signalled; each known descendant
 * is re-verified first and skipped if its PID now names a different process
 * (#6714). ESRCH (already gone) is ignored. Returns the descendants still
 * tracked: those signalled, besides the child.
 */
export function signalProcessTree(
  child: ChildProcess,
  signal: NodeJS.Signals,
  known: readonly KnownProcess[],
  ops: ProcessTreeOps = defaultOps
): KnownProcess[] {
  const pid = child.pid;
  const walk = isSpawnedProcess(child) && pid !== undefined && !hasExited(child);
  const fresh = walk ? identify(ops.collectDescendants(pid), ops) : [];
  // A tracked tree may hold descendants an earlier signal collected (the shutdown path).
  const candidates = uniqueByPid([...known, ...(liveTrees.get(child) ?? []), ...fresh]);
  child.kill(signal);
  const tree = candidates.filter((entry) => isSameProcess(entry, ops));
  for (const entry of tree) {
    try {
      ops.kill(entry.pid, signal);
    } catch {
      // ESRCH: already gone.
    }
  }
  if (liveTrees.has(child)) liveTrees.set(child, tree);
  return tree;
}

/**
 * True while the child, or any collected descendant that is still the same
 * process (#6714), is running.
 */
export function isProcessTreeAlive(
  child: ChildProcess,
  tree: readonly KnownProcess[],
  ops: ProcessTreeOps = defaultOps
): boolean {
  if (!hasExited(child)) return true;
  return tree.some((entry) => isSameProcess(entry, ops));
}

/** Forget every tracked tree whose child and known descendants have all exited. */
function pruneFinishedTrees(): void {
  for (const [child, known] of liveTrees) {
    if (!isProcessTreeAlive(child, known)) liveTrees.delete(child);
  }
}

/**
 * Track a spawned CLI, returning it. Only real spawns are tracked. The tree
 * stays tracked past the child's `close` while a descendant a signal already
 * collected is still running, so a shutdown inside the SIGKILL grace window
 * still reaches a grandchild that ignored the SIGTERM (#6714).
 */
export function trackProcessTree<T extends ChildProcess>(child: T): T {
  if (!isSpawnedProcess(child)) return child;
  pruneFinishedTrees();
  liveTrees.set(child, []);
  child.once('close', () => {
    const known = liveTrees.get(child) ?? [];
    if (!isProcessTreeAlive(child, known)) liveTrees.delete(child);
  });
  if (!exitHookInstalled) {
    exitHookInstalled = true;
    process.on('exit', () => {
      signalTrackedProcessTrees('SIGKILL');
    });
  }
  return child;
}

/**
 * Signal every tracked CLI tree; returns how many were signalled. Synchronous.
 * Each tree's collected descendants are remembered, so the exit hook's SIGKILL
 * still reaches a grandchild whose parent died on the shutdown SIGTERM.
 */
export function signalTrackedProcessTrees(signal: NodeJS.Signals): number {
  pruneFinishedTrees();
  let count = 0;
  for (const [child, known] of [...liveTrees]) {
    signalProcessTree(child, signal, known);
    count++;
  }
  return count;
}
