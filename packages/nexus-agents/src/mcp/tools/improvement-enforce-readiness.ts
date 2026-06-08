/**
 * Quantified shadow→enforce exit criterion (#3540 increment 2b / #3612).
 *
 * Condition 1 of the auto-invoke gate. Promotion from shadow (observe-only,
 * #3611) to enforce (#3618) must turn on a FALSIFIABLE numeric gate, not an
 * unfalsifiable "shows sound selection". Mirrors the tune-loop's explicit exit
 * criteria (#3323): a fixed set of conditions, each independently checkable,
 * ALL required (fail-closed — any unmet condition blocks enforce).
 *
 * The criteria, per the design vote:
 *  1. **Volume** — at least `minShadowSelections` shadow would-remediate
 *     decisions observed (enough data to judge).
 *  2. **Judged coverage** — at least `minJudgedRate` of those selections have
 *     actually been reviewed by the evaluator (you can't certify what you didn't
 *     look at).
 *  3. **Soundness** — at least `minSoundnessRate` of the *judged* selections
 *     were assessed sound (the loop picks the right remediations).
 *  4. **Named evaluator** — a specific person/role signed the soundness review.
 *  5. **Named owner** — a specific owner accepts turning enforcement on.
 *
 * This module only EVALUATES readiness against supplied data; it flips no flag
 * and runs no remediation. The enforce path (#3618) calls it and refuses to
 * enable enforcement unless `ready` is true. Soundness/evaluator/owner data is
 * supplied by the operational review of shadow records (selection counts come
 * from {@link summarizeRemediationShadow}).
 *
 * @module mcp/tools/improvement-enforce-readiness
 */

/** Tuning for {@link evaluateEnforceReadiness}. */
export interface EnforceReadinessConfig {
  /** Minimum shadow would-remediate decisions before enforce can be considered. */
  readonly minShadowSelections: number;
  /** Minimum fraction of selections that must have been reviewed by the evaluator. */
  readonly minJudgedRate: number;
  /** Minimum fraction of JUDGED selections that must be assessed sound. */
  readonly minSoundnessRate: number;
  /** Whether a named evaluator is required. */
  readonly requireNamedEvaluator: boolean;
  /** Whether a named owner sign-off is required. */
  readonly requireNamedOwner: boolean;
}

/** Conservative defaults — high bar, fail-closed. */
export const DEFAULT_ENFORCE_READINESS_CONFIG: EnforceReadinessConfig = {
  minShadowSelections: 20,
  minJudgedRate: 0.8,
  minSoundnessRate: 0.9,
  requireNamedEvaluator: true,
  requireNamedOwner: true,
};

/** The operational evidence the exit criterion is evaluated against. */
export interface EnforceReadinessEvidence {
  /** Count of shadow would-remediate decisions observed (from the shadow sink). */
  readonly shadowSelections: number;
  /** How many of those selections the evaluator actually reviewed. */
  readonly judgedSelections: number;
  /** How many reviewed selections were assessed SOUND. */
  readonly judgedSound: number;
  /** Named evaluator who performed the soundness review (undefined = none). */
  readonly evaluator?: string;
  /** Named owner accepting enforcement (undefined = none). */
  readonly owner?: string;
}

/** One checked condition of the exit criterion. */
export interface ReadinessCriterion {
  readonly name: string;
  readonly met: boolean;
  readonly detail: string;
}

/** Full readiness verdict. `ready` is true iff every criterion is met. */
export interface EnforceReadinessReport {
  readonly ready: boolean;
  readonly criteria: readonly ReadinessCriterion[];
  /** Names of the unmet criteria (empty when ready). */
  readonly blockers: readonly string[];
}

function pct(n: number, d: number): number {
  return d === 0 ? 0 : n / d;
}

/** Build a "named X is present" criterion (evaluator/owner), keeping the main fn simple. */
function presenceCriterion(
  name: string,
  label: string,
  value: string,
  required: boolean
): ReadinessCriterion {
  const present = value !== '';
  return {
    name,
    met: !required || present,
    detail: present ? `${label}: ${value}` : `no named ${label}`,
  };
}

/**
 * Evaluate whether shadow→enforce promotion criteria are met. Pure; supply the
 * operational evidence. Never returns `ready: true` unless ALL criteria pass.
 */
export function evaluateEnforceReadiness(
  evidence: EnforceReadinessEvidence,
  config: EnforceReadinessConfig = DEFAULT_ENFORCE_READINESS_CONFIG
): EnforceReadinessReport {
  const judgedRate = pct(evidence.judgedSelections, evidence.shadowSelections);
  const soundnessRate = pct(evidence.judgedSound, evidence.judgedSelections);
  const evaluator = evidence.evaluator?.trim() ?? '';
  const owner = evidence.owner?.trim() ?? '';

  const criteria: ReadinessCriterion[] = [
    {
      name: 'volume',
      met: evidence.shadowSelections >= config.minShadowSelections,
      detail: `${String(evidence.shadowSelections)} shadow selections (need ≥ ${String(config.minShadowSelections)})`,
    },
    {
      name: 'judged-coverage',
      met: judgedRate >= config.minJudgedRate,
      detail: `${String(Math.round(judgedRate * 100))}% reviewed (need ≥ ${String(Math.round(config.minJudgedRate * 100))}%)`,
    },
    {
      name: 'soundness',
      met: evidence.judgedSelections > 0 && soundnessRate >= config.minSoundnessRate,
      detail: `${String(Math.round(soundnessRate * 100))}% of reviewed judged sound (need ≥ ${String(Math.round(config.minSoundnessRate * 100))}%, with reviews present)`,
    },
    presenceCriterion('named-evaluator', 'evaluator', evaluator, config.requireNamedEvaluator),
    presenceCriterion('named-owner', 'owner', owner, config.requireNamedOwner),
  ];

  const blockers = criteria.filter((c) => !c.met).map((c) => c.name);
  return { ready: blockers.length === 0, criteria, blockers };
}
