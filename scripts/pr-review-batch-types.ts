/**
 * Shared types for the pr_review batch harness (#2240).
 *
 * @module scripts/pr-review-batch-types
 */

import { z } from 'zod';

// ============================================================================
// Dataset (input — checked into the repo)
// ============================================================================

/** A single PR in the historical evaluation set, OR a synthetic test case
 * with an inline diff. Either has known bugs (with post-merge fix references
 * for historical PRs, or the bug location for synthetic ones) or is `clean`. */
export const SamplePrSchema = z.object({
  /** PR number on the project repo (used to fetch diff via gh api), OR a
   * synthetic id like `synthetic-001` when paired with `customDiff`. */
  number: z
    .union([z.number().int().positive(), z.string().min(1).max(50)])
    .describe('PR number, or synthetic ID for customDiff entries'),
  title: z.string().min(1).max(500),
  /** Optional inline diff. When set, harness uses this instead of fetching
   * from GitHub — lets us hand-craft test cases with known diff-readable
   * bugs at controlled locations. */
  customDiff: z.string().max(50_000).optional(),
  /** Optional inline description (used with customDiff). */
  customDescription: z.string().max(5000).optional(),
  /** Empty array = clean PR. Each entry describes a known bug introduced
   * by this PR (and typically fixed by a follow-up PR/commit, or, for
   * synthetic cases, deliberately placed by the test author). */
  knownBugs: z.array(
    z.object({
      summary: z.string().min(1).max(500),
      /** The fix — PR number, commit SHA, issue number, or 'synthetic' for
       * hand-crafted test cases. */
      fixReference: z.string().min(1).max(200),
      /** Optional file:line hint where the bug lived, to help score finding
       * matches. */
      location: z.string().max(200).optional(),
    })
  ),
  notes: z.string().max(1000).optional(),
});

export type SamplePr = z.infer<typeof SamplePrSchema>;

export const SampleDatasetSchema = z.object({
  /** When the dataset was curated (ET, ISO format). */
  curatedAt: z.string(),
  /** Curation methodology — short note. */
  methodology: z.string().min(1).max(2000),
  prs: z.array(SamplePrSchema).min(1).max(100),
});

export type SampleDataset = z.infer<typeof SampleDatasetSchema>;

// ============================================================================
// Per-PR result (output of the batch run)
// ============================================================================

export interface BatchPrResult {
  readonly prNumber: number | string;
  readonly title: string;
  readonly knownBugCount: number;
  readonly diffSize: number;
  readonly diffTruncated: boolean;
  /** Aggregated decision from pr_review. */
  readonly summary: 'approve' | 'request_changes' | 'abstain';
  readonly approveCount: number;
  readonly requestChangesCount: number;
  readonly abstainCount: number;
  readonly errorCount: number;
  /** Per-voter results (full reasoning omitted to keep JSONL lines manageable). */
  readonly voters: readonly {
    readonly role: string;
    readonly decision: string;
    readonly confidence: number;
    readonly source: string;
    readonly cli?: string;
    readonly verifiedFindingCount: number;
    readonly unverifiedFindingCount: number;
    /** Top 5 findings only (full set in `findingsByVoter` below). */
    readonly findings: readonly {
      readonly summary: string;
      readonly location: string;
      readonly severity: string;
      readonly verified: boolean;
    }[];
  }[];
  readonly totalDurationMs: number;
  readonly errorMessage?: string;
}

export interface BatchSummary {
  readonly startedAt: string;
  readonly completedAt: string;
  readonly dataset: string;
  readonly simulate: boolean;
  readonly totalPrs: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly results: readonly BatchPrResult[];
}

// ============================================================================
// Score report (output of the scorer)
// ============================================================================

export interface PerPrScore {
  readonly prNumber: number | string;
  readonly knownBugCount: number;
  readonly toolDecision: 'approve' | 'request_changes' | 'abstain';
  readonly verifiedFindingCount: number;
  /** Did the tool's decision match expected for this PR class?
   * - For known-buggy: expected `request_changes`, got `request_changes` = match
   * - For clean: expected `approve`, got `approve` = match
   * - Anything else = mismatch */
  readonly classDecisionMatch: boolean;
  /** For known-buggy PRs only: how many of the known bugs did the tool's
   * verified findings overlap with (by file:line substring match)? */
  readonly knownBugsMatched: number;
}

export interface ScoreReport {
  readonly source: string;
  readonly totalPrs: number;
  readonly buggyPrs: number;
  readonly cleanPrs: number;
  /** Of buggy PRs: how many did the tool flag as request_changes? */
  readonly bugCatchRate: number;
  /** Of clean PRs: how many did the tool flag as request_changes (false positives)? */
  readonly falsePositiveRate: number;
  /** Of buggy PRs: how many had at least one verified finding overlapping
   * a known bug location? */
  readonly knownBugMatchRate: number;
  /** Avg time to decision per PR. */
  readonly avgDurationMs: number;
  /** Per-PR breakdown. */
  readonly perPr: readonly PerPrScore[];
  /** Pass/fail against #2233 success criteria. */
  readonly successCriteria: {
    readonly bugCatchAtLeastTenPercent: boolean;
    readonly falsePositiveBelowTwentyPercent: boolean;
    readonly avgDurationBelowFiveMinutes: boolean;
  };
}
