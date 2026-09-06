/**
 * Citation provenance for a posted PR review.
 *
 * The citations backing a review's `DraftReply` are derived from the PR's own
 * changed-file list, which is attacker-supplied: a PR that ADDS
 * `docs/policy.md` produced a `repoFile` citation for it, and the corroboration
 * record then attributed repo provenance to a path the author invented in that
 * same change — the mislabel class #4667 fixed for issue bodies, on the PR
 * path.
 *
 * A 7-voter panel chose to MARK the citations rather than tighten the
 * corroboration floor (option D, 5/6 approvers): dropping added-file paths
 * would leave an add-only PR with zero citations, and `DraftReplyAction.sources`
 * is `.min(1)`, so a legitimate review would be refused posting. The floor
 * therefore still cannot fail; #5796 tracks that half.
 *
 * @module dogfooding/pr-review-citations
 */
import type { ILogger } from '../core/index.js';
import type { SourceCitation } from '../security/action-schema.js';
import type { CorroborationResult } from '../security/corroboration-validator.js';
import type { PRFileChange } from './pr-review-types.js';

/**
 * File statuses whose path is present on the base ref — i.e. repo state that
 * existed BEFORE the change under review.
 *
 * `added` and `copied` name paths the author created in this very PR;
 * `renamed` names the new path, which likewise does not exist on the base ref
 * (`previousFilename` does); `unknown` means the provider did not say. All four
 * fail closed to "not verified", because a citation that overstates its
 * provenance is worse than one that admits it has none.
 */
const BASE_REF_STATUSES: ReadonlySet<PRFileChange['status']> = new Set([
  'modified',
  'removed',
  'changed',
  'unchanged',
]);

/**
 * Build the `repoFile` citations for a review, recording for each whether the
 * path existed on the base ref.
 *
 * The citation list is derived from the PR's own changed-file list, which is
 * attacker-supplied: a PR that ADDS `docs/policy.md` previously produced a
 * `repoFile` citation for it, and the corroboration record attributed Tier-1
 * repo provenance to a path the author invented in the same change (the
 * mislabel class #4667 fixed for issue bodies). Marking it is the honest
 * record; it deliberately does not change which reviews post — see #5796.
 */
export function buildReviewCitations(files: readonly PRFileChange[], limit = 20): SourceCitation[] {
  return files.slice(0, limit).map((file) => ({
    type: 'repoFile' as const,
    path: file.filename,
    existsOnBaseRef: BASE_REF_STATUSES.has(file.status),
  }));
}

/**
 * Say, in the log, when the corroboration floor was cleared entirely by paths
 * the PR author introduced.
 *
 * Not a violation: the floor is unchanged on purpose (panel option D, #5796).
 * This is the record naming WHAT cleared it — every citation is a path that did
 * not exist before the change under review, so the corroboration carries no
 * repo provenance at all. Without this the marker would sit on the citation and
 * reach no reader.
 */
export function reportUnverifiedCorroboration(
  corroboration: CorroborationResult,
  log: Pick<ILogger, 'warn'>
): void {
  if (!corroboration.clearedOnlyByUnverifiedSources) return;
  log.warn('Corroboration cleared only by author-supplied paths', {
    citedPaths: corroboration.corroboratingSources.length,
  });
}
