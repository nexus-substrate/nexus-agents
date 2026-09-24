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
 * Off Linux, `ps` runs asynchronously (#6718), so a signal pass does not block
 * the event loop for up to the `ps` timeout. The descendants are still
 * collected before anything is signalled: the async paths await the `ps`
 * result, then signal. The one synchronous `ps` left is the `exit` hook's,
 * because a `process.on('exit')` handler cannot await. On Linux the `/proc`
 * walk is synchronous everywhere; it reads small files and spawns nothing.
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
 * Known gap (#6718): a descendant that double-forked and was reparented to
 * init, or to another subreaper, before the signal is no longer in the tree,
 * so it is neither signalled nor escalated. The alternatives were weighed and
 * not adopted. A process-group or session kill cannot be used: the CLIs share
 * the server's group (#6703), and a daemon that double-forks usually calls
 * `setsid` as well. `PR_SET_CHILD_SUBREAPER` needs a `prctl` call Node does
 * not expose, so it would take a native addon or a wrapper binary. A cgroup
 * needs a delegated, writable cgroup v2 subtree, which a plain server does not
 * have. And a daemon that detached itself on purpose may be meant to outlive
 * the CLI. If a real CLI is seen leaking one, the cheapest dependency-free
 * option on Linux is to tag each spawn's environment with a unique marker and
 * match it in `/proc/<pid>/environ`, which a double fork inherits.
 *
 * @module cli-adapters/process-tree-kill
 */

import { execFile, execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import type { ChildProcess } from 'node:child_process';
import { readProcStartTime } from './proc-start-time.js';

/** Upper bound on descendants collected, so a fork bomb cannot stall the walk. */
const MAX_DESCENDANTS = 1_000;

/** `ps` arguments listing every process with its parent. */
const PS_ARGS = ['-A', '-o', 'pid=,ppid='];

/** Bound on one `ps` run, synchronous or not. */
const PS_TIMEOUT_MS = 2_000;

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

/** Parse `ps -o pid=,ppid=` output into a `ppid → children` map. */
function parsePsChildMap(out: string): Map<number, number[]> {
  const map = new Map<number, number[]>();
  for (const line of out.split('\n')) {
    const [pidText, ppidText] = line.trim().split(/\s+/);
    const pid = Number(pidText);
    const ppid = Number(ppidText);
    if (!Number.isInteger(pid) || !Number.isInteger(ppid)) continue;
    map.set(ppid, [...(map.get(ppid) ?? []), pid]);
  }
  return map;
}

/**
 * A `ppid → children` map from a SYNCHRONOUS `ps` (non-Linux POSIX), or
 * undefined when unavailable. It blocks the event loop for up to
 * {@link PS_TIMEOUT_MS}, so only the synchronous paths use it (#6718).
 */
function psChildMapSync(): Map<number, number[]> | undefined {
  if (process.platform === 'win32') return undefined;
  try {
    return parsePsChildMap(
      execFileSync('ps', PS_ARGS, { encoding: 'utf8', timeout: PS_TIMEOUT_MS })
    );
  } catch {
    return undefined;
  }
}

/** The same map from an asynchronous `ps`; resolves undefined when unavailable. */
function psChildMapAsync(): Promise<Map<number, number[]> | undefined> {
  if (process.platform === 'win32') return Promise.resolve(undefined);
  return new Promise((resolve) => {
    execFile('ps', PS_ARGS, { encoding: 'utf8', timeout: PS_TIMEOUT_MS }, (error, stdout) => {
      resolve(error === null ? parsePsChildMap(stdout) : undefined);
    });
  });
}

/** Every descendant PID of `root`, breadth-first, capped at {@link MAX_DESCENDANTS}. */
function walkDescendants(root: number, childrenOf: (pid: number) => number[]): number[] {
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

/**
 * Every descendant PID of `root`, synchronously. Empty when the platform
 * offers no way to list them.
 */
function collectDescendants(root: number): number[] {
  const useProc = process.platform === 'linux' && procChildren(root) !== undefined;
  const psMap = useProc ? undefined : psChildMapSync();
  return walkDescendants(root, (pid) => (useProc ? procChildren(pid) : psMap?.get(pid)) ?? []);
}

/** Every descendant PID of `root` from an asynchronous `ps` (#6718). */
async function collectDescendantsAsync(root: number): Promise<number[]> {
  const psMap = await psChildMapAsync();
  return walkDescendants(root, (pid) => psMap?.get(pid) ?? []);
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
  /** Every descendant PID of `root`, or empty when they cannot be listed. Synchronous. */
  readonly collectDescendants: (root: number) => number[];
  /**
   * The same without blocking the event loop, or undefined where the
   * synchronous walk does not block (Linux `/proc`). REQUIRED so every
   * producer decides; every path but the `exit` hook uses it when set (#6718).
   */
  readonly collectDescendantsAsync: ((root: number) => Promise<number[]>) | undefined;
  /** True when start times are available at all (Linux). */
  readonly hasStartTimes: boolean;
  /** The start time of `pid` now, or undefined when it cannot be read (gone). */
  readonly readStartTime: (pid: number) => string | undefined;
  readonly isPidAlive: (pid: number) => boolean;
  readonly kill: (pid: number, signal: NodeJS.Signals) => void;
}

const defaultOps: ProcessTreeOps = {
  collectDescendants,
  collectDescendantsAsync: process.platform === 'linux' ? undefined : collectDescendantsAsync,
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
 * The PID to walk for fresh descendants, or undefined when no walk may be
 * made: a test double, or a child that has exited and whose PID may already
 * name another process (#6714).
 */
function walkablePid(child: ChildProcess): number | undefined {
  return isSpawnedProcess(child) && !hasExited(child) ? child.pid : undefined;
}

/**
 * Signal the child, then `fresh` merged with `known` and the tracked set, each
 * re-verified first and skipped if its PID now names a different process
 * (#6714). ESRCH (already gone) is ignored. Returns the descendants signalled.
 */
function signalCollected(
  child: ChildProcess,
  signal: NodeJS.Signals,
  known: readonly KnownProcess[],
  fresh: readonly KnownProcess[],
  ops: ProcessTreeOps
): KnownProcess[] {
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
 * Signal the child and its descendants, synchronously. The descendants are
 * collected before anything is signalled — once a parent dies its children
 * are reparented and can no longer be found through it — and merged with
 * `known`, the set an earlier call collected, so a SIGKILL escalation still
 * reaches a grandchild whose parent exited on the SIGTERM.
 *
 * Once the child has exited no fresh walk is made and only `known` is
 * signalled (#6714). Returns the descendants still tracked: those signalled,
 * besides the child.
 *
 * Off Linux the walk is a synchronous `ps` that blocks the event loop, so in
 * production only the `exit` hook reaches this; every other path goes through
 * {@link terminateProcessTree} or {@link signalTrackedProcessTreesAsync} (#6718).
 */
export function signalProcessTree(
  child: ChildProcess,
  signal: NodeJS.Signals,
  known: readonly KnownProcess[],
  ops: ProcessTreeOps = defaultOps
): KnownProcess[] {
  const pid = walkablePid(child);
  const fresh = pid === undefined ? [] : identify(ops.collectDescendants(pid), ops);
  return signalCollected(child, signal, known, fresh, ops);
}

/**
 * Signal without blocking the event loop (#6718). When no asynchronous walk is
 * needed (`ops.collectDescendantsAsync` unset, or no walk at all) the signals
 * are sent before this returns and the tree comes back as an array, exactly as
 * {@link signalProcessTree}. Otherwise the returned promise collects FIRST and
 * signals once the collection resolves.
 */
function signalProcessTreeSoon(
  child: ChildProcess,
  signal: NodeJS.Signals,
  known: readonly KnownProcess[],
  ops: ProcessTreeOps
): KnownProcess[] | Promise<KnownProcess[]> {
  const pid = walkablePid(child);
  const collectAsync = ops.collectDescendantsAsync;
  if (pid === undefined || collectAsync === undefined) {
    return signalProcessTree(child, signal, known, ops);
  }
  return collectAsync(pid).then((pids) =>
    signalCollected(child, signal, known, identify(pids, ops), ops)
  );
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

/**
 * True once a tracked tree can be forgotten: its child has exited and no known
 * descendant is still the process that was collected. Without start times
 * (non-Linux) a live PID cannot be told from a reused one, so there a tree is
 * finished as soon as its child exits, as before #6714; retaining it could
 * leave a reused PID for the exit hook to SIGKILL.
 */
function isFinishedTree(
  child: ChildProcess,
  known: readonly KnownProcess[],
  ops: ProcessTreeOps
): boolean {
  if (!hasExited(child)) return false;
  return !ops.hasStartTimes || !isProcessTreeAlive(child, known, ops);
}

/** Forget every tracked tree that is finished. */
function pruneFinishedTrees(ops: ProcessTreeOps): void {
  for (const [child, known] of liveTrees) {
    if (isFinishedTree(child, known, ops)) liveTrees.delete(child);
  }
}

/**
 * Track a spawned CLI, returning it. Only real spawns are tracked. On Linux
 * the tree stays tracked past the child's `close` while a descendant a signal
 * already collected is still the same running process, so a shutdown inside
 * the SIGKILL grace window still reaches a grandchild that ignored the
 * SIGTERM (#6714). Elsewhere it is forgotten on `close`, as before.
 */
export function trackProcessTree<T extends ChildProcess>(
  child: T,
  ops: ProcessTreeOps = defaultOps
): T {
  if (!isSpawnedProcess(child)) return child;
  pruneFinishedTrees(ops);
  liveTrees.set(child, []);
  child.once('close', () => {
    if (isFinishedTree(child, liveTrees.get(child) ?? [], ops)) liveTrees.delete(child);
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
 * Signal every tracked CLI tree; returns how many were signalled. SYNCHRONOUS
 * because the `exit` hook cannot await, so off Linux this is the one path that
 * still runs a blocking `ps` (#6718). Each tree's collected descendants are
 * remembered, so the exit hook's SIGKILL still reaches a grandchild whose
 * parent died on the shutdown SIGTERM.
 */
export function signalTrackedProcessTrees(
  signal: NodeJS.Signals,
  ops: ProcessTreeOps = defaultOps
): number {
  pruneFinishedTrees(ops);
  let count = 0;
  for (const [child, known] of [...liveTrees]) {
    signalProcessTree(child, signal, known, ops);
    count++;
  }
  return count;
}

/**
 * {@link signalTrackedProcessTrees} for a caller that can await (the graceful
 * shutdown): off Linux each tree is collected by an asynchronous `ps` before
 * it is signalled (#6718). Resolves to how many trees were signalled.
 */
export async function signalTrackedProcessTreesAsync(
  signal: NodeJS.Signals,
  ops: ProcessTreeOps = defaultOps
): Promise<number> {
  pruneFinishedTrees(ops);
  const trees = [...liveTrees];
  await Promise.all(
    trees.map(([child, known]) => Promise.resolve(signalProcessTreeSoon(child, signal, known, ops)))
  );
  return trees.length;
}

/**
 * Grace period before a SIGTERMed tree is SIGKILLed (#3026 finding 1). 5 s
 * gives a well-behaved child time to flush state and exit, and bounds how long
 * one that ignores SIGTERM keeps running.
 */
export const SIGKILL_GRACE_MS = 5_000;

/**
 * SIGTERM the child and its descendants, then SIGKILL whatever of that tree is
 * still the same running process after `graceMs` (#6680, #6747). `onEscalate`
 * runs just before the SIGKILL, for the caller's log line. The escalation timer
 * is unref'd: a server exiting inside the grace window still reaches a tracked
 * tree through the exit hook.
 *
 * Where no asynchronous walk is needed (Linux) the SIGTERM is sent and the
 * timer armed before this returns. Off Linux the descendants are first
 * collected by an asynchronous `ps`, so the SIGTERM goes out, and the grace
 * period starts, once it resolves (#6718). Resolves to the descendants
 * signalled.
 */
export function terminateProcessTree(
  child: ChildProcess,
  graceMs: number = SIGKILL_GRACE_MS,
  onEscalate?: () => void,
  ops: ProcessTreeOps = defaultOps
): Promise<KnownProcess[]> {
  const armEscalation = (tree: KnownProcess[]): KnownProcess[] => {
    const timer = setTimeout(() => {
      if (!isProcessTreeAlive(child, tree, ops)) return;
      onEscalate?.();
      void signalProcessTreeSoon(child, 'SIGKILL', tree, ops);
    }, graceMs);
    timer.unref();
    // A descendant can outlive the child's close, so only an empty tree cancels the check.
    if (tree.length === 0) {
      child.once('close', () => {
        clearTimeout(timer);
      });
    }
    return tree;
  };
  const signalled = signalProcessTreeSoon(child, 'SIGTERM', [], ops);
  if (Array.isArray(signalled)) return Promise.resolve(armEscalation(signalled));
  return signalled.then(armEscalation);
}
