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

import { getTimeProvider } from '../../core/index.js';
import type { TaskAccessPolicy } from './types.js';

/** Max number of policies retained in the cache before LRU eviction. */
const DEFAULT_MAX_ENTRIES = 256;

interface CacheEntry {
  readonly policy: TaskAccessPolicy;
  readonly insertedAt: number;
}

export class PolicyCache {
  private readonly entries = new Map<string, CacheEntry>();

  constructor(private readonly maxEntries: number = DEFAULT_MAX_ENTRIES) {}

  /** Gets a cached policy or undefined. Side effect: bumps LRU position. */
  get(objectiveHash: string): TaskAccessPolicy | undefined {
    const entry = this.entries.get(objectiveHash);
    if (entry === undefined) return undefined;
    // Re-insert to refresh LRU position
    this.entries.delete(objectiveHash);
    this.entries.set(objectiveHash, entry);
    return entry.policy;
  }

  /** Stores a policy. Evicts the oldest entry if at capacity. */
  set(objectiveHash: string, policy: TaskAccessPolicy): void {
    if (this.entries.has(objectiveHash)) {
      this.entries.delete(objectiveHash);
    } else if (this.entries.size >= this.maxEntries) {
      // Map preserves insertion order; the first key is the oldest.
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(objectiveHash, { policy, insertedAt: getTimeProvider().now() });
  }

  /** Clears all entries. Useful for tests. */
  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
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
