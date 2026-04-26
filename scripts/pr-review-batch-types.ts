/**
 * Shared types for the pr_review batch harness (#2240).
 *
 * @module scripts/pr-review-batch-types
 */

import { z } from 'zod';

// ============================================================================
// Dataset (input — checked into the repo)
// ============================================================================

/** A single PR in the historical evaluation set. Either has known bugs (with
 * post-merge fix references) or is `clean` (no known bugs). */
export const SamplePrSchema = z.object({
  number: z
    .number()
    .int()
    .positive()
    .describe('PR number on github.com/williamzujkowski/nexus-agents'),
  title: z.string().min(1).max(500),
  /** Empty array = clean PR. Each entry describes a known bug introduced
   * by this PR (and typically fixed by a follow-up PR/commit). */
  knownBugs: z.array(
    z.object({
      summary: z.string().min(1).max(500),
      /** The fix — PR number, commit SHA, or issue number that reverted/fixed
       * this bug. At least one required to count as a "known" bug. */
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
  readonly prNumber: number;
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
  readonly prNumber: number;
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
