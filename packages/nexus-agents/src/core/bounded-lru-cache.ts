/**
 * BoundedLRUCache — a fixed-capacity least-recently-used cache (#3292).
 *
 * O(1) get/set/delete with insertion-order LRU eviction, backed by a `Map`
 * (which preserves insertion order, so the first key is always the oldest).
 * `get` and re-`set` bump a key's recency; at capacity, `set` evicts the
 * least-recently-used entry.
 *
 * Extracted as the single canonical implementation of the LRU bound that was
 * re-written across several security/config caches (PolicyCache, ReputationCache,
 * …). Pure size-bound LRU — no TTL (TTL-bearing caches use a separate variant).
 *
 * @module core/bounded-lru-cache
 */

export class BoundedLRUCache<K, V> {
  private readonly entries = new Map<K, V>();

  /**
   * @param capacity Maximum entries retained before LRU eviction (>= 1).
   * @throws Error if capacity < 1.
   */
  constructor(private readonly capacity: number) {
    if (capacity < 1) {
      throw new Error('BoundedLRUCache capacity must be at least 1');
    }
  }

  /** Number of entries currently held. */
  get size(): number {
    return this.entries.size;
  }

  /** True if `key` is present (does not affect recency). */
  has(key: K): boolean {
    return this.entries.has(key);
  }

  /**
   * Get the value for `key`, or undefined. Side effect: bumps `key` to
   * most-recently-used.
   */
  get(key: K): V | undefined {
    const value = this.entries.get(key);
    if (value === undefined && !this.entries.has(key)) return undefined;
    // Re-insert to refresh LRU position (Map keeps insertion order).
    this.entries.delete(key);
    this.entries.set(key, value as V);
    return value;
  }

  /**
   * Store `value` under `key`, bumping recency. Evicts the least-recently-used
   * entry when at capacity.
   */
  set(key: K, value: V): void {
    if (this.entries.has(key)) {
      this.entries.delete(key);
    } else if (this.entries.size >= this.capacity) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, value);
  }

  /** Remove `key`. Returns true if it was present. */
  delete(key: K): boolean {
    return this.entries.delete(key);
  }

  /** Remove all entries. */
  clear(): void {
    this.entries.clear();
  }
}
