/**
 * nexus-agents/mcp — PR-Review Audit-Record Producer (#4031).
 *
 * The pr_review side of the #3831 Option-C arc: turn a completed review into an
 * authentic, self-hashed governance record bound to {prNumber, baseSha,
 * reviewedDiffHash, verdict}, so the warn-first governor-review gate can find a
 * diff-bound record for the PR it is checking. Split out of pr-review-tool.ts to
 * keep that file's single-purpose review flow lean.
 *
 * Best-effort and never-throws: a missing binding or a write failure is surfaced
 * as a structured {@link PrReviewRecordOutcome}, never an exception into the
 * review path (an audit sink must not break the operation it observes).
 *
 * @module mcp/tools/pr-review-record-producer
 */

import type { ILogger } from '../../core/index.js';
import { computeReviewedDiffHash } from '../../audit/reviewed-diff-hash.js';
import { persistPrReviewRecord } from '../../audit/pr-review-record-store.js';
import type {
  PrReviewBindingBounds,
  PrReviewDiffProvenance,
  PrReviewDiffSource,
  PrReviewPanelCoverage,
  PrReviewSanitization,
} from '../../audit/pr-review-record.js';
import {
  hasFileBoundaries,
  looksLikeUnifiedDiff,
  type BindingMeasurement,
  type BindingMeasurementSource,
  type PanelBudgetSource,
} from './pr-review-diff-budget.js';
import { resolveBindingMeasurement } from './pr-review-sanitization-view.js';
import type { PrReviewAggregate, PrReviewInput } from './pr-review-tool.js';

/**
 * Structured outcome of the best-effort Option-C audit-record persistence
 * (#4031). Surfaced on the pr_review response so an MCP caller can SEE whether a
 * record was written and, when not, WHY — mirroring the consensus_vote
 * `voteRecordPersisted` observability. Reasons:
 *  - `binding-inputs-absent` — `prNumber` and/or `baseSha` were not supplied, so
 *    there is nothing to bind the record to (the warn-first skip; not an error).
 *  - `simulated` — the review used simulated voters; a committed record would
 *    seed governance from non-live output (mirrors #2319 for votes).
 *  - `no-live-votes` — every voter errored, so the aggregate verdict was produced
 *    by NO live opinion. Persisting would write a gate-satisfying record for a
 *    review that never actually happened (the governor-review analogue of the
 *    consensus_vote `no_quorum` void, #4053). Skipped so a failed review cannot
 *    silently flip the #3831 gate from warn to a false pass.
 *  - `raw-hash-absent` — a sanitizer WAS in the path but supplied no
 *    pre-sanitization hash, so the only binding available is over sanitized
 *    bytes the gate can never reproduce from git. Refused rather than written:
 *    the record would carry a binding that cannot match plus a disclosure
 *    asserting the sanitizer left those bytes alone (#5385, panel condition).
 *  - `write-failed` — the binding was present but the ledger path was unresolved
 *    or the append failed (the producer already logged the underlying cause).
 */
export type PrReviewRecordOutcome =
  | {
      readonly persisted: true;
      readonly prNumber: number;
      readonly baseSha: string;
      readonly reviewedDiffHash: string;
      readonly sequence: number;
    }
  | {
      readonly persisted: false;
      readonly reason:
        | 'binding-inputs-absent'
        | 'simulated'
        | 'no-live-votes'
        | 'diff-not-unified'
        | 'raw-hash-absent'
        | 'write-failed';
      readonly detail: string;
    };

/** Per-decision voter tally subset {@link persistReviewRecord} consumes. */
export interface PrReviewCounts {
  readonly approveCount: number;
  readonly requestChangesCount: number;
  readonly abstainCount: number;
  readonly errorCount: number;
}

/**
 * Large-diff review coverage stamped onto the record (#4140, #6003, #6190).
 * Present when the panel read was partial OR the hash binds only a prefix.
 * Written to the record TWICE, on purpose: as the structured, hash-covered
 * `coverage` / `bindingBounds` fields (the evidence — every dropped path, uncapped)
 * and as a human-readable stamp in the (also hash-covered, 500-char-capped)
 * `summary`, which lists at most {@link SUMMARY_DROPPED_FILES_LISTED} of the
 * dropped paths and counts the rest. The `reviewedDiffHash` binding is
 * UNCHANGED (still the canonical first-`MAX_REVIEWED_DIFF_BYTES` of the bytes
 * the hash was computed over); the gate matches on `{prNumber,
 * reviewedDiffHash}`, never on the summary text. The byte fields are UTF-8
 * (see `PrReviewBindingCoverage`); `binding` / `boundBytes` are measured over
 * the bytes the hash covers and `bindingSource` says which those were (#6177).
 */
export interface PrReviewCoverageStamp {
  readonly reviewedFiles: number;
  readonly totalFiles: number;
  readonly droppedFiles: readonly string[];
  readonly partial: boolean;
  readonly panelRead: 'full' | 'partial';
  readonly binding: 'full' | 'prefix';
  readonly bindingSource: BindingMeasurementSource;
  readonly reviewedBytes: number;
  readonly boundBytes: number;
  readonly totalBytes: number;
  readonly budgetSource: PanelBudgetSource;
  readonly budgetDetail: string;
}

/** `61204` → `61,204`: the record is read by people; group the digits. */
function bytes(n: number): string {
  return n.toLocaleString('en-US');
}

/**
 * The human-readable name of the bytes the binding was measured over (#6177).
 * `'input'` says nothing — the diff as handed is the raw diff, the pre-#6177
 * wording. `'raw'` is stated so a reader can see the binding figure and the
 * `panel read` figure are over different texts. The fallback is spelled out
 * because its `full` is not a raw measurement and must not read as one.
 */
function bindingSourceClause(source: BindingMeasurementSource): string {
  if (source === 'raw') return ' (raw)';
  if (source === 'sanitized-fallback') return ' (sanitized; raw length not supplied)';
  return '';
}

/**
 * The #6003 summary stamp: what the PANEL read and what the BINDING covers, as
 * two statements, plus the budget's source. No hash here — the record's own
 * `reviewedDiffHash` field already carries it, and 71 chars of the store's
 * 500-char summary cap are better spent on the dropped-file list.
 */
function bindingStamp(coverage: PrReviewCoverageStamp): string {
  const binding =
    (coverage.binding === 'prefix'
      ? `binding covers first ${bytes(coverage.boundBytes)} bytes`
      : `binding covers all ${bytes(coverage.boundBytes)} bytes`) +
    bindingSourceClause(coverage.bindingSource);
  return (
    `[panel read ${bytes(coverage.reviewedBytes)}/${bytes(coverage.totalBytes)} bytes; ` +
    `${binding}; budget: ${coverage.budgetSource} (${coverage.budgetDetail})]`
  );
}

/**
 * How many dropped paths the SUMMARY stamp lists (#6190). The full list is in
 * the record's `coverage.droppedFiles`; the summary is capped at 500 chars by
 * the store, and before this a review that dropped forty 22-char paths kept
 * seventeen of them and lost the binding stamp. Three keeps the stamp bounded
 * (≈ 273 fixed chars + three paths) so the cap reaches the title first.
 */
const SUMMARY_DROPPED_FILES_LISTED = 3;

/**
 * `40 dropped (3 listed): a, b, c` — or `2 dropped: a, b` when every path
 * fits. The count is always the TOTAL, so a reader of the summary alone knows
 * how much the field holds that the stamp does not.
 */
function droppedFilesClause(dropped: readonly string[]): string {
  const listed = dropped.slice(0, SUMMARY_DROPPED_FILES_LISTED);
  const qualifier = listed.length < dropped.length ? ` (${String(listed.length)} listed)` : '';
  return `${String(dropped.length)} dropped${qualifier}: ${listed.join(', ')}`;
}

/**
 * Both coverage stamps, or `''` when there is nothing to disclose. Order is
 * load-bearing: the store caps the summary at 500 chars, so the stamps go
 * BEFORE the title, and the #4140 file stamp goes before the fixed-width
 * binding stamp. Since #6190 the file stamp is bounded too (it lists at most
 * {@link SUMMARY_DROPPED_FILES_LISTED} paths; the structured `coverage` field
 * carries them all), so the cap now reaches the title first and never the
 * evidence. The file stamp fires only on a partial PANEL read: a full read
 * over a prefix binding dropped no file, and must not be recorded as if it had.
 */
function coverageStamps(coverage: PrReviewCoverageStamp | undefined): string {
  if (coverage === undefined) return '';
  const files = coverage.partial
    ? `[partial coverage: ${String(coverage.reviewedFiles)}/${String(coverage.totalFiles)} files reviewed, ${droppedFilesClause(coverage.droppedFiles)}] `
    : '';
  return ` ${files}${bindingStamp(coverage)}`;
}

/**
 * The structured record fields (#6190), rebuilt field-by-field from the
 * packer's coverage so the audit schema — which cannot import this module's
 * types (governor path, dependency-minimal) — is satisfied by construction:
 * a field the packer adds is not silently written, and a value the schema
 * would reject (`budgetSource`) is a compile error here, not a refused write.
 * `undefined` in ⇒ `undefined` out: a both-full review states nothing, and
 * the record must not carry zero-filled fields that read as a measurement.
 */
function coverageFieldsOf(
  coverage: PrReviewCoverageStamp | undefined
): { coverage: PrReviewPanelCoverage; bindingBounds: PrReviewBindingBounds } | undefined {
  if (coverage === undefined) return undefined;
  return {
    coverage: {
      panelRead: coverage.panelRead,
      reviewedFiles: coverage.reviewedFiles,
      totalFiles: coverage.totalFiles,
      droppedFiles: [...coverage.droppedFiles],
      reviewedBytes: coverage.reviewedBytes,
      totalBytes: coverage.totalBytes,
      budgetSource: coverage.budgetSource,
      budgetDetail: coverage.budgetDetail,
    },
    bindingBounds: { kind: coverage.binding, boundBytes: coverage.boundBytes },
  };
}

/**
 * The middleware's pre-sanitization view, handed to the producer by a caller
 * that sits behind {@link createSecureHandler} (#5385).
 */
export interface ReviewSanitizationInput {
  /**
   * `reviewedDiffHash` over the RAW `prDiff` bytes, before sanitization. Its own
   * `undefined` case is retained: the middleware only hashes a field it finds as
   * a string, so a caller must be able to say "a sanitizer ran but I have no
   * pre-sanitization hash" rather than pass a hash of the wrong artifact.
   */
  readonly rawDiffHash: string | undefined;
  /**
   * UTF-8 byte length of the RAW `prDiff` the hash above was computed over,
   * measured by the middleware beside the hash (#6177). Its own `undefined`
   * case, like the hash's: a middleware that hashed but did not measure must
   * be representable, and the producer then measures the sanitized text and
   * SAYS SO rather than claiming a raw measurement it never received.
   */
  readonly rawDiffBytes: number | undefined;
  /**
   * Whether `computeReviewedDiffHash` truncated the raw input at
   * `MAX_REVIEWED_DIFF_BYTES` (#6177) — the raw-side answer to
   * `reviewedDiffWasTruncated`, which the producer cannot compute itself
   * because it never holds the raw text. `undefined` exactly when
   * `rawDiffBytes` is.
   */
  readonly rawTruncated: boolean | undefined;
  /** HTML comments the middleware stripped from the args before dispatch. */
  readonly commentsRemoved: number;
  /**
   * How many FIELDS the middleware changed at all. Carried separately because
   * `commentsRemoved` counts HTML comments only — an XML-like injection tag is
   * stripped through a different counter, and without this a tag-only strip is
   * indistinguishable from a no-op.
   */
  readonly fieldsModified: number;
  /** XML-like tags removed. Its own counter — see PrReviewSanitizationSchema. */
  readonly tagsRemoved: number;
}

/** Inputs for {@link persistReviewRecord} — bundled to stay within max-params. */
export interface PersistReviewRecordArgs {
  readonly input: PrReviewInput;
  /**
   * What the SANITIZER in this producer's path did, or `undefined` when there
   * was no sanitizer (#5385).
   *
   * REQUIRED including its `undefined` case, and grouped rather than flattened
   * into two fields, because presence is itself the signal. `input.prDiff` is
   * NOT the bytes the governor gate recomputes from git — the MCP middleware
   * sanitized it before the handler saw it — so a caller that sits behind the
   * middleware must hand over the raw hash and the counters. Flattened, the
   * local-ledger door (`undefined`, `0`) would be indistinguishable from a
   * sanitizer that ran and removed nothing.
   */
  readonly sanitization: ReviewSanitizationInput | undefined;
  readonly aggregate: PrReviewAggregate;
  readonly counts: PrReviewCounts;
  readonly reviewCount: number;
  readonly logger: ILogger;
  /**
   * REQUIRED (#4459): where `input.prDiff` came from. Every door into the ledger
   * must NAME its provenance — a default would let a caller that never thought
   * about it emit a record asserting something about its own derivation. There
   * are exactly two doors: the pr_review MCP tool (`caller-supplied`, the diff is
   * opaque input) and `scripts/pr-review-local-ledger.ts` (`canonical-git`).
   */
  readonly diffSource: PrReviewDiffSource;
  /**
   * #4140/#6003/#6190: large-diff coverage; written as the structured
   * `coverage` / `bindingBounds` record fields AND stamped into the summary whenever
   * present (the packer supplies it only when the panel read was partial or the
   * binding is a prefix — absent means both were full, and the record then
   * carries neither field).
   */
  readonly coverage?: PrReviewCoverageStamp | undefined;
}

/**
 * Diff-hash parity contract (#4031): the gate recomputes `reviewedDiffHash` over the
 * first MAX_REVIEWED_DIFF_BYTES of the canonical `git diff`. If the reviewed diff
 * exceeds that byte cap, content past it is UNBOUND, so a record can match a
 * different tail than the voters saw. Warn so the silent truncation is observable
 * (the diff-hash module documents this producer obligation).
 *
 * Decided over the bytes the hash COVERS (#6177): the middleware's raw
 * measurement when it supplied one, `input.prDiff` when no sanitizer was in
 * the path. Reading `input.prDiff` on the MCP path read the sanitized text,
 * which is under the cap exactly when the sanitizer stripped enough — the
 * state this warning exists for. The fallback (a sanitizer that supplied no
 * raw length) is its own warning, so a measurement over the wrong artifact is
 * never silent.
 */
function warnIfDiffTruncated(binding: BindingMeasurement, prNumber: number, logger: ILogger): void {
  if (binding.source === 'sanitized-fallback') {
    logger.warn(
      'Binding bounds measured over the SANITIZED diff: the sanitizer supplied no raw byte length, so a prefix binding can be under-stated (#6177)',
      { prNumber, sanitizedBytes: binding.totalBytes }
    );
  }
  if (!binding.truncated) return;
  logger.warn(
    'Reviewed diff exceeds the hash byte cap; content past it is unbound in reviewedDiffHash',
    { prNumber, measuredOver: binding.source, totalBytes: binding.totalBytes }
  );
}

/**
 * The #4459 provenance descriptor for a reviewed diff: WHERE the bytes came from
 * (asserted by the producer's door — see {@link PersistReviewRecordArgs.diffSource})
 * and whether the REAL {@link hasFileBoundaries} split attributed them to files.
 * Hash-covered downstream, so neither half can be upgraded after the fact. Computed
 * over the SAME `input.prDiff` bytes the `reviewedDiffHash` binding covers.
 */
function diffProvenanceOf(source: PrReviewDiffSource, diff: string): PrReviewDiffProvenance {
  return { source, fileBoundaries: hasFileBoundaries(diff) };
}

/**
 * The record's sanitization disclosure (#5385): the hash of the once-sanitized
 * full diff, plus the middleware's counter.
 *
 * The `reviewedDiffHash` binding covers RAW bytes, because those are the only
 * ones the governor gate can recompute from git. What reached the panel was
 * `prDiff`, which the middleware had already stripped. Recording the binding
 * WITHOUT this would assert "these bytes were reviewed" about bytes no voter
 * saw.
 *
 * This names the SANITIZATION gap only. Coverage packing (#4140) reduces the
 * prompt further on an over-budget diff, and is disclosed separately in the
 * hash-covered `summary` — see `PrReviewSanitizationSchema.sanitizedDiffHash`
 * for why the two reductions are kept apart rather than folded into one hash.
 *
 * Returns `undefined` — not a zero-filled block — when no sanitizer was in the
 * path, because "no sanitizer" and "a sanitizer ran and removed nothing" are
 * different claims and the record must not collapse them.
 */
function sanitizationDisclosureOf(
  sanitization: ReviewSanitizationInput | undefined,
  prDiff: string
): PrReviewSanitization | undefined {
  if (sanitization === undefined) return undefined;
  return {
    sanitizedDiffHash: computeReviewedDiffHash(prDiff),
    commentsRemoved: sanitization.commentsRemoved,
    fieldsModified: sanitization.fieldsModified,
    tagsRemoved: sanitization.tagsRemoved,
  };
}

/**
 * The outcome for a store that returned `undefined` (#6054). Kept out of
 * {@link buildAndPersist} for the line cap; the text is load-bearing, because
 * `undefined` now has TWO causes — an unwritable path, or a record the read
 * schema would reject — and the caller must not be told a filesystem cause it
 * cannot distinguish.
 */
function writeFailedOutcome(): PrReviewRecordOutcome {
  return {
    persisted: false,
    reason: 'write-failed',
    detail:
      'Audit record NOT written: either the records path was unresolved / the ' +
      'append failed, or the record was refused because the read schema would ' +
      'reject it (#6054). The server log line "Failed to persist authentic ' +
      'pr-review record" carries the cause — a filesystem error, or the ' +
      'offending field.',
  };
}

/**
 * Build + append the Option-C record for a review whose binding is present and
 * live (the guards in {@link persistReviewRecord} already passed). Hashes the
 * EXACT reviewed diff via the same canonical {@link computeReviewedDiffHash} the
 * gate recomputes with, then maps the producer result to a structured outcome.
 */
function buildAndPersist(
  prNumber: number,
  baseSha: string,
  args: PersistReviewRecordArgs
): PrReviewRecordOutcome {
  const { input, aggregate, counts, reviewCount, logger, coverage, diffSource, sanitization } =
    args;
  // #5385: the RAW hash when the caller had one, so producer and gate agree by
  // construction. After the `raw-hash-absent` guard above, the fallback has
  // exactly ONE way to fire — `sanitization === undefined`, the local-ledger
  // door, whose diff comes straight from git and was never sanitized, so
  // `input.prDiff` already IS the canonical bytes.
  const reviewedDiffHash = sanitization?.rawDiffHash ?? computeReviewedDiffHash(input.prDiff);
  // #4140/#6003/#6190: honest completeness — what the panel read and what the
  // hash binds go on the record as structured, hash-covered fields (every
  // dropped path) and, human-readably, into the summary stamp. Does NOT touch
  // reviewedDiffHash (the gate's binding), so gate parity is preserved. Stamped
  // BEFORE the title: the store caps the summary at 500 chars, and a title can
  // be 500 chars on its own.
  const stamps = coverageStamps(coverage);
  const coverageFields = coverageFieldsOf(coverage);
  const disclosure = sanitizationDisclosureOf(sanitization, input.prDiff);
  warnIfDiffTruncated(resolveBindingMeasurement(input.prDiff, sanitization), prNumber, logger);
  const record = persistPrReviewRecord({
    prNumber,
    baseSha,
    reviewedDiffHash,
    diffProvenance: diffProvenanceOf(diffSource, input.prDiff),
    ...(disclosure !== undefined ? { sanitization: disclosure } : {}),
    ...(coverageFields ?? {}),
    verdict: aggregate.decision,
    verified: aggregate.verified,
    voteCounts: {
      approve: counts.approveCount,
      request_changes: counts.requestChangesCount,
      abstain: counts.abstainCount,
      error: counts.errorCount,
      total: reviewCount,
    },
    summary: `${aggregate.decision} (${String(counts.approveCount)} approve / ${String(counts.requestChangesCount)} request_changes / ${String(counts.abstainCount)} abstain)${stamps} — ${input.prTitle}`,
    // #4278: lets a caller (e.g. an MCP server whose cwd has no `.git`
    // ancestor) say where the repo is, so the record isn't silently dropped.
    ...(input.repoPath !== undefined ? { repoPathOverride: input.repoPath } : {}),
    logger,
  });
  if (record === undefined) {
    return writeFailedOutcome();
  }
  return {
    persisted: true,
    prNumber: record.prNumber,
    baseSha: record.baseSha,
    reviewedDiffHash: record.reviewedDiffHash,
    sequence: record.sequence,
  };
}

/**
 * Best-effort Option-C audit-record persistence (#4031). Persists ONLY when both
 * `prNumber` and `baseSha` are present AND the review was live; otherwise returns
 * a structured skip. `baseSha` is CALLER-ASSERTED here and NOT cross-checked
 * against the diff; acceptable for the warn-first gate, but a future enforce flip
 * (#3831) must add that provenance check (design-vote condition).
 */
/**
 * Outcome of the pre-write guard chain: either a refusal to persist, or the
 * narrowed binding the writer needs. Carrying `prNumber`/`baseSha` out of the
 * guard keeps their non-undefined narrowing without re-checking in the caller.
 */
type PersistGate =
  | { readonly ok: false; readonly outcome: PrReviewRecordOutcome }
  | { readonly ok: true; readonly prNumber: number; readonly baseSha: string };

/**
 * Every reason a review must NOT be written to the governance ledger.
 *
 * Extracted from {@link persistReviewRecord} so the guard chain can grow without
 * pushing that function over the max-lines budget. Each guard fails CLOSED: a
 * ledger record is evidence, and a wrong record is worse than a missing one.
 */
/** The refusal reasons {@link refuseToPersist} can return. */
type RefusalReason =
  'binding-inputs-absent' | 'diff-not-unified' | 'simulated' | 'no-live-votes' | 'raw-hash-absent';

/** Wraps a refusal so every guard in {@link refuseToPersist} reads the same way. */
function refuse(reason: RefusalReason, detail: string): PersistGate {
  return { ok: false, outcome: { persisted: false, reason, detail } };
}

/**
 * #5385 panel condition: a sanitizer in the path that supplied no raw hash.
 *
 * The one state where the binding fallback would produce a self-contradicting
 * record — a binding over SANITIZED bytes (which the gate, hashing raw git
 * output, can never reproduce) carrying a disclosure that compares that same
 * hash against itself and so reports the bound bytes as untouched. Unreachable
 * today: the middleware hashes any string `prDiff`, and the schema rejects a
 * non-string one. Guarded anyway, because an audit sink must fail closed — "no
 * record" is honest where "a record that cannot match, claiming it was
 * untouched" is not.
 */
function rawHashMissing(args: PersistReviewRecordArgs): boolean {
  return args.sanitization !== undefined && args.sanitization.rawDiffHash === undefined;
}

function refuseToPersist(args: PersistReviewRecordArgs): PersistGate {
  const { input, counts } = args;
  if (rawHashMissing(args)) {
    return refuse(
      'raw-hash-absent',
      'No audit record written: a sanitizer processed this input but supplied no ' +
        'pre-sanitization hash, so the only available binding is over sanitized ' +
        'bytes the governor gate cannot recompute from git (#5385).'
    );
  }

  if (input.prNumber === undefined || input.baseSha === undefined) {
    return refuse(
      'binding-inputs-absent',
      'No audit record written: supply both prNumber and baseSha to persist an ' +
        'Option-C governor-review record bound to {prNumber, baseSha, reviewedDiffHash}.'
    );
  }
  // #4451 second gate. `PrReviewInputSchema` rejects a non-diff `prDiff`, but it
  // only guards the MCP entrance: `scripts/pr-review-local-ledger.ts` builds a
  // PrReviewInput literal and calls this function directly, never touching the
  // schema. Since the harm in #4451 is a fabricated `verified: true` LEDGER
  // RECORD, the check has to live at the writer too — otherwise the gate covers
  // one of two doors into the thing it protects.
  if (!looksLikeUnifiedDiff(input.prDiff)) {
    return refuse(
      'diff-not-unified',
      'No audit record written: prDiff is not a unified diff, so the review did not ' +
        'examine code and reviewedDiffHash would hash non-diff text — a record ' +
        'indistinguishable from a real one (#4451).'
    );
  }
  if (input.simulate) {
    return refuse(
      'simulated',
      'No audit record written: the review used simulated voters, and a committed ' +
        'governance record must not be seeded from non-live output (mirrors #2319).'
    );
  }
  // Quorum floor (#4031, found in #4031 adversarial review): an all-errored panel
  // still aggregates to a verdict (abstain/verified — see aggregatePrDecisions),
  // but NO voter actually reviewed. Persisting would write a gate-satisfying
  // record for a review that never happened — the governor-review analogue of the
  // consensus_vote `no_quorum` void (#4053). Valid (non-error) voters are exactly
  // the approve/request_changes/abstain tallies; if all three are zero, skip.
  if (counts.approveCount + counts.requestChangesCount + counts.abstainCount === 0) {
    return refuse(
      'no-live-votes',
      'No audit record written: every voter errored, so the aggregate verdict ' +
        'reflects no live review. A committed governor-review record must not be ' +
        'seeded from a failed panel (the pr_review analogue of no_quorum, #4053).'
    );
  }
  return { ok: true, prNumber: input.prNumber, baseSha: input.baseSha };
}

export function persistReviewRecord(args: PersistReviewRecordArgs): PrReviewRecordOutcome {
  const gate = refuseToPersist(args);
  if (!gate.ok) return gate.outcome;
  // Defense-in-depth: buildAndPersist's only non-store-guarded step is the diff
  // hash, which does not currently throw — but an audit sink must NEVER throw into
  // the review path, so a future throwable change degrades to write-failed here.
  try {
    return buildAndPersist(gate.prNumber, gate.baseSha, args);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    args.logger.warn('Audit-record persistence threw (non-fatal)', { detail });
    return {
      persisted: false,
      reason: 'write-failed',
      detail: `Audit record persistence raised: ${detail}`,
    };
  }
}
