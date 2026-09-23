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
 * One contender. `A` parks after observing the stale lock until `go-A` exists;
 * `B` holds the lock until `release-B` exists. Each stamps when it enters and
 * leaves its critical section.
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
    ? async () => { writeFileSync(join(dir, 'A-saw-stale'), ''); await waitFor('go-A'); }
    : undefined,
});
`;

async function waitForFile(path: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!existsSync(path)) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${path}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

function exited(child: ChildProcess): Promise<number | null> {
  return new Promise((r) => child.on('close', r));
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
    const spawnContender = (name: string): ChildProcess => {
      const child = spawn(process.execPath, [tsxCli, worker, dir, name], { stdio: 'ignore' });
      children.push(child);
      return child;
    };

    const a = spawnContender('A');
    await waitForFile(join(dir, 'A-saw-stale'));
    const b = spawnContender('B');
    await waitForFile(join(dir, 'B-in'));

    // A resumes its break while B holds the lock.
    writeFileSync(join(dir, 'go-A'), '');
    await new Promise((r) => setTimeout(r, 750));
    expect(existsSync(join(dir, 'A-in'))).toBe(false);
    expect(readFileSync(join(dir, 'ledger.lock'), 'utf-8')).toBe(
      readFileSync(join(dir, 'B-token'), 'utf-8')
    );

    writeFileSync(join(dir, 'release-B'), '');
    expect(await exited(b)).toBe(0);
    expect(await exited(a)).toBe(0);
    // A got in only after B left.
    const aIn = Number(readFileSync(join(dir, 'A-in'), 'utf-8'));
    const bOut = Number(readFileSync(join(dir, 'B-out'), 'utf-8'));
    expect(aIn).toBeGreaterThanOrEqual(bOut);
  }, 90_000);
});
