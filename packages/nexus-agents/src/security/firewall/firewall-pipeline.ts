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
import {
  AuditTrail,
  createAuditTrail,
  emitReputationEvent,
  emitSanitizationEvent,
  MAX_STRIPPED_ELEMENTS_PER_EVENT,
  emitTrustEvent,
} from '../audit-trail.js';
import { sanitizeInput } from '../input-sanitizer.js';
import type { ReputationAssessment, GitHubUserMetadata } from '../reputation-model.js';
import { assessReputation, ReputationCache } from '../reputation-model.js';
import type { ClassifyResult } from '../trust-classifier.js';
import { classifyTrust } from '../trust-classifier.js';
import type { SanitizedInput, GitHubUserRole } from '../trust-types.js';
import { generateATL } from './agent-trust-labels.js';
import type {
  ATLData,
  FirewallConfig,
  FirewallError,
  FirewallStages,
  SourceMetadata,
} from './firewall-types.js';
import { FirewallConfigSchema } from './firewall-types.js';

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
  readonly atl: string;
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
    this.auditTrail = createAuditTrail();
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

    // Stage 5: Generate ATL
    const atl = this.buildATL(meta, trust, sanitized, reputation);

    // Collect audit events
    const auditEvents = this.auditTrail.query().map((e) => ({ id: e.id, type: e.type }));

    return ok({
      sanitized,
      trust,
      ...(reputation !== undefined ? { reputation } : {}),
      atl,
      auditEvents,
      durationMs: Date.now() - start,
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

  private runSanitization(meta: SourceMetadata): SanitizedInput {
    if (!this.stages.sanitization) {
      return createPassthroughSanitized(meta);
    }

    const result = sanitizeInput(
      meta.content,
      meta.authorAssociation as GitHubUserRole,
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

    const metadata: GitHubUserMetadata = {
      username: meta.username,
      accountAgeDays: 365,
      priorContributions: 0,
      recentCommentCount: 0,
      recentCommentWindowMinutes: 60,
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
    trust: ClassifyResult,
    sanitized: SanitizedInput,
    reputation?: ReputationAssessment
  ): string {
    const data: ATLData = {
      tier: trust.trustTier,
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
    userRole: meta.authorAssociation as GitHubUserRole,
    injectionFlags: [],
    strippedElements: [],
    wasModified: false,
    sanitizedAt: new Date().toISOString(),
  };
}

function createPassthroughClassification(meta: SourceMetadata): ClassifyResult {
  return {
    trustTier: '3',
    userRole: meta.authorAssociation as GitHubUserRole,
    isAllowlisted: false,
    wasDowngraded: false,
    reason: 'Trust classification disabled — default Tier 3',
  };
}
