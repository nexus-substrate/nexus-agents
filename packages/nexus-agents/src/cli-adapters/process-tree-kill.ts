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
 * @module cli-adapters/process-tree-kill
 */

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import type { ChildProcess } from 'node:child_process';

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
 * Signal the child and its descendants. The descendants are collected before
 * anything is signalled — once a parent dies its children are reparented and
 * can no longer be found through it — and merged with `known`, the set an
 * earlier call collected, so a SIGKILL escalation still reaches a grandchild
 * whose parent exited on the SIGTERM. Only those PIDs are signalled; ESRCH
 * (already gone) is ignored. Returns the PIDs signalled besides the child.
 */
export function signalProcessTree(
  child: ChildProcess,
  signal: NodeJS.Signals,
  known: readonly number[] = []
): number[] {
  const pid = child.pid;
  const fresh = isSpawnedProcess(child) && pid !== undefined ? collectDescendants(pid) : [];
  const tree = [...new Set([...known, ...fresh])];
  child.kill(signal);
  for (const descendant of tree) {
    try {
      process.kill(descendant, signal);
    } catch {
      // ESRCH: already gone.
    }
  }
  return tree;
}

/** True while the child, or any of the collected descendants, is still running. */
export function isProcessTreeAlive(child: ChildProcess, tree: readonly number[] = []): boolean {
  if (child.exitCode === null && child.signalCode === null) return true;
  return tree.some(isPidAlive);
}

/**
 * CLI process trees still running, so server shutdown can end them (#6680).
 *
 * The CLIs share the server's process group, so a signal to the whole group
 * reaches them directly. A signal to the server's PID alone does not: the
 * shutdown path SIGTERMs these trees instead, and a synchronous `exit` hook
 * SIGKILLs whatever is left.
 */
const liveTrees = new Map<ChildProcess, number[]>();
let exitHookInstalled = false;

/** Track a spawned CLI until its stdio closes, returning it. Only real spawns are tracked. */
export function trackProcessTree<T extends ChildProcess>(child: T): T {
  if (!isSpawnedProcess(child)) return child;
  liveTrees.set(child, []);
  child.once('close', () => {
    liveTrees.delete(child);
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
  let count = 0;
  for (const [child, known] of liveTrees) {
    liveTrees.set(child, signalProcessTree(child, signal, known));
    count++;
  }
  return count;
}
