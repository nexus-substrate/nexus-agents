/**
 * Synthesis Historical Learning (#1507).
 *
 * Tracks which synthesis tiers succeed/fail for conflict patterns
 * (identified by worker role combinations). When a pattern repeatedly
 * fails at Tier 2, the system recommends starting at Tier 3 instead.
 *
 * @module orchestration/aorchestra/synthesis-history
 */

import { getTimeProvider } from '../../core/index.js';

// ============================================================================
// Types
// ============================================================================

/** Stats for a single conflict pattern. */
export interface PatternStats {
  readonly totalAttempts: number;
  readonly tier2Successes: number;
  readonly tier3Successes: number;
  readonly consecutiveTier2Failures: number;
}

/** Internal mutable entry. */
interface PatternEntry {
  totalAttempts: number;
  tier2Successes: number;
  tier3Successes: number;
  consecutiveTier2Failures: number;
  lastUpdated: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Number of consecutive Tier 2 failures before recommending Tier 3. */
const TIER_SKIP_THRESHOLD = 2;

/** Maximum number of patterns to track (LRU eviction). */
const MAX_PATTERNS = 100;

// ============================================================================
// Public API
// ============================================================================

/**
 * Creates a conflict pattern key from worker roles.
 * Sorted and deduplicated for consistent keying regardless of order.
 */
export function createConflictPatternKey(roles: readonly string[]): string {
  return [...new Set(roles)].sort().join('+');
}

/**
 * Tracks synthesis tier outcomes per conflict pattern.
 * In-memory only — resets on process restart. Lightweight by design.
 */
export class SynthesisHistoryTracker {
  private readonly patterns = new Map<string, PatternEntry>();

  /** Record a synthesis attempt outcome. */
  record(patternKey: string, tier: number, success: boolean): void {
    let entry = this.patterns.get(patternKey);
    if (entry === undefined) {
      entry = {
        totalAttempts: 0,
        tier2Successes: 0,
        tier3Successes: 0,
        consecutiveTier2Failures: 0,
        lastUpdated: getTimeProvider().now(),
      };
      this.patterns.set(patternKey, entry);
    }

    entry.totalAttempts++;
    entry.lastUpdated = getTimeProvider().now();

    if (tier === 2) {
      if (success) {
        entry.tier2Successes++;
        entry.consecutiveTier2Failures = 0;
      } else {
        entry.consecutiveTier2Failures++;
      }
    } else if (tier === 3 && success) {
      entry.tier3Successes++;
    }

    this.evictIfNeeded();
  }

  /**
   * Recommend which tier to start at for a conflict pattern.
   * Returns 3 if the pattern has >= TIER_SKIP_THRESHOLD consecutive
   * Tier 2 failures, otherwise returns 2 (default).
   */
  recommendStartTier(patternKey: string): number {
    const entry = this.patterns.get(patternKey);
    if (entry === undefined) return 2;
    return entry.consecutiveTier2Failures >= TIER_SKIP_THRESHOLD ? 3 : 2;
  }

  /** Get stats for a conflict pattern. */
  getStats(patternKey: string): PatternStats | undefined {
    const entry = this.patterns.get(patternKey);
    if (entry === undefined) return undefined;
    return {
      totalAttempts: entry.totalAttempts,
      tier2Successes: entry.tier2Successes,
      tier3Successes: entry.tier3Successes,
      consecutiveTier2Failures: entry.consecutiveTier2Failures,
    };
  }

  /** List all tracked patterns (for diagnostics). */
  allPatterns(): readonly string[] {
    return [...this.patterns.keys()];
  }

  /** Evict oldest entries when over capacity. */
  private evictIfNeeded(): void {
    if (this.patterns.size <= MAX_PATTERNS) return;
    // Evict entries with oldest lastUpdated
    const sorted = [...this.patterns.entries()].sort((a, b) => a[1].lastUpdated - b[1].lastUpdated);
    const toRemove = sorted.slice(0, this.patterns.size - MAX_PATTERNS);
    for (const [key] of toRemove) {
      this.patterns.delete(key);
    }
  }
}

/** Singleton instance for process-wide tracking. */
let globalTracker: SynthesisHistoryTracker | undefined;

/** Get the global synthesis history tracker. */
export function getSynthesisHistoryTracker(): SynthesisHistoryTracker {
  globalTracker ??= new SynthesisHistoryTracker();
  return globalTracker;
}

/** Reset the global tracker (for testing). */
export function resetSynthesisHistory(): void {
  globalTracker = undefined;
}
