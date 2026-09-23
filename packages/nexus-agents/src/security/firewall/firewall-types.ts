/**
 * nexus-agents/security/firewall - Types
 *
 * Configuration, result, and adapter interface types for the
 * HostileInputFirewall pipeline. Uses Zod schemas for runtime
 * validation at construction boundaries.
 *
 * @module security/firewall/firewall-types
 * (Source: Issue #826 — Reusable Hostile Input Firewall)
 */

import { z } from 'zod';
import type { Result } from '../../core/result.js';
import type { IAuditLogger } from '../../audit/audit-types.js';
import type { AgentAction, SourceCitation } from '../action-schema.js';
import type { Violation } from '../policy-gate.js';
import type { ClassifyResult } from '../trust-classifier.js';
import type { SanitizedInput, TrustTier } from '../trust-types.js';
import type { FirewallPolicyMode } from './firewall-policy-mode.js';
import type {
  FirewallActionEvaluationOptions,
  FirewallActionPolicyResult,
  FirewallPolicyEvaluation,
} from './firewall-policy-stage.js';
import type {
  ReputationAssessment,
  ReputationGateDecision,
  ReputationGatingMode,
  GitHubUserMetadata,
} from '../reputation-model.js';

// ============================================================================
// Source Adapter Interface
// ============================================================================

/**
 * Metadata extracted from a platform-specific input source.
 */
export interface SourceMetadata {
  readonly username: string;
  readonly authorAssociation: string;
  readonly content: string;
  readonly sourceType: string;
}

/**
 * Adapter that extracts normalized metadata from platform-specific input.
 * Each platform (GitHub, GitLab, etc.) implements this interface.
 */
export interface ISourceAdapter {
  readonly platform: string;
  extractMetadata(input: unknown): SourceMetadata;
}

// ============================================================================
// Stage Configuration
// ============================================================================

/**
 * Controls which pipeline stages run. Disabled stages use safe defaults.
 */
export const FirewallStagesSchema = z.object({
  sanitization: z.boolean().default(true),
  trustClassification: z.boolean().default(true),
  reputationAssessment: z.boolean().default(false),
  policyEnforcement: z.boolean().default(true),
  corroboration: z.boolean().default(false),
  audit: z.boolean().default(true),
});
export type FirewallStages = z.infer<typeof FirewallStagesSchema>;

/** Creates default stage configuration. */
export function createDefaultStages(): FirewallStages {
  return FirewallStagesSchema.parse({});
}

// ============================================================================
// Firewall Configuration
// ============================================================================

/**
 * Configuration for the HostileInputFirewall.
 * The adapter is required; all other fields have sensible defaults.
 */
export const FirewallConfigSchema = z.object({
  stages: FirewallStagesSchema.default(() => ({
    sanitization: true,
    trustClassification: true,
    reputationAssessment: false,
    policyEnforcement: true,
    corroboration: false,
    audit: true,
  })),
  allowlistedMaintainers: z.array(z.string().min(1)).default([]),
  maxInputLength: z.number().int().positive().default(50_000),
  context: z
    .object({
      hasWriteAccess: z.boolean().default(false),
      hasSecretAccess: z.boolean().default(false),
    })
    .default(() => ({
      hasWriteAccess: false,
      hasSecretAccess: false,
    })),
});

/**
 * Full config including the adapter (not Zod-validated since it's an interface).
 */
export interface FirewallConfig {
  readonly adapter: ISourceAdapter;
  readonly stages?: Partial<FirewallStages>;
  readonly allowlistedMaintainers?: readonly string[];
  readonly maxInputLength?: number;
  readonly context?: {
    readonly hasWriteAccess?: boolean;
    readonly hasSecretAccess?: boolean;
  };
  /**
   * Rollout gate for behaviour changes to this published API (#5382).
   * Defaults to `NEXUS_FIREWALL_POLICY`, and to `off` when that is unset —
   * under `off` the firewall behaves exactly as it did before #5382.
   *
   * Explicit here as well as in the environment because the firewall is a
   * library: an embedding consumer must be able to opt in per instance without
   * setting a process-wide variable.
   */
  readonly policyMode?: FirewallPolicyMode;
  /**
   * Environment to resolve `policyMode` from when it is not given explicitly.
   * Injectable so the resolution path itself is testable — without this the
   * flag could be unreachable in production with every unit test still passing.
   */
  readonly env?: NodeJS.ProcessEnv;
  /**
   * Optional durable audit logger. When provided, every security decision the
   * firewall records is mirrored to this persistent, hash-chained store via
   * the audit bridge (#3291). When absent, decisions are in-memory only.
   */
  readonly auditLogger?: IAuditLogger;
  /**
   * Rollout gate for REPUTATION demotion (#5381). Distinct from `policyMode`:
   * different env var (`NEXUS_REPUTATION_GATING`) and — load-bearing — a
   * different default, `enforce` rather than `off`. Production reads this same
   * knob (`issue-triage.ts`, `pr-reviewer-helpers.ts`), and the firewall reading
   * a different one is what let the two compositions disagree under identical
   * configuration.
   */
  readonly reputationGatingMode?: ReputationGatingMode;
  /**
   * Supplies the reputation assessment. Defaults to `assessReputation` over the
   * instance's cache.
   *
   * Injectable for the same reason as `env` above: without it the reconciliation
   * is unobservable. The firewall hands the reputation engine only
   * `authorAssociation` + `injectionFlags` — the two inputs the trust classifier
   * already consumed — so reputation is never stricter than the classifier and
   * `reconcileTrustTier` returns the classifier tier every time. Deleting the
   * reconciliation passed 1588 tests (#5405). This seam is what lets a test
   * present a stricter tier and prove the check can fire.
   */
  readonly reputationAssessor?: (metadata: GitHubUserMetadata) => ReputationAssessment;
  /**
   * Whether the sanitizer's content tier is applied as a classification
   * downgrade (#4992). Default `true` — the firewall's behaviour since #826:
   * injection-bearing content from a Tier-2 author classifies as Tier 4.
   *
   * `false` keeps the classifier role-only. The sanitization stage still runs
   * and still records its injection flags — only the tier downgrade is
   * withheld. The dogfooding paths (`issue-triage`, `pr-reviewer`) set this
   * because they route content signals through reputation gating, which has
   * its own rollout knob (`NEXUS_REPUTATION_GATING`); applying the same signal
   * at classification too would bypass that knob and change the recorded
   * `trustTier` under the default `NEXUS_FIREWALL_POLICY=off`, which #5382
   * promises is pass-through.
   */
  readonly contentDowngrade?: boolean;
}

/**
 * Per-call inputs to {@link HostileInputFirewall.process} (#4992).
 *
 * These are the facts that vary by CALL rather than by instance, so a
 * process-wide firewall (the dogfooding singleton) can serve many repositories
 * and many access postures without holding any of them globally.
 */
export interface FirewallProcessOptions {
  /**
   * Maintainer allowlist for THIS call, from the repository context. Replaces —
   * does not merge with — the construction-time list, and is forgotten after
   * the call. When neither this nor the construction-time list was supplied,
   * no allowlist is consulted and `FirewallResult.isAllowlisted` is absent.
   */
  readonly allowlistedMaintainers?: readonly string[];
  /**
   * Access posture of the caller for THIS call, feeding the Rule-of-Two check.
   * Replaces the construction-time `context` for the call. Without it a shared
   * instance would evaluate every caller against one posture, and
   * `wouldRefuse` could never fire for a caller whose posture differs.
   */
  readonly context?: {
    readonly hasWriteAccess: boolean;
    readonly hasSecretAccess: boolean;
  };
  /**
   * The caller's own reputation measurement for THIS call. When present, the
   * reputation gate runs on it under `NEXUS_REPUTATION_GATING`, whether or not
   * the instance's `reputationAssessment` stage is on: `effectiveTrustTier` is
   * the enforced tier, `reputationGate` is returned, and the Rule-of-Two check,
   * `wouldRefuse` and the trust audit event all use that tier. This is what
   * lets a caller with richer signals than the firewall can see (account age,
   * comment history) act on ONE gate rather than two that can disagree.
   *
   * `assessment: undefined` means the caller measured nothing (reputation
   * disabled) but still wants the gate decision recorded on the classifier
   * tier; omitting the option entirely leaves the stage to the instance config.
   */
  readonly reputation?: {
    readonly assessment: ReputationAssessment | undefined;
  };
  /**
   * The action the caller intends to take on this input, for THIS call (#5380).
   *
   * With it, the `policyEnforcement` stage runs the full `evaluatePolicy` set —
   * the same seven checks production runs — against the enforced tier and the
   * call's access posture, and `FirewallResult.policy` carries every violation
   * plus the decision's own `requiresApproval`. Without it only the Rule of
   * Two, the one context-only check, can run; the six action-scoped checks are
   * then listed under `policy.unmeasured` rather than silently counted as
   * passed. `process()` is input-shaped and constructs no action itself, so
   * this is the only way those checks reach it.
   */
  readonly action?: AgentAction;
  /**
   * The repository's label set, consulted by the label-validity check when
   * `action` is a `ProposeLabels` (#5380). When absent, `evaluatePolicy`
   * reports `LABEL_SET_UNAVAILABLE` as a blocking violation — unevaluable
   * label validity fails closed, exactly as it does on the production path.
   */
  readonly existingLabels?: ReadonlySet<string>;
}

// ============================================================================
// Agent Trust Label (ATL) Data
// ============================================================================

/**
 * Structured data for an Agent Trust Label.
 */
export const ATLDataSchema = z.object({
  tier: z.enum(['1', '2', '3', '4']),
  source: z.string().min(1),
  user: z.string().min(1),
  sanitized: z.boolean(),
  rep: z.number().min(0).max(1).optional(),
});
export type ATLData = z.infer<typeof ATLDataSchema>;

// ============================================================================
// Firewall Error
// ============================================================================

/**
 * Error codes for firewall pipeline failures.
 */
export type FirewallErrorCode =
  | 'EXTRACTION_FAILED'
  | 'SANITIZATION_FAILED'
  | 'CLASSIFICATION_FAILED'
  | 'REPUTATION_FAILED'
  | 'INVALID_CONFIG'
  /**
   * #5382: a blocking policy violation refused the input outright, rather than
   * being surfaced as a signal on a successful result. Only reachable when the
   * firewall policy mode is `enforce` — under the default `off` a violation is
   * still returned via `ruleOfTwoViolation` on an `ok()` result.
   */
  | 'POLICY_REFUSED';

/**
 * Structured error from the firewall pipeline.
 */
export interface FirewallError {
  readonly code: FirewallErrorCode;
  readonly message: string;
  readonly stage: string;
  /**
   * The blocking policy violations behind a `POLICY_REFUSED` from the policy
   * stage (#5383) — the structured form of the rules `message` names, so a
   * consumer that maps a refusal onto its own action record can list the rule
   * ids without parsing the message. Absent for every other code, and for the
   * corroboration stage's refusal, which carries `missing` instead.
   */
  readonly violations?: readonly Violation[];
  /**
   * The unmet corroboration requirements behind a `POLICY_REFUSED` from the
   * corroboration stage (#6309) — the structured form of what `message`
   * names, so a consumer recording the refusal can list them without parsing
   * prose. Absent for every other code and stage.
   */
  readonly missing?: readonly string[];
}

// ============================================================================
// Firewall Result & Action Validation
// ============================================================================

/**
 * Output of the firewall pipeline. Aggregates results from each stage.
 */
export interface FirewallResult {
  readonly sanitized: SanitizedInput;
  readonly trust: ClassifyResult;
  /**
   * Whether the author is on the maintainer allowlist — present ONLY when an
   * allowlist was consulted (#4992), i.e. one was supplied at construction or
   * per call. `trust.isAllowlisted` is the classifier's published always-boolean
   * field and reads `false` whether the list was empty or never supplied; this
   * field is the one to record, because absence here means "not measured"
   * rather than "measured false" — the same treatment `reputationGate` gets.
   */
  readonly isAllowlisted?: boolean;
  readonly reputation?: ReputationAssessment;
  /**
   * The tier consumers should ENFORCE on (#3106): the classifier tier
   * reconciled with the reputation assessment (demotion-only; Tier-1/allowlist
   * wins; equals `trust.trustTier` when reputation is absent). Previously the
   * reputation tier was computed but dropped — `trust.trustTier` alone left
   * reputation unenforced.
   */
  readonly effectiveTrustTier: TrustTier;
  /**
   * The reputation gating decision behind `effectiveTrustTier` (#5381).
   *
   * **Absent means the reputation stage did not run** — not "it ran and
   * suppressed nothing". `ReputationGateDecision.demotionSuppressed` is a
   * required boolean, so surfacing it unconditionally would report `false` for a
   * check that never happened. Since the stage defaults to off, that
   * unevaluated case is the common one.
   */
  readonly reputationGate?: ReputationGateDecision;
  readonly atl: string;
  /**
   * Rule-of-Two assessment surfaced by the `policyEnforcement` stage (#3198):
   * present (`severity: 'block'`) when the effective tier is untrusted AND the
   * context has both write and secret access; `undefined` when the stage is
   * disabled or the rule holds. Since #5380 a view onto {@link policy} — its
   * `RULE_OF_TWO` entry — kept so existing consumers read the same field.
   */
  readonly ruleOfTwoViolation?: Violation;
  /**
   * The `policyEnforcement` stage's full verdict (#5380). **Absent means the
   * stage did not run.** Its `scope` says how much of `evaluatePolicy` could be
   * evaluated ({@link FirewallPolicyEvaluation}), so "seven checks, none fired"
   * is distinguishable from "one check, six unmeasured". `wouldRefuse` and the
   * `enforce` refusal both derive from `policy.violations`, whichever scope.
   */
  readonly policy?: FirewallPolicyEvaluation;
  /**
   * The rollout mode this run was evaluated under (#5382). Recorded on the
   * result rather than left implicit so a consumer reading a verdict can tell
   * WHICH policy produced it — a result that does not say which rules were in
   * force cannot be audited later.
   */
  readonly policyMode: FirewallPolicyMode;
  /**
   * Whether `enforce` would have refused this input.
   *
   * This is what makes `audit` mode measurable, and it is the field that makes
   * the mode a real gate rather than a switch with two indistinguishable
   * settings: under `audit` the answer is computed and reported while the input
   * is still allowed through, so an operator can size the impact of flipping to
   * `enforce` before flipping it.
   *
   * Always `false` under `enforce`, because an input that would be refused IS
   * refused — it comes back as a `POLICY_REFUSED` error, not a result.
   */
  readonly wouldRefuse: boolean;
  readonly auditEvents: readonly { readonly id: string; readonly type: string }[];
  /**
   * Whether a durable `AuditLogger` was configured for this instance (#4992
   * review). `configured` means this run's events were HANDED to that logger;
   * delivery to the hash chain is subject to the logger's own severity filter
   * (trust events are `info`), its bounded queue and its timed, fail-loud
   * flush, and is NOT confirmed per call — the write is queued. `none` means
   * the events exist only in the in-memory trail, which the next `process()`
   * call clears. This is a construction-time fact, not a per-call outcome.
   */
  readonly auditSink: 'configured' | 'none';
  readonly durationMs: number;
  /**
   * Action-shaped re-entry handle (#6310). Evaluates policy for one action
   * against this classified input's metadata and enforced tier, recording only
   * the `policy_gate` event to the audit trail without re-running sanitization,
   * classification or reputation gating.
   */
  readonly evaluateAction: (
    action: AgentAction,
    options?: Pick<FirewallActionEvaluationOptions, 'context' | 'existingLabels'>
  ) => Result<FirewallActionPolicyResult, FirewallError>;
}

/**
 * Outcome of {@link HostileInputFirewall.validateAction} (#5382).
 *
 * A discriminated union rather than a struct with optional fields, deliberately:
 * a caller cannot read `satisfied` without first narrowing on `evaluated`, so
 * "the stage did not run" is structurally impossible to misread as "the stage
 * ran and passed". `stages.corroboration` defaults to `false`, which makes the
 * unevaluated branch the COMMON case — exactly where a silent `satisfied: true`
 * would do the most damage.
 */
export type ActionValidation =
  | {
      readonly evaluated: false;
      /** Why no verdict exists. Absence is attributable, not anonymous. */
      readonly reason: 'corroboration-stage-disabled';
      readonly policyMode: FirewallPolicyMode;
    }
  | {
      readonly evaluated: true;
      readonly satisfied: boolean;
      /** Unmet corroboration requirements; empty when satisfied. */
      readonly missing: readonly string[];
      readonly corroboratingSources: readonly SourceCitation[];
      /**
       * The validator's #5796 marker: the floor was cleared, and only by
       * `repoFile` citations the producer found absent from the base ref.
       * Carried so a consumer can report it without re-deriving the rule.
       */
      readonly clearedOnlyByUnverifiedSources: boolean;
      readonly policyMode: FirewallPolicyMode;
      /** Whether `enforce` would have refused this action (see FirewallResult). */
      readonly wouldRefuse: boolean;
    };
