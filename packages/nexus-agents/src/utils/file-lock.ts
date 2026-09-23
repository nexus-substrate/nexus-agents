/**
 * Cross-process advisory file lock (#6531).
 *
 * A lock is a sibling file created with `O_CREAT | O_EXCL` (`'wx'`), so exactly
 * one process can create it. The holder writes a unique token into it and, on
 * release, removes it only while the token is still its own — a holder whose
 * lock was broken as stale must not delete the next holder's lock.
 *
 * WHY a lock and not a bare `O_APPEND` write: an append-only ledger that stamps
 * each line with `max(sequence) + 1` has to READ the tip before it writes, and
 * `O_APPEND` makes only the write atomic. Two processes that read the same tip
 * wrote the same sequence (#6531: eight concurrent writers on a fresh ledger all
 * wrote sequence 0). The read and the append have to share one critical section.
 *
 * Synchronous on purpose: its consumer (`persistVoteRecord`) is synchronous,
 * and the critical section is one small read plus one append.
 *
 * Stale locks: a holder that crashed leaves its file behind. A lock whose mtime
 * is older than `staleMs` is broken by renaming it to a unique name (only one
 * breaker's rename of a given file succeeds) and unlinking that. Known limit: a
 * breaker that stats a stale lock, is descheduled while another process breaks
 * it and re-acquires, and then renames the NEW lock would steal it. That needs a
 * genuinely stale lock plus two simultaneous breakers inside a stat→rename gap;
 * the default `staleMs` is orders of magnitude above the critical section.
 *
 * @module utils/file-lock
 */

import {
  closeSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { randomBytes } from 'node:crypto';

/** Tuning for {@link withFileLockSync}. All values are milliseconds. */
export interface FileLockOptions {
  /** Give up acquiring after this long. Default 10 000. */
  readonly timeoutMs?: number | undefined;
  /** A lock file older than this is presumed abandoned and broken. Default 30 000. */
  readonly staleMs?: number | undefined;
  /** Base delay between acquisition attempts (jittered up to 2x). Default 15. */
  readonly retryMs?: number | undefined;
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

function errnoCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const code = (error as { readonly code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

/** Block the thread without spinning. */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
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

/** Break the lock when it is older than `staleMs`. A vanished lock is not an error. */
function breakIfStale(lockPath: string, staleMs: number): void {
  let ageMs: number;
  try {
    ageMs = Date.now() - statSync(lockPath).mtimeMs;
  } catch (error: unknown) {
    if (errnoCode(error) === 'ENOENT') return;
    throw error;
  }
  if (ageMs <= staleMs) return;
  const graveyard = `${lockPath}.stale-${String(process.pid)}-${randomBytes(4).toString('hex')}`;
  try {
    renameSync(lockPath, graveyard);
  } catch (error: unknown) {
    // Another breaker got there first.
    if (errnoCode(error) === 'ENOENT') return;
    throw error;
  }
  unlinkSync(graveyard);
}

/** Remove the lock only while it still carries this holder's token. */
function release(lockPath: string, token: string): void {
  let current: string;
  try {
    current = readFileSync(lockPath, 'utf-8');
  } catch (error: unknown) {
    if (errnoCode(error) === 'ENOENT') return;
    throw error;
  }
  if (current === token) unlinkSync(lockPath);
}

/**
 * Run `body` while holding the cross-process lock at `lockPath`.
 *
 * @throws {FileLockTimeoutError} when the lock is not acquired within `timeoutMs`;
 *   `body` has not run in that case.
 */
export function withFileLockSync<T>(
  lockPath: string,
  body: () => T,
  options: FileLockOptions = {}
): T {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const staleMs = options.staleMs ?? DEFAULT_STALE_MS;
  const retryMs = options.retryMs ?? DEFAULT_RETRY_MS;
  const token = `${String(process.pid)}:${randomBytes(8).toString('hex')}`;
  const deadline = Date.now() + timeoutMs;

  while (!tryCreate(lockPath, token)) {
    breakIfStale(lockPath, staleMs);
    if (Date.now() >= deadline) throw new FileLockTimeoutError(lockPath, timeoutMs);
    sleepSync(retryMs + Math.floor(Math.random() * retryMs));
  }
  try {
    return body();
  } finally {
    release(lockPath, token);
  }
}
