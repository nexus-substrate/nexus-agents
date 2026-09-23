/**
 * Cross-process advisory file lock (#6531).
 *
 * A lock is a sibling file created with `O_CREAT | O_EXCL` (`'wx'`), so exactly
 * one process can create it. The holder writes a unique owner token into it —
 * `<host>:<pid>:<random>` — and on release removes it only while the token is
 * still its own.
 *
 * WHY a lock and not a bare `O_APPEND` write: an append-only ledger that stamps
 * each line with `max(sequence) + 1` has to READ the tip before it writes, and
 * `O_APPEND` makes only the write atomic. Two processes that read the same tip
 * wrote the same sequence (#6531). The read and the append share this lock.
 *
 * ASYNC (#6548 review): acquisition polls with `setTimeout`, so a contended
 * lock never blocks the event loop — the MCP server keeps serving while a vote
 * waits for the ledger.
 *
 * STALENESS. A lock is abandoned when its owner cannot release it:
 *  - owner on THIS host: stale iff its pid is no longer running. A live holder
 *    is never broken, however slow — breaking it would admit a second writer;
 *  - owner on another host, or an unreadable token (a crash between create and
 *    write, or a foreign format): stale iff older than `staleMs`.
 *
 * BREAKING WITHOUT ABA (#6548 review). "Observe stale, then remove the path" is
 * unsafe: between the two, another process may break the same stale lock and
 * acquire a fresh one, which the late remover then deletes — two writers.
 * Breakers therefore serialize on a second O_EXCL file, `<lock>.break`, and
 * under it RE-READ the lock and judge it again, removing it only if the lock
 * now at the path is itself stale. A lock acquired since the first look has a
 * live owner (or a fresh mtime) and is left alone. That judge-then-unlink is
 * safe because nothing else can change the path in between: acquirers only
 * create an ABSENT file, other breakers are excluded by `.break`, and a stale
 * owner does not release (a dead pid cannot; the cross-host/age rule is the
 * one residual — a holder slower than `staleMs` on another host).
 *
 * The `.break` file guards a few syscalls. If its owner died inside them it is
 * removed by the same liveness/age rule, without the token compare — a
 * residual that needs a crash inside that window plus two more concurrent
 * breakers.
 *
 * @module utils/file-lock
 */

import { closeSync, openSync, readFileSync, statSync, unlinkSync, writeSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { hostname } from 'node:os';

/** Tuning for {@link withFileLock}. All durations are milliseconds. */
export interface FileLockOptions {
  /** Give up acquiring after this long. Default 10 000. */
  readonly timeoutMs?: number | undefined;
  /** Age after which a lock whose owner cannot be checked is abandoned. Default 30 000. */
  readonly staleMs?: number | undefined;
  /** Base delay between acquisition attempts (jittered up to 2x). Default 15. */
  readonly retryMs?: number | undefined;
  /**
   * Test seam: runs after a lock is observed stale and before the break is
   * attempted — the window the ABA regression test parks a process in.
   */
  readonly onStaleObserved?: (() => void | Promise<void>) | undefined;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_STALE_MS = 30_000;
const DEFAULT_RETRY_MS = 15;

/** Thrown when the lock could not be acquired within `timeoutMs`. */
export class FileLockTimeoutError extends Error {
  constructor(
    readonly lockPath: string,
    readonly timeoutMs: number
  ) {
    super(`Timed out after ${String(timeoutMs)}ms waiting for lock ${lockPath}`);
    this.name = 'FileLockTimeoutError';
  }
}

/** What a lock file held when read. */
interface LockSnapshot {
  readonly token: string;
  readonly mtimeMs: number;
}

function errnoCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const code = (error as { readonly code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

function newToken(): string {
  return `${hostname()}:${String(process.pid)}:${randomBytes(8).toString('hex')}`;
}

/** One attempt: true when this call created the lock file. */
function tryCreate(lockPath: string, token: string): boolean {
  let fd: number;
  try {
    fd = openSync(lockPath, 'wx', 0o600);
  } catch (error: unknown) {
    if (errnoCode(error) === 'EEXIST') return false;
    throw error;
  }
  try {
    writeSync(fd, token);
  } finally {
    closeSync(fd);
  }
  return true;
}

/** The lock's token and mtime, or undefined when there is no lock. */
function readLock(lockPath: string): LockSnapshot | undefined {
  try {
    const { mtimeMs } = statSync(lockPath);
    return { token: readFileSync(lockPath, 'utf-8'), mtimeMs };
  } catch (error: unknown) {
    if (errnoCode(error) === 'ENOENT') return undefined;
    throw error;
  }
}

/** True while `pid` is a running process (EPERM: running, owned by another user). */
function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    return errnoCode(error) === 'EPERM';
  }
}

/** The staleness rule in the module doc. */
function isStale(lock: LockSnapshot, staleMs: number): boolean {
  const match = /^(.+):(\d+):[0-9a-z]+$/.exec(lock.token);
  if (match?.[1] === hostname()) return !isRunning(Number(match[2]));
  return Date.now() - lock.mtimeMs > staleMs;
}

/** Remove the file only while it still carries `token`. */
function removeIfOwned(path: string, token: string): void {
  if (readLock(path)?.token === token) unlinkSync(path);
}

/** Unlink, tolerating a file that is already gone. */
function unlinkIfPresent(path: string): void {
  try {
    unlinkSync(path);
  } catch (error: unknown) {
    if (errnoCode(error) !== 'ENOENT') throw error;
  }
}

/**
 * Break `lockPath` if it is stale, removing only the exact lock judged stale.
 * Returns without breaking when another breaker holds `.break`; the caller
 * retries.
 */
async function breakIfStale(
  lockPath: string,
  staleMs: number,
  onStaleObserved: FileLockOptions['onStaleObserved']
): Promise<void> {
  const seen = readLock(lockPath);
  if (seen === undefined || !isStale(seen, staleMs)) return;
  await onStaleObserved?.();

  const breakPath = `${lockPath}.break`;
  const breakToken = newToken();
  if (!tryCreate(breakPath, breakToken)) {
    const breaker = readLock(breakPath);
    if (breaker !== undefined && isStale(breaker, staleMs)) unlinkIfPresent(breakPath);
    return;
  }
  try {
    const now = readLock(lockPath);
    if (now !== undefined && isStale(now, staleMs)) {
      unlinkSync(lockPath);
    }
  } finally {
    removeIfOwned(breakPath, breakToken);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

/**
 * Run `body` while holding the cross-process lock at `lockPath`. The directory
 * holding `lockPath` must exist.
 *
 * @throws {FileLockTimeoutError} when the lock is not acquired within
 *   `timeoutMs`; `body` has not run in that case.
 */
export async function withFileLock<T>(
  lockPath: string,
  body: () => T | Promise<T>,
  options: FileLockOptions = {}
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const staleMs = options.staleMs ?? DEFAULT_STALE_MS;
  const retryMs = options.retryMs ?? DEFAULT_RETRY_MS;
  const token = newToken();
  const deadline = Date.now() + timeoutMs;
  while (!tryCreate(lockPath, token)) {
    await breakIfStale(lockPath, staleMs, options.onStaleObserved);
    if (Date.now() >= deadline) throw new FileLockTimeoutError(lockPath, timeoutMs);
    await delay(retryMs + Math.floor(Math.random() * retryMs));
  }
  try {
    return await body();
  } finally {
    removeIfOwned(lockPath, token);
  }
}
