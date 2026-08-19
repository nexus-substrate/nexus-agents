/**
 * Scratch-filesystem headroom check for `nexus-agents doctor` (#4488).
 *
 * A tmpfs at 100% is invisible until something fails, and it fails badly: a
 * subprocess does its work and then dies at the *write* step, so the output is
 * lost rather than the command being refused. During a long autonomous run
 * that reads as unexplained tool failure, not a disk problem. This check makes
 * the condition visible before it bites.
 *
 * @module cli/doctor-scratch-space
 * (Source: Issue #4488)
 */

import { statfsSync } from 'node:fs';

import { getNexusTmpDir } from '../config/nexus-tmp-dir.js';

const MIB = 1024 * 1024;
const GIB = 1024 * 1024 * 1024;

/**
 * Below this, treat the filesystem as already failing.
 *
 * A single agent run writes subprocess output, prompt files, and worktrees;
 * the transcripts alone reached hundreds of MiB in the #4488 incident. Under
 * 512 MiB there is not enough room for one more run to complete.
 */
export const CRITICAL_FREE_BYTES = 512 * MIB;

/**
 * Below this, warn. Two GiB leaves room for the current run plus a margin,
 * which is roughly what the #4488 incident consumed between the first symptom
 * and total exhaustion.
 */
export const WARN_FREE_BYTES = 2 * GIB;

export type ScratchSpaceSeverity = 'ok' | 'warn' | 'critical';

export interface ScratchSpaceCheck {
  /** The scratch root whose backing filesystem was measured. */
  readonly root: string;
  /** False when the filesystem could not be interrogated at all. */
  readonly available: boolean;
  readonly freeBytes: number;
  readonly totalBytes: number;
  /** Whole-percent used, rounded. Zero when unavailable. */
  readonly percentUsed: number;
  readonly severity: ScratchSpaceSeverity;
  readonly message: string;
}

/** Subset of `statfsSync`'s result this check depends on. */
export interface StatfsReading {
  readonly bsize: number;
  readonly blocks: number;
  readonly bavail: number;
}

type StatfsFn = (path: string) => StatfsReading;

/** Renders a byte count as GiB/MiB, whichever reads better. */
function formatBytes(bytes: number): string {
  if (bytes >= GIB) return `${(bytes / GIB).toFixed(1)} GiB`;
  return `${(bytes / MIB).toFixed(0)} MiB`;
}

/**
 * Grade the reading on absolute free bytes.
 *
 * Deliberately not percentage-based. The question this check answers is "can
 * the next run write?", which is an absolute quantity: 3% free on a 4 TiB
 * volume is ~123 GiB and entirely fine, while 20% free on a 1 GiB volume is
 * not enough for one agent run. Percentage is reported for context only.
 */
function grade(freeBytes: number): ScratchSpaceSeverity {
  if (freeBytes < CRITICAL_FREE_BYTES) return 'critical';
  if (freeBytes < WARN_FREE_BYTES) return 'warn';
  return 'ok';
}

/**
 * Measure headroom on the filesystem backing the scratch root.
 *
 * Never throws: a platform without `statfs` support reports `available: false`
 * and grades `ok`, because an unreadable filesystem is not evidence of a full
 * one and doctor must not fail closed on a diagnostic.
 *
 * @param root - Scratch root to measure; defaults to the configured tmp dir.
 * @param statfs - Injection seam for tests.
 */
export function checkScratchSpace(
  root: string = getNexusTmpDir(),
  statfs: StatfsFn = statfsSync
): ScratchSpaceCheck {
  let reading: StatfsReading;
  try {
    reading = statfs(root);
  } catch {
    return {
      root,
      available: false,
      freeBytes: 0,
      totalBytes: 0,
      percentUsed: 0,
      severity: 'ok',
      message: `Scratch filesystem at ${root} could not be read (statfs unavailable)`,
    };
  }

  const totalBytes = reading.blocks * reading.bsize;
  const freeBytes = reading.bavail * reading.bsize;
  const percentUsed =
    totalBytes > 0 ? Math.round(((totalBytes - freeBytes) / totalBytes) * 100) : 100;
  const severity = grade(freeBytes);

  return {
    root,
    available: true,
    freeBytes,
    totalBytes,
    percentUsed,
    severity,
    message: `${formatBytes(freeBytes)} free of ${formatBytes(totalBytes)} (${String(percentUsed)}% used)`,
  };
}

/** Render the check as a doctor line, with remediation only when it is needed. */
export function formatScratchSpace(check: ScratchSpaceCheck): string {
  if (!check.available) {
    return `  ⚠ Scratch space: ${check.message}`;
  }

  const icon = check.severity === 'ok' ? '✓' : check.severity === 'warn' ? '⚠' : '✗';
  const line = `  ${icon} Scratch space (${check.root}): ${check.message}`;

  if (check.severity === 'ok') return line;

  // Only shown when short: an operator reading a healthy report does not need
  // instructions for a problem they do not have.
  return [
    line,
    '    A full scratch filesystem fails subprocesses at the write step, after',
    '    they have done their work, so output is lost rather than refused.',
    '    Free space, or point NEXUS_TMPDIR at a roomier filesystem.',
  ].join('\n');
}
