/**
 * Goodhart-resistant outcome feedback for auto-remediations (#3540 inc.2f / #3616).
 *
 * Condition 5 + the epic's outcome-feedback increment. For the capability loop to
 * be Darwinian, it must select remediations on MEASURED success — but "success"
 * is trivially gameable. The naive metric "a remediation PR was opened" (or even
 * "merged") is Goodhartable: it rewards activity, not improvement. This module
 * defines what actually counts:
 *
 *   success  ≡  the PR was **merged by a human**  AND  fitness **recovered**
 *              by at least `minFitnessDelta` within the attribution window.
 *
 * and how confident that judgement is:
 *
 *   pending  — the attribution window has not elapsed (or the PR isn't merged
 *              yet): too early to record an outcome at all.
 *   low      — window elapsed but the signal is confounded (concurrent merges /
 *              CI noise in the window) — record, but mark low-confidence.
 *   high     — window elapsed, human-merged, no confounders.
 *
 * Bot/auto-merges never count as success (they bypass the human-validation that
 * makes the metric trustworthy). The enforce path (#3618) computes the inputs
 * (PR state, fitness before/after, concurrent merges) and feeds the resulting
 * outcome to the OutcomeStore so the selection loop learns from real results.
 * This module is pure logic — it reads nothing and records nothing itself.
 *
 * @module mcp/tools/improvement-remediation-outcome
 */

// @export-no-consumer-yet — see #3618
// The enforce capstone (#3618) computes the inputs and records the assessed
// outcome to the OutcomeStore; this Goodhart-resistant assessment is built ahead
// for that named consumer.

/** Tuning for {@link assessRemediationOutcome}. */
export interface RemediationOutcomeConfig {
  /** Minimum fitness improvement (points) to count as a recovery. */
  readonly minFitnessDelta: number;
}

/** Conservative default — require a meaningful, not-noise recovery. */
export const DEFAULT_REMEDIATION_OUTCOME_CONFIG: RemediationOutcomeConfig = {
  minFitnessDelta: 1,
};

/** Observed facts about a remediation, supplied by the enforce path (#3618). */
export interface RemediationOutcomeInput {
  readonly signalKey: string;
  /** Whether the remediation PR has been merged. */
  readonly prMerged: boolean;
  /** Whether the merge was performed by a human (NOT an auto/bot merge). */
  readonly mergedByHuman: boolean;
  /** Fitness score before the remediation landed. */
  readonly fitnessBefore: number;
  /** Fitness score after the attribution window. */
  readonly fitnessAfter: number;
  /** Whether the isolated attribution window has fully elapsed. */
  readonly attributionWindowElapsed: boolean;
  /** Count of OTHER merges within the attribution window (confounders). */
  readonly concurrentMerges: number;
}

/** Confidence in the outcome judgement. `pending` = do not record yet. */
export type RemediationOutcomeConfidence = 'pending' | 'low' | 'high';

/** The assessed outcome. `success` is only meaningful when confidence ≠ pending. */
export interface RemediationOutcomeAssessment {
  readonly signalKey: string;
  readonly success: boolean;
  readonly confidence: RemediationOutcomeConfidence;
  readonly fitnessDelta: number;
  readonly reason: string;
  /** True when this assessment is safe to record to the OutcomeStore. */
  readonly recordable: boolean;
}

/**
 * Assess a remediation's outcome under the Goodhart-resistant rules. Pure.
 * Returns `recordable: false` for `pending` — premature/unmerged remediations
 * must NOT be recorded as outcomes (recording "PR opened" is the failure mode
 * this module exists to prevent).
 */
export function assessRemediationOutcome(
  input: RemediationOutcomeInput,
  config: RemediationOutcomeConfig = DEFAULT_REMEDIATION_OUTCOME_CONFIG
): RemediationOutcomeAssessment {
  const fitnessDelta = input.fitnessAfter - input.fitnessBefore;
  const base = { signalKey: input.signalKey, fitnessDelta };

  // Not yet merged, or window still open → too early to judge. Do not record.
  if (!input.prMerged || !input.attributionWindowElapsed) {
    return {
      ...base,
      success: false,
      confidence: 'pending',
      recordable: false,
      reason: !input.prMerged
        ? 'PR not merged — outcome pending (never recorded as success on "PR opened")'
        : 'attribution window not yet elapsed — outcome pending',
    };
  }

  // Merged, but by a bot/auto-merge → not a human-validated success (Goodhart).
  if (!input.mergedByHuman) {
    return {
      ...base,
      success: false,
      confidence: 'high',
      recordable: true,
      reason: 'merged without human validation — not counted as success',
    };
  }

  const recovered = fitnessDelta >= config.minFitnessDelta;
  const confounded = input.concurrentMerges > 0;
  const confidence: RemediationOutcomeConfidence = confounded ? 'low' : 'high';
  return {
    ...base,
    success: recovered,
    confidence,
    recordable: true,
    reason: recovered
      ? `human-merged + fitness recovered by ${String(fitnessDelta)} (≥ ${String(config.minFitnessDelta)})${confounded ? `; confounded by ${String(input.concurrentMerges)} concurrent merge(s) — low confidence` : ''}`
      : `human-merged but fitness did not recover (Δ ${String(fitnessDelta)} < ${String(config.minFitnessDelta)})${confounded ? `; ${String(input.concurrentMerges)} concurrent merge(s)` : ''}`,
  };
}
