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
import { categorizeOutcomeErrorMessage } from './outcome-types.js';
import { isPersistenceEnabled } from '../../config/learning-persistence.js';

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
 * Auto-classifies failed outcomes that are missing a failureCategory.
 * Uses errorMessage if available; otherwise marks as 'execution' for non-success
 * outcomes (better default than 'unknown' for outcomes that failed but have no error info).
 */
function autoClassify(outcome: TaskOutcome): TaskOutcome {
  if (outcome.success || outcome.failureCategory !== undefined) return outcome;
  if (typeof outcome.errorMessage === 'string' && outcome.errorMessage.length > 0) {
    return { ...outcome, failureCategory: categorizeOutcomeErrorMessage(outcome.errorMessage) };
  }
  // Failed outcome with no error info — classify as 'execution' (generic failure)
  return { ...outcome, failureCategory: 'execution' };
}

/** Check if outcome has a non-empty error message. */
function hasErrorMessage(o: TaskOutcome): boolean {
  return typeof o.errorMessage === 'string' && o.errorMessage.length > 0;
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

  /** Append a new outcome. Auto-classifies failures missing failureCategory (#1441). */
  append(outcome: TaskOutcome): void {
    this.entries.push(autoClassify(outcome));
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

  /**
   * Backfill: reclassify all entries missing failureCategory (#1444).
   * Also reclassifies 'unknown' entries with no error message as 'execution'
   * (#1511) since 'unknown' with no diagnostic info is less useful than the
   * default 'execution' category.
   * Returns count of reclassified entries.
   */
  reclassifyAll(): number {
    let count = 0;
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      if (entry === undefined || entry.success) continue;
      if (entry.failureCategory === undefined) {
        this.entries[i] = autoClassify(entry);
        count++;
      } else if (entry.failureCategory === 'unknown') {
        // Re-run classification with updated patterns (#1507)
        const newCategory = hasErrorMessage(entry)
          ? categorizeOutcomeErrorMessage(entry.errorMessage as string)
          : 'execution';
        if (newCategory !== 'unknown') {
          this.entries[i] = { ...entry, failureCategory: newCategory };
          count++;
        }
      }
    }
    return count;
  }

  /**
   * Purge false failures with zero execution time (#1528).
   * Removes non-success entries with durationMs=0 — these are either:
   * - Skipped workers (circuit breaker, role auto-disable)
   * - Test-generated entries (E2E eval artifacts)
   * - Pre-execution short-circuits (validation, initialization)
   * Real model execution always takes >0ms.
   * Returns count of purged entries.
   */
  purgeSkippedWorkers(): number {
    const before = this.entries.length;
    let writeIdx = 0;
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      if (entry === undefined) continue;
      const isZeroDurationFailure = !entry.success && entry.durationMs === 0;
      if (!isZeroDurationFailure) {
        this.entries[writeIdx] = entry;
        writeIdx++;
      }
    }
    this.entries.length = writeIdx;
    return before - writeIdx;
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

/**
 * Get the shared OutcomeStore singleton.
 * Returns PersistentOutcomeStore when NEXUS_PERSIST_LEARNING=true
 * and the factory has been registered (import outcome-store-persistence first).
 */
export function getOutcomeStore(): OutcomeStore {
  if (singletonStore === undefined) {
    if (isPersistenceEnabled() && persistentFactory !== undefined) {
      singletonStore = persistentFactory();
    } else {
      singletonStore = new OutcomeStore();
    }
  }
  return singletonStore;
}

/** Reset the singleton (for testing). */
export function resetOutcomeStore(): void {
  singletonStore = undefined;
}

/**
 * Replace the singleton with a specific store instance.
 * Used by E2E eval to inject an in-memory store that won't pollute
 * the persistent outcome file (#1528).
 */
export function setOutcomeStore(store: OutcomeStore): void {
  singletonStore = store;
}

// ============================================================================
// Persistent factory registration (Issue #1009)
// ============================================================================

type OutcomeStoreFactory = () => OutcomeStore;
let persistentFactory: OutcomeStoreFactory | undefined;

/**
 * Register a factory for creating PersistentOutcomeStore instances.
 * Called from outcome-store-persistence.ts at import time to break
 * the circular dependency.
 */
export function registerPersistentOutcomeStoreFactory(factory: OutcomeStoreFactory): void {
  persistentFactory = factory;
}

// ============================================================================
// Helpers
// ============================================================================

/** Builds predicate functions from an OutcomeQuery filter. */
function buildPredicates(filter: OutcomeQuery): Array<(o: TaskOutcome) => boolean> {
  const preds: Array<(o: TaskOutcome) => boolean> = [];
  if (filter.cli !== undefined) preds.push((o) => o.cli === filter.cli);
  if (filter.category !== undefined) preds.push((o) => o.category === filter.category);
  if (filter.source !== undefined) preds.push((o) => o.source === filter.source);
  if (filter.success !== undefined) preds.push((o) => o.success === filter.success);
  if (filter.failureCategory !== undefined) {
    preds.push((o) => o.failureCategory === filter.failureCategory);
  }
  if (filter.since !== undefined) {
    const since = filter.since;
    preds.push((o) => o.timestamp >= since);
  }
  return preds;
}

function applyFilters(entries: readonly TaskOutcome[], filter: OutcomeQuery): TaskOutcome[] {
  const preds = buildPredicates(filter);
  return entries.filter((o) => preds.every((p) => p(o)));
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
