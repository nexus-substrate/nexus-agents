/**
 * nexus-agents/security/firewall - Pipeline Engine
 *
 * HostileInputFirewall: a composition layer that orchestrates existing
 * security modules (sanitizer, trust-classifier, reputation-model,
 * audit-trail) into a configurable, source-agnostic pipeline.
 *
 * Replaces ad-hoc manual composition found in issue-triage, pr-reviewer,
 * and secure-handler with a single reusable abstraction.
 *
 * @module security/firewall/firewall-pipeline
 * (Source: Issue #826 — Reusable Hostile Input Firewall)
 */

import type { Result } from '../../core/result.js';
import { err, ok } from '../../core/result.js';
import { resolveFirewallPolicyMode, type FirewallPolicyMode } from './firewall-policy-mode.js';
import {
  AuditTrail,
  createAuditTrail,
  emitReputationEvent,
  emitSanitizationEvent,
  MAX_STRIPPED_ELEMENTS_PER_EVENT,
  emitTrustEvent,
} from '../audit-trail.js';
import { createDurableAuditSink } from '../audit-bridge.js';
import { sanitizeInput } from '../input-sanitizer.js';
import type {
  ReputationAssessment,
  GitHubUserMetadata,
  ReputationGatingMode,
} from '../reputation-model.js';
import {
  assessReputation,
  ReputationCache,
  gateWithReputation,
  resolveReputationGatingMode,
} from '../reputation-model.js';
import type { ReputationGateDecision } from '../reputation-model.js';
import type { ClassifyResult } from '../trust-classifier.js';
import { classifyTrust, mapAuthorAssociation } from '../trust-classifier.js';
import type { SanitizedInput, TrustTier } from '../trust-types.js';
import { generateATL } from './agent-trust-labels.js';
import {
  createPassthroughClassification,
  createPassthroughSanitized,
} from './firewall-passthrough.js';
import { describeGate } from './firewall-trust-reason.js';
import type {
  ActionValidation,
  ATLData,
  FirewallConfig,
  FirewallError,
  FirewallProcessOptions,
  FirewallResult,
  FirewallStages,
  SourceMetadata,
} from './firewall-types.js';
export type { FirewallResult, ActionValidation };
import { FirewallConfigSchema } from './firewall-types.js';
import {
  blockingViolations,
  buildActionContext,
  evaluateActionPolicy,
  evaluateFirewallPolicy,
  policyRefusal,
  type FirewallActionEvaluationOptions,
  type FirewallActionPolicyEvaluation,
  type FirewallActionPolicyResult,
  type FirewallPolicyEvaluation,
} from './firewall-policy-stage.js';
export type {
  FirewallActionEvaluationOptions,
  FirewallActionPolicyEvaluation,
  FirewallActionPolicyResult,
};
import { validateCorroboration } from '../corroboration-validator.js';
import type { AgentAction } from '../action-schema.js';
import { createLogger } from '../../core/index.js';

const logger = createLogger({ component: 'HostileInputFirewall' });

// ============================================================================
// HostileInputFirewall
// ============================================================================

/**
 * Orchestrates existing security modules into a configurable pipeline.
 * Each stage is independently toggleable via config.stages.
 */
export class HostileInputFirewall {
  private readonly stages: FirewallStages;
  /**
   * Construction-time allowlist, or `undefined` when none was supplied (#4992).
   * The Zod default of `[]` is deliberately NOT taken here: an absent list and
   * an empty list must stay distinguishable so `isAllowlisted` can be omitted
   * rather than recorded as `false` when nothing was consulted.
   */
  private readonly allowlisted: readonly string[] | undefined;
  private readonly maxInputLength: number;
  private readonly adapter: FirewallConfig['adapter'];
  private readonly reputationCache: ReputationCache;
  private readonly auditTrail: AuditTrail;
  private readonly context: { readonly hasWriteAccess: boolean; readonly hasSecretAccess: boolean };
  /** #5382 rollout gate; resolved once at construction, not per call. */
  private readonly policyMode: FirewallPolicyMode;
  /** #5381 reputation-demotion gate; a DIFFERENT knob from `policyMode`. */
  private readonly reputationGatingMode: ReputationGatingMode;
  /** #5405 seam: how a reputation assessment is obtained. */
  private readonly assessReputationFn: (metadata: GitHubUserMetadata) => ReputationAssessment;
  /** #4992: whether the sanitizer's content tier downgrades the classifier tier. */
  private readonly contentDowngrade: boolean;
  /** #4992 review: whether a durable logger was configured (not per-call delivery). */
  private readonly auditSink: 'configured' | 'none';

  constructor(config: FirewallConfig) {
    const validated = FirewallConfigSchema.parse({
      stages: config.stages,
      allowlistedMaintainers: config.allowlistedMaintainers,
      maxInputLength: config.maxInputLength,
      context: config.context,
    });
    this.stages = validated.stages;
    this.allowlisted =
      config.allowlistedMaintainers !== undefined ? validated.allowlistedMaintainers : undefined;
    this.maxInputLength = validated.maxInputLength;
    this.adapter = config.adapter;
    this.reputationCache = new ReputationCache();
    // Mirror security decisions to the durable, hash-chained audit log when a
    // logger is provided; otherwise stay in-memory only (#3291).
    this.auditTrail = createAuditTrail(
      config.auditLogger !== undefined ? createDurableAuditSink(config.auditLogger) : undefined
    );
    this.auditSink = config.auditLogger !== undefined ? 'configured' : 'none';
    this.context = validated.context;
    // Explicit config wins; otherwise the environment; otherwise `off`. Resolved
    // once here rather than per `process()` call so a mid-run env change cannot
    // make two inputs in the same batch answer to different policies.
    this.policyMode = config.policyMode ?? resolveFirewallPolicyMode(config.env ?? process.env);
    // Same resolve-once discipline, but a SEPARATE knob: `NEXUS_REPUTATION_GATING`,
    // defaulting to `enforce`. Production reads this one, so the firewall reading
    // it too is what makes the two compositions agree under one configuration.
    this.reputationGatingMode =
      config.reputationGatingMode ?? resolveReputationGatingMode(config.env ?? process.env);
    this.assessReputationFn =
      config.reputationAssessor ?? ((metadata) => assessReputation(metadata, this.reputationCache));
    this.contentDowngrade = config.contentDowngrade ?? true;
  }

  /**
   * Processes untrusted input through the firewall pipeline.
   * Returns a structured FirewallResult or a typed FirewallError.
   *
   * `options` carries the per-call facts (#4992): the repository's maintainer
   * allowlist and the caller's access posture. Each replaces its
   * construction-time counterpart for this call only, so one shared instance
   * never holds a repository's allowlist or a caller's posture process-wide.
   */
  process(input: unknown, options?: FirewallProcessOptions): Result<FirewallResult, FirewallError> {
    const start = Date.now();
    this.auditTrail.clear();
    const allowlist = options?.allowlistedMaintainers ?? this.allowlisted;
    const context = options?.context ?? this.context;

    // Stage 1: Extract metadata via adapter
    const metaResult = this.runExtraction(input);
    if (!metaResult.ok) return metaResult;
    const meta = metaResult.value;

    // Stage 2: Sanitize input
    const sanitized = this.runSanitization(meta, allowlist);

    // Stage 3: Classify trust
    const trust = this.runClassification(meta, sanitized, allowlist);

    // Stage 4: Assess reputation — the caller's when supplied, else the stage.
    const reputation = this.runReputation(meta, sanitized, options?.reputation);

    const { tier: effectiveTrustTier, gate: reputationGate } = this.runReputationGate(
      trust.trustTier,
      reputation,
      options?.reputation !== undefined
    );

    // Trust event on the tier the consumer acts on, not the pre-reputation one.
    this.recordTrustDecision(meta, trust, effectiveTrustTier, reputationGate, allowlist);

    // Stage 5: Generate ATL (labelled with the enforced tier)
    const atl = this.buildATL(meta, effectiveTrustTier, sanitized, reputation);

    // Stage 6: policy enforcement (#3198, #5380). Signal only: the consumer
    // enforces — except under `enforce`, where a blocking violation refuses (#5382).
    const policy = this.runPolicyEnforcement(meta, effectiveTrustTier, context, options);
    const refusal = policyRefusal(policy, this.policyMode, meta.username, effectiveTrustTier);
    if (refusal !== undefined) return err(refusal);

    return ok(
      this.assembleResult({
        sanitized,
        trust,
        // Measured or absent: present only when an allowlist was consulted.
        isAllowlisted: allowlist !== undefined ? trust.isAllowlisted : undefined,
        reputation,
        effectiveTrustTier,
        reputationGate,
        atl,
        policy,
        start,
        user: meta.username,
        context,
      })
    );
  }

  /**
   * Action-shaped re-entry that evaluates policy for one action against an
   * already-enforced trust tier (#6310).
   *
   * Unlike {@link process}, this does NOT re-run input extraction, sanitization,
   * trust classification, or reputation gating, and does NOT re-emit the
   * input-level audit events (`sanitization`, `reputation`, `trust_classification`).
   * It evaluates the policy stage against the provided tier and context,
   * recording only the `policy_gate` event to the audit trail.
   */
  evaluateAction(
    action: AgentAction,
    options: FirewallActionEvaluationOptions
  ): Result<FirewallActionPolicyResult, FirewallError> {
    return evaluateActionPolicy(action, options, {
      defaultContext: this.context,
      policyMode: this.policyMode,
      policyEnforcementStage: this.stages.policyEnforcement,
      auditTrail: this.auditTrail,
      auditStage: this.stages.audit,
    });
  }

  /**
   * Runs the policy checks the call's facts allow — see
   * {@link evaluateFirewallPolicy} (#5380; Rule-of-Two-only since #3198). The
   * decision reaches the audit trail when the audit stage is on. Returns
   * `undefined` when the stage is disabled, so absence keeps meaning "not run".
   */
  private runPolicyEnforcement(
    meta: SourceMetadata,
    effectiveTrustTier: TrustTier,
    context: { readonly hasWriteAccess: boolean; readonly hasSecretAccess: boolean },
    options: FirewallProcessOptions | undefined
  ): FirewallPolicyEvaluation | undefined {
    if (!this.stages.policyEnforcement) return undefined;

    const evaluation = evaluateFirewallPolicy(
      buildActionContext(effectiveTrustTier, context, options),
      options?.action,
      this.stages.audit ? this.auditTrail : undefined
    );
    const blocking = blockingViolations(evaluation);
    if (blocking.length > 0) {
      logger.warn('Firewall surfaced blocking policy violations', {
        user: meta.username,
        effectiveTrustTier,
        scope: evaluation.scope,
        rules: blocking.map((v) => v.rule),
      });
    }
    return evaluation;
  }

  /**
   * Builds the successful result. Optional fields are spread in only when they
   * were evaluated, so absence keeps meaning "not measured" (see the field
   * docs on {@link FirewallResult}).
   */
  private assembleResult(parts: {
    readonly sanitized: SanitizedInput;
    readonly trust: ClassifyResult;
    readonly isAllowlisted: boolean | undefined;
    readonly reputation: ReputationAssessment | undefined;
    readonly effectiveTrustTier: TrustTier;
    readonly reputationGate: ReputationGateDecision | undefined;
    readonly atl: string;
    readonly policy: FirewallPolicyEvaluation | undefined;
    readonly start: number;
    readonly user: string;
    readonly context: { readonly hasWriteAccess: boolean; readonly hasSecretAccess: boolean };
  }): FirewallResult {
    const { isAllowlisted, reputation, reputationGate, policy } = parts;
    const ruleOfTwoViolation = policy?.violations.find((v) => v.rule === 'RULE_OF_TWO');
    const blocking = blockingViolations(policy).length > 0;
    return {
      sanitized: parts.sanitized,
      trust: parts.trust,
      ...(isAllowlisted !== undefined ? { isAllowlisted } : {}),
      ...(reputation !== undefined ? { reputation } : {}),
      effectiveTrustTier: parts.effectiveTrustTier,
      ...(reputationGate !== undefined ? { reputationGate } : {}),
      atl: parts.atl,
      ...(ruleOfTwoViolation !== undefined ? { ruleOfTwoViolation } : {}),
      ...(policy !== undefined ? { policy } : {}),
      policyMode: this.policyMode,
      // Reached only when we did NOT refuse, so this is "audit mode saw
      // something enforce would have stopped". Under `off` it stays false: the
      // signal is already on `policy.violations`, and reporting a would-be
      // refusal for a mode that has not opted in would overstate the gate.
      wouldRefuse: blocking && this.policyMode === 'audit',
      auditEvents: this.auditTrail.query().map((e) => ({ id: e.id, type: e.type })),
      auditSink: this.auditSink,
      durationMs: Date.now() - parts.start,
      evaluateAction: (action, evalOptions) =>
        this.evaluateAction(action, {
          user: parts.user,
          effectiveTrustTier: parts.effectiveTrustTier,
          context: evalOptions?.context ?? parts.context,
          existingLabels: evalOptions?.existingLabels,
        }),
    };
  }

  /**
   * Validates corroboration for a decided action (#5382).
   *
   * Separate from {@link process} because the two operate at different points
   * in the lifecycle, which is the real shape of the divergence epic #5281
   * found: `process()` is INPUT-shaped — it sanitizes, classifies and labels
   * untrusted content — while corroboration is ACTION-shaped, asking whether a
   * decision the consumer has now reached is backed by sources of sufficient
   * tier. There is no `AgentAction` in scope during `process()`, so the
   * `stages.corroboration` flag could never have been wired there; this is the
   * entry point that makes it readable.
   *
   * It is also the shape #5383 needs: production validates corroboration per
   * action (`issue-triage.ts:391`), so those callers cannot migrate onto the
   * firewall unless it offers a per-action surface.
   *
   * Returns `evaluated: false` when the stage is disabled — never a satisfied
   * verdict for a check that did not run. Under `enforce` an unsatisfied action
   * is refused with `POLICY_REFUSED`; under `audit` the would-be refusal is
   * reported via `wouldRefuse` and the action is allowed through.
   */
  validateAction(action: AgentAction): Result<ActionValidation, FirewallError> {
    if (!this.stages.corroboration) {
      return ok({
        evaluated: false,
        reason: 'corroboration-stage-disabled',
        policyMode: this.policyMode,
      });
    }

    const corroboration = validateCorroboration(action);

    if (!corroboration.satisfied && this.policyMode === 'enforce') {
      logger.warn('Firewall REFUSED an uncorroborated action under enforce mode', {
        actionType: corroboration.actionType,
        missing: corroboration.missing,
      });
      return err({
        code: 'POLICY_REFUSED',
        message:
          `Refused by firewall policy: ${corroboration.actionType} lacks required ` +
          `corroboration — ${corroboration.missing.join('; ')}`,
        stage: 'corroboration',
        missing: corroboration.missing,
      });
    }

    return ok({
      evaluated: true,
      satisfied: corroboration.satisfied,
      missing: corroboration.missing,
      corroboratingSources: corroboration.corroboratingSources,
      clearedOnlyByUnverifiedSources: corroboration.clearedOnlyByUnverifiedSources,
      policyMode: this.policyMode,
      wouldRefuse: !corroboration.satisfied && this.policyMode === 'audit',
    });
  }

  /** Returns the internal audit trail for inspection. */
  getAuditTrail(): AuditTrail {
    return this.auditTrail;
  }

  // ==========================================================================
  // Pipeline Stages (private)
  // ==========================================================================

  private runExtraction(input: unknown): Result<SourceMetadata, FirewallError> {
    try {
      const meta = this.adapter.extractMetadata(input);
      return ok(meta);
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : String(cause);
      return err({
        code: 'EXTRACTION_FAILED',
        message: `Adapter extraction failed: ${message}`,
        stage: 'extraction',
      });
    }
  }

  private runSanitization(
    meta: SourceMetadata,
    allowlist: readonly string[] | undefined
  ): SanitizedInput {
    if (!this.stages.sanitization) {
      return createPassthroughSanitized(meta);
    }

    const result = sanitizeInput(
      meta.content,
      mapAuthorAssociation(meta.authorAssociation),
      meta.username,
      {
        allowlistedMaintainers: [...(allowlist ?? [])],
        maxInputLength: this.maxInputLength,
      }
    );

    if (this.stages.audit) {
      emitSanitizationEvent(this.auditTrail, {
        source: meta.sourceType,
        wasModified: result.wasModified,
        ...(result.truncated !== undefined ? { truncated: result.truncated } : {}),
        strippedCount: result.strippedElements.length,
        injectionFlagCount: result.injectionFlags.length,
        strippedElements: result.strippedElements
          .slice(0, MAX_STRIPPED_ELEMENTS_PER_EVENT)
          .map((e) => ({ tag: e.tag, reason: e.reason })),
      });
    }

    return result;
  }

  private runClassification(
    meta: SourceMetadata,
    sanitized: SanitizedInput,
    allowlist: readonly string[] | undefined
  ): ClassifyResult {
    if (!this.stages.trustClassification) {
      return createPassthroughClassification(meta);
    }

    return classifyTrust({
      username: meta.username,
      authorAssociation: meta.authorAssociation,
      // #4992: `contentDowngrade: false` withholds the sanitizer's content tier
      // from the classifier; the flags themselves were still measured above.
      ...(this.contentDowngrade && sanitized.contentTierMeasured !== false
        ? { sanitizedInput: sanitized }
        : {}),
      config: {
        allowlistedMaintainers: [...(allowlist ?? [])],
      },
    });
  }

  /**
   * Emits the trust audit event for the tier the consumer acts on — after the
   * reputation gate, so the record cannot describe a tier nobody enforced
   * (#4992 review). A demotion is named in `reason`.
   */
  private recordTrustDecision(
    meta: SourceMetadata,
    trust: ClassifyResult,
    effectiveTrustTier: TrustTier,
    gate: ReputationGateDecision | undefined,
    allowlist: readonly string[] | undefined
  ): void {
    if (!this.stages.audit) return;
    const demoted = effectiveTrustTier !== trust.trustTier;
    emitTrustEvent(this.auditTrail, {
      username: meta.username,
      assignedTier: effectiveTrustTier,
      userRole: trust.userRole,
      // Recorded only when an allowlist was consulted (#4992).
      ...(allowlist !== undefined ? { isAllowlisted: trust.isAllowlisted } : {}),
      wasDowngraded: trust.wasDowngraded || demoted,
      reason: describeGate(trust.reason, demoted, gate),
    });
  }

  /**
   * Reconcile the classifier tier with reputation, under the rollout mode
   * production honours (#3106 reconciliation, #5381 gating).
   *
   * #3106's reconciliation is demotion-only; Tier-1/allowlist wins; it equals
   * the classifier tier when reputation is absent. #5381 puts it behind
   * `NEXUS_REPUTATION_GATING`, so `audit` is audit-only here too — previously
   * the firewall enforced unconditionally while production suppressed, on
   * identical configuration.
   *
   * Returns no gate at all when the stage is off, so absence in the result
   * means "not evaluated" rather than "evaluated, nothing suppressed" —
   * `demotionSuppressed` is a required boolean and would otherwise report
   * `false` for a check that never ran.
   */
  private runReputationGate(
    classifierTier: TrustTier,
    reputation: ReputationAssessment | undefined,
    callerSupplied: boolean
  ): { readonly tier: TrustTier; readonly gate?: ReputationGateDecision } {
    // A caller-supplied measurement runs the gate even when the instance's own
    // reputation stage is off (#4992 review): the caller measured, so record it.
    if (!this.stages.reputationAssessment && !callerSupplied) return { tier: classifierTier };
    const gate = gateWithReputation(classifierTier, reputation, this.reputationGatingMode);
    return { tier: gate.enforcedTier, gate };
  }

  private runReputation(
    meta: SourceMetadata,
    sanitized: SanitizedInput,
    supplied: { readonly assessment: ReputationAssessment | undefined } | undefined
  ): ReputationAssessment | undefined {
    if (supplied !== undefined) {
      // The caller's measurement replaces the instance's stage for this call;
      // `undefined` means the caller measured nothing, so nothing is emitted.
      if (supplied.assessment !== undefined && this.stages.audit) {
        emitReputationEvent(this.auditTrail, {
          username: meta.username,
          reputationScore: supplied.assessment.reputationScore,
          isSuspicious: supplied.assessment.isSuspicious,
          effectiveTier: supplied.assessment.effectiveTrustTier,
          signalCount: supplied.assessment.suspiciousSignals.length,
        });
      }
      return supplied.assessment;
    }
    if (!this.stages.reputationAssessment) return undefined;

    // #3106: only supply what the firewall actually knows from the event —
    // author association + injection flags. Account-age / contribution /
    // recent-comment data is NOT available here (it's fetched at the wiring
    // layer in a later phase), so it is OMITTED, not fabricated. The engine
    // skips the account/activity signals when their data is absent; until the
    // fetch lands, the firewall's reputation reflects injection + authority
    // signals only — honest rather than always-benign.
    const metadata: GitHubUserMetadata = {
      username: meta.username,
      authorAssociation: meta.authorAssociation.toUpperCase(),
      injectionFlags: sanitized.injectionFlags,
    };

    const result = this.assessReputationFn(metadata);

    if (this.stages.audit) {
      emitReputationEvent(this.auditTrail, {
        username: meta.username,
        reputationScore: result.reputationScore,
        isSuspicious: result.isSuspicious,
        effectiveTier: result.effectiveTrustTier,
        signalCount: result.suspiciousSignals.length,
      });
    }

    return result;
  }

  private buildATL(
    meta: SourceMetadata,
    effectiveTrustTier: TrustTier,
    sanitized: SanitizedInput,
    reputation?: ReputationAssessment
  ): string {
    const data: ATLData = {
      tier: effectiveTrustTier,
      source: meta.sourceType,
      user: meta.username,
      sanitized: sanitized.wasModified,
      ...(reputation !== undefined ? { rep: reputation.reputationScore / 100 } : {}),
    };
    return generateATL(data);
  }
}
