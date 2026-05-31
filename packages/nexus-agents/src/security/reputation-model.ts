/**
 * nexus-agents/security - Reputation Model
 *
 * Lightweight trust model for GitHub users that assesses reputation
 * based on account age, contribution history, and behavioral signals.
 * Integrates with the trust classifier for comprehensive trust assessment.
 *
 * @module security/reputation-model
 * (Source: Issue #818, #824 — Phase 3: Reputation Model)
 */

import { z } from 'zod';

import { getTimeProvider } from '../core/index.js';
import type { TrustTier, GitHubUserRole, InjectionFlag } from './trust-types.js';
import { TRUST_TIER_NUMERIC, ROLE_DEFAULT_TRUST } from './trust-types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Signals that indicate a suspicious actor.
 */
export const SuspiciousSignalSchema = z.enum([
  'new_account',
  'no_prior_contributions',
  'injection_patterns_detected',
  'rapid_comments',
  'mismatched_authority_claim',
]);
export type SuspiciousSignal = z.infer<typeof SuspiciousSignalSchema>;

/**
 * GitHub user metadata for reputation assessment.
 */
export interface GitHubUserMetadata {
  readonly username: string;
  readonly accountAgeDays: number;
  readonly priorContributions: number;
  readonly recentCommentCount: number;
  readonly recentCommentWindowMinutes: number;
  readonly authorAssociation: string;
  readonly injectionFlags: readonly InjectionFlag[];
}

/**
 * Result of a reputation assessment.
 */
export interface ReputationAssessment {
  readonly username: string;
  readonly userRole: GitHubUserRole;
  readonly suspiciousSignals: readonly SuspiciousSignal[];
  readonly isSuspicious: boolean;
  readonly effectiveTrustTier: TrustTier;
  readonly reputationScore: number;
  readonly reason: string;
  readonly assessedAt: string;
}

// ============================================================================
// Configuration
// ============================================================================

/** Thresholds for suspicious behavior detection. */
/** Approximate days per year, used to normalize account age to a 0–10 scale. */
const DAYS_PER_YEAR_APPROX = 36.5;

const SUSPICIOUS_THRESHOLDS = {
  /** Account younger than this (days) is flagged. */
  newAccountDays: 30,
  /** Fewer contributions than this is flagged. */
  minContributions: 1,
  /** More comments than this in the window triggers rapid-comment flag. */
  rapidCommentThreshold: 5,
  /** Time window (minutes) for rapid comment detection. */
  rapidCommentWindowMinutes: 10,
} as const;

// ============================================================================
// Reputation Cache
// ============================================================================

interface CacheEntry {
  assessment: ReputationAssessment;
  expiresAt: number;
}

// Canonical source: config/timeouts.ts (Issue #1046)
import { CACHE_TIMEOUTS } from '../config/timeouts.js';

const DEFAULT_TTL_MS: number = CACHE_TIMEOUTS.reputationTtlMs;
const DEFAULT_MAX_SIZE = 1000;

/**
 * In-memory reputation cache with TTL and max size.
 * Reduces redundant assessments for the same user within a short window.
 * Evicts oldest entries when max size is exceeded.
 */
export class ReputationCache {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttlMs: number;
  private readonly maxSize: number;

  constructor(ttlMs = DEFAULT_TTL_MS, maxSize = DEFAULT_MAX_SIZE) {
    this.ttlMs = ttlMs;
    this.maxSize = maxSize;
  }

  get(username: string): ReputationAssessment | undefined {
    const entry = this.cache.get(username);
    if (entry === undefined) return undefined;
    if (getTimeProvider().now() > entry.expiresAt) {
      this.cache.delete(username);
      return undefined;
    }
    return entry.assessment;
  }

  set(username: string, assessment: ReputationAssessment): void {
    if (this.cache.size >= this.maxSize && !this.cache.has(username)) {
      this.evictOldest();
    }
    this.cache.set(username, {
      assessment,
      expiresAt: getTimeProvider().now() + this.ttlMs,
    });
  }

  /** Evict a batch of oldest entries (10% of maxSize, minimum 1). */
  private evictOldest(): void {
    const batchSize = Math.max(1, Math.floor(this.maxSize * 0.1));
    const keys = this.cache.keys();
    for (let i = 0; i < batchSize; i++) {
      const next = keys.next();
      if (next.done === true) break;
      this.cache.delete(next.value);
    }
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

// ============================================================================
// Suspicious Signal Detection
// ============================================================================

/** Detect all suspicious signals from user metadata. */
function detectSuspiciousSignals(metadata: GitHubUserMetadata): SuspiciousSignal[] {
  const signals: SuspiciousSignal[] = [];

  if (metadata.accountAgeDays < SUSPICIOUS_THRESHOLDS.newAccountDays) {
    signals.push('new_account');
  }

  if (metadata.priorContributions < SUSPICIOUS_THRESHOLDS.minContributions) {
    signals.push('no_prior_contributions');
  }

  // Only count hostile-tier injection flags — benign flags like
  // instruction_pattern (triggered by "please remove") should not
  // trigger the injection_patterns_detected signal.
  const hostileInjectionFlags: readonly InjectionFlag[] = [
    'system_prompt_manipulation',
    'fake_conversation',
    'authority_claim',
    'hidden_content',
  ];
  const hasHostileFlags = metadata.injectionFlags.some((f) => hostileInjectionFlags.includes(f));
  if (hasHostileFlags) {
    signals.push('injection_patterns_detected');
  }

  if (
    metadata.recentCommentCount > SUSPICIOUS_THRESHOLDS.rapidCommentThreshold &&
    metadata.recentCommentWindowMinutes <= SUSPICIOUS_THRESHOLDS.rapidCommentWindowMinutes
  ) {
    signals.push('rapid_comments');
  }

  // Authority claim from non-maintainer role
  const hasAuthorityClaim = metadata.injectionFlags.includes('authority_claim');
  const association = metadata.authorAssociation.toUpperCase();
  const isAuthoritative = association === 'OWNER' || association === 'MEMBER';
  if (hasAuthorityClaim && !isAuthoritative) {
    signals.push('mismatched_authority_claim');
  }

  return signals;
}

/** Calculate a 0-100 reputation score. */
function calculateReputationScore(
  metadata: GitHubUserMetadata,
  signals: readonly SuspiciousSignal[],
  userRole: GitHubUserRole
): number {
  let score = 50; // baseline

  // Role bonus
  const roleBonus: Record<GitHubUserRole, number> = {
    owner: 40,
    maintainer: 35,
    collaborator: 25,
    contributor: 15,
    member: 5,
    unknown: 0,
  };
  score += roleBonus[userRole];

  // Account age bonus (max +10)
  score += Math.min(metadata.accountAgeDays / DAYS_PER_YEAR_APPROX, 10);

  // Contribution bonus (max +10)
  score += Math.min(metadata.priorContributions, 10);

  // Suspicious signal penalties
  const signalPenalty: Record<SuspiciousSignal, number> = {
    new_account: -15,
    no_prior_contributions: -10,
    injection_patterns_detected: -25,
    rapid_comments: -20,
    mismatched_authority_claim: -30,
  };
  for (const signal of signals) {
    score += signalPenalty[signal];
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

/** Map role string to GitHubUserRole. */
function mapRole(association: string): GitHubUserRole {
  switch (association.toUpperCase()) {
    case 'OWNER':
      return 'owner';
    case 'MEMBER':
      return 'member';
    case 'COLLABORATOR':
      return 'collaborator';
    case 'CONTRIBUTOR':
      return 'contributor';
    default:
      return 'unknown';
  }
}

/** Determine effective trust tier from signals and role. */
function determineEffectiveTier(
  userRole: GitHubUserRole,
  signals: readonly SuspiciousSignal[]
): TrustTier {
  const baseTier = ROLE_DEFAULT_TRUST[userRole];

  // Hostile signals → Tier 4
  const hostileSignals: SuspiciousSignal[] = [
    'injection_patterns_detected',
    'mismatched_authority_claim',
  ];
  if (signals.some((s) => hostileSignals.includes(s))) return '4';

  // Multiple suspicious signals → downgrade by 1
  if (signals.length >= 2) {
    const baseNumeric = TRUST_TIER_NUMERIC[baseTier];
    const downgraded = Math.min(baseNumeric + 1, 4);
    return String(downgraded) as TrustTier;
  }

  return baseTier;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Assess a GitHub user's reputation for trust classification.
 *
 * @param metadata - User metadata from GitHub API or local context.
 * @param cache - Optional cache instance for TTL-based deduplication.
 * @returns ReputationAssessment with trust tier and suspicious signals.
 */
export function assessReputation(
  metadata: GitHubUserMetadata,
  cache?: ReputationCache
): ReputationAssessment {
  // Check cache first
  const cached = cache?.get(metadata.username);
  if (cached !== undefined) return cached;

  const userRole = mapRole(metadata.authorAssociation);
  const signals = detectSuspiciousSignals(metadata);
  const score = calculateReputationScore(metadata, signals, userRole);
  const effectiveTier = determineEffectiveTier(userRole, signals);

  const assessment: ReputationAssessment = {
    username: metadata.username,
    userRole,
    suspiciousSignals: signals,
    isSuspicious: signals.length > 0,
    effectiveTrustTier: effectiveTier,
    reputationScore: score,
    reason: buildReason(userRole, signals, effectiveTier),
    assessedAt: new Date().toISOString(),
  };

  cache?.set(metadata.username, assessment);
  return assessment;
}

/**
 * Reconcile a trust-classifier tier with a reputation assessment into the
 * effective tier to enforce (#3119 / epic #3118). Demotion-only — reputation
 * can only RAISE the tier number (more restrictive), never lower it.
 *
 * Invariants:
 * - **Allowlist/Tier-1 wins**: a classifier Tier 1 (owner/allowlisted maintainer)
 *   is authoritative — reputation never demotes it.
 * - **Absent reputation → classifier tier**: no assessment (stage off / not
 *   fetched) keeps the classifier/role-default tier — never fabricate a benign
 *   tier, never escalate on mere absence (fetch-failure ≠ hostile signal).
 * - **Score is advisory**: only `effectiveTrustTier` participates; the 0–100
 *   `reputationScore` never moves the gate.
 */
export function reconcileTrustTier(
  classifierTier: TrustTier,
  reputation: ReputationAssessment | undefined
): TrustTier {
  if (classifierTier === '1') return '1';
  const repTier = reputation?.effectiveTrustTier;
  if (repTier === undefined) return classifierTier;
  return TRUST_TIER_NUMERIC[repTier] > TRUST_TIER_NUMERIC[classifierTier]
    ? repTier
    : classifierTier;
}

/** Build a human-readable reason string. */
function buildReason(
  role: GitHubUserRole,
  signals: readonly SuspiciousSignal[],
  tier: TrustTier
): string {
  if (signals.length === 0) {
    return `Role ${role} → Tier ${tier} (no suspicious signals)`;
  }
  const signalList = signals.join(', ');
  return `Role ${role} → Tier ${tier} (signals: ${signalList})`;
}
