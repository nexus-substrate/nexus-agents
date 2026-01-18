/**
 * nexus-agents/context - Belief Memory Recall Operations
 *
 * Query and retrieval operations for Hindsight Belief Memory.
 * Extracted from belief-memory.ts to comply with 400-line limit.
 *
 * @module context/belief-memory-recall
 * (Source: Issue #336, arXiv:2512.12818 - Hindsight Belief Memory)
 */

import type { Result } from '../core/result.js';
import { ok, err } from '../core/result.js';
import { MemoryError } from './memory-backend-types.js';
import type { Belief, BeliefQuery } from './belief-types.js';
import { BeliefQuerySchema } from './belief-types.js';
import { sortBeliefs, matchesQueryFilters, intersectSets } from './belief-memory-helpers.js';

// ============================================================================
// Types for Recall Data Stores
// ============================================================================

/**
 * Data stores required for recall operations.
 */
export interface RecallDataStores {
  readonly beliefs: Map<string, Belief>;
  readonly subjectIndex: Map<string, Set<string>>;
  readonly predicateIndex: Map<string, Set<string>>;
  readonly domainIndex: Map<string, Set<string>>;
}

// ============================================================================
// Recall Operations
// ============================================================================

/**
 * Recall a single belief by ID.
 */
export function recallInternal(
  stores: Pick<RecallDataStores, 'beliefs'>,
  beliefId: string
): Promise<Result<Belief | null, MemoryError>> {
  try {
    return Promise.resolve(ok(stores.beliefs.get(beliefId) ?? null));
  } catch (error) {
    return Promise.resolve(
      err(
        new MemoryError('Failed to recall belief', {
          cause: error instanceof Error ? error : new Error(String(error)),
        })
      )
    );
  }
}

/**
 * Get candidate belief IDs based on indexed fields.
 */
function getCandidateIds(stores: RecallDataStores, query: BeliefQuery): Set<string> | null {
  let ids: Set<string> | null = null;

  if (query.subject !== undefined) {
    ids = new Set(stores.subjectIndex.get(query.subject) ?? []);
  }

  if (query.predicate !== undefined) {
    const pIds = stores.predicateIndex.get(query.predicate) ?? new Set();
    ids = ids ? intersectSets(ids, pIds) : new Set(pIds);
  }

  if (query.domain !== undefined) {
    const dIds = stores.domainIndex.get(query.domain) ?? new Set();
    ids = ids ? intersectSets(ids, dIds) : new Set(dIds);
  }

  return ids;
}

/**
 * Filter candidates by query criteria.
 */
function filterCandidates(
  stores: Pick<RecallDataStores, 'beliefs'>,
  candidateIds: Set<string> | null,
  query: BeliefQuery
): Belief[] {
  const allIds = candidateIds ?? new Set(stores.beliefs.keys());
  const filtered: Belief[] = [];

  for (const id of allIds) {
    const b = stores.beliefs.get(id);
    if (b !== undefined && matchesQueryFilters(b, query)) {
      filtered.push(b);
    }
  }

  return filtered;
}

/**
 * Query beliefs with filters, sorting, and pagination.
 */
export function queryInternal(
  stores: RecallDataStores,
  query: BeliefQuery
): Promise<Result<readonly Belief[], MemoryError>> {
  try {
    const validation = BeliefQuerySchema.safeParse(query);
    if (!validation.success) {
      return Promise.resolve(
        err(new MemoryError('Invalid query', { context: { errors: validation.error.issues } }))
      );
    }

    const candidateIds = getCandidateIds(stores, query);
    const filtered = filterCandidates(stores, candidateIds, query);
    const sorted = sortBeliefs(filtered, query.orderBy, query.orderDirection);
    const limited = query.limit !== undefined ? sorted.slice(0, query.limit) : sorted;

    return Promise.resolve(ok(limited));
  } catch (error) {
    return Promise.resolve(
      err(
        new MemoryError('Failed to query beliefs', {
          cause: error instanceof Error ? error : new Error(String(error)),
        })
      )
    );
  }
}

/**
 * Recall beliefs by subject.
 */
export function recallBySubjectInternal(
  stores: RecallDataStores,
  subject: string,
  limit?: number
): Promise<Result<readonly Belief[], MemoryError>> {
  const q: BeliefQuery = { subject, includeSuperseded: false };
  return limit !== undefined ? queryInternal(stores, { ...q, limit }) : queryInternal(stores, q);
}

/**
 * Recall current (most recent, non-superseded) belief for subject-predicate.
 */
export async function recallCurrentInternal(
  stores: RecallDataStores,
  subject: string,
  predicate: string
): Promise<Result<Belief | null, MemoryError>> {
  const result = await queryInternal(stores, {
    subject,
    predicate,
    includeSuperseded: false,
    orderBy: 'updatedAt',
    orderDirection: 'desc',
    limit: 1,
  });

  if (!result.ok) return result;
  return ok(result.value[0] ?? null);
}

/**
 * Recall belief history for subject-predicate (including superseded).
 */
export function recallHistoryInternal(
  stores: RecallDataStores,
  subject: string,
  predicate: string,
  limit?: number
): Promise<Result<readonly Belief[], MemoryError>> {
  const q: BeliefQuery = {
    subject,
    predicate,
    includeSuperseded: true,
    orderBy: 'updatedAt',
    orderDirection: 'desc',
  };
  return limit !== undefined ? queryInternal(stores, { ...q, limit }) : queryInternal(stores, q);
}
