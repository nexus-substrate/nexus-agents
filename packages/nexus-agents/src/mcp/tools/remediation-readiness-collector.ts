/**
 * Readiness-evidence collector (#3764) — the 3rd link in the autonomy
 * enforce-decision-gate evidence chain (#3540 / #3653).
 *
 * Builds the {@link EnforceReadinessEvidence} that {@link evaluateEnforceReadiness}
 * consumes, from two durable, secret-scrubbed surfaces that just landed:
 *  - the soak summary (#3762) → `shadowSelections` (audit-mode would-remediate count);
 *  - the soundness-review summary (#3765) → `judgedSelections` / `judgedSound` /
 *    `evaluator` / `owner`.
 *
 * This replaces the hardcoded `NOT_READY` producer in `auto-remediation-deps.ts`.
 * FAIL-CLOSED by construction: with no review data, `judgedSelections` is 0 →
 * the judged-coverage criterion fails → enforce stays blocked. It is a pure
 * projection (the two summaries are the only inputs); the async `readiness()`
 * provider that reads them off disk lives in `auto-remediation-deps.ts`.
 *
 * @module mcp/tools/remediation-readiness-collector
 */

import type { EnforceReadinessEvidence } from './improvement-enforce-readiness.js';
import type { RemediationSoakSummary } from './improvement-remediation-shadow.js';
import type { RemediationReviewSummary } from './remediation-review.js';

/**
 * Project the durable soak + review summaries into the evidence the readiness
 * gate evaluates. Pure; no I/O. `shadowSelections` is the soak total (every
 * audit-mode selection is a would-remediate observation). Evaluator/owner are
 * carried through only when present, so the gate's named-evaluator/owner
 * criteria fail-closed when the human surface has not signed off.
 */
export function buildEnforceReadinessEvidence(
  soak: RemediationSoakSummary,
  reviews: RemediationReviewSummary
): EnforceReadinessEvidence {
  return {
    shadowSelections: soak.total,
    judgedSelections: reviews.judgedSelections,
    judgedSound: reviews.judgedSound,
    ...(reviews.evaluator !== undefined ? { evaluator: reviews.evaluator } : {}),
    ...(reviews.owner !== undefined ? { owner: reviews.owner } : {}),
  };
}
