/**
 * Context Freshness — TTL-based staleness detection for context entries.
 *
 * Simple timestamp check: entries older than a configurable TTL
 * are considered stale and should be re-verified before use.
 *
 * @module orchestration/aorchestra/context-freshness
 * (Source: Issue #1305, Epic #1299, arXiv:2602.20478)
 */

// ============================================================================
// Types
// ============================================================================

/**
 * A context entry with a verification timestamp.
 */
export interface ContextEntry {
  /** Identifier for this context (file path, memory key, etc.) */
  readonly key: string;
  /** Timestamp (ms since epoch) when this context was last verified */
  readonly lastVerifiedMs: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Default TTL: 5 minutes. */
export const DEFAULT_TTL_MS = 5 * 60 * 1000;

// ============================================================================
// Public API
// ============================================================================

/**
 * Check if a context entry is still fresh (within TTL).
 *
 * @param entry - Context entry to check
 * @param ttlMs - TTL in milliseconds (default: DEFAULT_TTL_MS)
 * @returns true if the entry is fresh, false if stale
 */
export function isContextFresh(entry: ContextEntry, ttlMs: number = DEFAULT_TTL_MS): boolean {
  return Date.now() - entry.lastVerifiedMs < ttlMs;
}

/**
 * Mark a context entry as verified at the current time.
 *
 * Returns a new entry (immutable update) with the timestamp set to now.
 *
 * @param entry - Context entry to update
 * @returns New entry with updated lastVerifiedMs
 */
export function markContextVerified(entry: ContextEntry): ContextEntry {
  return {
    key: entry.key,
    lastVerifiedMs: Date.now(),
  };
}

/**
 * Get the age of a context entry in milliseconds.
 *
 * @param entry - Context entry to check
 * @returns Age in milliseconds since last verification
 */
export function getContextAge(entry: ContextEntry): number {
  return Date.now() - entry.lastVerifiedMs;
}
