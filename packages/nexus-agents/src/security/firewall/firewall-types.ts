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
import type { IAuditLogger } from '../../audit/audit-types.js';
import type { FirewallPolicyMode } from './firewall-policy-mode.js';
import type {
  ReputationAssessment,
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
}
