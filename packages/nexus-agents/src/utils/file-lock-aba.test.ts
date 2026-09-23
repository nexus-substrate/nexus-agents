/**
 * Stale-lock ABA regression for the cross-process file lock (#6531, #6548
 * review). Real child processes, sequenced by barrier files:
 *
 *  1. a lock left by a dead process sits on disk;
 *  2. A observes it as stale, then parks (the `onStaleObserved` seam);
 *  3. B breaks the same stale lock, acquires, and holds;
 *  4. A resumes its break.
 *
 * A late break that removes whatever is at the path deletes B's live lock and
 * lets A in while B still holds it — two writers. The break must remove only
 * the lock it judged stale.
 *
 * @module utils/file-lock-aba.test
 */

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { hostname, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const lockModule = pathToFileURL(resolve(here, 'file-lock.ts')).href;
const tsxCli = createRequire(import.meta.url).resolve('tsx/cli');

/**
 * One contender. `A` parks after observing the stale lock until `go-A` exists,
 * then stamps `A-resumed` and runs its break; `B` holds the lock until
 * `release-B` exists. Each stamps when it enters and leaves its critical
 * section.
 */
const WORKER_SOURCE = `
import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { withFileLock } from ${JSON.stringify(lockModule)};
const [dir, name] = process.argv.slice(2);
const waitFor = async (file) => { while (!existsSync(join(dir, file))) await new Promise((r) => setTimeout(r, 10)); };
await withFileLock(join(dir, 'ledger.lock'), async () => {
  writeFileSync(join(dir, name + '-in'), String(Date.now()));
  writeFileSync(join(dir, name + '-token'), readFileSync(join(dir, 'ledger.lock'), 'utf-8'));
  if (name === 'B') await waitFor('release-B');
  writeFileSync(join(dir, name + '-out'), String(Date.now()));
}, {
  timeoutMs: 30000,
  staleMs: 60000,
  retryMs: 10,
  onStaleObserved: name === 'A'
    ? async () => {
        writeFileSync(join(dir, 'A-saw-stale'), '');
        await waitFor('go-A');
        writeFileSync(join(dir, 'A-resumed'), '');
      }
    : undefined,
});
`;

/**
 * Every wait in this test is bounded and names itself, so a stuck barrier fails
 * with a message instead of running into the test timeout (#6568). The budgets
 * sum to less than the test timeout.
 */
const BARRIER_MS = 20_000;
const EXIT_MS = 15_000;
/**
 * How long B keeps holding after A resumes. A's break is synchronous from
 * `A-resumed` on, and a late break that deleted B's lock would let A in on its
 * next attempt (retryMs 10, jittered to <20 ms), so this is >25x that path.
 */
const SETTLE_MS = 500;

async function waitForFile(path: string, label: string, timeoutMs = BARRIER_MS): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!existsSync(path)) {
    if (Date.now() > deadline) {
      throw new Error(`timed out after ${String(timeoutMs)}ms waiting for ${label} (${path})`);
    }
    await new Promise((r) => setTimeout(r, 10));
  }
}

/**
 * A contender and its exit. The exit promise is created AT SPAWN: a `close`
 * listener attached later misses a child that already exited, which is how
 * `exited(a)` hung whenever A exited before B's `close` was observed (#6568).
 */
interface Contender {
  readonly child: ChildProcess;
  readonly exit: Promise<number | null>;
}

function exited(contender: Contender, label: string, timeoutMs = EXIT_MS): Promise<number | null> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`timed out after ${String(timeoutMs)}ms waiting for ${label} to exit`));
    }, timeoutMs);
  });
  return Promise.race([contender.exit, timeout]).finally(() => {
    clearTimeout(timer);
  });
}

/** A pid that is certainly not running: a child that has already exited. */
function deadPid(): number {
  const done = spawnSync(process.execPath, ['-e', '']);
  if (done.pid === undefined) throw new Error('could not spawn a child for a dead pid');
  return done.pid;
}

describe('withFileLock stale-lock break (ABA, #6531)', () => {
  let dir: string;
  const children: ChildProcess[] = [];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'file-lock-aba-'));
  });

  afterEach(() => {
    for (const c of children) c.kill();
    children.length = 0;
    rmSync(dir, { recursive: true, force: true });
  });

  it('a late break does not remove the lock another process acquired after the stale one', async () => {
    const worker = join(dir, 'contender.mts');
    writeFileSync(worker, WORKER_SOURCE);
    // A lock whose owner is dead: stale by owner liveness on this host.
    // Also aged past `staleMs`, so it is stale under an age rule as well.
    writeFileSync(join(dir, 'ledger.lock'), `${hostname()}:${String(deadPid())}:crashed`);
    const old = new Date(Date.now() - 120_000);
    utimesSync(join(dir, 'ledger.lock'), old, old);
    const spawnContender = (name: string): Contender => {
      const child = spawn(process.execPath, [tsxCli, worker, dir, name], { stdio: 'ignore' });
      children.push(child);
      const exit = new Promise<number | null>((r) => child.once('close', r));
      return { child, exit };
    };

    const a = spawnContender('A');
    await waitForFile(join(dir, 'A-saw-stale'), 'A to observe the stale lock');
    const b = spawnContender('B');
    await waitForFile(join(dir, 'B-in'), 'B to acquire');

    // A resumes its break while B holds the lock.
    writeFileSync(join(dir, 'go-A'), '');
    await waitForFile(join(dir, 'A-resumed'), 'A to resume its break', 10_000);
    await new Promise((r) => setTimeout(r, SETTLE_MS));
    expect(existsSync(join(dir, 'A-in'))).toBe(false);
    expect(readFileSync(join(dir, 'ledger.lock'), 'utf-8')).toBe(
      readFileSync(join(dir, 'B-token'), 'utf-8')
    );

    writeFileSync(join(dir, 'release-B'), '');
    // Either may exit first; both exits were captured at spawn.
    expect(await exited(b, 'B')).toBe(0);
    expect(await exited(a, 'A')).toBe(0);
    // A got in only after B left.
    const aIn = Number(readFileSync(join(dir, 'A-in'), 'utf-8'));
    const bOut = Number(readFileSync(join(dir, 'B-out'), 'utf-8'));
    expect(aIn).toBeGreaterThanOrEqual(bOut);
  }, 90_000);
});
