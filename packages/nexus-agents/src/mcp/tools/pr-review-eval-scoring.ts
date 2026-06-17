/**
 * Per-voter pr_review eval scoring + precision/recall report (#3848).
 *
 * Two pure, deterministic functions (the computeResearchMaturityReport / #3727
 * pattern):
 * - {@link scoreVoterCase}: apply the rubric (#3846) to one voter's outcome on
 *   one case, yielding a persistable {@link VoterEvalVerdict} with TP/FP/FN
 *   tallies. Location-tolerance matching (±5 lines / structural) is the
 *   caller's job upstream — this function takes the already-resolved
 *   matched-bug / verified-finding counts and applies the class rules.
 * - {@link computePerVoterPrecisionRecall}: fold a window of verdicts into
 *   per-role + aggregate precision/recall.
 *
 * No I/O, no live routing change — record + measure only.
 *
 * @module mcp/tools/pr-review-eval-scoring
 * (Source: #3848 — per-voter precision/recall in the outcome store)
 */

import { PR_REVIEW_EVAL_ROLES } from './pr-review-eval-types.js';
import type {
  PrReviewCaseClass,
  PrReviewEvalRole,
  VoterEvalVerdict,
  VoterPrecisionRecall,
  PerVoterPrecisionRecallReport,
} from './pr-review-eval-types.js';

// ============================================================================
// Scoring one voter on one case
// ============================================================================

/**
 * Inputs to {@link scoreVoterCase}: a single voter's adjudicated outcome on a
 * single labeled eval case. The match counts are produced upstream by applying
 * the rubric's location tolerance to the voter's verified findings vs the
 * case's `knownBugs`.
 */
export interface ScoreVoterCaseInput {
  readonly runId: string;
  readonly caseNumber: string;
  readonly caseClass: PrReviewCaseClass;
  readonly role: PrReviewEvalRole;
  /** Number of known bugs on the case (ground truth; 0 for clean/borderline). */
  readonly knownBugCount: number;
  /** Known bugs THIS voter flagged with a verified, location-matching finding. */
  readonly matchedBugCount: number;
  /** Count of this voter's verified findings (gate-passed). */
  readonly verifiedFindingCount: number;
  readonly rubricVersion: string;
  readonly timestamp: string;
}

/**
 * Apply the rubric to one voter/case pair and produce a scored verdict.
 *
 * Class rules (#3846):
 * - `buggy`: matched bugs are true positives; unmatched known bugs are false
 *   negatives. Extra non-matching findings are NOT counted as false positives
 *   (strict-FP is a clean-case-only measure).
 * - `clean`: every verified finding is a strict false positive.
 * - `borderline`: excluded from all numerators (neither catch nor FP).
 */
export function scoreVoterCase(input: ScoreVoterCaseInput): VoterEvalVerdict {
  const knownBugs = Math.max(0, Math.trunc(input.knownBugCount));
  // Defensive clamp: a voter cannot match more bugs than exist.
  const matched = Math.min(knownBugs, Math.max(0, Math.trunc(input.matchedBugCount)));
  const verified = Math.max(0, Math.trunc(input.verifiedFindingCount));

  let truePositives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;

  switch (input.caseClass) {
    case 'buggy':
      truePositives = matched;
      falseNegatives = knownBugs - matched;
      break;
    case 'clean':
      falsePositives = verified;
      break;
    case 'borderline':
      // Excluded from both numerators by rubric Rule 4.
      break;
  }

  return {
    id: `${input.runId}:${input.caseNumber}:${input.role}`,
    runId: input.runId,
    caseNumber: input.caseNumber,
    caseClass: input.caseClass,
    role: input.role,
    truePositives,
    falsePositives,
    falseNegatives,
    rubricVersion: input.rubricVersion,
    timestamp: input.timestamp,
  };
}

// ============================================================================
// Precision / recall over a window of verdicts
// ============================================================================

interface RoleAccumulator {
  tp: number;
  fp: number;
  fn: number;
  cases: Set<string>;
}

function emptyAccumulator(): RoleAccumulator {
  return { tp: 0, fp: 0, fn: 0, cases: new Set<string>() };
}

/** precision = tp/(tp+fp), 0 when no positives raised (avoids NaN). */
function precision(tp: number, fp: number): number {
  const denom = tp + fp;
  return denom > 0 ? tp / denom : 0;
}

/** recall = tp/(tp+fn), 0 when no bugs to find (avoids NaN). */
function recall(tp: number, fn: number): number {
  const denom = tp + fn;
  return denom > 0 ? tp / denom : 0;
}

function finalize(acc: RoleAccumulator): VoterPrecisionRecall {
  return {
    truePositives: acc.tp,
    falsePositives: acc.fp,
    falseNegatives: acc.fn,
    precision: precision(acc.tp, acc.fp),
    recall: recall(acc.tp, acc.fn),
    caseCount: acc.cases.size,
  };
}

/**
 * Fold a window of per-voter verdicts into a precision/recall report.
 *
 * Pure + deterministic. Every pr_review role appears in `byRole` (roles with no
 * verdicts report all-zero entries) so consumers can render a stable table. The
 * aggregate sums tallies across all roles; `caseCount` is distinct case numbers
 * per role (so re-scoring the same case across runs does not inflate it within
 * a role, though it does across roles).
 */
export function computePerVoterPrecisionRecall(
  verdicts: readonly VoterEvalVerdict[]
): PerVoterPrecisionRecallReport {
  const byRoleAcc = new Map<PrReviewEvalRole, RoleAccumulator>();
  for (const role of PR_REVIEW_EVAL_ROLES) {
    byRoleAcc.set(role, emptyAccumulator());
  }
  const aggregate = emptyAccumulator();

  for (const v of verdicts) {
    const acc = byRoleAcc.get(v.role);
    if (acc === undefined) continue; // unknown role — defensive, schema-guarded
    acc.tp += v.truePositives;
    acc.fp += v.falsePositives;
    acc.fn += v.falseNegatives;
    acc.cases.add(v.caseNumber);

    aggregate.tp += v.truePositives;
    aggregate.fp += v.falsePositives;
    aggregate.fn += v.falseNegatives;
    aggregate.cases.add(`${v.role}:${v.caseNumber}`);
  }

  const byRole = {} as Record<PrReviewEvalRole, VoterPrecisionRecall>;
  for (const role of PR_REVIEW_EVAL_ROLES) {
    byRole[role] = finalize(byRoleAcc.get(role) ?? emptyAccumulator());
  }

  return {
    byRole,
    aggregate: finalize(aggregate),
    totalVerdicts: verdicts.length,
  };
}
