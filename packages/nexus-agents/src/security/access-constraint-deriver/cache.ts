/**
 * Access Constraint Deriver — Policy cache (#1977 condition 5).
 *
 * In-memory LRU cache keyed by objectiveHash. Avoids re-deriving a policy
 * for repeated invocations of the same user task. Capped size prevents
 * unbounded growth in long-running sessions.
 *
 * The cache is a process-local singleton by design — it does not persist
 * across restarts because policies are cheap to re-derive and staleness
 * across process boundaries is not worth debugging.
 *
 * @module security/access-constraint-deriver/cache
 */

import { BoundedLRUCache } from '../../core/index.js';
import type { TaskAccessPolicy } from './types.js';

/** Max number of policies retained in the cache before LRU eviction. */
const DEFAULT_MAX_ENTRIES = 256;

/**
 * LRU cache of derived access policies, keyed by objectiveHash. A thin wrapper
 * over the canonical {@link BoundedLRUCache} (#3292) — the same size-bound LRU
 * semantics previously hand-rolled here (the unused `insertedAt` field was
 * dropped; this cache has no TTL).
 */
export class PolicyCache {
  private readonly cache: BoundedLRUCache<string, TaskAccessPolicy>;

  constructor(maxEntries: number = DEFAULT_MAX_ENTRIES) {
    this.cache = new BoundedLRUCache(maxEntries);
  }

  /** Gets a cached policy or undefined. Side effect: bumps LRU position. */
  get(objectiveHash: string): TaskAccessPolicy | undefined {
    return this.cache.get(objectiveHash);
  }

  /** Stores a policy. Evicts the least-recently-used entry if at capacity. */
  set(objectiveHash: string, policy: TaskAccessPolicy): void {
    this.cache.set(objectiveHash, policy);
  }

  /** Clears all entries. Useful for tests. */
  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

/** Singleton cache. */
let instance: PolicyCache | undefined;

export function getPolicyCache(): PolicyCache {
  instance ??= new PolicyCache();
  return instance;
}

/** Reset for tests. */
export function resetPolicyCache(): void {
  instance = undefined;
}
