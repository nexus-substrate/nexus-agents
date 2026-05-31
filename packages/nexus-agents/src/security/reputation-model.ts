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
  /**
   * Account/activity fields are OPTIONAL (#3106). When a field is absent (the
   * caller couldn't fetch it — e.g. the firewall before Phase 3 wiring), its
   * signal is SKIPPED rather than fabricated: an unknown value must never be
   * treated as benign (the old hardcoded `365`/`0`) nor as hostile. Only the
   * `authorAssociation` + `injectionFlags` signals fire on absent activity data.
   */
  readonly accountAgeDays?: number;
  readonly priorContributions?: number;
  readonly recentCommentCount?: number;
  readonly recentCommentWindowMinutes?: number;
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

/** Only hostile-tier injection flags count — benign flags like
 * instruction_pattern ("please remove") must not trip the injection signal. */
const HOSTILE_INJECTION_FLAGS: readonly InjectionFlag[] = [
  'system_prompt_manipulation',
  'fake_conversation',
  'authority_claim',
  'hidden_content',
];

function hasHostileInjection(flags: readonly InjectionFlag[]): boolean {
  return flags.some((f) => HOSTILE_INJECTION_FLAGS.includes(f));
}

/** Rapid-comment burst — only when both count and window are known (#3106). */
function isRapidCommenting(m: GitHubUserMetadata): boolean {
  return (
    m.recentCommentCount !== undefined &&
    m.recentCommentWindowMinutes !== undefined &&
    m.recentCommentCount > SUSPICIOUS_THRESHOLDS.rapidCommentThreshold &&
    m.recentCommentWindowMinutes <= SUSPICIOUS_THRESHOLDS.rapidCommentWindowMinutes
  );
}

/** Authority claim from a non-maintainer role. */
function isMismatchedAuthority(m: GitHubUserMetadata): boolean {
  if (!m.injectionFlags.includes('authority_claim')) return false;
  const association = m.authorAssociation.toUpperCase();
  return association !== 'OWNER' && association !== 'MEMBER';
}

/** Detect all suspicious signals from user metadata. #3106: account/activity
 * signals are skipped when their data is absent — never fabricated. */
function detectSuspiciousSignals(metadata: GitHubUserMetadata): SuspiciousSignal[] {
  const signals: SuspiciousSignal[] = [];
  const { accountAgeDays, priorContributions } = metadata;

  if (accountAgeDays !== undefined && accountAgeDays < SUSPICIOUS_THRESHOLDS.newAccountDays) {
    signals.push('new_account');
  }
  if (
    priorContributions !== undefined &&
    priorContributions < SUSPICIOUS_THRESHOLDS.minContributions
  ) {
    signals.push('no_prior_contributions');
  }
  if (hasHostileInjection(metadata.injectionFlags)) signals.push('injection_patterns_detected');
  if (isRapidCommenting(metadata)) signals.push('rapid_comments');
  if (isMismatchedAuthority(metadata)) signals.push('mismatched_authority_claim');

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

  // Account age bonus (max +10). #3106: absent → no bonus (avoid NaN; an
  // unknown account neither earns nor loses the age bonus).
  if (metadata.accountAgeDays !== undefined) {
    score += Math.min(metadata.accountAgeDays / DAYS_PER_YEAR_APPROX, 10);
  }

  // Contribution bonus (max +10). #3106: absent → no bonus.
  if (metadata.priorContributions !== undefined) {
    score += Math.min(metadata.priorContributions, 10);
  }

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

// ============================================================================
// Reputation gating rollout (#3122 / epic #3118 Phase 4)
// ============================================================================

/**
 * Rollout mode for reputation-based tier gating, mirroring
 * `NEXUS_ACCESS_POLICY_MODE` (#1977): `off` (no reputation effect), `audit`
 * (compute + report the would-be demotion but enforce the classifier tier), or
 * `enforce` (apply the demotion). Default `audit` — surface telemetry without
 * blocking until the false-positive rate is known, then flip to `enforce`.
 */
export const ReputationGatingModeSchema = z.enum(['off', 'audit', 'enforce']);
export type ReputationGatingMode = z.infer<typeof ReputationGatingModeSchema>;

/** Default when `NEXUS_REPUTATION_GATING` is unset/invalid — audit (telemetry, no block). */
export const DEFAULT_REPUTATION_GATING_MODE: ReputationGatingMode = 'audit';

/** Resolve the gating mode from the environment (invalid → default, never throws). */
export function resolveReputationGatingMode(
  env: NodeJS.ProcessEnv = process.env
): ReputationGatingMode {
  const raw = env['NEXUS_REPUTATION_GATING'];
  if (typeof raw !== 'string' || raw.length === 0) return DEFAULT_REPUTATION_GATING_MODE;
  const parsed = ReputationGatingModeSchema.safeParse(raw.toLowerCase());
  return parsed.success ? parsed.data : DEFAULT_REPUTATION_GATING_MODE;
}

/** Outcome of applying the gating mode to a reputation assessment. */
export interface ReputationGateDecision {
  /** Tier to actually enforce at the policy gate. */
  readonly enforcedTier: TrustTier;
  /** Tier reputation reconciliation computed (what `enforce` mode WOULD use). */
  readonly reconciledTier: TrustTier;
  /** True when reputation would demote but the mode (off/audit) did not enforce it. */
  readonly demotionSuppressed: boolean;
  readonly mode: ReputationGatingMode;
}

/**
 * Apply the rollout mode to a reputation assessment (#3122). `enforce` gates on
 * the reconciled (possibly demoted) tier; `audit`/`off` gate on the classifier
 * tier but report whether a demotion was suppressed (for telemetry). The
 * Tier-1/allowlist-wins and demotion-only invariants live in `reconcileTrustTier`,
 * so the allowlist remains the escape hatch in every mode.
 */
export function gateWithReputation(
  classifierTier: TrustTier,
  reputation: ReputationAssessment | undefined,
  mode: ReputationGatingMode
): ReputationGateDecision {
  const reconciledTier =
    mode === 'off' ? classifierTier : reconcileTrustTier(classifierTier, reputation);
  const enforcedTier = mode === 'enforce' ? reconciledTier : classifierTier;
  return {
    enforcedTier,
    reconciledTier,
    demotionSuppressed: mode !== 'enforce' && reconciledTier !== classifierTier,
    mode,
  };
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
