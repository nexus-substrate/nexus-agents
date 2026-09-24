/**
 * Signal a CLI subprocess together with the processes it spawned (#6680).
 *
 * A CLI can relaunch itself as a child (gemini-cli does unless
 * `GEMINI_CLI_NO_RELAUNCH` is set), so signalling only the spawned PID left
 * the real worker running as an orphan after a cancel or a timeout. On POSIX
 * the adapter spawns each CLI as the leader of its own process group, and
 * these helpers signal the whole group. On Windows there are no process
 * groups (and `detached` would open a console), so only the direct child is
 * signalled.
 *
 * @module cli-adapters/process-tree-kill
 */

import type { ChildProcess } from 'node:child_process';

/**
 * Whether the CLI is spawned as its own process-group leader. Not on Windows,
 * where `detached` means a new console window rather than a new group. The
 * child is never `unref`'d, so the parent still waits for it and its stdio is
 * unchanged.
 */
export const SPAWN_IN_OWN_PROCESS_GROUP = process.platform !== 'win32';

/**
 * True for a child `spawn` actually started. Duck-typed on the fields only a
 * real spawn sets, not `instanceof ChildProcess`: a test that replaces
 * `node:child_process` wholesale has no `ChildProcess` export to compare with.
 */
function isSpawnedProcess(child: ChildProcess): boolean {
  return (
    typeof child.pid === 'number' &&
    typeof child.spawnfile === 'string' &&
    Array.isArray(child.spawnargs)
  );
}

/**
 * The process group a child leads, when it is a real spawned process in its
 * own group. Test doubles lack the spawn fields, so they never
 * reach `process.kill` with a negative PID that might name a real group.
 */
function ownGroupId(child: ChildProcess): number | undefined {
  if (!SPAWN_IN_OWN_PROCESS_GROUP || !isSpawnedProcess(child)) return undefined;
  return child.pid;
}

/**
 * Send `signal` to the child, then to its whole process group. `ESRCH` from
 * the group means every member has already exited; any other failure leaves
 * the direct `child.kill` as the fallback that already ran.
 */
export function signalProcessTree(child: ChildProcess, signal: NodeJS.Signals): void {
  child.kill(signal);
  const group = ownGroupId(child);
  if (group === undefined) return;
  try {
    process.kill(-group, signal);
  } catch {
    // ESRCH: the group is gone. EPERM and others: the direct kill above stands.
  }
}

/**
 * True while the child, or any process left in its group, is still running.
 * The group check is what catches a relaunched worker whose parent exited on
 * SIGTERM while it ignored the signal.
 */
export function isProcessTreeAlive(child: ChildProcess): boolean {
  if (child.exitCode === null && child.signalCode === null) return true;
  const group = ownGroupId(child);
  if (group === undefined) return false;
  try {
    process.kill(-group, 0);
    return true;
  } catch (error: unknown) {
    // Only ESRCH proves the group is empty; EPERM means a member still exists.
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

/**
 * CLI process trees still running, so server shutdown can end them (#6680).
 *
 * Spawning each CLI in its own process group takes it out of the server's
 * group: a Ctrl-C, or a harness that SIGTERMs the server's group, no longer
 * reaches it directly. The server's shutdown path signals these instead, and
 * a synchronous `exit` hook SIGKILLs whatever is left. Neither runs when the
 * server itself is SIGKILLed; see {@link trackProcessTree}.
 */
const liveTrees = new Set<ChildProcess>();
let exitHookInstalled = false;

/**
 * Track a spawned CLI until its stdio closes, returning it. Only real children
 * in their own group are tracked. Residual gap: a SIGKILL of the server runs no handler, so
 * its CLI trees keep running. That includes a SIGKILL sent to the server's
 * whole group, which used to reach them when they shared its group (#6701).
 */
export function trackProcessTree<T extends ChildProcess>(child: T): T {
  if (ownGroupId(child) === undefined) return child;
  liveTrees.add(child);
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

/** Signal every tracked CLI tree; returns how many were signalled. Synchronous. */
export function signalTrackedProcessTrees(signal: NodeJS.Signals): number {
  let count = 0;
  for (const child of liveTrees) {
    signalProcessTree(child, signal);
    count++;
  }
  return count;
}
