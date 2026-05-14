/**
 * Governance Enforcer for Tier 3 Requests
 *
 * When requests are promoted to Tier 3 (security/architecture), this module
 * determines the required governance policy: voting threshold, audit trail,
 * and promotion reason. Governance enforcement is mandatory and cannot be
 * disabled.
 *
 * @module mcp/gateway/governance-enforcer
 * (Source: Issue #894, Epic #888)
 */

import type { ILogger } from '../../core/index.js';
import { createLogger } from '../../core/index.js';
import { classifyRequestTier, RequestTier, type TierOverrides } from './tier-classifier.js';
import type { VoteThreshold } from '../tools/consensus-vote-types.js';

/**
 * Voting threshold required by governance policy.
 * Alias of `VoteThreshold` from `consensus-vote-types.ts` — kept as a
 * named local re-export for readability at call sites in this module
 * (#2638 — single source of truth).
 */
export type VotingThreshold = VoteThreshold;

/** Governance domain that triggered Tier 3 promotion. */
export type GovernanceDomain = 'security' | 'architecture' | 'none';

/** Result of governance-aware request classification. */
export interface GovernanceClassification {
  /** The effective request tier. */
  tier: RequestTier;
  /** Whether the request was promoted from a lower tier. */
  promoted: boolean;
  /** Governance domain that triggered promotion (if any). */
  domain: GovernanceDomain;
  /** Required voting threshold per governance.md rules. */
  votingThreshold: VotingThreshold | null;
  /** Human-readable promotion reason for audit log. */
  promotionReason: string | null;
}

import {
  SECURITY_KEYWORDS,
  ARCHITECTURE_KEYWORDS,
  PROMOTED_ROLES as GOVERNANCE_ROLES,
} from './gateway-keywords.js';

/** Voting thresholds per governance.md. */
const DOMAIN_THRESHOLDS: Record<GovernanceDomain, VotingThreshold | null> = {
  security: 'supermajority',
  architecture: 'supermajority',
  none: null,
};

/**
 * Classifies a request with governance-aware metadata.
 *
 * Extends the basic tier classification with governance policy:
 * - Security requests → supermajority voting threshold
 * - Architecture requests → supermajority voting threshold
 * - Promotion is mandatory and cannot be disabled
 *
 * @param toolName - The MCP tool being invoked
 * @param params - The tool's input parameters
 * @param overrides - Optional per-tool tier overrides
 * @returns Governance classification with tier, promotion reason, and policy
 */
export function classifyWithGovernance(
  toolName: string,
  params: Record<string, unknown>,
  overrides?: TierOverrides
): GovernanceClassification {
  const tier = classifyRequestTier(toolName, params, overrides);

  if (tier !== RequestTier.ORCHESTRATED) {
    return { tier, promoted: false, domain: 'none', votingThreshold: null, promotionReason: null };
  }

  const domain = detectGovernanceDomain(params);
  const promoted = domain !== 'none';
  const votingThreshold = DOMAIN_THRESHOLDS[domain];
  const promotionReason = promoted ? buildPromotionReason(domain, params) : null;

  return { tier, promoted, domain, votingThreshold, promotionReason };
}

/**
 * Logs a governance audit entry for Tier 3 promoted requests.
 *
 * @param classification - The governance classification result
 * @param toolName - The tool that was classified
 * @param logger - Logger instance for audit trail
 */
export function auditGovernancePromotion(
  classification: GovernanceClassification,
  toolName: string,
  logger?: ILogger
): void {
  if (!classification.promoted) return;

  const log = logger ?? createLogger({ component: 'governance' });
  log.warn('Governance promotion', {
    tool: toolName,
    domain: classification.domain,
    votingThreshold: classification.votingThreshold,
    reason: classification.promotionReason,
  });
}

/** Detects which governance domain (if any) triggered the classification. */
function detectGovernanceDomain(params: Record<string, unknown>): GovernanceDomain {
  // Role-based detection
  const role = params['role'];
  if (typeof role === 'string') {
    if (role === 'security_expert') return 'security';
    if (role === 'architecture_expert') return 'architecture';
  }

  // Text content detection
  const textFields = ['task', 'proposal', 'prompt'];
  for (const field of textFields) {
    const value = params[field];
    if (typeof value !== 'string') continue;
    const lower = value.toLowerCase();

    if (SECURITY_KEYWORDS.some((kw) => lower.includes(kw))) return 'security';
    if (ARCHITECTURE_KEYWORDS.some((kw) => lower.includes(kw))) return 'architecture';
  }

  return 'none';
}

/** Builds a human-readable promotion reason for audit logging. */
function buildPromotionReason(domain: GovernanceDomain, params: Record<string, unknown>): string {
  const role = params['role'];
  if (typeof role === 'string' && GOVERNANCE_ROLES.has(role)) {
    return `${domain} governance: role=${role} requires ${DOMAIN_THRESHOLDS[domain] ?? 'majority'} voting`;
  }

  const textFields = ['task', 'proposal', 'prompt'];
  for (const field of textFields) {
    const value = params[field];
    if (typeof value !== 'string') continue;
    const keyword = findMatchingKeyword(value, domain);
    if (keyword !== null) {
      return `${domain} governance: keyword "${keyword}" detected, requires ${DOMAIN_THRESHOLDS[domain] ?? 'majority'} voting`;
    }
  }

  return `${domain} governance: requires ${DOMAIN_THRESHOLDS[domain] ?? 'majority'} voting`;
}

/** Finds the first matching keyword in text for the given domain. */
function findMatchingKeyword(text: string, domain: GovernanceDomain): string | null {
  const lower = text.toLowerCase();
  const keywords = domain === 'security' ? SECURITY_KEYWORDS : ARCHITECTURE_KEYWORDS;
  for (const kw of keywords) {
    if (lower.includes(kw)) return kw;
  }
  return null;
}
