/**
 * nexus-agents/mcp — PR-Review Large-Diff Budget Packer (#4140, epic #4130).
 *
 * Option A of the large-diff affordance: when a PR diff exceeds the voter PANEL
 * budget (`MAX_DIFF_LENGTH`), pack it down to a REAL, security-prioritized subset
 * of WHOLE files instead of hard-failing at the schema or lossily hand-truncating
 * mid-hunk. A packed review is honestly labeled PARTIAL and (per the #4140 C1
 * gate wired in pr-review-tool.ts) is BARRED from a verified-approve — it can
 * BLOCK on a reviewed file but never verified-APPROVE.
 *
 * This module is PURE, deterministic, and I/O-free: no model call, no filesystem,
 * no clock. It is unit-testable in isolation and reused by `executePrReviewBody`.
 *
 * FILE-BOUNDARY SAFETY is the load-bearing invariant. `splitByFile` splits only on
 * `^diff --git ` file headers, so each unit is a whole file's hunk-set. The packer
 * includes each file WHOLE or drops it — worst case a single over-budget file is
 * included TRUNCATED with an explicit marker AND still listed as partially-seen. A
 * voter never receives a corrupted mid-hunk fragment that reads as complete.
 *
 * NOT built here (deferred): the exhaustive multi-pass arm (#4151), file-fetch
 * (#4152), and any scored/weighted ranker. Ordering is a documented two-tier
 * partition (sensitive-path files first, stable; then the rest in diff order) —
 * NOT a score.
 *
 * @module mcp/tools/pr-review-diff-budget
 */

import type { PrReviewAggregate } from './pr-review-tool.js';

/** One whole file's slice of a unified diff (header + all its hunks). */
export interface DiffFile {
  /** Destination path from the `diff --git a/<x> b/<path>` header (best-effort). */
  readonly path: string;
  /** The exact bytes of this file's diff segment, verbatim from the input. */
  readonly text: string;
  /** UTF-8 byte length of `text` — the budgeting unit. */
  readonly bytes: number;
}

/** Result of {@link securityFirstPack}. */
export interface DiffPackResult {
  /** The concatenated diff text of the reviewed (included) files, in packed order. */
  readonly packed: string;
  /** Paths of files included in `packed` (whole, or the one truncated head). */
  readonly reviewedFiles: string[];
  /** Total number of files in the original diff. */
  readonly totalFiles: number;
  /** Paths of files NOT fully reviewed (dropped, or the truncated head — honest). */
  readonly droppedFiles: string[];
  /** True when at least one file was dropped/truncated (coverage is incomplete). */
  readonly partial: boolean;
}

/**
 * Documented sensitive-path signals. A file whose path contains ANY of these
 * substrings (case-insensitive) is ordered FIRST in the pack so the highest-risk
 * changes are the ones that survive a tight budget. This is a small, auditable
 * const list — deliberately NOT scored weights (a ranker is deferred, #4140). Add
 * a substring here to raise a path class into the security-first tier.
 */
export const SENSITIVE_PATH_PATTERNS: readonly string[] = Object.freeze([
  'auth',
  'crypto',
  'secret',
  'credential',
  'security',
  'exec',
  'spawn',
  'password',
  'token',
  '.env',
  'permission',
  'sql',
]);

/** Whether a file path matches any {@link SENSITIVE_PATH_PATTERNS} substring. */
function isSensitivePath(path: string): boolean {
  const lower = path.toLowerCase();
  return SENSITIVE_PATH_PATTERNS.some((p) => lower.includes(p));
}

/** UTF-8 byte length helper (the budgeting unit). */
function byteLen(text: string): number {
  return Buffer.byteLength(text, 'utf-8');
}

/**
 * Extract the reviewed (destination) path from a file segment's `diff --git` header
 * line: `diff --git a/<old> b/<new>`. Prefers the `b/<new>` path (correct for
 * rename-only entries). Falls back to the raw header remainder when the shape is
 * unusual (mode-only / binary / malformed) — the segment is still kept WHOLE, so a
 * degraded path label never corrupts content.
 */
function extractPath(fileText: string): string {
  const nl = fileText.indexOf('\n');
  const firstLine = nl === -1 ? fileText : fileText.slice(0, nl);
  const m = /^diff --git a\/(.+?) b\/(.+)$/.exec(firstLine);
  if (m !== null) return m[2] as string;
  return firstLine.replace(/^diff --git\s*/, '').trim();
}

/**
 * Split a unified diff into whole-file segments on `^diff --git ` boundaries
 * (multiline). Each returned {@link DiffFile} is a complete file segment — header
 * plus every hunk up to the next file header — so the packer can only ever include
 * or drop a WHOLE file, never a mid-hunk fragment. Robust to rename-only, mode-only,
 * `Binary files … differ`, and `\ No newline at end of file` entries (they live
 * inside a segment and are carried verbatim).
 *
 * Edge cases, all fragment-safe:
 *  - Content BEFORE the first `diff --git` (rare preamble) becomes a `(preamble)`
 *    segment kept in original order — carried whole, never corrupted.
 *  - A diff with NO `diff --git` header at all becomes one `(unstructured)` segment
 *    (kept whole or dropped as a unit).
 *  - Empty input → `[]`.
 */
export function splitByFile(diff: string): DiffFile[] {
  if (diff.length === 0) return [];

  const headerRe = /^diff --git .*$/gm;
  const starts: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = headerRe.exec(diff)) !== null) {
    starts.push(m.index);
  }

  if (starts.length === 0) {
    return [{ path: '(unstructured)', text: diff, bytes: byteLen(diff) }];
  }

  const files: DiffFile[] = [];
  const firstStart = starts[0] as number;
  if (firstStart > 0) {
    const text = diff.slice(0, firstStart);
    files.push({ path: '(preamble)', text, bytes: byteLen(text) });
  }
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i] as number;
    const end = i + 1 < starts.length ? (starts[i + 1] as number) : diff.length;
    const text = diff.slice(start, end);
    files.push({ path: extractPath(text), text, bytes: byteLen(text) });
  }
  return files;
}

/**
 * Build the truncated-head text for a single file that alone exceeds the budget.
 * Includes a byte-bounded prefix plus an explicit marker so a voter can SEE it is
 * partial. Byte-truncation may clip a trailing multibyte codepoint — acceptable for
 * this display-only marker (the canonical `reviewedDiffHash` is computed elsewhere,
 * over `input.prDiff`, and is NOT affected).
 */
function truncateWithMarker(file: DiffFile, budget: number): string {
  const marker =
    `\n[... TRUNCATED: file ${file.path} is ${String(file.bytes)} bytes, over the ` +
    `${String(budget)}-byte review budget; showing a partial prefix — this file is ` +
    `listed in droppedFiles as partially-seen ...]\n`;
  const room = Math.max(0, budget - byteLen(marker));
  const prefix = Buffer.from(file.text, 'utf-8').subarray(0, room).toString('utf-8');
  return prefix + marker;
}

/**
 * Pack files into `budget` UTF-8 bytes, SECURITY FIRST. Ordering: files whose path
 * matches {@link SENSITIVE_PATH_PATTERNS} come first (STABLE — original relative
 * order preserved), then the rest in original diff order. The packer then greedily
 * includes WHOLE files in that priority order until the next file would exceed
 * `budget`; that file and every remaining file go to `droppedFiles`.
 *
 * Single oversize file (nothing has fit yet AND the highest-priority file alone
 * exceeds `budget`): it is included TRUNCATED with a marker AND still listed in
 * `droppedFiles` as partially-seen — honest coverage, never a fragment that reads
 * as whole.
 *
 * `partial = droppedFiles.length > 0`. Pure, deterministic, no I/O, no model call.
 */
export function securityFirstPack(files: DiffFile[], budget: number): DiffPackResult {
  const sensitive = files.filter((f) => isSensitivePath(f.path));
  const rest = files.filter((f) => !isSensitivePath(f.path));
  const ordered = [...sensitive, ...rest];

  const segments: string[] = [];
  const reviewedFiles: string[] = [];
  const droppedFiles: string[] = [];
  let used = 0;

  for (let i = 0; i < ordered.length; i++) {
    const file = ordered[i] as DiffFile;
    if (used + file.bytes <= budget) {
      segments.push(file.text);
      reviewedFiles.push(file.path);
      used += file.bytes;
      continue;
    }

    // This file does not fit. If NOTHING has fit yet, it is the highest-priority
    // file and it alone exceeds budget — include a truncated head (honest partial)
    // rather than showing the voter zero content.
    if (used === 0) {
      segments.push(truncateWithMarker(file, budget));
      reviewedFiles.push(file.path);
      droppedFiles.push(file.path);
    } else {
      droppedFiles.push(file.path);
    }
    // Everything after the first non-fitting file is dropped (greedy stop).
    for (let j = i + 1; j < ordered.length; j++) {
      droppedFiles.push((ordered[j] as DiffFile).path);
    }
    break;
  }

  return {
    packed: segments.join(''),
    reviewedFiles,
    totalFiles: files.length,
    droppedFiles,
    partial: droppedFiles.length > 0,
  };
}

/**
 * Machine-readable coverage of a large-diff review (#4140). Present ONLY when the
 * input diff exceeded the panel budget and was packed; ABSENT for a whole-diff
 * review (a within-budget diff is byte-identical to pre-#4140). `partial: true`
 * means the verdict was BARRED from a verified-approve (the C1 gate below).
 */
export interface PrReviewCoverage {
  /** Number of files whose full diff the panel actually reviewed. */
  readonly reviewedFiles: number;
  /** Total number of files in the original diff. */
  readonly totalFiles: number;
  /** Paths NOT fully reviewed (dropped, or the one truncated-head file). */
  readonly droppedFiles: readonly string[];
  /** True when coverage is incomplete (`droppedFiles.length > 0`). */
  readonly partial: boolean;
  /** Day-one strategy is always `'budget'` (exhaustive arm deferred to #4151). */
  readonly strategy: 'budget';
}

/** The proposal-shaping inputs {@link packDiffForReview} produces from a raw diff. */
export interface DiffReviewPacking {
  /** Coverage to ride on the response; `undefined` for a within-budget diff. */
  readonly coverage: PrReviewCoverage | undefined;
  /** The diff to embed in the proposal (packed subset when over budget). */
  readonly packedDiff: string;
  /** Visible partial-review NOTE to PREPEND to the proposal (`''` when whole). */
  readonly note: string;
}

/**
 * Decide the #4140 large-diff affordance for a raw `prDiff`. Within `budget`:
 * returns the diff unchanged, `coverage: undefined`, `note: ''` — the caller builds
 * a BYTE-IDENTICAL proposal (no pack, no note). Over budget: security-first packs
 * whole files, returns the packed subset, the coverage object, and a visible NOTE
 * so voters know coverage is partial. Pure — no I/O, no model call, no logging.
 */
export function packDiffForReview(prDiff: string, budget: number): DiffReviewPacking {
  if (prDiff.length <= budget) {
    return { coverage: undefined, packedDiff: prDiff, note: '' };
  }
  const pack = securityFirstPack(splitByFile(prDiff), budget);
  const coverage: PrReviewCoverage = {
    reviewedFiles: pack.reviewedFiles.length,
    totalFiles: pack.totalFiles,
    droppedFiles: pack.droppedFiles,
    partial: pack.partial,
    strategy: 'budget',
  };
  const note = pack.partial
    ? `> NOTE: partial review — ${String(pack.reviewedFiles.length)} of ${String(pack.totalFiles)} ` +
      `files reviewed (security-prioritized; lowest-priority dropped): ${pack.droppedFiles.join(', ')}\n\n`
    : '';
  return { coverage, packedDiff: pack.packed, note };
}

/**
 * #4140 C1 gate (LOAD-BEARING). A PARTIAL review (some files dropped) MUST NOT
 * produce a `{ approve, verified: true }` verdict — the panel never saw the dropped
 * files, so it cannot honestly verified-approve the whole PR. If the aggregate would
 * otherwise be a verified approve, degrade to a recoverable `{ abstain, verified:false,
 * reason }` (the #4132 no_quorum shape). A `request_changes` / genuine blocker from a
 * REVIEWED file STILL WINS: it is produced by Tiers 1-2 inside `aggregatePrDecisions`
 * (run first), and this gate only rewrites a would-be verified APPROVE — so a partial
 * review can BLOCK but never verified-APPROVE. A whole-diff review (`coverage`
 * undefined or not partial) is returned unchanged.
 */
export function applyPartialCoverageGate(
  aggregate: PrReviewAggregate,
  coverage: PrReviewCoverage | undefined
): PrReviewAggregate {
  if (coverage?.partial !== true) return aggregate;
  if (aggregate.decision === 'approve' && aggregate.verified) {
    return {
      decision: 'abstain',
      verified: false,
      reason: `no_quorum: partial diff — ${String(coverage.reviewedFiles)} of ${String(coverage.totalFiles)} files reviewed`,
    };
  }
  return aggregate;
}
