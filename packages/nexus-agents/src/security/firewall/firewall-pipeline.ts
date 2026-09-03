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
import type { ReputationAssessment, GitHubUserMetadata } from '../reputation-model.js';
import { assessReputation, ReputationCache, reconcileTrustTier } from '../reputation-model.js';
import type { ClassifyResult } from '../trust-classifier.js';
import { classifyTrust, mapAuthorAssociation } from '../trust-classifier.js';
import type { SanitizedInput, TrustTier } from '../trust-types.js';
import { generateATL } from './agent-trust-labels.js';
import type {
  ATLData,
  FirewallConfig,
  FirewallError,
  FirewallStages,
  SourceMetadata,
} from './firewall-types.js';
import { FirewallConfigSchema } from './firewall-types.js';
import { checkRuleOfTwo } from '../policy-gate.js';
import type { Violation } from '../policy-gate.js';
import { createLogger } from '../../core/index.js';

const logger = createLogger({ component: 'HostileInputFirewall' });

// ============================================================================
// Firewall Result
// ============================================================================

/**
 * Output of the firewall pipeline. Aggregates results from each stage.
 */
export interface FirewallResult {
  readonly sanitized: SanitizedInput;
  readonly trust: ClassifyResult;
  readonly reputation?: ReputationAssessment;
  /**
   * The tier consumers should ENFORCE on (#3106): the classifier tier
   * reconciled with the reputation assessment (demotion-only; Tier-1/allowlist
   * wins; equals `trust.trustTier` when reputation is absent). Previously the
   * reputation tier was computed but dropped — `trust.trustTier` alone left
   * reputation unenforced.
   */
  readonly effectiveTrustTier: TrustTier;
  readonly atl: string;
  /**
   * Rule-of-Two assessment surfaced by the `policyEnforcement` stage (#3198):
   * present (with `severity: 'block'`) when the effective tier is untrusted AND
   * the configured context has both write and secret access. The firewall is a
   * signal provider — it SURFACES this for the consumer to enforce; it does not
   * hard-block. `undefined` when the stage is disabled or the rule holds.
   */
  readonly ruleOfTwoViolation?: Violation;
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
  readonly durationMs: number;
}

// ============================================================================
// HostileInputFirewall
// ============================================================================

/**
 * Orchestrates existing security modules into a configurable pipeline.
 * Each stage is independently toggleable via config.stages.
 */
export class HostileInputFirewall {
  private readonly stages: FirewallStages;
  private readonly allowlisted: readonly string[];
  private readonly maxInputLength: number;
  private readonly adapter: FirewallConfig['adapter'];
  private readonly reputationCache: ReputationCache;
  private readonly auditTrail: AuditTrail;
  private readonly context: { readonly hasWriteAccess: boolean; readonly hasSecretAccess: boolean };
  /** #5382 rollout gate; resolved once at construction, not per call. */
  private readonly policyMode: FirewallPolicyMode;

  constructor(config: FirewallConfig) {
    const validated = FirewallConfigSchema.parse({
      stages: config.stages,
      allowlistedMaintainers: config.allowlistedMaintainers,
      maxInputLength: config.maxInputLength,
      context: config.context,
    });
    this.stages = validated.stages;
    this.allowlisted = validated.allowlistedMaintainers;
    this.maxInputLength = validated.maxInputLength;
    this.adapter = config.adapter;
    this.reputationCache = new ReputationCache();
    // Mirror security decisions to the durable, hash-chained audit log when a
    // logger is provided; otherwise stay in-memory only (#3291).
    this.auditTrail = createAuditTrail(
      config.auditLogger !== undefined ? createDurableAuditSink(config.auditLogger) : undefined
    );
    this.context = validated.context;
    // Explicit config wins; otherwise the environment; otherwise `off`. Resolved
    // once here rather than per `process()` call so a mid-run env change cannot
    // make two inputs in the same batch answer to different policies.
    this.policyMode = config.policyMode ?? resolveFirewallPolicyMode(config.env ?? process.env);
  }

  /**
   * Processes untrusted input through the firewall pipeline.
   * Returns a structured FirewallResult or a typed FirewallError.
   */
  process(input: unknown): Result<FirewallResult, FirewallError> {
    const start = Date.now();
    this.auditTrail.clear();

    // Stage 1: Extract metadata via adapter
    const metaResult = this.runExtraction(input);
    if (!metaResult.ok) return metaResult;
    const meta = metaResult.value;

    // Stage 2: Sanitize input
    const sanitized = this.runSanitization(meta);

    // Stage 3: Classify trust
    const trust = this.runClassification(meta, sanitized);

    // Stage 4: Assess reputation (optional)
    const reputation = this.runReputation(meta, sanitized);

    // #3106: reconcile the classifier tier with reputation into the tier
    // consumers enforce on (demotion-only; Tier-1/allowlist wins; == classifier
    // tier when reputation absent). Previously the reputation tier was dropped.
    const effectiveTrustTier = reconcileTrustTier(trust.trustTier, reputation);

    // Stage 5: Generate ATL (labelled with the enforced tier)
    const atl = this.buildATL(meta, effectiveTrustTier, sanitized, reputation);

    // Stage 6: Rule-of-Two policy enforcement (#3198) — evaluate + surface the
    // violation during firewall composition (previously the policyEnforcement
    // stage was declared but never read). Signal only: the consumer enforces.
    const ruleOfTwoViolation = this.stages.policyEnforcement
      ? checkRuleOfTwo({
          inputTrustTier: effectiveTrustTier,
          hasWriteAccess: this.context.hasWriteAccess,
          hasSecretAccess: this.context.hasSecretAccess,
        })
      : undefined;
    if (ruleOfTwoViolation !== undefined) {
      logger.warn('Firewall surfaced a Rule-of-Two violation', {
        user: meta.username,
        effectiveTrustTier,
        rule: ruleOfTwoViolation.rule,
      });
    }

    // #5382: decide the RESPONSE to a blocking violation.
    const blocking = ruleOfTwoViolation?.severity === 'block';
    const refusal = this.refuseIfEnforcing(ruleOfTwoViolation, meta, effectiveTrustTier);
    if (refusal !== undefined) return err(refusal);

    // Collect audit events
    const auditEvents = this.auditTrail.query().map((e) => ({ id: e.id, type: e.type }));

    return ok({
      sanitized,
      trust,
      ...(reputation !== undefined ? { reputation } : {}),
      effectiveTrustTier,
      atl,
      ...(ruleOfTwoViolation !== undefined ? { ruleOfTwoViolation } : {}),
      policyMode: this.policyMode,
      // Reached only when we did NOT refuse, so this is "audit mode saw
      // something enforce would have stopped". Under `off` it stays false: the
      // signal is already on `ruleOfTwoViolation`, and reporting a would-be
      // refusal for a mode that has not opted in would overstate the gate.
      wouldRefuse: blocking && this.policyMode === 'audit',
      auditEvents,
      durationMs: Date.now() - start,
    });
  }

  /**
   * The fail-closed half of the #5382 gate: under `enforce`, a blocking policy
   * violation refuses the input instead of riding along as a signal on an
   * `ok()` result that a caller checking only `result.ok` walks straight past.
   *
   * This gates the RESPONSE to a violation, never its detection. It cannot
   * manufacture a refusal where the `policyEnforcement` stage never ran, and it
   * cannot refuse a non-blocking (`warn`) violation — so `enforce` is not a
   * kill switch, and an allowlisted maintainer stays served.
   *
   * @returns the refusal, or `undefined` when the input passes or the mode has
   *          not opted in.
   */
  private refuseIfEnforcing(
    violation: Violation | undefined,
    meta: SourceMetadata,
    effectiveTrustTier: TrustTier
  ): FirewallError | undefined {
    if (violation?.severity !== 'block' || this.policyMode !== 'enforce') return undefined;
    logger.warn('Firewall REFUSED input under enforce mode', {
      user: meta.username,
      effectiveTrustTier,
      rule: violation.rule,
    });
    return {
      code: 'POLICY_REFUSED',
      message: `Refused by firewall policy: ${violation.rule} — ${violation.message}`,
      stage: 'policy',
    };
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

  private runSanitization(meta: SourceMetadata): SanitizedInput {
    if (!this.stages.sanitization) {
      return createPassthroughSanitized(meta);
    }

    const result = sanitizeInput(
      meta.content,
      mapAuthorAssociation(meta.authorAssociation),
      meta.username,
      {
        allowlistedMaintainers: [...this.allowlisted],
        maxInputLength: this.maxInputLength,
      }
    );

    if (this.stages.audit) {
      emitSanitizationEvent(this.auditTrail, {
        source: meta.sourceType,
        wasModified: result.wasModified,
        strippedCount: result.strippedElements.length,
        injectionFlagCount: result.injectionFlags.length,
        strippedElements: result.strippedElements
          .slice(0, MAX_STRIPPED_ELEMENTS_PER_EVENT)
          .map((e) => ({ tag: e.tag, reason: e.reason })),
      });
    }

    return result;
  }

  private runClassification(meta: SourceMetadata, sanitized: SanitizedInput): ClassifyResult {
    if (!this.stages.trustClassification) {
      return createPassthroughClassification(meta);
    }

    const result = classifyTrust({
      username: meta.username,
      authorAssociation: meta.authorAssociation,
      sanitizedInput: sanitized,
      config: {
        allowlistedMaintainers: [...this.allowlisted],
      },
    });

    if (this.stages.audit) {
      emitTrustEvent(this.auditTrail, {
        username: meta.username,
        assignedTier: result.trustTier,
        userRole: result.userRole,
        isAllowlisted: result.isAllowlisted,
        wasDowngraded: result.wasDowngraded,
        reason: result.reason,
      });
    }

    return result;
  }

  private runReputation(
    meta: SourceMetadata,
    sanitized: SanitizedInput
  ): ReputationAssessment | undefined {
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

    const result = assessReputation(metadata, this.reputationCache);

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

// ============================================================================
// Passthrough Defaults (for disabled stages)
// ============================================================================

function createPassthroughSanitized(meta: SourceMetadata): SanitizedInput {
  return {
    content: meta.content,
    originalLength: meta.content.length,
    trustTier: '3',
    userRole: mapAuthorAssociation(meta.authorAssociation),
    injectionFlags: [],
    strippedElements: [],
    wasModified: false,
    sanitizedAt: new Date().toISOString(),
  };
}

function createPassthroughClassification(meta: SourceMetadata): ClassifyResult {
  return {
    trustTier: '3',
    userRole: mapAuthorAssociation(meta.authorAssociation),
    isAllowlisted: false,
    wasDowngraded: false,
    reason: 'Trust classification disabled — default Tier 3',
  };
}
