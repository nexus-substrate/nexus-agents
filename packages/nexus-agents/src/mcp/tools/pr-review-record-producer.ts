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
import {
  computeReviewedDiffHash,
  reviewedDiffWasTruncated,
} from '../../audit/reviewed-diff-hash.js';
import { persistPrReviewRecord } from '../../audit/pr-review-record-store.js';
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
      readonly reason: 'binding-inputs-absent' | 'simulated' | 'no-live-votes' | 'write-failed';
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
 * Large-diff review coverage stamped onto the record (#4140). Present only when the
 * review was over-budget and partially reviewed. Folded into the (hash-covered)
 * record `summary` for honest completeness — the `reviewedDiffHash` binding is
 * UNCHANGED (still the canonical first-`MAX_REVIEWED_DIFF_BYTES` of `input.prDiff`);
 * the gate matches on `{prNumber, reviewedDiffHash}`, never on the summary text.
 */
export interface PrReviewCoverageStamp {
  readonly reviewedFiles: number;
  readonly totalFiles: number;
  readonly droppedFiles: readonly string[];
  readonly partial: boolean;
}

/** Inputs for {@link persistReviewRecord} — bundled to stay within max-params. */
export interface PersistReviewRecordArgs {
  readonly input: PrReviewInput;
  readonly aggregate: PrReviewAggregate;
  readonly counts: PrReviewCounts;
  readonly reviewCount: number;
  readonly logger: ILogger;
  /** #4140: large-diff coverage; stamped into the record summary when partial. */
  readonly coverage?: PrReviewCoverageStamp | undefined;
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
  const { input, aggregate, counts, reviewCount, logger, coverage } = args;
  // #4140: honest completeness — stamp partial coverage into the (hash-covered)
  // summary so an auditor reading the ledger sees the review was partial. Does NOT
  // touch reviewedDiffHash (the gate's binding), so gate parity is preserved.
  const coverageSuffix =
    coverage?.partial === true
      ? ` [partial coverage: ${String(coverage.reviewedFiles)}/${String(coverage.totalFiles)} files reviewed, dropped: ${coverage.droppedFiles.join(', ')}]`
      : '';
  // Diff-hash parity contract (#4031): the gate recomputes this hash over the
  // first MAX_REVIEWED_DIFF_BYTES of the canonical `git diff`. If the reviewed
  // diff exceeds that byte cap, content past it is UNBOUND, so a record can match
  // a different tail than the voters saw. Warn so the silent truncation is
  // observable (the diff-hash module documents this producer obligation).
  if (reviewedDiffWasTruncated(input.prDiff)) {
    logger.warn(
      'Reviewed diff exceeds the hash byte cap; content past it is unbound in reviewedDiffHash',
      { prNumber }
    );
  }
  const record = persistPrReviewRecord({
    prNumber,
    baseSha,
    reviewedDiffHash: computeReviewedDiffHash(input.prDiff),
    verdict: aggregate.decision,
    verified: aggregate.verified,
    voteCounts: {
      approve: counts.approveCount,
      request_changes: counts.requestChangesCount,
      abstain: counts.abstainCount,
      error: counts.errorCount,
      total: reviewCount,
    },
    summary: `${aggregate.decision} (${String(counts.approveCount)} approve / ${String(counts.requestChangesCount)} request_changes / ${String(counts.abstainCount)} abstain) — ${input.prTitle}${coverageSuffix}`,
    // #4278: lets a caller (e.g. an MCP server whose cwd has no `.git`
    // ancestor) say where the repo is, so the record isn't silently dropped.
    ...(input.repoPath !== undefined ? { repoPathOverride: input.repoPath } : {}),
    logger,
  });
  if (record === undefined) {
    return {
      persisted: false,
      reason: 'write-failed',
      detail:
        'Audit record could not be written: the records path was unresolved or the ' +
        'append failed (see server logs for the underlying cause).',
    };
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
export function persistReviewRecord(args: PersistReviewRecordArgs): PrReviewRecordOutcome {
  const { input } = args;
  if (input.prNumber === undefined || input.baseSha === undefined) {
    return {
      persisted: false,
      reason: 'binding-inputs-absent',
      detail:
        'No audit record written: supply both prNumber and baseSha to persist an ' +
        'Option-C governor-review record bound to {prNumber, baseSha, reviewedDiffHash}.',
    };
  }
  if (input.simulate) {
    return {
      persisted: false,
      reason: 'simulated',
      detail:
        'No audit record written: the review used simulated voters, and a committed ' +
        'governance record must not be seeded from non-live output (mirrors #2319).',
    };
  }
  // Quorum floor (#4031, found in #4031 adversarial review): an all-errored panel
  // still aggregates to a verdict (abstain/verified — see aggregatePrDecisions),
  // but NO voter actually reviewed. Persisting would write a gate-satisfying
  // record for a review that never happened — the governor-review analogue of the
  // consensus_vote `no_quorum` void (#4053). Valid (non-error) voters are exactly
  // the approve/request_changes/abstain tallies; if all three are zero, skip.
  const { counts } = args;
  if (counts.approveCount + counts.requestChangesCount + counts.abstainCount === 0) {
    return {
      persisted: false,
      reason: 'no-live-votes',
      detail:
        'No audit record written: every voter errored, so the aggregate verdict ' +
        'reflects no live review. A committed governor-review record must not be ' +
        'seeded from a failed panel (the pr_review analogue of no_quorum, #4053).',
    };
  }
  // Defense-in-depth: buildAndPersist's only non-store-guarded step is the diff
  // hash, which does not currently throw — but an audit sink must NEVER throw into
  // the review path, so a future throwable change degrades to write-failed here.
  try {
    return buildAndPersist(input.prNumber, input.baseSha, args);
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
