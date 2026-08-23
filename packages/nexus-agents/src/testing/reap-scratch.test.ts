/**
 * Tests for the scratch reaper (#4413).
 *
 * @module testing/reap-scratch.test
 */

import {
  existsSync,
  mkdirSync,
  lutimesSync,
  readdirSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { mkdtempOutsideRepo } from './non-repo-temp-dir.js';
import { formatReapReport, reapScratchRoot } from './reap-scratch.js';

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 7, 23, 12, 0, 0);

let root: string;
/** Every fixture root, removed in afterEach — this suite does not leak. */
const created: string[] = [];

function scratch(prefix: string): string {
  const dir = mkdtempOutsideRepo(prefix);
  created.push(dir);
  return dir;
}

beforeEach(() => {
  root = scratch('reap-test-');
});

afterEach(() => {
  while (created.length > 0) {
    const dir = created.pop();
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  }
});

/** Creates a file `ageHours` old relative to the fixed NOW. */
function agedFile(name: string, ageHours: number, bytes = 8): string {
  const p = join(root, name);
  writeFileSync(p, Buffer.alloc(bytes));
  const t = new Date(NOW - ageHours * HOUR);
  utimesSync(p, t, t);
  return p;
}

/** Creates a directory `ageHours` old holding one file of `bytes`. */
function agedDir(name: string, ageHours: number, bytes = 8): string {
  const p = join(root, name);
  mkdirSync(p);
  writeFileSync(join(p, 'inner'), Buffer.alloc(bytes));
  const t = new Date(NOW - ageHours * HOUR);
  utimesSync(p, t, t);
  return p;
}

describe('reapScratchRoot', () => {
  it('removes entries older than maxAge and keeps newer ones', () => {
    agedFile('old.so', 48);
    agedFile('fresh.so', 1);

    const report = reapScratchRoot(root, { maxAgeMs: 24 * HOUR, now: NOW });

    expect(report.reaped).toBe(1);
    expect(report.retained).toBe(1);
    expect(existsSync(join(root, 'old.so'))).toBe(false);
    expect(existsSync(join(root, 'fresh.so'))).toBe(true);
  });

  it('removes stale directories recursively and counts their bytes', () => {
    agedDir('qgate-abc', 48, 4096);

    const report = reapScratchRoot(root, { maxAgeMs: 24 * HOUR, now: NOW });

    expect(report.reaped).toBe(1);
    expect(report.reclaimedBytes).toBeGreaterThanOrEqual(4096);
    expect(readdirSync(root)).toHaveLength(0);
  });

  it('treats an entry exactly at maxAge as retained, not reaped', () => {
    // A boundary that silently reaps is a boundary that can delete a run
    // whose clock differs by a millisecond. Retain on the tie.
    agedFile('boundary.so', 24);

    const report = reapScratchRoot(root, { maxAgeMs: 24 * HOUR, now: NOW });

    expect(report.reaped).toBe(0);
    expect(report.retained).toBe(1);
  });

  it('reports an empty root as empty, distinctly from a swept root', () => {
    const empty = reapScratchRoot(root, { maxAgeMs: 24 * HOUR, now: NOW });
    expect(empty.rootExisted).toBe(true);
    expect(empty.scanned).toBe(0);
    expect(formatReapReport(empty)).toContain('empty');

    agedFile('fresh.so', 1);
    const swept = reapScratchRoot(root, { maxAgeMs: 24 * HOUR, now: NOW });
    expect(swept.scanned).toBe(1);
    expect(swept.reaped).toBe(0);
    expect(formatReapReport(swept)).not.toContain('empty');
    expect(formatReapReport(swept)).toContain('none older than');
  });

  it('reports a missing root as absent rather than throwing or claiming success', () => {
    const report = reapScratchRoot(join(root, 'does-not-exist'), {
      maxAgeMs: 24 * HOUR,
      now: NOW,
    });

    expect(report.rootExisted).toBe(false);
    expect(report.scanned).toBe(0);
    expect(report.reaped).toBe(0);
    expect(formatReapReport(report)).toContain('absent');
  });

  it('removes a stale symlink without following it', () => {
    const outside = scratch('reap-outside-');
    writeFileSync(join(outside, 'keep-me'), 'precious');
    const link = join(root, 'stale-link');
    symlinkSync(outside, link);
    // lutimes, not utimes: utimesSync follows the link and would age the
    // target instead, leaving the link itself newer than the age limit.
    const t = new Date(NOW - 48 * HOUR);
    lutimesSync(link, t, t);

    const report = reapScratchRoot(root, { maxAgeMs: 24 * HOUR, now: NOW });

    expect(report.reaped).toBe(1);
    expect(existsSync(link)).toBe(false);
    expect(existsSync(join(outside, 'keep-me'))).toBe(true);
  });

  it('continues past an entry it cannot remove and records the failure', () => {
    agedFile('removable.so', 48);
    agedFile('locked.so', 48);

    const report = reapScratchRoot(root, {
      maxAgeMs: 24 * HOUR,
      now: NOW,
      remove: (path) => {
        if (path.endsWith('locked.so')) throw new Error('EPERM');
      },
    });

    expect(report.reaped).toBe(1);
    expect(report.failed).toHaveLength(1);
    expect(report.failed[0]?.name).toBe('locked.so');
    expect(formatReapReport(report)).toContain('1 failed');
  });

  it('reports failures rather than silently reporting a clean sweep', () => {
    agedFile('locked.so', 48);

    const report = reapScratchRoot(root, {
      maxAgeMs: 24 * HOUR,
      now: NOW,
      remove: () => {
        throw new Error('EBUSY');
      },
    });

    expect(report.reaped).toBe(0);
    expect(report.failed).toHaveLength(1);
    // The whole point of the net is that it is visible when it tears.
    expect(formatReapReport(report)).toContain('failed');
  });
});
