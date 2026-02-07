/**
 * In-memory, append-only store for task outcomes.
 *
 * Provides bounded storage with FIFO eviction, filtering queries,
 * and aggregated performance summaries. Thread-safe for single-process
 * use (Node.js event loop).
 *
 * @module orchestration/outcomes/outcome-store
 * (Source: Issue #861 — Task outcome tracking)
 */

import type { TaskOutcome, OutcomeQuery, PerformanceSummary, GroupStats } from './outcome-types.js';

// ============================================================================
// Constants
// ============================================================================

/** Default maximum stored outcomes before oldest are evicted. */
const DEFAULT_MAX_ENTRIES = 10_000;

// ============================================================================
// OutcomeStore
// ============================================================================

export interface OutcomeStoreConfig {
  readonly maxEntries?: number;
}

/**
 * Bounded, append-only, in-memory store for task outcomes.
 * Evicts oldest entries when capacity is exceeded.
 */
export class OutcomeStore {
  private readonly entries: TaskOutcome[] = [];
  private readonly maxEntries: number;

  constructor(config?: OutcomeStoreConfig) {
    this.maxEntries = config?.maxEntries ?? DEFAULT_MAX_ENTRIES;
  }

  /** Append a new outcome. Evicts oldest if at capacity. */
  append(outcome: TaskOutcome): void {
    this.entries.push(outcome);
    this.enforceLimit();
  }

  /** Query outcomes with optional filters. */
  query(filter?: OutcomeQuery): readonly TaskOutcome[] {
    if (filter === undefined) return [...this.entries];
    const filtered = applyFilters(this.entries, filter);
    return filter.limit !== undefined ? filtered.slice(-filter.limit) : filtered;
  }

  /** Aggregate outcomes into a performance summary. */
  summarize(filter?: OutcomeQuery): PerformanceSummary {
    const outcomes = this.query(filter);

    if (outcomes.length === 0) {
      return {
        totalTasks: 0,
        successRate: 0,
        avgDurationMs: 0,
        byCli: new Map(),
        byCategory: new Map(),
      };
    }

    const successCount = outcomes.filter((o) => o.success).length;
    const totalDuration = outcomes.reduce((s, o) => s + o.durationMs, 0);

    return {
      totalTasks: outcomes.length,
      successRate: successCount / outcomes.length,
      avgDurationMs: totalDuration / outcomes.length,
      byCli: groupBy(outcomes, (o) => o.cli),
      byCategory: groupBy(outcomes, (o) => o.category),
    };
  }

  /** Number of stored outcomes. */
  get size(): number {
    return this.entries.length;
  }

  /** Remove all stored outcomes. */
  clear(): void {
    this.entries.length = 0;
  }

  private enforceLimit(): void {
    if (this.entries.length > this.maxEntries) {
      const excess = this.entries.length - this.maxEntries;
      this.entries.splice(0, excess);
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let singletonStore: OutcomeStore | undefined;

/** Get the shared OutcomeStore singleton. */
export function getOutcomeStore(): OutcomeStore {
  singletonStore ??= new OutcomeStore();
  return singletonStore;
}

/** Reset the singleton (for testing). */
export function resetOutcomeStore(): void {
  singletonStore = undefined;
}

// ============================================================================
// Helpers
// ============================================================================

function applyFilters(entries: readonly TaskOutcome[], filter: OutcomeQuery): TaskOutcome[] {
  return entries.filter((o) => {
    if (filter.cli !== undefined && o.cli !== filter.cli) return false;
    if (filter.category !== undefined && o.category !== filter.category) return false;
    if (filter.source !== undefined && o.source !== filter.source) return false;
    if (filter.since !== undefined && o.timestamp < filter.since) return false;
    return true;
  });
}

function groupBy(
  outcomes: readonly TaskOutcome[],
  keyFn: (o: TaskOutcome) => string
): ReadonlyMap<string, GroupStats> {
  const groups = new Map<string, TaskOutcome[]>();

  for (const o of outcomes) {
    const key = keyFn(o);
    const list = groups.get(key);
    if (list !== undefined) {
      list.push(o);
    } else {
      groups.set(key, [o]);
    }
  }

  const result = new Map<string, GroupStats>();
  for (const [key, list] of groups) {
    const sc = list.filter((o) => o.success).length;
    const td = list.reduce((s, o) => s + o.durationMs, 0);
    result.set(key, {
      count: list.length,
      successRate: sc / list.length,
      avgDurationMs: td / list.length,
    });
  }

  return result;
}
