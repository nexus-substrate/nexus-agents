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
import { getDefaultRegistry, type ModelRegistry } from '../../config/model-registry.js';

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
  /**
   * Registry used to resolve vendor/family from `outcome.model` at write
   * time (#2548). Defaults to the process singleton. Pass an explicit
   * registry for tests that want deterministic resolution without
   * touching global state.
   */
  readonly registry?: ModelRegistry;
}

/**
 * Default minimum sample count before `queryByModelWithFamilyFallback`
 * broadens to family-level data. Tuned so cold-start siblings inherit
 * their family's signal until they accumulate ~5 of their own outcomes.
 */
export const DEFAULT_FAMILY_FALLBACK_THRESHOLD = 5;

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
  private readonly registry: ModelRegistry;

  constructor(config?: OutcomeStoreConfig) {
    this.maxEntries = config?.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.registry = config?.registry ?? getDefaultRegistry();
  }

  /**
   * Append a new outcome. Auto-classifies failures missing failureCategory
   * (#1441) and resolves the outcome's `vendor` / `family` via the
   * ModelRegistry (#2548) so family-level retrieval can warm-start
   * siblings after a model retirement.
   */
  append(outcome: TaskOutcome): void {
    this.entries.push(this.enrich(autoClassify(outcome)));
    this.enforceLimit();
  }

  /**
   * Attach `vendor` and `family` to the outcome if they're not already
   * set. Idempotent — pre-enriched outcomes pass through unchanged.
   */
  private enrich(outcome: TaskOutcome): TaskOutcome {
    if (outcome.vendor !== undefined && outcome.family !== undefined) return outcome;
    const entry = this.registry.getEntry(outcome.model);
    return {
      ...outcome,
      vendor: outcome.vendor ?? entry.vendor,
      family: outcome.family ?? entry.family,
    };
  }

  /** Query outcomes with optional filters. */
  query(filter?: OutcomeQuery): readonly TaskOutcome[] {
    if (filter === undefined) return [...this.entries];
    // Closes #2955 site 1: pre-fix this did
    // `entries.filter(...).slice(-limit)` — a full O(N) scan of all 10k
    // cap entries even when limit=20. The composite-router calls this
    // inside computeQualityReward() on every single executeTask, so it's
    // a hot path. Walk from the tail and stop once `limit` matches
    // accumulate. Preserves "last N matching" semantics; drops to
    // O(matches-needed) best-case (recent history is heavily skewed
    // toward the cli/category being queried).
    if (filter.limit === undefined) return applyFilters(this.entries, filter);
    return tailScan(this.entries, filter, filter.limit);
  }

  /**
   * Query outcomes for a specific model with a family-level warm-start
   * fallback (#2548). When the literal `modelId` has fewer than
   * `threshold` samples in the store, broaden the result to the model's
   * `{vendor, family}` siblings — siblings within a family share enough
   * behavior profile that their outcomes are useful priors for cold
   * starts after a retirement.
   *
   * Returns the outcomes and a `scope` flag so callers know whether
   * they're consuming literal-id data or family-broadened data.
   */
  queryByModelWithFamilyFallback(
    modelId: string,
    options?: {
      readonly threshold?: number;
      readonly extraFilter?: Omit<OutcomeQuery, 'limit'>;
    }
  ): {
    readonly outcomes: readonly TaskOutcome[];
    readonly scope: 'literal' | 'family' | 'empty';
    readonly vendor?: string;
    readonly family?: string;
  } {
    const threshold = options?.threshold ?? DEFAULT_FAMILY_FALLBACK_THRESHOLD;
    const base = options?.extraFilter ?? {};
    const entry = this.registry.getEntry(modelId);
    const { literal, family } = partitionByLiteralAndFamily(
      applyFilters(this.entries, base),
      modelId,
      entry.vendor,
      entry.family
    );
    if (literal.length >= threshold) {
      return { outcomes: literal, scope: 'literal', vendor: entry.vendor, family: entry.family };
    }
    if (family.length === 0) {
      return { outcomes: literal, scope: 'empty', vendor: entry.vendor, family: entry.family };
    }
    return { outcomes: family, scope: 'family', vendor: entry.vendor, family: entry.family };
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
      } else if (
        entry.failureCategory === 'unknown' ||
        entry.failureCategory === 'execution' ||
        entry.failureCategory === 'generic'
      ) {
        // Re-run classification with updated patterns (#1507, #1530, #1401)
        // Reclassifies execution/generic/unknown entries since pattern ownership changed:
        // HTTP 5xx → connection, empty response → parse (#1530),
        // "service unavailable" → connection, exit code patterns → specific categories.
        const newCategory = hasErrorMessage(entry)
          ? categorizeOutcomeErrorMessage(entry.errorMessage as string)
          : 'execution';
        if (newCategory !== entry.failureCategory) {
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
    // Phase 6 of #2766: surface the store on the unified registry for
    // discovery + telemetry. Fire-and-forget; failure here must never
    // block routing — the existing `getOutcomeStore()` callers don't
    // depend on this side effect.
    void attachOutcomeStoreToRegistry(singletonStore);
  }
  return singletonStore;
}

async function attachOutcomeStoreToRegistry(store: OutcomeStore): Promise<void> {
  try {
    const { getMemoryRegistry } = await import('nexus-memory');
    const { OutcomeStoreAdapter } = await import('./outcome-store-adapter.js');
    getMemoryRegistry().attach('outcomes', new OutcomeStoreAdapter(store));
  } catch {
    // Already attached or nexus-memory unavailable — silent.
  }
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
// Context Helpers (#1711 — Central Workflow Hub)
// ============================================================================

/**
 * Build a human-readable outcome summary for planning context.
 * Returns empty string when no outcomes are available (cold start).
 * Includes success rate and recent failure patterns with categories.
 */
export function getOutcomeSummaryText(limit = 5): string {
  const store = getOutcomeStore();
  const summary = store.summarize();
  if (summary.totalTasks === 0) return '';
  const failures = store.query({ success: false, limit });
  const failLines = failures
    .map((f) => {
      const cat = f.failureCategory ?? 'unknown';
      const msg = f.errorMessage ?? '';
      return msg.length > 0 ? `${cat}: ${msg}` : cat;
    })
    .filter((l) => l.length > 0);
  const taskCount = String(summary.totalTasks);
  const pct = String(Math.round(summary.successRate * 100));
  const header = `## Outcome Context (${taskCount} tasks, ${pct}% success)`;
  const failSection = failLines.length > 0 ? `\nRecent failures:\n${failLines.join('\n')}` : '';
  return `${header}${failSection}`;
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
  if (filter.excludeQualitySignals !== undefined && filter.excludeQualitySignals.length > 0) {
    const excluded = new Set(filter.excludeQualitySignals);
    preds.push((o) => {
      const signals = o.qualitySignals;
      if (signals === undefined || signals.length === 0) return true;
      return !signals.some((s) => excluded.has(s));
    });
  }
  if (filter.baselineId !== undefined) {
    preds.push((o) => o.baselineId === filter.baselineId);
  }
  return preds;
}

function applyFilters(entries: readonly TaskOutcome[], filter: OutcomeQuery): TaskOutcome[] {
  const preds = buildPredicates(filter);
  return entries.filter((o) => preds.every((p) => p(o)));
}

/**
 * Single-pass partition of base-filtered outcomes into literal-id matches
 * and same-vendor/same-family matches (closes #2955 site 2). The family
 * bucket INCLUDES literal-id matches so the family-broadened result is a
 * superset of the literal-id result — matches pre-fix semantics.
 *
 * Cross-vendor transfer is out of scope (#2548) — vendor + family must
 * both match. An Anthropic claude-opus outcome should not warm-start an
 * Anthropic claude-haiku query.
 */
function partitionByLiteralAndFamily(
  baseFiltered: readonly TaskOutcome[],
  modelId: string,
  vendor: string,
  family: string
): { literal: TaskOutcome[]; family: TaskOutcome[] } {
  const literalBucket: TaskOutcome[] = [];
  const familyBucket: TaskOutcome[] = [];
  for (const o of baseFiltered) {
    if (o.vendor !== vendor || o.family !== family) continue;
    familyBucket.push(o);
    if (o.model === modelId) literalBucket.push(o);
  }
  return { literal: literalBucket, family: familyBucket };
}

/**
 * Walk `entries` from the tail backwards, collecting up to `limit` matches,
 * then return them in chronological order (closes #2955 site 1).
 *
 * Equivalent to `applyFilters(entries, filter).slice(-limit)` but avoids
 * scanning the entire entries array when the recent tail contains enough
 * matches — which is the common case for the composite-router's hot path.
 */
function tailScan(
  entries: readonly TaskOutcome[],
  filter: OutcomeQuery,
  limit: number
): TaskOutcome[] {
  if (limit <= 0) return [];
  const preds = buildPredicates(filter);
  const collected: TaskOutcome[] = [];
  for (let i = entries.length - 1; i >= 0; i--) {
    const o = entries[i];
    if (o === undefined) continue;
    if (preds.every((p) => p(o))) {
      collected.push(o);
      if (collected.length >= limit) break;
    }
  }
  return collected.reverse();
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
