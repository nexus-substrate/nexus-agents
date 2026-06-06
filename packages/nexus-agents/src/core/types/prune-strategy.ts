/**
 * nexus-agents/core - Pruning Strategy Types
 *
 * Unified interface for all pruning strategies across the system.
 * Per System Mandate Loop H - Memory Redundancy Consolidation.
 *
 * Used by:
 * - ContextPruner (7 strategies)
 * - Memory backends (TTL-based)
 * - TypedMemory (per-module)
 * - HybridMemoryBackend (FTS triggers)
 *
 * @module core/types/prune-strategy
 */

/**
 * Context available during pruning decisions.
 */
export interface PruneContext {
  /** Current timestamp (ms) */
  readonly now: number;
  /** Total items before pruning */
  readonly totalItems: number;
  /** Target number of items to retain */
  readonly targetRetention?: number;
  /** Memory/token budget constraints */
  readonly budget?: {
    readonly current: number;
    readonly max: number;
  };
  /** Custom metadata for strategy-specific logic */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Result of a pruning decision for a single item.
 */
export interface PruneDecision {
  /** Whether this item should be pruned */
  readonly shouldPrune: boolean;
  /** Reason for the decision */
  readonly reason: string;
  /** Priority score (lower = more likely to prune) */
  readonly score?: number;
}

/**
 * Result of a batch pruning operation.
 */
export interface PruneResult<T> {
  /** Items selected for removal */
  readonly removed: readonly T[];
  /** Items retained after pruning */
  readonly retained: readonly T[];
  /** Number of items removed */
  readonly removedCount: number;
  /** Number of items retained */
  readonly retainedCount: number;
  /** Strategy that was used */
  readonly strategyUsed: string;
  /** Duration of pruning operation (ms) */
  readonly durationMs?: number;
}

/**
 * Unified pruning strategy interface.
 *
 * All pruning mechanisms in the system should implement this interface
 * to ensure consistent behavior and enable composition.
 *
 * @template T - Type of items being pruned
 *
 * @example
 * ```typescript
 * class OldestFirstStrategy implements IPruneStrategy<ContextItem> {
 *   readonly name = 'oldest_first';
 *
 *   shouldPrune(item: ContextItem, context: PruneContext): PruneDecision {
 *     const ageMs = context.now - item.timestamp;
 *     const maxAgeMs = 3600_000; // 1 hour
 *     return {
 *       shouldPrune: ageMs > maxAgeMs,
 *       reason: ageMs > maxAgeMs ? 'exceeded_max_age' : 'within_age_limit',
 *       score: ageMs,
 *     };
 *   }
 *
 *   selectForRemoval(items: ContextItem[], target: number): ContextItem[] {
 *     return items
 *       .sort((a, b) => a.timestamp - b.timestamp)
 *       .slice(0, items.length - target);
 *   }
 * }
 * ```
 */
export interface IPruneStrategy<T> {
  /** Strategy identifier */
  readonly name: string;

  /**
   * Determine if a single item should be pruned.
   *
   * @param item - Item to evaluate
   * @param context - Pruning context (timestamps, budgets, etc.)
   * @returns Decision with reason and optional score
   */
  shouldPrune(item: T, context: PruneContext): PruneDecision;

  /**
   * Select items for removal to meet target retention.
   *
   * @param items - All items to consider
   * @param targetRetention - Number of items to keep
   * @param context - Pruning context
   * @returns Items selected for removal (not retained items)
   */
  selectForRemoval(items: readonly T[], targetRetention: number, context: PruneContext): T[];
}

/**
 * Factory for creating pruning strategies.
 */
export interface IPruneStrategyFactory<T> {
  /**
   * Create a pruning strategy by name.
   *
   * @param name - Strategy name
   * @param config - Optional strategy configuration
   * @returns Pruning strategy instance
   */
  create(name: string, config?: Record<string, unknown>): IPruneStrategy<T>;

  /**
   * List available strategy names.
   */
  listStrategies(): string[];
}

/**
 * Common pruning strategy names.
 */
export const PruneStrategyName = {
  /** Remove oldest items first */
  OLDEST_FIRST: 'oldest_first',
  /** Remove items with lowest priority */
  LOWEST_PRIORITY: 'lowest_priority',
  /** Balance age and priority */
  PRIORITY_WEIGHTED_AGE: 'priority_weighted_age',
  /** Summarize groups of items */
  SUMMARIZE: 'summarize',
  /** Keep most recent N items */
  SLIDING_WINDOW: 'sliding_window',
  /** Prune by hierarchy level */
  HIERARCHICAL: 'hierarchical',
  /** Prune by semantic similarity */
  SEMANTIC: 'semantic',
  /** TTL-based expiration */
  TTL: 'ttl',
  /** LRU cache eviction */
  LRU: 'lru',
} as const;

export type PruneStrategyName = (typeof PruneStrategyName)[keyof typeof PruneStrategyName];
