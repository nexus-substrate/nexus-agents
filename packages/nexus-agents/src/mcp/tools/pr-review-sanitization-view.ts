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
  return {
    rawDiffHash: ctx.sanitization.rawFieldHashes['prDiff'],
    commentsRemoved: ctx.sanitization.commentsRemoved,
    fieldsModified: ctx.sanitization.fieldsModified,
    tagsRemoved: ctx.sanitization.tagsRemoved,
  };
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
