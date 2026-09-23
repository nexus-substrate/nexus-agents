/**
 * Tests for the cross-process advisory file lock (#6531). The cross-process
 * ABA case is in `file-lock-aba.test.ts`.
 *
 * @module utils/file-lock.test
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FileLockTimeoutError, withFileLock } from './file-lock.js';

/** A pid that is certainly not running: a child that has already exited. */
function deadPid(): number {
  const done = spawnSync(process.execPath, ['-e', '']);
  if (done.pid === undefined) throw new Error('could not spawn a child for a dead pid');
  return done.pid;
}

function age(path: string, ms: number): void {
  const then = new Date(Date.now() - ms);
  utimesSync(path, then, then);
}

const FAST = { timeoutMs: 150, staleMs: 60_000, retryMs: 10 } as const;

describe('withFileLock', () => {
  let dir: string;
  let lockPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'file-lock-'));
    lockPath = join(dir, 'ledger.jsonl.lock');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('holds the lock file while the body runs and removes it afterwards', async () => {
    let heldDuringBody = false;
    const value = await withFileLock(lockPath, () => {
      heldDuringBody = existsSync(lockPath);
      return 42;
    });
    expect(value).toBe(42);
    expect(heldDuringBody).toBe(true);
    expect(existsSync(lockPath)).toBe(false);
  });

  it('releases the lock when the body throws, and rethrows', async () => {
    await expect(
      withFileLock(lockPath, () => {
        throw new Error('body failed');
      })
    ).rejects.toThrow('body failed');
    expect(existsSync(lockPath)).toBe(false);
  });

  it('times out without entering the body while a live process on this host holds the lock', async () => {
    // Aged far past staleMs: a live holder is never broken, however old.
    const live = `${hostname()}:${String(process.pid)}:live`;
    writeFileSync(lockPath, live);
    age(lockPath, 3_600_000);
    let entered = false;
    await expect(
      withFileLock(
        lockPath,
        () => {
          entered = true;
        },
        FAST
      )
    ).rejects.toThrow(FileLockTimeoutError);
    expect(entered).toBe(false);
    expect(readFileSync(lockPath, 'utf-8')).toBe(live);
  });

  it('breaks a fresh lock whose owner on this host is dead', async () => {
    writeFileSync(lockPath, `${hostname()}:${String(deadPid())}:crashed`);
    expect(await withFileLock(lockPath, () => 'ran', FAST)).toBe('ran');
    expect(existsSync(lockPath)).toBe(false);
  });

  it('breaks an unreadable or foreign-host lock only once it is older than staleMs', async () => {
    writeFileSync(lockPath, 'other-host:1:abc');
    await expect(withFileLock(lockPath, () => 'ran', FAST)).rejects.toThrow(FileLockTimeoutError);
    age(lockPath, 120_000);
    expect(await withFileLock(lockPath, () => 'ran', FAST)).toBe('ran');
  });

  it('clears an abandoned break marker left by a dead breaker', async () => {
    writeFileSync(lockPath, `${hostname()}:${String(deadPid())}:crashed`);
    writeFileSync(`${lockPath}.break`, `${hostname()}:${String(deadPid())}:crashed`);
    expect(await withFileLock(lockPath, () => 'ran', { ...FAST, timeoutMs: 1_000 })).toBe('ran');
    expect(existsSync(`${lockPath}.break`)).toBe(false);
  });

  it('does not delete a lock it no longer owns on release', async () => {
    await withFileLock(lockPath, () => {
      // Our lock was replaced by another holder while the body ran.
      rmSync(lockPath);
      writeFileSync(lockPath, 'new-holder');
    });
    expect(readFileSync(lockPath, 'utf-8')).toBe('new-holder');
  });
});
