/**
 * Scratch-filesystem headroom check for `nexus-agents doctor` (#4488).
 *
 * A tmpfs at 100% is invisible until something fails, and it fails badly: a
 * subprocess does its work and then dies at the *write* step, so the output is
 * lost rather than the command being refused. During a long autonomous run
 * that reads as unexplained tool failure, not a disk problem. This check makes
 * the condition visible before it bites.
 *
 * ## Why two roots, not one
 *
 * The check originally measured only `getNexusTmpDir()`. That is the wrong
 * filesystem for the incident it was written for: `getNexusTmpDir()` defaults
 * to `<dataDir>/tmp` inside the repo, which on the reporting machine sits on a
 * 900 GiB volume, while the #4488 outage was a **32 GiB tmpfs at `os.tmpdir()`**
 * hitting 100%. Every subprocess failed, and the check graded `ok` throughout,
 * because the volume it measured had 200 GiB free the entire time.
 *
 * So both roots are measured: the nexus scratch root and the system temp dir
 * the harness and other tooling share. They are deduplicated by device id, so
 * the common case where both live on one filesystem still reports one line.
 * The overall grade is the WORST across filesystems — a roomy nexus root must
 * never mask a starved shared one, which is exactly the masking that made the
 * original check unable to fail for its own motivating incident.
 *
 * @module cli/doctor-scratch-space
 * (Source: Issue #4488)
 */

import { statSync, statfsSync } from 'node:fs';
import { tmpdir } from 'node:os';

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

/** Which scratch root a reading describes, for operator-facing output. */
export type ScratchRootLabel = 'nexus' | 'system';

/** A scratch root to measure, paired with the label its line is reported under. */
export interface ScratchRoot {
  readonly label: ScratchRootLabel;
  readonly root: string;
}

export interface ScratchSpaceCheck {
  /** Which of the scratch roots this reading describes. */
  readonly label: ScratchRootLabel;
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
 * @param label - Which root this is, for the reported line.
 */
export function checkScratchSpace(
  root: string = getNexusTmpDir(),
  statfs: StatfsFn = statfsSync,
  label: ScratchRootLabel = 'nexus'
): ScratchSpaceCheck {
  let reading: StatfsReading;
  try {
    reading = statfs(root);
  } catch {
    return {
      label,
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
    label,
    root,
    available: true,
    freeBytes,
    totalBytes,
    percentUsed,
    severity,
    message: `${formatBytes(freeBytes)} free of ${formatBytes(totalBytes)} (${String(percentUsed)}% used)`,
  };
}

/** Resolves a path to the id of the device backing it. */
type DeviceFn = (path: string) => number;

/** Severity ranking, worst last. */
const SEVERITY_ORDER: readonly ScratchSpaceSeverity[] = ['ok', 'warn', 'critical'];

export interface ScratchFilesystemsOptions {
  /** Roots to consider; defaults to the nexus scratch root and the system temp dir. */
  readonly roots?: readonly ScratchRoot[];
  readonly statfs?: StatfsFn;
  readonly deviceOf?: DeviceFn;
}

/** The roots worth measuring by default, in reporting order. */
function defaultRoots(): readonly ScratchRoot[] {
  return [
    { label: 'nexus', root: getNexusTmpDir() },
    { label: 'system', root: tmpdir() },
  ];
}

/**
 * Measure every distinct filesystem backing a scratch root.
 *
 * Roots that resolve to the same device are measured once, keeping the common
 * single-volume machine to one line. A root whose device cannot be identified
 * is skipped rather than guessed at: it is dropped from the report entirely,
 * because a path that cannot be resolved is unmeasured, and reporting an
 * unmeasured root as healthy is the failure this whole check exists to avoid.
 */
export function checkScratchFilesystems(
  options: ScratchFilesystemsOptions = {}
): readonly ScratchSpaceCheck[] {
  const roots = options.roots ?? defaultRoots();
  const statfs = options.statfs ?? statfsSync;
  const deviceOf = options.deviceOf ?? ((path: string): number => statSync(path).dev);

  const seen = new Set<number>();
  const checks: ScratchSpaceCheck[] = [];

  for (const { label, root } of roots) {
    let device: number;
    try {
      device = deviceOf(root);
    } catch {
      continue;
    }

    if (seen.has(device)) continue;
    seen.add(device);
    checks.push(checkScratchSpace(root, statfs, label));
  }

  return checks;
}

/**
 * The worst grade across measured filesystems.
 *
 * Worst rather than first, so a roomy volume cannot mask a full one. An empty
 * list grades `ok`: nothing was measured, and absence of a reading is not
 * evidence of a full disk — doctor must not fail closed on a diagnostic.
 */
export function worstSeverity(checks: readonly ScratchSpaceCheck[]): ScratchSpaceSeverity {
  return checks.reduce<ScratchSpaceSeverity>(
    (worst, check) =>
      SEVERITY_ORDER.indexOf(check.severity) > SEVERITY_ORDER.indexOf(worst)
        ? check.severity
        : worst,
    'ok'
  );
}

/** Render every measured filesystem, one line each. */
export function formatScratchFilesystems(checks: readonly ScratchSpaceCheck[]): string {
  if (checks.length === 0) {
    return '  ⚠ Scratch space: no scratch filesystem could be identified';
  }
  return checks.map(formatScratchSpace).join('\n');
}

/** Render the check as a doctor line, with remediation only when it is needed. */
export function formatScratchSpace(check: ScratchSpaceCheck): string {
  if (!check.available) {
    return `  ⚠ Scratch space [${check.label}]: ${check.message}`;
  }

  const icon = check.severity === 'ok' ? '✓' : check.severity === 'warn' ? '⚠' : '✗';
  const line = `  ${icon} Scratch space [${check.label}] (${check.root}): ${check.message}`;

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
