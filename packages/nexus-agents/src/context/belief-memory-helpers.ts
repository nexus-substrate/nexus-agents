/**
 * nexus-agents/context - Hindsight Belief Memory Helpers
 *
 * Helper functions for the Hindsight Belief Memory implementation.
 *
 * @module context/belief-memory-helpers
 * (Source: Issue #336, arXiv:2512.12818 - Hindsight Belief Memory)
 */

import { getTimeProvider, getRandomProvider } from '../core/index.js';
import type {
  Belief,
  BeliefConfidence,
  BeliefMemoryStats,
  BeliefQuery,
  BeliefSourceType,
} from './belief-types.js';
import { BeliefConfidence as BeliefConfidenceEnum } from './belief-types.js';

// ============================================================================
// ID Generation
// ============================================================================

/** Generate a unique ID with prefix */
export function generateId(prefix: string): string {
  const timestamp = getTimeProvider().now().toString(36);
  const random = getRandomProvider().random().toString(36).substring(2, 10);
  return `${prefix}_${timestamp}_${random}`;
}

// ============================================================================
// Confidence Level Operations
// ============================================================================

/** Compare confidence levels for ordering */
export function compareConfidence(a: BeliefConfidence, b: BeliefConfidence): number {
  const order: Record<BeliefConfidence, number> = {
    high: 4,
    medium: 3,
    low: 2,
    speculative: 1,
  };
  return order[a] - order[b];
}

/** Get next confidence level up */
export function strengthenConfidence(current: BeliefConfidence): BeliefConfidence {
  const progression: Record<BeliefConfidence, BeliefConfidence> = {
    speculative: BeliefConfidenceEnum.LOW,
    low: BeliefConfidenceEnum.MEDIUM,
    medium: BeliefConfidenceEnum.HIGH,
    high: BeliefConfidenceEnum.HIGH,
  };
  return progression[current];
}

/** Get next confidence level down */
export function weakenConfidence(current: BeliefConfidence): BeliefConfidence {
  const regression: Record<BeliefConfidence, BeliefConfidence> = {
    high: BeliefConfidenceEnum.MEDIUM,
    medium: BeliefConfidenceEnum.LOW,
    low: BeliefConfidenceEnum.SPECULATIVE,
    speculative: BeliefConfidenceEnum.SPECULATIVE,
  };
  return regression[current];
}

// ============================================================================
// Belief Sorting
// ============================================================================

/** Sort beliefs by query options */
export function sortBeliefs(
  beliefs: readonly Belief[],
  orderBy?: 'createdAt' | 'updatedAt' | 'confidence',
  direction?: 'asc' | 'desc'
): Belief[] {
  const sorted = [...beliefs];
  const multiplier = direction === 'asc' ? 1 : -1;

  sorted.sort((a, b) => {
    switch (orderBy) {
      case 'createdAt':
        return (a.createdAt.getTime() - b.createdAt.getTime()) * multiplier;
      case 'updatedAt':
        return (a.updatedAt.getTime() - b.updatedAt.getTime()) * multiplier;
      case 'confidence':
        return compareConfidence(a.confidence, b.confidence) * multiplier;
      default:
        return (b.updatedAt.getTime() - a.updatedAt.getTime()) * multiplier;
    }
  });

  return sorted;
}

// ============================================================================
// Query Filtering
// ============================================================================

/** Check if belief matches query filters */
export function matchesQueryFilters(belief: Belief, query: BeliefQuery): boolean {
  if (query.includeSuperseded !== true && belief.superseded) {
    return false;
  }
  if (query.minConfidence !== undefined) {
    if (compareConfidence(belief.confidence, query.minConfidence) < 0) {
      return false;
    }
  }
  if (query.sourceType !== undefined && belief.sourceType !== query.sourceType) {
    return false;
  }
  return true;
}

/** Intersect two sets */
export function intersectSets<T>(a: Set<T>, b: Set<T>): Set<T> {
  const result = new Set<T>();
  for (const item of a) {
    if (b.has(item)) {
      result.add(item);
    }
  }
  return result;
}

// ============================================================================
// Statistics Computation
// ============================================================================

/** Initialize empty stats counters */
export function initializeStatsCounters(): {
  beliefsByConfidence: Record<BeliefConfidence, number>;
  beliefsBySource: Record<BeliefSourceType, number>;
} {
  return {
    beliefsByConfidence: {
      high: 0,
      medium: 0,
      low: 0,
      speculative: 0,
    },
    beliefsBySource: {
      observation: 0,
      inference: 0,
      external: 0,
      user_input: 0,
      hindsight: 0,
      prior: 0,
    },
  };
}

/** Build final stats object with optional date fields */
export function buildStatsResult(
  baseStats: Omit<BeliefMemoryStats, 'oldestBelief' | 'newestBelief'>,
  oldestBelief: Date | undefined,
  newestBelief: Date | undefined
): BeliefMemoryStats {
  if (oldestBelief !== undefined && newestBelief !== undefined) {
    return { ...baseStats, oldestBelief, newestBelief };
  } else if (oldestBelief !== undefined) {
    return { ...baseStats, oldestBelief };
  } else if (newestBelief !== undefined) {
    return { ...baseStats, newestBelief };
  }
  return baseStats;
}

// ============================================================================
// Update Record Creation
// ============================================================================

import type { BeliefUpdate, BeliefUpdateType } from './belief-types.js';

/** Options for creating an update record */
export interface UpdateRecordOptions {
  readonly beliefId: string;
  readonly updateType: BeliefUpdateType;
  readonly previousState: Record<string, unknown>;
  readonly newState: Record<string, unknown>;
  readonly reason: string;
  readonly evidence?: string;
}

/** Create a new update record */
export function createUpdateRecord(options: UpdateRecordOptions): BeliefUpdate {
  return {
    updateId: generateId('update'),
    beliefId: options.beliefId,
    updateType: options.updateType,
    previousState: options.previousState,
    newState: options.newState,
    reason: options.reason,
    ...(options.evidence !== undefined ? { evidence: options.evidence } : {}),
    timestamp: new Date(getTimeProvider().now()),
  };
}
