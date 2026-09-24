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

import { ChildProcess } from 'node:child_process';

/**
 * Whether the CLI is spawned as its own process-group leader. Not on Windows,
 * where `detached` means a new console window rather than a new group. The
 * child is never `unref`'d, so the parent still waits for it and its stdio is
 * unchanged.
 */
export const SPAWN_IN_OWN_PROCESS_GROUP = process.platform !== 'win32';

/**
 * The process group a child leads, when it is a real spawned process in its
 * own group. Test doubles are not `ChildProcess` instances, so they never
 * reach `process.kill` with a negative PID that might name a real group.
 */
function ownGroupId(child: ChildProcess): number | undefined {
  if (!SPAWN_IN_OWN_PROCESS_GROUP || !(child instanceof ChildProcess)) return undefined;
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
