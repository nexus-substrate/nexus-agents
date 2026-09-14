/**
 * nexus-agents/mcp — what the middleware removed, in the shapes pr_review needs (#5385).
 *
 * Two adapters over `HandlerContext.sanitization`. They are here rather than in
 * `pr-review-tool.ts` because both exist to preserve one invariant, and keeping
 * them together keeps that invariant in one place:
 *
 * **All THREE counters travel, always.** The sanitizer removes two different
 * things and reports them through separate counters, and a third counter
 * (`fieldsModified`) counts FIELDS rather than removals. None of the three can be
 * derived from the others:
 *
 *  - `commentsRemoved` alone cannot represent a tag strip.
 *  - `fieldsModified` alone cannot either — a comment and a tag in the SAME field
 *    is one modified field, byte-identical to a lone comment.
 *  - so `tagsRemoved` is carried explicitly.
 *
 * Dropping any of them lets a consumer report a stripped prompt-injection tag as
 * a routine comment removal, which is the reassurance an attacker wants and costs
 * them only an HTML comment — GitHub's default PR template supplies one.
 *
 * @module mcp/tools/pr-review-sanitization-view
 */

import type { HandlerContext } from '../middleware/secure-handler.js';
import {
  MAX_REVIEWED_DIFF_BYTES,
  reviewedDiffWasTruncated,
} from '../../audit/reviewed-diff-hash.js';
import type { BindingMeasurement } from './pr-review-diff-budget.js';
import type { ReviewSanitizationInput } from './pr-review-record-producer.js';

/**
 * The producer's view of what the middleware did.
 *
 * `rawFieldHashes['prDiff']` is `undefined` only when the middleware found no
 * string there, which validation then rejects — so in practice the hash is
 * present. It is forwarded as `undefined` rather than dropped so the producer can
 * distinguish "a sanitizer ran but gave me no raw hash" (which it refuses) from
 * "no sanitizer was in this path" (which is legitimate).
 */
export function sanitizationViewOf(ctx: HandlerContext): ReviewSanitizationInput {
  const rawDiffBytes = ctx.sanitization.rawFieldBytes['prDiff'];
  return {
    rawDiffHash: ctx.sanitization.rawFieldHashes['prDiff'],
    rawDiffBytes,
    // #6177: the same UTF-8 test `reviewedDiffWasTruncated` applies to the raw
    // string, over the length the middleware measured beside the hash — the
    // raw text itself never reaches the handler (sanitize-before-dispatch).
    // `undefined` when the length is: a missing number is not "not truncated".
    rawTruncated: rawDiffBytes === undefined ? undefined : rawDiffBytes > MAX_REVIEWED_DIFF_BYTES,
    commentsRemoved: ctx.sanitization.commentsRemoved,
    fieldsModified: ctx.sanitization.fieldsModified,
    tagsRemoved: ctx.sanitization.tagsRemoved,
  };
}

/** The diff as handed, measured by the same functions the hash uses. */
function measuredAsHanded(
  prDiff: string,
  source: BindingMeasurement['source']
): BindingMeasurement {
  return {
    totalBytes: Buffer.byteLength(prDiff, 'utf-8'),
    truncated: reviewedDiffWasTruncated(prDiff),
    source,
  };
}

/**
 * Which bytes the BINDING is measured over (#6177) — the one place that
 * decides it, consumed by the packer (`packDiffForPanelAndBinding`) for
 * `bindingBounds` and by the producer for the truncation warning, so the two
 * cannot disagree.
 *
 * `reviewedDiffHash` covers the RAW input: on the MCP path the middleware
 * computes it before sanitization and hands the handler the hash, and since
 * #6177 the raw UTF-8 length and whether the hash truncated it. `prDiff` is
 * the sanitized text. Measuring coverage over `prDiff` is measuring the
 * wrong artifact, so:
 *
 *  - no sanitizer in the path (`undefined`) → `prDiff` IS the raw diff
 *    (the local-ledger door reads it from git): measure it, source `'input'`;
 *  - a sanitizer that measured → the middleware's numbers, source `'raw'`;
 *  - a sanitizer that did NOT measure (an older middleware: `rawDiffBytes` or
 *    `rawTruncated` absent) → the empty case, named: measure the sanitized
 *    text and say so with `'sanitized-fallback'`. Never `'raw'` from a missing
 *    number — that source would let a consumer read `full` as a raw claim.
 */
export function resolveBindingMeasurement(
  prDiff: string,
  sanitization: ReviewSanitizationInput | undefined
): BindingMeasurement {
  if (sanitization === undefined) return measuredAsHanded(prDiff, 'input');
  const { rawDiffBytes, rawTruncated } = sanitization;
  if (rawDiffBytes === undefined || rawTruncated === undefined) {
    return measuredAsHanded(prDiff, 'sanitized-fallback');
  }
  return { totalBytes: rawDiffBytes, truncated: rawTruncated, source: 'raw' };
}

/**
 * What an EARLIER sanitization stage removed, for the voter-facing note.
 *
 * Absent caller ⇒ nothing was stripped upstream, which is true of the CI and
 * script paths, where `buildPrReviewProposal` does the only stripping.
 */
export function removalsBefore(sanitization: ReviewSanitizationInput | undefined): {
  comments: number;
  fields: number;
  tags: number;
} {
  return {
    comments: sanitization?.commentsRemoved ?? 0,
    fields: sanitization?.fieldsModified ?? 0,
    tags: sanitization?.tagsRemoved ?? 0,
  };
}
