/**
 * Per-voter pr_review eval types — verdict records + precision/recall report.
 *
 * The data plumbing for #3848 (Epic E, parent #3845): for each labeled eval
 * case, record EACH voter role's verdict against the rubric ground truth
 * (#3846) so per-voter true-positive / false-positive / false-negative tallies
 * accrue and precision/recall per role becomes queryable over time. This is the
 * evidence a chronically-noisy-voter demotion (Epic D / ADR-0017 authority
 * ladder) would cite.
 *
 * Records ONLY — no live routing/weighting change. Acting on the metrics
 * (voter demotion) is a separate, ratified Epic D transition.
 *
 * @module mcp/tools/pr-review-eval-types
 * (Source: #3848 — per-voter precision/recall in the outcome store)
 */

import { z } from 'zod';

// ============================================================================
// Voter roles (mirrors the pr_review panel — #3845)
// ============================================================================

/**
 * The five pr_review voter roles scored by this module. Kept as a local Zod
 * enum (not imported from the broader {@link VoterRole} union) because the eval
 * scores ONLY the pr_review panel; the wider union carries roles
 * (`ai_ml`, `pm`) that the pr_review tool does not run.
 */
export const PR_REVIEW_EVAL_ROLES = [
  'architect',
  'security',
  'devex',
  'catfish',
  'scope_steward',
] as const;

export const PrReviewEvalRoleSchema = z.enum(PR_REVIEW_EVAL_ROLES);
export type PrReviewEvalRole = z.infer<typeof PrReviewEvalRoleSchema>;

// ============================================================================
// Ground truth (rubric-adjudicated — #3846)
// ============================================================================

/**
 * The rubric class of an eval case (rubric Rule 3–4).
 * - `buggy`: contains >=1 known bug at severity medium+; a verified finding is a catch.
 * - `clean`: zero known bugs; a verified finding is a strict false positive.
 * - `borderline`: defensible-but-unconfirmed; excluded from BOTH numerators
 *   (neither a catch nor a false positive).
 */
export const PrReviewCaseClassSchema = z.enum(['buggy', 'clean', 'borderline']);
export type PrReviewCaseClass = z.infer<typeof PrReviewCaseClassSchema>;

// ============================================================================
// Per-voter per-case verdict record (the persisted unit)
// ============================================================================

/**
 * One voter's scored verdict on one eval case, adjudicated against ground truth.
 *
 * The four tally fields are the rubric-scored outcome of comparing the voter's
 * verified findings to the case's known bugs (with location tolerance applied
 * upstream by {@link scoreVoterCase}):
 * - `truePositives`: verified findings that matched a known bug (buggy cases).
 * - `falsePositives`: verified findings on a clean case that matched no bug.
 * - `falseNegatives`: known bugs on a buggy case that this voter did NOT flag.
 *
 * Borderline cases contribute zero to all three (excluded numerators) but are
 * still recorded for provenance via `caseClass: 'borderline'`.
 */
export const VoterEvalVerdictSchema = z.object({
  /** Stable record id (e.g. `${runId}:${caseNumber}:${role}`). */
  id: z.string().min(1).max(160),
  /** The pr_review run / batch this verdict belongs to. */
  runId: z.string().min(1).max(64),
  /** Dataset case identifier (the dataset's `number` field). */
  caseNumber: z.string().min(1).max(80),
  /** Rubric class of the case (ground-truth label). */
  caseClass: PrReviewCaseClassSchema,
  /** The voter role being scored. */
  role: PrReviewEvalRoleSchema,
  /** Verified findings that matched a known bug. */
  truePositives: z.number().int().nonnegative(),
  /** Verified findings on clean code that matched no known bug. */
  falsePositives: z.number().int().nonnegative(),
  /** Known bugs this voter failed to flag. */
  falseNegatives: z.number().int().nonnegative(),
  /** Rubric version the ground truth was adjudicated under. */
  rubricVersion: z.string().min(1).max(32),
  /** ISO-8601 timestamp the verdict was recorded. */
  timestamp: z.string().min(1).max(40),
});

export type VoterEvalVerdict = z.infer<typeof VoterEvalVerdictSchema>;

/** Query filter for {@link PrReviewEvalStore.query}. */
export const VoterEvalVerdictQuerySchema = z.object({
  role: PrReviewEvalRoleSchema.optional(),
  runId: z.string().min(1).max(64).optional(),
  caseClass: PrReviewCaseClassSchema.optional(),
  rubricVersion: z.string().min(1).max(32).optional(),
  /** ISO-8601 lower bound (inclusive) on `timestamp`. */
  since: z.string().optional(),
  /** Most-recent-N cap. */
  limit: z.number().int().positive().optional(),
});

export type VoterEvalVerdictQuery = z.infer<typeof VoterEvalVerdictQuerySchema>;

// ============================================================================
// Report types (per-voter precision/recall — pure, fixture-tested)
// ============================================================================

/** Precision/recall tallies + derived rates for one voter role (or aggregate). */
export interface VoterPrecisionRecall {
  readonly truePositives: number;
  readonly falsePositives: number;
  readonly falseNegatives: number;
  /**
   * tp / (tp + fp). 0 when the voter raised zero positives (tp+fp === 0) — a
   * voter that never speaks has no measurable precision; we report 0 rather
   * than NaN so the value is sortable and persistable.
   */
  readonly precision: number;
  /**
   * tp / (tp + fn). 0 when there were zero known bugs to find (tp+fn === 0).
   */
  readonly recall: number;
  /** Distinct eval cases that contributed to this voter's tallies. */
  readonly caseCount: number;
}

/** Per-voter precision/recall report over a window of verdicts. */
export interface PerVoterPrecisionRecallReport {
  /** One entry per pr_review role (roles with no verdicts report zeros). */
  readonly byRole: Readonly<Record<PrReviewEvalRole, VoterPrecisionRecall>>;
  /** Panel-wide tallies summed across all roles. */
  readonly aggregate: VoterPrecisionRecall;
  /** Total verdict records folded into this report. */
  readonly totalVerdicts: number;
}
