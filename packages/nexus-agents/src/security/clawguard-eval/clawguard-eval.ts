/**
 * nexus-agents/security — ClawGuard violation false-positive-rate + precision scorer
 * (#4104, epic #4094, PART 2 of #4097).
 *
 * A deterministic scorer over a hand-labeled corpus of ClawGuard access-policy
 * violations (the warnings the enforcer in
 * `security/access-constraint-deriver/enforcer.ts` produces). It is the MEASUREMENT
 * MECHANISM for the #2077 audit→enforce decision: #4097 PART 1 made audit-mode
 * violations persist as durable `clawguard_violation` audit events; this builds the
 * scorer + a labeled fixture corpus so the precision of FIRED violations is
 * measurable before any enforce flip.
 *
 * HOW IT STAYS DETERMINISTIC. The score is a pure tally over the corpus labels —
 * no I/O, no RNG, no clock. truePositives = count(!isFalsePositive),
 * falsePositives = count(isFalsePositive). Same corpus ⇒ identical numbers.
 *
 * INTERPRETING THE RESULT (intellectual honesty, for the #2077 decision):
 *  - The fixture FP-rate / precision is a PROXY that validates the SCORER MECHANISM
 *    on hand-authored examples — NOT a production readiness number. A low fixture
 *    FP-rate does NOT justify flipping ClawGuard to enforce mode.
 *  - The real #2077 audit→enforce decision needs the LIVE persisted
 *    `clawguard_violation` events (queryable via `AuditTrail.query`) human-labeled,
 *    meeting precision ≥ 0.90 ∧ recall ≥ 0.80 over ≥ 100 judged events (per
 *    docs/governance/loop-promotion-criteria.md). This corpus is the rehearsal of
 *    that labeling shape, not a substitute for it.
 *  - SCOPE: this corpus measures PRECISION of FIRED violations only (TP vs FP among
 *    violations that actually fired). RECALL — missed violations / false negatives —
 *    is OUT OF SCOPE here, because a fired-violation corpus contains only TP + FP
 *    (it cannot observe a violation that never fired). Recall belongs to the live
 *    judged-event path above.
 *
 * @module security/clawguard-eval/clawguard-eval
 */

// @export-no-consumer-yet — see #4104. Consumed by its test now; production consumer is the #2077 audit→enforce readiness path once live clawguard_violation events are human-labeled into this entry shape.

/** A hand-labeled ClawGuard violation, self-justifying so the FP/TP label is reproducible. */
export interface ClawGuardCorpusEntry {
  readonly tool: string;
  readonly path?: string;
  /** The violation category/rule that fired (e.g. 'unbypassable:path', 'unbypassable:tool', 'allowedTools', 'allowedTools:confirm_risky'). */
  readonly rule: string;
  /** The human-readable warning the enforcer produced. */
  readonly warning: string;
  /** The task context/objective that makes the FP/TP label DETERMINABLE (esp. for allowedTools violations). For unbypassable rules this can note "TP by design". */
  readonly taskContext: string;
  /** true = the policy wrongly flagged a legitimate access (false alarm); false = a genuine risky access correctly flagged (true positive). */
  readonly isFalsePositive: boolean;
  /** One-line justification of the label against tool/path/rule/taskContext — makes the label auditable. */
  readonly rationale: string;
}

export interface ClawGuardFalsePositiveResult {
  readonly total: number;
  readonly truePositives: number;
  readonly falsePositives: number;
  /** falsePositives / total; 0 when total is 0. */
  readonly falsePositiveRate: number;
  /** truePositives / (truePositives + falsePositives) = 1 − falsePositiveRate; 0 when total is 0. Precision of FIRED violations. */
  readonly precision: number;
}

/**
 * Score a hand-labeled ClawGuard violation corpus. Pure and deterministic: tallies
 * the FP/TP labels, guarding divide-by-zero (empty corpus → all zeros).
 */
export function computeClawGuardFalsePositiveRate(
  entries: readonly ClawGuardCorpusEntry[]
): ClawGuardFalsePositiveResult {
  const total = entries.length;
  let falsePositives = 0;
  for (const entry of entries) {
    if (entry.isFalsePositive) falsePositives++;
  }
  const truePositives = total - falsePositives;
  if (total === 0) {
    return { total: 0, truePositives: 0, falsePositives: 0, falsePositiveRate: 0, precision: 0 };
  }
  return {
    total,
    truePositives,
    falsePositives,
    falsePositiveRate: falsePositives / total,
    precision: truePositives / total,
  };
}
