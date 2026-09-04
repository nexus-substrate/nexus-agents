/**
 * nexus-agents/mcp - Coordinated Memory Decay
 *
 * Implements FADE (Forgetting with Adaptive Decay) principles for coordinated
 * memory management across all memory systems:
 * - SessionMemory (FIFO)
 * - BeliefMemory (age-based)
 * - AgenticMemory (importance-based)
 * - AdaptiveMemory (priority decay)
 * - MobiMem (TTL + capacity)
 *
 * Key features:
 * - Cross-memory reference tracking to prevent orphaned references
 * - Coordinated decay scheduling across memory types
 *
 * @module mcp/tools/memory-decay
 * (Source: Issue #746 Phase 5 - Coordinated Decay/Forgetting)
 * (Research: arXiv:2512.21567 - Decision-Theoretic Memory)
 */

import type { ILogger } from '../../core/index.js';
import { getErrorMessage, createLogger, getTimeProvider } from '../../core/index.js';

import type { HindsightBeliefMemory } from '../../context/belief-memory.js';
import type { AgenticMemoryBackend } from '../../context/agentic-memory.js';
import type { AdaptiveMemoryBackend } from '../../context/adaptive-memory.js';
import type { MobiMem } from '../../context/mobimem.js';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for coordinated memory decay.
 * Based on FADE principles from arXiv:2512.21567.
 */
export interface MemoryDecayConfig {
  /** Whether decay is enabled (default: true) */
  readonly enabled: boolean;

  /** Interval between automatic decay runs in ms (default: 1 hour) */
  readonly decayIntervalMs: number;

  /** Belief decay - age in days before pruning superseded beliefs (default: 30) */
  readonly beliefMaxAgeDays: number;

  /** Agentic decay - max entries before importance-based eviction (default: 10000) */
  readonly agenticMaxEntries: number;

  /** Agentic decay - importance threshold for eviction (default: 0.3) */
  readonly agenticImportanceThreshold: number;

  /** Adaptive decay - priority score threshold for eviction (default: 0.2) */
  readonly adaptivePriorityThreshold: number;

  /** MobiMem decay - run TTL eviction on coordinated decay (default: true) */
  readonly mobimemEvictOnDecay: boolean;

  /** Whether to check cross-references before eviction (default: true) */
  readonly checkCrossReferences: boolean;

  /** Grace period in ms before removing items with cross-references (default: 7 days) */
  readonly crossReferenceGracePeriodMs: number;
}

/** Default decay configuration. */
export const DEFAULT_DECAY_CONFIG: MemoryDecayConfig = {
  enabled: true,
  decayIntervalMs: 60 * 60 * 1000, // 1 hour
  beliefMaxAgeDays: 30,
  agenticMaxEntries: 10000,
  agenticImportanceThreshold: 0.3,
  adaptivePriorityThreshold: 0.2,
  mobimemEvictOnDecay: true,
  checkCrossReferences: true,
  crossReferenceGracePeriodMs: 7 * 24 * 60 * 60 * 1000, // 7 days
};

// ============================================================================
// Decay Statistics
// ============================================================================

/**
 * Statistics from a single decay run.
 */
export interface DecayRunStats {
  readonly startedAt: Date;
  readonly completedAt: Date;
  readonly beliefsPruned: number;
  readonly agenticEvicted: number;
  readonly adaptiveEvicted: number;
  readonly mobimemEvicted: number;
  readonly crossReferencesPreserved: number;
  readonly errors: readonly string[];
}

/**
 * Aggregate statistics across multiple decay runs.
 */
export interface DecayAggregateStats {
  readonly totalRuns: number;
  readonly lastRunAt: Date | null;
  readonly totalBeliefsPruned: number;
  readonly totalAgenticEvicted: number;
  readonly totalAdaptiveEvicted: number;
  readonly totalMobimemEvicted: number;
  readonly totalCrossReferencesPreserved: number;
  readonly totalErrors: number;
}

/** Internal results from decay phases. */
interface DecayPhaseResults {
  beliefsPruned?: number;
  agenticEvicted?: number;
  adaptiveEvicted?: number;
  mobimemEvicted?: number;
  crossReferencesPreserved?: number;
  errors: string[];
}

// ============================================================================
// Cross-Reference Tracking
// ============================================================================

/**
 * Represents a cross-memory reference.
 */
export interface CrossReference {
  readonly sourceMemory: 'session' | 'belief' | 'agentic' | 'adaptive' | 'mobimem';
  readonly sourceKey: string;
  readonly targetMemory: 'session' | 'belief' | 'agentic' | 'adaptive' | 'mobimem';
  readonly targetKey: string;
  readonly createdAt: Date;
}

/**
 * Tracks cross-references between memory systems.
 * Used to prevent orphaned references during decay.
 */
export class CrossReferenceTracker {
  private readonly references: Map<string, CrossReference[]> = new Map();
  private readonly log: ILogger;

  constructor(logger?: ILogger) {
    this.log = logger ?? createLogger({ component: 'CrossReferenceTracker' });
  }

  /**
   * Register a cross-reference between two memories.
   */
  registerReference(ref: Omit<CrossReference, 'createdAt'>): void {
    const key = this.makeKey(ref.sourceMemory, ref.sourceKey);
    const refs = this.references.get(key) ?? [];
    refs.push({
      ...ref,
      createdAt: new Date(getTimeProvider().now()),
    });
    this.references.set(key, refs);
    this.log.debug('Registered cross-reference', {
      source: `${ref.sourceMemory}:${ref.sourceKey}`,
      target: `${ref.targetMemory}:${ref.targetKey}`,
    });
  }

  /**
   * Check if a memory entry has cross-references.
   */
  hasReferences(memory: CrossReference['sourceMemory'], key: string): boolean {
    const refKey = this.makeKey(memory, key);
    const refs = this.references.get(refKey);
    return refs !== undefined && refs.length > 0;
  }

  /**
   * Get all references for a memory entry.
   */
  getReferences(memory: CrossReference['sourceMemory'], key: string): readonly CrossReference[] {
    const refKey = this.makeKey(memory, key);
    return this.references.get(refKey) ?? [];
  }

  /**
   * Remove references for a deleted memory entry.
   */
  removeReferences(memory: CrossReference['sourceMemory'], key: string): number {
    const refKey = this.makeKey(memory, key);
    const refs = this.references.get(refKey);
    if (refs === undefined) return 0;
    this.references.delete(refKey);

    // Also remove any references targeting this key
    let removed = refs.length;
    for (const [k, targetRefs] of this.references.entries()) {
      const filtered = targetRefs.filter(
        (r) => !(r.targetMemory === memory && r.targetKey === key)
      );
      if (filtered.length !== targetRefs.length) {
        removed += targetRefs.length - filtered.length;
        if (filtered.length === 0) {
          this.references.delete(k);
        } else {
          this.references.set(k, filtered);
        }
      }
    }
    return removed;
  }

  /**
   * Get statistics about tracked references.
   */
  getStats(): { totalReferences: number; uniqueSources: number } {
    let totalReferences = 0;
    for (const refs of this.references.values()) {
      totalReferences += refs.length;
    }
    return {
      totalReferences,
      uniqueSources: this.references.size,
    };
  }

  private makeKey(memory: string, key: string): string {
    return `${memory}:${key}`;
  }
}

// ============================================================================
// MemoryDecayManager
// ============================================================================

/**
 * Manages coordinated decay across all memory systems.
 * Implements FADE (Forgetting with Adaptive Decay) principles.
 */
export class MemoryDecayManager {
  private readonly config: MemoryDecayConfig;
  private readonly log: ILogger;
  private readonly tracker: CrossReferenceTracker;
  private readonly runHistory: DecayRunStats[] = [];
  private decayTimer: ReturnType<typeof setInterval> | null = null;

  // Memory system references (set during initialization)
  private beliefs: HindsightBeliefMemory | null = null;
  private agentic: AgenticMemoryBackend | null = null;
  private adaptive: AdaptiveMemoryBackend | null = null;
  private mobimem: MobiMem | null = null;

  constructor(config: Partial<MemoryDecayConfig> = {}, logger?: ILogger) {
    this.config = { ...DEFAULT_DECAY_CONFIG, ...config };
    this.log = logger ?? createLogger({ component: 'MemoryDecayManager' });
    this.tracker = new CrossReferenceTracker(this.log);
  }

  /**
   * The effective configuration this manager runs with (defaults overlaid by
   * whatever the constructor received). #5097: the startup line in
   * tool-memory reads THIS, not the value it passed in, so the log reports
   * what the manager holds rather than what the caller believes it sent.
   */
  getConfig(): MemoryDecayConfig {
    return this.config;
  }

  /**
   * Initialize with memory system references.
   */
  initialize(options: {
    beliefs?: HindsightBeliefMemory;
    agentic?: AgenticMemoryBackend | null;
    adaptive?: AdaptiveMemoryBackend | null;
    mobimem?: MobiMem | null;
  }): void {
    this.beliefs = options.beliefs ?? null;
    this.agentic = options.agentic ?? null;
    this.adaptive = options.adaptive ?? null;
    this.mobimem = options.mobimem ?? null;
    this.log.info('MemoryDecayManager initialized', {
      beliefs: this.beliefs !== null,
      agentic: this.agentic !== null,
      adaptive: this.adaptive !== null,
      mobimem: this.mobimem !== null,
    });
  }

  /**
   * Start automatic decay scheduling.
   */
  startAutoDecay(): void {
    if (!this.config.enabled) {
      this.log.info('Auto-decay disabled by configuration');
      return;
    }
    if (this.decayTimer !== null) {
      this.log.warn('Auto-decay already running');
      return;
    }

    this.decayTimer = setInterval(() => {
      void this.runDecay().catch((error: unknown) => {
        const err = error instanceof Error ? error : new Error(String(error));
        this.log.error('Auto-decay failed', err, {});
      });
    }, this.config.decayIntervalMs);
    // #5402: never be the sole reason the process stays alive. A background
    // maintenance sweep on a 1-hour cadence must not outvote the exit path —
    // `task-store.ts` and `response-cache.ts` already unref theirs for the same
    // reason. Today every server exit path calls `process.exit()`, which does
    // not wait for the loop to drain, so this is latent rather than live; that
    // masking is incidental and one `transport.onclose` handler away from
    // mattering.
    this.decayTimer.unref();

    this.log.info('Auto-decay started', { intervalMs: this.config.decayIntervalMs });
  }

  /**
   * Stop automatic decay scheduling.
   */
  stopAutoDecay(): void {
    if (this.decayTimer !== null) {
      clearInterval(this.decayTimer);
      this.decayTimer = null;
      this.log.info('Auto-decay stopped');
    }
  }

  /**
   * Run a coordinated decay pass across all memory systems.
   */
  async runDecay(): Promise<DecayRunStats> {
    const startedAt = new Date(getTimeProvider().now());
    this.log.info('Starting coordinated decay run');

    const results = await this.executeDecayPhases();
    const stats = this.buildStats(startedAt, results);
    this.recordHistory(stats);
    this.logCompletion(stats);

    return stats;
  }

  /** Execute all decay phases and collect results. */
  private async executeDecayPhases(): Promise<DecayPhaseResults> {
    const results: DecayPhaseResults = { errors: [] };

    // Phase 1: Belief Memory
    const beliefResult = await this.safeDecay('Belief', () => this.decayBeliefs());
    results.beliefsPruned = beliefResult.pruned;
    results.crossReferencesPreserved = beliefResult.preserved;
    if (beliefResult.error !== undefined) results.errors.push(beliefResult.error);

    // Phase 2: Agentic Memory
    const agenticResult = await this.safeDecay('Agentic', () => this.decayAgentic());
    results.agenticEvicted = agenticResult.evicted;
    results.crossReferencesPreserved =
      (results.crossReferencesPreserved ?? 0) + agenticResult.preserved;
    if (agenticResult.error !== undefined) results.errors.push(agenticResult.error);

    // Phase 3: Adaptive Memory
    const adaptiveResult = await this.safeDecay('Adaptive', () => this.decayAdaptive());
    results.adaptiveEvicted = adaptiveResult.evicted;
    results.crossReferencesPreserved =
      (results.crossReferencesPreserved ?? 0) + adaptiveResult.preserved;
    if (adaptiveResult.error !== undefined) results.errors.push(adaptiveResult.error);

    // Phase 4: MobiMem
    results.mobimemEvicted = this.decayMobiMem(results.errors);

    return results;
  }

  /** Safely execute a decay function with error handling. */
  private async safeDecay(
    name: string,
    fn: () => Promise<{ pruned?: number; evicted?: number; preserved: number }>
  ): Promise<{ pruned: number; evicted: number; preserved: number; error?: string }> {
    try {
      const result = await fn();
      return {
        pruned: result.pruned ?? 0,
        evicted: result.evicted ?? 0,
        preserved: result.preserved,
      };
    } catch (error) {
      const msg = `${name} decay failed: ${getErrorMessage(error)}`;
      this.log.warn(msg);
      return { pruned: 0, evicted: 0, preserved: 0, error: msg };
    }
  }

  /** Execute MobiMem maintenance. */
  private decayMobiMem(errors: string[]): number {
    if (this.mobimem === null || !this.config.mobimemEvictOnDecay) return 0;
    try {
      this.mobimem.runMaintenance();
      return this.mobimem.getStats().action.totalEntries > 0 ? 1 : 0;
    } catch (error) {
      const msg = `MobiMem decay failed: ${getErrorMessage(error)}`;
      errors.push(msg);
      this.log.warn(msg);
      return 0;
    }
  }

  /** Build DecayRunStats from phase results. */
  private buildStats(startedAt: Date, results: DecayPhaseResults): DecayRunStats {
    return {
      startedAt,
      completedAt: new Date(getTimeProvider().now()),
      beliefsPruned: results.beliefsPruned ?? 0,
      agenticEvicted: results.agenticEvicted ?? 0,
      adaptiveEvicted: results.adaptiveEvicted ?? 0,
      mobimemEvicted: results.mobimemEvicted ?? 0,
      crossReferencesPreserved: results.crossReferencesPreserved ?? 0,
      errors: results.errors,
    };
  }

  /** Record stats in history, keeping last 100. */
  private recordHistory(stats: DecayRunStats): void {
    this.runHistory.push(stats);
    if (this.runHistory.length > 100) this.runHistory.shift();
  }

  /** Log completion of decay run. */
  private logCompletion(stats: DecayRunStats): void {
    this.log.info('Coordinated decay completed', {
      durationMs: stats.completedAt.getTime() - stats.startedAt.getTime(),
      beliefsPruned: stats.beliefsPruned,
      agenticEvicted: stats.agenticEvicted,
      adaptiveEvicted: stats.adaptiveEvicted,
      mobimemEvicted: stats.mobimemEvicted,
      crossReferencesPreserved: stats.crossReferencesPreserved,
      errors: stats.errors.length,
    });
  }

  /**
   * Decay beliefs older than the configured age.
   */
  private async decayBeliefs(): Promise<{ pruned: number; preserved: number }> {
    if (this.beliefs === null) return { pruned: 0, preserved: 0 };

    const maxAgeMs = this.config.beliefMaxAgeDays * 24 * 60 * 60 * 1000;
    const cutoffDate = new Date(getTimeProvider().now() - maxAgeMs);

    // If cross-reference checking is enabled, we need to check before pruning
    // For now, use the simple age-based pruning
    const result = await this.beliefs.pruneSuperseded(cutoffDate);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    return { pruned: result.value, preserved: 0 };
  }

  /**
   * Decay agentic memories with low importance.
   */
  private async decayAgentic(): Promise<{ evicted: number; preserved: number }> {
    if (this.agentic === null) return { evicted: 0, preserved: 0 };

    // Use the base prune functionality with age-based cutoff
    // Agentic memory importance-based eviction requires searching all entries
    // For Phase 5, we use a conservative approach: prune entries older than 90 days
    const cutoffDate = new Date(getTimeProvider().now() - 90 * 24 * 60 * 60 * 1000);
    const result = await this.agentic.prune(cutoffDate);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    return { evicted: result.value, preserved: 0 };
  }

  /**
   * Decay adaptive memories with low priority scores.
   */
  private async decayAdaptive(): Promise<{ evicted: number; preserved: number }> {
    if (this.adaptive === null) return { evicted: 0, preserved: 0 };

    // Use the base prune functionality with age-based cutoff
    // Priority-based eviction would require retrieving all entries and filtering
    // For Phase 5, we use a conservative approach: prune entries older than 60 days
    const cutoffDate = new Date(getTimeProvider().now() - 60 * 24 * 60 * 60 * 1000);
    const result = await this.adaptive.prune(cutoffDate);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    return { evicted: result.value, preserved: 0 };
  }

  /**
   * Register a cross-reference between memory systems.
   * Call this when promoting memory between layers.
   */
  registerCrossReference(
    sourceMemory: CrossReference['sourceMemory'],
    sourceKey: string,
    targetMemory: CrossReference['targetMemory'],
    targetKey: string
  ): void {
    this.tracker.registerReference({
      sourceMemory,
      sourceKey,
      targetMemory,
      targetKey,
    });
  }

  /**
   * Get aggregate statistics across all decay runs.
   */
  getAggregateStats(): DecayAggregateStats {
    const lastRun = this.runHistory.length > 0 ? this.runHistory[this.runHistory.length - 1] : null;

    return {
      totalRuns: this.runHistory.length,
      lastRunAt: lastRun?.completedAt ?? null,
      totalBeliefsPruned: this.runHistory.reduce((sum, r) => sum + r.beliefsPruned, 0),
      totalAgenticEvicted: this.runHistory.reduce((sum, r) => sum + r.agenticEvicted, 0),
      totalAdaptiveEvicted: this.runHistory.reduce((sum, r) => sum + r.adaptiveEvicted, 0),
      totalMobimemEvicted: this.runHistory.reduce((sum, r) => sum + r.mobimemEvicted, 0),
      totalCrossReferencesPreserved: this.runHistory.reduce(
        (sum, r) => sum + r.crossReferencesPreserved,
        0
      ),
      totalErrors: this.runHistory.reduce((sum, r) => sum + r.errors.length, 0),
    };
  }

  /**
   * Get the last N decay run results.
   */
  getRecentRuns(limit = 10): readonly DecayRunStats[] {
    return this.runHistory.slice(-limit);
  }

  /**
   * Get cross-reference tracker statistics.
   */
  getCrossReferenceStats(): { totalReferences: number; uniqueSources: number } {
    return this.tracker.getStats();
  }

  /**
   * Clean up resources.
   */
  shutdown(): void {
    this.stopAutoDecay();
    this.log.info('MemoryDecayManager shutdown');
  }
}
