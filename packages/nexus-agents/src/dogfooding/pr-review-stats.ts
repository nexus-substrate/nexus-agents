/**
 * Review coverage calculation and statistics rendering.
 *
 * @module dogfooding/pr-review-stats
 */

import type {
  ExpertReviewResult,
  PRMetadata,
  PRReviewDraft,
  ReviewSeverity,
} from './pr-review-types.js';
import { SEVERITY_EMOJI } from './pr-review-types.js';

/** Calculates how much of the fetched PR was supplied to a successful expert. */
export function getFileReviewCoverage(
  pr: PRMetadata,
  reviews: readonly ExpertReviewResult[],
  filesIncluded: number
): Pick<PRReviewDraft, 'totalFiles' | 'filesWithPatch' | 'filesReviewed' | 'reviewCoverage'> {
  const totalFiles = pr.files.length;
  const filesWithPatch = pr.files.filter((file) => file.patch !== undefined).length;
  const hasSuccessfulReview = reviews.some((review) => review.errored !== true);
  const filesReviewed = hasSuccessfulReview ? filesIncluded : 0;
  const reviewCoverage =
    filesReviewed === 0 ? 'none' : filesReviewed === totalFiles ? 'full' : 'partial';
  return { totalFiles, filesWithPatch, filesReviewed, reviewCoverage };
}

/** Formats the measured file-review coverage without losing the PR total. */
export function formatFileReviewCoverage(result: PRReviewDraft): string {
  return `${String(result.filesReviewed)} of ${String(result.totalFiles)} files reviewed (${result.reviewCoverage})`;
}

/** Renders the collapsible statistics section in a GitHub review comment. */
export function formatReviewStats(result: PRReviewDraft): string {
  const total = Object.values(result.findingsBySeverity).reduce((a, b) => a + b, 0);
  const parts: string[] = [];
  for (const severity of ['critical', 'high', 'medium', 'low', 'info'] as ReviewSeverity[]) {
    const count = result.findingsBySeverity[severity];
    if (count > 0) parts.push(`${SEVERITY_EMOJI[severity]} ${String(count)} ${severity}`);
  }

  return `<details>
<summary>Review Statistics (${String(total)} findings)</summary>

- Experts: ${String(result.expertCount)}
- Files: ${formatFileReviewCoverage(result)}
- Consensus: ${(result.consensusScore * 100).toFixed(0)}%
- Duration: ${String(result.totalDurationMs)}ms
- Findings: ${parts.join(', ') || 'none'}

</details>`;
}
