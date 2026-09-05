/**
 * nexus-agents/security - Trust Classifier
 *
 * Classifies GitHub users and content into trust tiers based on
 * repository relationship, allowlist membership, and content analysis.
 * Works with the input sanitizer to determine how agent decisions
 * should weight each input source.
 *
 * @module security/trust-classifier
 * (Source: Issue #818, #819 — Phase 1: Input Sanitization)
 */

import type { TrustTier, GitHubUserRole, SanitizedInput, SanitizerConfig } from './trust-types.js';
import { ROLE_DEFAULT_TRUST, TRUST_TIER_NUMERIC } from './trust-types.js';

// ============================================================================
// GitHub Author Association Mapping
// ============================================================================

/**
 * Maps GitHub API author_association values to our GitHubUserRole enum.
 * See: https://docs.github.com/en/graphql/reference/enums#commentauthorassociation
 */
export function mapAuthorAssociation(association: string): GitHubUserRole {
  switch (association.toUpperCase()) {
    case 'OWNER':
      return 'owner';
    case 'MEMBER':
      return 'member';
    case 'COLLABORATOR':
      return 'collaborator';
    case 'CONTRIBUTOR':
      return 'contributor';
    case 'FIRST_TIMER':
    case 'FIRST_TIME_CONTRIBUTOR':
    case 'NONE':
      return 'unknown';
    case 'MANNEQUIN':
      return 'unknown';
    default:
      return 'unknown';
  }
}

// ============================================================================
// Trust Classification
// ============================================================================

/**
 * Input for trust classification.
 */
export interface ClassifyInput {
  /** GitHub username. */
  readonly username: string;
  /** GitHub API author_association value. */
  readonly authorAssociation: string;
  /** Sanitized input (if content has already been through the sanitizer). */
  readonly sanitizedInput?: SanitizedInput;
  /** Sanitizer config (for allowlist check). */
  readonly config?: Partial<SanitizerConfig>;
}

/**
 * Result of trust classification.
 */
export interface ClassifyResult {
  /** Assigned trust tier. */
  readonly trustTier: TrustTier;
  /** GitHub user role. */
  readonly userRole: GitHubUserRole;
  /** Whether the user is on the maintainer allowlist. */
  readonly isAllowlisted: boolean;
  /** Whether content triggered a trust downgrade. */
  readonly wasDowngraded: boolean;
  /** Reason for the assigned tier. */
  readonly reason: string;
}

/**
 * Classifies a GitHub user and their content into a trust tier.
 *
 * The trust tier is determined by:
 * 1. Allowlist membership (always Tier 1)
 * 2. GitHub author_association → role → default tier
 * 3. Content injection analysis (can only downgrade, never upgrade)
 *
 * ⚠ **Use HostileInputFirewall.process() in agent code paths.** The live
 * paths (`dogfooding/issue-triage`, `dogfooding/pr-reviewer`) route through
 * it as of #4992. Calling classifyTrust() directly emits no audit-trail
 * event, and unless the caller supplies `config.allowlistedMaintainers` no
 * allowlist is consulted — `isAllowlisted: false` is then a default, not a
 * measurement, and must not be recorded as one. Direct use is for unit tests
 * and non-decision analysis only. (The Rule of Two is enforced separately by
 * `evaluatePolicy` in policy-gate; the firewall evaluates it too, as a
 * signal, and refuses on it only under `NEXUS_FIREWALL_POLICY=enforce`.)
 *
 * @see packages/nexus-agents/src/security/firewall/firewall-pipeline.ts
 * @see packages/nexus-agents/src/security/policy-gate.ts
 */
export function classifyTrust(input: ClassifyInput): ClassifyResult {
  const allowlistedMaintainers = input.config?.allowlistedMaintainers ?? [];
  const isAllowlisted = allowlistedMaintainers.includes(input.username);
  const userRole = mapAuthorAssociation(input.authorAssociation);

  if (isAllowlisted) {
    return {
      trustTier: '1',
      userRole,
      isAllowlisted: true,
      wasDowngraded: false,
      reason: `User ${input.username} is on the maintainer allowlist`,
    };
  }

  const baseTier = ROLE_DEFAULT_TRUST[userRole];

  // Explicit false means the sanitization stage did not measure content.
  // Absence is legacy sanitizer output and remains measured fail-closed.
  if (input.sanitizedInput !== undefined && input.sanitizedInput.contentTierMeasured !== false) {
    const contentTier = input.sanitizedInput.trustTier;
    const downgraded = TRUST_TIER_NUMERIC[contentTier] > TRUST_TIER_NUMERIC[baseTier];

    return {
      trustTier: downgraded ? contentTier : baseTier,
      userRole,
      isAllowlisted: false,
      wasDowngraded: downgraded,
      reason: downgraded
        ? `Downgraded from Tier ${baseTier} to ${contentTier}: injection patterns detected`
        : `Role ${userRole} → Tier ${baseTier}`,
    };
  }

  return {
    trustTier: baseTier,
    userRole,
    isAllowlisted: false,
    wasDowngraded: false,
    reason: `Role ${userRole} → Tier ${baseTier}`,
  };
}

/**
 * Checks whether a trust tier can influence agent decisions.
 * Tiers 3-4 are informational only — they cannot drive actions.
 */
export function canInfluenceDecisions(tier: TrustTier): boolean {
  return TRUST_TIER_NUMERIC[tier] <= 2;
}

/**
 * Checks whether a trust tier requires corroboration with Tier 1 sources.
 * Tier 2 requires corroboration; Tier 1 is self-sufficient.
 */
export function requiresCorroboration(tier: TrustTier): boolean {
  return tier === '2';
}

/**
 * Returns the minimum trust tier required for a given action type.
 * Actions that modify state require higher trust.
 */
export function getRequiredTrustTier(actionType: string): TrustTier {
  switch (actionType) {
    case 'GeneratePatchPlan':
      return '1'; // Requires maintainer-level trust
    case 'DraftReply':
    case 'ProposeLabels':
      return '2'; // Requires at least collaborator-level trust
    case 'SummarizeIssue':
    case 'ClassifyIssue':
    case 'IdentifyDuplicates':
      return '3'; // Read-only, can use any input
    case 'RequestHumanApproval':
    case 'RefuseAction':
      return '4'; // Always allowed (safety actions)
    default:
      return '1'; // Unknown actions require highest trust
  }
}
