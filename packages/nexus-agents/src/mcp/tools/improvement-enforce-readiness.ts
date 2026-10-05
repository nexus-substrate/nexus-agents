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
 *  4. **Named evaluator** — a named human or owner-sample reviewer judged a ref;
 *     a panel identifier never substitutes for a human evaluator.
 *  5. **Named owner** — a specific owner accepts turning enforcement on.
 *  6. **Owner agreement** — a random sample has enough owner judgments and
 *     no more than the configured disagreements with the panel. The sample must
 *     be drawn strictly after the latest current panel judgment. With no current panel
 *     judgments in the raw store, owner agreement is explicitly
 *     not applicable (the human path); overridden rejections need owner confirmation.
 *     The owner-sample model is defined in remediation-review-sample.ts.
 *     Unverifiable and evicted current panels fail closed.
 *
 * This module only EVALUATES readiness against supplied data; it flips no flag
 * and runs no remediation. The enforce path (#3618) calls it and refuses to
 * enable enforcement unless `ready` is true. Soundness/evaluator/owner data is
 * supplied by the operational review of shadow records (selection counts come
 * from {@link summarizeRemediationShadow}).
 *
 * @module mcp/tools/improvement-enforce-readiness
 */

import type { ReadinessCriterion, ReadinessVerdict } from './readiness-verdict.js';
import type { JudgmentCounts } from './remediation-review.js';

// Re-export the shared envelope under this module's historical name so existing
// consumers of `ReadinessCriterion` from here are unaffected (#4096).
export type { ReadinessCriterion } from './readiness-verdict.js';
export type { JudgmentCounts } from './remediation-review.js';

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
  /** Minimum sampled panel judgments the owner must independently judge. */
  readonly minOwnerSample: number;
  /** Legacy tuning field; owner disagreement history always requires zero disagreements. */
  readonly maxSampleDisagreements: number;
}

/**
 * Conservative defaults — high bar, fail-closed.
 *
 * #4158: `minShadowSelections` is 100 (raised from 20). This gate authorizes the
 * auto-remediation enforce flip, which makes REAL code changes — its volume bar
 * should match the comparably-stakes access-policy flip (the retired
 * clawguard-eval required ≥100 judged events, #2077), not sit 5× lower. Raising it is monotonically safer
 * (a thinner corpus stays in audit longer); overridable per-caller via
 * `config.readinessConfig`.
 */
export const DEFAULT_ENFORCE_READINESS_CONFIG: EnforceReadinessConfig = {
  minShadowSelections: 100,
  minJudgedRate: 0.8,
  minSoundnessRate: 0.9,
  requireNamedEvaluator: true,
  requireNamedOwner: true,
  minOwnerSample: 10,
  maxSampleDisagreements: 0,
};

/** The operational evidence the exit criterion is evaluated against. */
export interface EnforceReadinessEvidence {
  /** Count of shadow would-remediate decisions observed (from the shadow sink). */
  readonly shadowSelections: number;
  /** How many of those selections the evaluator actually reviewed. */
  readonly judgedSelections: number;
  /** How many reviewed selections were assessed SOUND. */
  readonly judgedSound: number;
  readonly human?: JudgmentCounts;
  readonly panel?: JudgmentCounts;
  readonly sample?: JudgmentCounts;
  /** False or absent means no durable sample exists. */
  readonly sampleExists?: boolean;
  /** True only when the sample was drawn strictly after the latest current panel judgment. */
  readonly sampleFresh?: boolean;
  /** Named cause when an override is missing from the active draw. */
  readonly sampleFreshnessReason?: string;
  /** Total refs in the active sample, so partial coverage cannot certify agreement. */
  readonly sampledSelections?: number;
  /** Reviews excluded because their bound soak line was evicted from the current store. */
  readonly evictedReviewRows?: number;
  /** Panel rows excluded because their persisted vote evidence could not be verified. */
  readonly unverifiablePanelRows?: number;
  readonly supersededPanelRows?: number;
  readonly mootOwnerDisagreements?: number;
  readonly overriddenPanelRejections?: number;
  readonly unconfirmedPanelRejections?: number;
  readonly unverifiablePanelReasons?: readonly string[];
  /** Raw-store counts retain excluded evidence; superseded panels are reported separately. */
  readonly reviewStoreComplete?: boolean;
  readonly sampleStoreComplete?: boolean;
  readonly rawPanelRows?: number;
  readonly rawOwnerSampleRows?: number;
  readonly evictedPanelRows?: number;
  /** Named human/owner judgments retained across samples, including inactive samples. */
  readonly namedEvaluatorJudgments?: number;
  /** Named evaluator who performed the soundness review (undefined = none). */
  readonly evaluator?: string;
  /** Named owner accepting enforcement (undefined = none). */
  readonly owner?: string;
}

/**
 * Full readiness verdict. `ready` is true iff every criterion is met. Alias of the
 * shared {@link ReadinessVerdict} envelope (#4096).
 */
export type EnforceReadinessReport = ReadinessVerdict;

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

/** Owner samples verify panel decisions and never increase primary coverage. */
function primaryJudgmentCount(evidence: EnforceReadinessEvidence): number {
  return evidence.human !== undefined || evidence.panel !== undefined
    ? (evidence.human?.n ?? 0) + (evidence.panel?.n ?? 0)
    : evidence.judgedSelections;
}

/** Historical named judgments take precedence over the active-sample fallback. */
function namedEvaluatorJudgmentCount(evidence: EnforceReadinessEvidence): number {
  return evidence.namedEvaluatorJudgments ?? (evidence.human?.n ?? 0) + (evidence.sample?.n ?? 0);
}

/** A named evaluator must have human evidence; panel ids are never evaluator names. */
function namedEvaluator(evidence: EnforceReadinessEvidence): string {
  const evaluator = evidence.evaluator?.trim() ?? '';
  const structured = evidence.human !== undefined || evidence.panel !== undefined;
  const humanJudgments = namedEvaluatorJudgmentCount(evidence);
  return /^panel:/i.test(evaluator) || (structured && !(humanJudgments > 0)) ? '' : evaluator;
}

/** Distinguish a stale draw from missing evidence of when the sample was drawn. */
function sampleFreshnessDetail(fresh: boolean | undefined): string {
  return fresh === false
    ? 'stale owner sample — drawn before or at the latest panel judgment'
    : 'unmeasured owner sample freshness';
}

/** Store reads must preserve evidence of disagreement and absence. */
function reviewIntegrityFailure(evidence: EnforceReadinessEvidence): string | undefined {
  if (evidence.reviewStoreComplete === false) {
    return 'corrupt or unreadable review store — raw evidence incomplete';
  }
  if (evidence.sampleStoreComplete === false) {
    return 'corrupt or unreadable owner-sample store — disagreement history incomplete';
  }
  return undefined;
}

/** Excluded panels never become evidence that no panel review occurred. */
function panelEvidenceFailure(evidence: EnforceReadinessEvidence): string | undefined {
  const unverifiable = evidence.unverifiablePanelRows ?? 0;
  if (unverifiable > 0) {
    const reasons = evidence.unverifiablePanelReasons?.join('; ') ?? 'cause unmeasured';
    return `${String(unverifiable)} unverifiable panel rows: ${reasons}; re-judge the ref by a human or re-run panel-judge`;
  }
  const evicted = evidence.evictedPanelRows ?? 0;
  if (evicted > 0) return `${String(evicted)} evicted panel rows`;
  return undefined;
}

/** Reject incomplete evidence before checking whether owner agreement applies. */
function ownerAgreementFailure(evidence: EnforceReadinessEvidence): string | undefined {
  const integrity = reviewIntegrityFailure(evidence);
  if (integrity !== undefined) return integrity;
  const disagreements = evidence.sample?.disagreements ?? 0;
  if (disagreements > 0)
    return `${String(disagreements)} unresolved owner disagreements (allow ≤ 0)`;
  const panels = panelEvidenceFailure(evidence);
  if (panels !== undefined) return panels;
  if (evidence.rawPanelRows === undefined || evidence.rawOwnerSampleRows === undefined) {
    return 'unmeasured raw review-store applicability';
  }
  return evidence.sampleFreshnessReason ?? overrideConfirmationFailure(evidence);
}

function overrideConfirmationFailure(evidence: EnforceReadinessEvidence): string | undefined {
  const unconfirmed = evidence.unconfirmedPanelRejections ?? 0;
  if (unconfirmed === 0) return undefined;
  return `${String(evidence.overriddenPanelRejections ?? unconfirmed)} panel rejections overridden by human; ${String(unconfirmed)} without owner confirmation`;
}

/** Measured absence of current panels makes sampling freshness inapplicable. */
function hasNoPanelReviewHistory(evidence: EnforceReadinessEvidence): boolean {
  return (
    evidence.rawPanelRows !== undefined &&
    evidence.rawPanelRows === (evidence.supersededPanelRows ?? 0) &&
    (evidence.panel?.n ?? 0) === 0
  );
}

/** Panel review needs a fresh, fully measured sample; a raw human-only history needs none. */
function ownerAgreementCriterion(
  evidence: EnforceReadinessEvidence,
  config: EnforceReadinessConfig
): ReadinessCriterion {
  const name = 'owner-agreement';
  const failure = ownerAgreementFailure(evidence);
  if (failure !== undefined) return { name, met: false, detail: failure };
  if (hasNoPanelReviewHistory(evidence)) {
    return {
      name,
      met: true,
      detail: ownerAgreementDetail('n/a — no current panel judgments', evidence),
    };
  }
  if (evidence.sampleExists !== true) {
    return { name, met: false, detail: 'no owner sample exists' };
  }
  if (evidence.sampleFresh !== true) {
    return { name, met: false, detail: sampleFreshnessDetail(evidence.sampleFresh) };
  }
  const total = evidence.sampledSelections;
  if (total === undefined) return { name, met: false, detail: 'unmeasured owner sample size' };
  const sample = evidence.sample ?? { n: 0, disagreements: 0 };
  return {
    name,
    met: sample.n >= config.minOwnerSample && sample.n === total && sample.disagreements === 0,
    detail: ownerAgreementDetail(
      `${String(sample.n)} of ${String(total)} owner sample judgments (need ≥ ${String(config.minOwnerSample)}); ${String(sample.disagreements)} disagreements (allow ≤ 0)`,
      evidence
    ),
  };
}

/** Report moot history and confirmed overrides alongside the applicable agreement verdict. */
function ownerAgreementDetail(detail: string, evidence: EnforceReadinessEvidence): string {
  const moot = evidence.mootOwnerDisagreements ?? 0;
  const overrides = evidence.overriddenPanelRejections ?? 0;
  if (moot > 0) detail += `; ${String(moot)} moot owner disagreements on superseded panel refs`;
  if (overrides > 0)
    detail += `; ${String(overrides)} panel rejections overridden by human; all owner-confirmed`;
  return detail;
}

/** Coverage reports verified measurements and explicitly fails excluded panel evidence. */
function judgedCoverageCriterion(
  evidence: EnforceReadinessEvidence,
  config: EnforceReadinessConfig,
  judgedRate: number
): ReadinessCriterion {
  const unverifiable = evidence.unverifiablePanelRows ?? 0;
  const evicted = evidence.evictedPanelRows ?? 0;
  return {
    name: 'judged-coverage',
    met:
      judgedRate >= config.minJudgedRate &&
      evidence.reviewStoreComplete !== false &&
      unverifiable + evicted === 0,
    detail: `${String(Math.round(judgedRate * 100))}% reviewed (need ≥ ${String(Math.round(config.minJudgedRate * 100))}%); ${String(unverifiable)} unverifiable and ${String(evicted)} evicted panel rows${unverifiable > 0 ? `; ${panelEvidenceFailure(evidence) ?? ''}` : ''}`,
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
  const judgedSelections = primaryJudgmentCount(evidence);
  const judgedRate = pct(judgedSelections, evidence.shadowSelections);
  const soundnessRate = pct(evidence.judgedSound, judgedSelections);
  const evaluator = namedEvaluator(evidence);
  const owner = evidence.owner?.trim() ?? '';

  const criteria: ReadinessCriterion[] = [
    {
      name: 'volume',
      met: evidence.shadowSelections >= config.minShadowSelections,
      detail: `${String(evidence.shadowSelections)} shadow selections (need ≥ ${String(config.minShadowSelections)})`,
    },
    judgedCoverageCriterion(evidence, config, judgedRate),
    {
      name: 'soundness',
      met: judgedSelections > 0 && soundnessRate >= config.minSoundnessRate,
      detail: `${String(Math.round(soundnessRate * 100))}% of reviewed judged sound (need ≥ ${String(Math.round(config.minSoundnessRate * 100))}%, with reviews present)`,
    },
    presenceCriterion('named-evaluator', 'evaluator', evaluator, config.requireNamedEvaluator),
    presenceCriterion('named-owner', 'owner', owner, config.requireNamedOwner),
    ownerAgreementCriterion(evidence, config),
  ];

  const blockers = criteria.filter((c) => !c.met).map((c) => c.name);
  return { ready: blockers.length === 0, criteria, blockers };
}
