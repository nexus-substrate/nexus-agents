/**
 * Tests for the cross-process advisory file lock (#6531).
 *
 * @module utils/file-lock.test
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FileLockTimeoutError, withFileLockSync } from './file-lock.js';

describe('withFileLockSync', () => {
  let dir: string;
  let lockPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'file-lock-'));
    lockPath = join(dir, 'ledger.jsonl.lock');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('holds the lock file while the body runs and removes it afterwards', () => {
    let heldDuringBody = false;
    const value = withFileLockSync(lockPath, () => {
      heldDuringBody = existsSync(lockPath);
      return 42;
    });
    expect(value).toBe(42);
    expect(heldDuringBody).toBe(true);
    expect(existsSync(lockPath)).toBe(false);
  });

  it('releases the lock when the body throws, and rethrows', () => {
    expect(() =>
      withFileLockSync(lockPath, () => {
        throw new Error('body failed');
      })
    ).toThrow('body failed');
    expect(existsSync(lockPath)).toBe(false);
  });

  it('times out instead of entering the body while a fresh lock is held elsewhere', () => {
    writeFileSync(lockPath, 'other-holder');
    let entered = false;
    expect(() => {
      withFileLockSync(
        lockPath,
        () => {
          entered = true;
        },
        { timeoutMs: 120, staleMs: 60_000, retryMs: 10 }
      );
    }).toThrow(FileLockTimeoutError);
    expect(entered).toBe(false);
    // Someone else's lock is left alone.
    expect(readFileSync(lockPath, 'utf-8')).toBe('other-holder');
  });

  it('breaks a lock older than staleMs (a crashed holder) and proceeds', () => {
    writeFileSync(lockPath, 'crashed-holder');
    const old = new Date(Date.now() - 120_000);
    utimesSync(lockPath, old, old);
    const value = withFileLockSync(lockPath, () => 'ran', {
      timeoutMs: 1_000,
      staleMs: 60_000,
      retryMs: 10,
    });
    expect(value).toBe('ran');
    expect(existsSync(lockPath)).toBe(false);
  });

  it('does not delete a lock it no longer owns on release', () => {
    withFileLockSync(lockPath, () => {
      // Simulate our lock being broken as stale and re-acquired by another
      // process while the body ran.
      rmSync(lockPath);
      writeFileSync(lockPath, 'new-holder');
    });
    expect(readFileSync(lockPath, 'utf-8')).toBe('new-holder');
  });
});
