/**
 * Age-based reaper for a scratch root (#4413).
 *
 * ## Why this exists
 *
 * #4412 moved the test suite's scratch off the shared `/tmp` tmpfs, because
 * that tmpfs filled and the suite failed to *collect* ~1,100 files while
 * reporting zero assertion failures — a disk fault presenting as a code fault.
 * Relocating it fixed the shared-filesystem contention but removed the one
 * property the tmpfs had: it cleared on reboot. On real disk the same leak
 * accumulates permanently instead of self-clearing, and it did — the test
 * scratch root reached 9.7 GB across 1,987 entries before anything measured it.
 *
 * This reaper is the missing half of that change.
 *
 * ## What it is not
 *
 * It is a safety net, not a licence to leak. A net that silently absorbs a
 * growing leak is worse than no net, because it converts a visible disk-full
 * failure into an invisible one. So {@link reapScratchRoot} returns a report of
 * everything it touched and {@link formatReapReport} renders it for the run
 * log: a leak shows up as a rising reap count every run, rather than as a
 * silent 9.7 GB two months later.
 *
 * For that reason the report distinguishes four outcomes that a naive
 * implementation collapses into one cheerful "cleaned up":
 *
 * | Outcome | Meaning |
 * | --- | --- |
 * | root absent | nothing was measured — the reaper never ran on a real dir |
 * | root empty | measured, and there was genuinely nothing there |
 * | swept, none stale | measured, entries exist, none old enough |
 * | reaped N | measured, and N were removed |
 *
 * "Absent" and "empty" are the two that matter: a reaper pointed at the wrong
 * path reports the first, and reporting it as success is how a guard ends up
 * aimed at a directory nothing writes to. See `.rules/development-disciplines.md`
 * ("Name the empty case") and #4580.
 *
 * @module testing/reap-scratch
 */

import { lstatSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/** One entry the reaper tried and failed to remove. */
export interface ReapFailure {
  /** Entry name, relative to the root. */
  readonly name: string;
  /** Stringified cause, for the run log. */
  readonly reason: string;
}

/** What a single sweep observed and did. Every field is measured, never assumed. */
export interface ReapReport {
  /** The root the sweep was pointed at. */
  readonly root: string;
  /** False means nothing was measured — distinct from "measured and empty". */
  readonly rootExisted: boolean;
  /** Direct children examined. */
  readonly scanned: number;
  /** Direct children removed. */
  readonly reaped: number;
  /** Direct children retained because they were newer than `maxAgeMs`. */
  readonly retained: number;
  /** Bytes freed, summed over what was actually removed. */
  readonly reclaimedBytes: number;
  /** Entries that were stale but could not be removed. */
  readonly failed: readonly ReapFailure[];
}

/** Options for {@link reapScratchRoot}. */
export interface ReapOptions {
  /** Entries strictly older than this are removed. Ties are retained. */
  readonly maxAgeMs: number;
  /** Reference time; injected so tests do not depend on the wall clock. */
  readonly now: number;
  /** Removal seam, injected so tests can simulate an unremovable entry. */
  readonly remove?: (path: string) => void;
}

/** Recursively sizes a path, treating anything unreadable as zero. */
function sizeOf(path: string): number {
  let stat;
  try {
    stat = lstatSync(path);
  } catch {
    return 0;
  }

  if (!stat.isDirectory()) return stat.size;

  let total = 0;
  let children: string[];
  try {
    children = readdirSync(path);
  } catch {
    return total;
  }
  for (const child of children) total += sizeOf(join(path, child));
  return total;
}

function defaultRemove(path: string): void {
  rmSync(path, { recursive: true, force: true });
}

/** What the sweep did with one entry. */
type SweepOutcome =
  | { kind: 'vanished' }
  | { kind: 'retained' }
  | { kind: 'reaped'; bytes: number }
  | { kind: 'failed'; reason: string };

function sweepEntry(
  path: string,
  options: Required<Omit<ReapOptions, 'remove'>> & { remove: (p: string) => void }
): SweepOutcome {
  let mtimeMs: number;
  try {
    mtimeMs = lstatSync(path).mtimeMs;
  } catch {
    // Vanished mid-sweep — another run cleaned up after itself. Not a failure.
    return { kind: 'vanished' };
  }

  // Retain on a tie: a boundary that reaps at exactly maxAge can delete a
  // concurrent run whose clock differs by a millisecond.
  if (options.now - mtimeMs <= options.maxAgeMs) return { kind: 'retained' };

  const bytes = sizeOf(path);
  try {
    options.remove(path);
    return { kind: 'reaped', bytes };
  } catch (error) {
    return { kind: 'failed', reason: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Removes direct children of `root` older than `maxAgeMs` and reports what it did.
 *
 * Only direct children are considered, and symlinks are removed as links rather
 * than followed — a stale symlink in the scratch root must not become a path out
 * of it.
 *
 * Never throws for an absent root or an unremovable entry: a failed sweep must
 * still let the run proceed, but it must say so in the report rather than
 * presenting itself as a clean one.
 */
export function reapScratchRoot(root: string, options: ReapOptions): ReapReport {
  const { maxAgeMs, now } = options;
  const remove = options.remove ?? defaultRemove;

  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return {
      root,
      rootExisted: false,
      scanned: 0,
      reaped: 0,
      retained: 0,
      reclaimedBytes: 0,
      failed: [],
    };
  }

  let reaped = 0;
  let retained = 0;
  let reclaimedBytes = 0;
  const failed: ReapFailure[] = [];

  for (const name of entries) {
    const outcome = sweepEntry(join(root, name), { maxAgeMs, now, remove });
    if (outcome.kind === 'vanished') continue;
    if (outcome.kind === 'retained') retained += 1;
    else if (outcome.kind === 'reaped') {
      reaped += 1;
      reclaimedBytes += outcome.bytes;
    } else failed.push({ name, reason: outcome.reason });
  }

  return {
    root,
    rootExisted: true,
    scanned: entries.length,
    reaped,
    retained,
    reclaimedBytes,
    failed,
  };
}

/** Renders bytes at whole-unit precision, e.g. `9.7 GB`. */
function humanBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rendered = unit === 0 ? String(value) : value.toFixed(1);
  return `${rendered} ${units[unit] ?? 'B'}`;
}

/**
 * Renders a report as one log line, keeping the four outcomes distinguishable.
 *
 * The wording is load-bearing: "absent" must never read like "clean", or a
 * reaper pointed at the wrong directory looks exactly like a working one.
 */
export function formatReapReport(report: ReapReport): string {
  const prefix = `[scratch-reaper] ${report.root}`;

  if (!report.rootExisted) return `${prefix}: absent — nothing measured`;
  if (report.scanned === 0) return `${prefix}: empty — nothing to reap`;

  const failures =
    report.failed.length > 0 ? `, ${String(report.failed.length)} failed to remove` : '';

  if (report.reaped === 0) {
    return `${prefix}: ${String(report.scanned)} entries, none older than the age limit${failures}`;
  }

  return (
    `${prefix}: reaped ${String(report.reaped)} of ${String(report.scanned)} entries, ` +
    `freed ${humanBytes(report.reclaimedBytes)}${failures}`
  );
}
