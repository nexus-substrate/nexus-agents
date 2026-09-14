/**
 * nexus-agents/mcp — PR-Review Large-Diff Budget Packer (#4140, epic #4130).
 *
 * Option A of the large-diff affordance: when a PR diff exceeds the voter PANEL
 * budget (since #6003 derived from the panel's context windows in
 * `pr-review-panel-budget.ts`; the hash cap `MAX_DIFF_LENGTH` is a separate
 * budget, see `packDiffForPanelAndBinding`), pack it down to a REAL, security-prioritized subset
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
 * Path label for the single segment {@link splitByFile} returns when the input
 * carries NO `^diff --git ` header at all — i.e. the content could not be
 * attributed to files. Exported so {@link hasFileBoundaries} (and the #4459
 * provenance stamp it feeds) reads the split's own verdict instead of
 * re-deriving one.
 */
// Module-local by design: `splitByFile` and `hasFileBoundaries` are its only
// readers, and the export ratchet (#4561) correctly flagged it as a producer
// with no consumer when it was exported for a test that never imported it.
const UNSTRUCTURED_SEGMENT_PATH = '(unstructured)';

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
    return [{ path: UNSTRUCTURED_SEGMENT_PATH, text: diff, bytes: byteLen(diff) }];
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
 * Whether `diff` carries parseable per-file boundaries (#4459) — i.e. whether the
 * REAL {@link splitByFile} result attributes content to files, rather than falling
 * back to the single {@link UNSTRUCTURED_SEGMENT_PATH} segment.
 *
 * Answered from the split itself, deliberately NOT from a second `^diff --git`
 * regex: a re-derivation can drift from what the packer actually sees, and this
 * value is written into a hash-covered audit record. Lives beside `splitByFile` so
 * there stays ONE place that knows what a file boundary is.
 *
 * Note this is genuinely independent of {@link looksLikeUnifiedDiff}: that gate
 * ACCEPTS plain `diff -u` output (no `diff --git` headers), which lands here as
 * `false`. Empty input is `false` — no boundaries were observed.
 */
export function hasFileBoundaries(diff: string): boolean {
  const segments = splitByFile(diff);
  return segments.length > 0 && segments.every((s) => s.path !== UNSTRUCTURED_SEGMENT_PATH);
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

/** `diff --git a/x b/x` — git's own file header. */
const GIT_FILE_HEADER = /^diff --git /m;
/** `@@ -1,3 +1,4 @@` (optionally followed by context) — a unified hunk header. */
const HUNK_HEADER = /^@@ .* @@/m;
/** The `---` / `+++` old/new file-header pair. */
const OLD_FILE_HEADER = /^--- /m;
const NEW_FILE_HEADER = /^\+\+\+ /m;
/**
 * An added/removed body line. A hunk header alone proves nothing — prefixing one
 * line of prose with `@@ -1 +1 @@` would otherwise satisfy the gate and reproduce
 * #4451 end to end. A real hunk is always followed by `+`/`-` content.
 *
 * Note `^--- ` and `^+++ ` (file headers, space-suffixed) also match this, which
 * is harmless: those paths already require the header pair.
 */
const BODY_LINE = /^[+-]/m;

/**
 * Whether `text` is structurally a unified diff.
 *
 * This is a *shape* gate, not a correctness gate: it answers "did the caller
 * pass a diff, or something else entirely?" It cannot tell whether the diff is
 * the one actually under review — that is what provenance metadata is for.
 *
 * Motivation (#4451): `pr_review` previously validated `prDiff` by length only,
 * so a prose summary produced a full panel review and a `verified: true`
 * governance record indistinguishable from a real one. The panel approved a PR
 * that warranted `request_changes`, because it never saw any code.
 *
 * Kept next to `splitByFile` so there is ONE place that knows what a diff looks
 * like. Note `splitByFile` deliberately *tolerates* unstructured input (it
 * returns an `(unstructured)` segment) because the budget packer should pack
 * whatever it is handed — that tolerance is correct there, and this gate belongs
 * at the entry boundary instead.
 */
export function looksLikeUnifiedDiff(text: string): boolean {
  // `diff --git` is git's own header and is not something prose produces, so it
  // stands alone — and it must, since rename-only, mode-only and binary diffs
  // legitimately carry no body lines at all.
  if (GIT_FILE_HEADER.test(text)) return true;
  // A hunk header must be backed by actual +/- content: `@@ -1 +1 @@` prepended
  // to a paragraph is otherwise enough to pass, which reproduces #4451.
  if (HUNK_HEADER.test(text) && BODY_LINE.test(text)) return true;
  // `---` and `+++` are required TOGETHER, never alone. A lone `^--- ` is far too
  // weak a signal: ordinary prose uses dashed rules and section headers
  // (`--- Release notes ---`, `--- Section header ---`), and accepting those
  // reopens exactly the hole this gate closes. In a real unified diff the two
  // always co-occur, so requiring the pair costs nothing — verified against
  // rename-only, binary, mode-only, CRLF, `diff -u`, bare-hunk and
  // `git format-patch` output, all of which still qualify.
  return OLD_FILE_HEADER.test(text) && NEW_FILE_HEADER.test(text);
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
 *
 * pr_review itself now reports the {@link PrReviewBindingCoverage} extension
 * (#6003), which is also present when the panel read everything but the hash
 * binds only a prefix; this base shape is what the single-budget
 * {@link packDiffForReview} callers (triangulated review) still get.
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
  // UTF-8 BYTES, not UTF-16 code units (#5818). `bytes` is the budgeting unit
  // everywhere else in this module, and the reviewed-diff hash truncates on
  // `Buffer.byteLength` too. This fast path used `prDiff.length`, so a diff with
  // multibyte content could sit under the budget by code units while the hash
  // bound only a PREFIX of it — the packer reported complete coverage for a
  // review whose binding was partial, and content past the cap went unattested.
  if (byteLen(prDiff) <= budget) {
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

/** Where the panel-read budget came from (#6003). */
export type PanelBudgetSource = 'registry' | 'binding-cap-fallback';

/**
 * The TWO budgets a pr_review packs against (#6003). They answer different
 * questions and are named separately so one comparison can never decide both:
 *
 *  - `bindingCapBytes` — how many UTF-8 bytes the `reviewedDiffHash` binds
 *    (`MAX_REVIEWED_DIFF_BYTES`). A byte question: the hash truncates on bytes.
 *  - `panelReadBudgetBytes` — how many UTF-8 bytes the voter PANEL is sent. A
 *    TOKEN question (the #6003 contrarian seat): bounded by the smallest context
 *    window on the panel, converted with the shared estimator's most
 *    conservative ratio. See `pr-review-panel-budget.ts`.
 *
 * `source` / `detail` record how the panel budget was derived, so the ledger
 * can name the estimator it relied on — or the reason it fell back to the cap.
 */
export interface ReviewBudgets {
  readonly bindingCapBytes: number;
  readonly panelReadBudgetBytes: number;
  readonly source: PanelBudgetSource;
  /** Human-readable derivation (registry) or fallback reason; stamped into the record. */
  readonly detail: string;
}

/**
 * Coverage of a pr_review whose panel read and hash binding are decided
 * SEPARATELY (#6003). Extends {@link PrReviewCoverage}: `partial` keeps its
 * meaning — the PANEL did not read every file — and is what the C1 gate keys on.
 * `binding` is a different fact: whether the record's `reviewedDiffHash` covers
 * every byte or only a prefix. All four combinations are reachable.
 *
 * Every byte field is UTF-8 (`Buffer.byteLength(text, 'utf-8')`), the same unit
 * the hash truncates on — never UTF-16 code units (#5818).
 */
export interface PrReviewBindingCoverage extends PrReviewCoverage {
  /** `'full'` — the panel was sent the whole diff; `'partial'` — a packed subset. */
  readonly panelRead: 'full' | 'partial';
  /** `'full'` — the hash covers every byte; `'prefix'` — only the first `boundBytes`. */
  readonly binding: 'full' | 'prefix';
  /** UTF-8 bytes of the diff text the panel actually read (`packedDiff`). */
  readonly reviewedBytes: number;
  /** UTF-8 bytes the hash binds: `min(totalBytes, bindingCapBytes)`. */
  readonly boundBytes: number;
  /** UTF-8 bytes of the raw input diff. */
  readonly totalBytes: number;
  /** Where the panel-read budget came from. */
  readonly budgetSource: PanelBudgetSource;
  /** The budget derivation or the fallback reason, verbatim from {@link ReviewBudgets.detail}. */
  readonly budgetDetail: string;
}

/** {@link packDiffForPanelAndBinding}'s result — {@link DiffReviewPacking} with binding coverage. */
export interface PanelReviewPacking {
  /** Coverage; `undefined` only when the panel read is full AND the binding is full. */
  readonly coverage: PrReviewBindingCoverage | undefined;
  readonly packedDiff: string;
  readonly note: string;
}

/** File tally for a diff the panel read WHOLE — from the packer's own split, not assumed. */
function wholeDiffFileCoverage(prDiff: string): PrReviewCoverage {
  const fileCount = splitByFile(prDiff).length;
  return {
    reviewedFiles: fileCount,
    totalFiles: fileCount,
    droppedFiles: [],
    partial: false,
    strategy: 'budget',
  };
}

/**
 * Decide what the PANEL reads and what the BINDING covers as two separate
 * questions (#6003). Before this, one `byteLen(prDiff) <= budget` comparison
 * answered both, so a diff over the hash cap was packed down even when every
 * voter could have read it whole.
 *
 *  - The panel read is decided by `panelReadBudgetBytes` via {@link packDiffForReview}.
 *  - The binding is `'prefix'` iff the diff exceeds `bindingCapBytes` — the same
 *    UTF-8 test `reviewedDiffWasTruncated` applies.
 *
 * Returns `coverage: undefined` (byte-identical proposal, no note) ONLY when both
 * are full — the pre-#4140 contract for a small diff. The empty diff is that
 * case: zero bytes fit every budget, so it is both-full, not an error here (the
 * MCP schema rejects it upstream; the local-ledger door does not call this).
 * Pure — no I/O, no model call.
 */
export function packDiffForPanelAndBinding(
  prDiff: string,
  budgets: ReviewBudgets
): PanelReviewPacking {
  const totalBytes = byteLen(prDiff);
  const binding: PrReviewBindingCoverage['binding'] =
    totalBytes > budgets.bindingCapBytes ? 'prefix' : 'full';
  const boundBytes = Math.min(totalBytes, budgets.bindingCapBytes);
  const panel = packDiffForReview(prDiff, budgets.panelReadBudgetBytes);
  const panelRead: PrReviewBindingCoverage['panelRead'] =
    panel.coverage?.partial === true ? 'partial' : 'full';
  if (panelRead === 'full' && binding === 'full') {
    return { coverage: undefined, packedDiff: prDiff, note: '' };
  }
  // A full panel read over a prefix binding: the packer had nothing to pack, so
  // the file tally is "every file reviewed" — derived from the same split the
  // packer would have used, not assumed.
  const fileCoverage: PrReviewCoverage = panel.coverage ?? wholeDiffFileCoverage(prDiff);
  const coverage: PrReviewBindingCoverage = {
    ...fileCoverage,
    panelRead,
    binding,
    reviewedBytes: byteLen(panel.packedDiff),
    boundBytes,
    totalBytes,
    budgetSource: budgets.source,
    budgetDetail: budgets.detail,
  };
  return { coverage, packedDiff: panel.packedDiff, note: panel.note };
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
 *
 * #6003: `partial` means the PANEL read was partial. A {@link PrReviewBindingCoverage}
 * whose panel read is full but whose `binding` is a prefix passes through — the
 * voters read everything, so the approve stands; the record discloses the prefix
 * binding in its summary stamp instead.
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
