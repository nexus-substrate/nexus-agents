/**
 * nexus-agents/context - MobiMEM Types
 *
 * Type definitions for MobiMEM post-deployment evolution memory system.
 * Implements Profile, Experience, and Action memory modules for
 * continuous agent improvement without weight updates.
 *
 * @module context/mobimem-types
 * (Source: Issue #149, arXiv:2512.15784)
 */

import { z } from 'zod';

/**
 * Profile entry storing agent/user preferences and patterns.
 */
export interface ProfileEntry {
  /** Unique identifier */
  readonly id: string;
  /** Associated agent or user ID */
  readonly entityId: string;
  /** Type of entity (agent or user) */
  readonly entityType: 'agent' | 'user';
  /** Preference key (e.g., "preferred_model", "output_format") */
  readonly preferenceKey: string;
  /** Preference value */
  readonly preferenceValue: unknown;
  /** Confidence in this preference (0-1) */
  readonly confidence: number;
  /** Number of observations supporting this preference */
  readonly observationCount: number;
  /** When first observed */
  readonly createdAt: Date;
  /** When last updated */
  readonly updatedAt: Date;
}

/**
 * Experience entry storing workflow execution patterns.
 */
export interface ExperienceEntry {
  /** Unique identifier */
  readonly id: string;
  /** Task type or category */
  readonly taskType: string;
  /** Sequence of actions taken */
  readonly actionSequence: readonly ActionStep[];
  /** Outcome of the execution */
  readonly outcome: ExecutionOutcome;
  /** Context in which this pattern succeeded */
  readonly contextSignature: string;
  /** How often this pattern has succeeded */
  readonly successCount: number;
  /** Total times this pattern was attempted */
  readonly attemptCount: number;
  /** Success rate (successCount / attemptCount) */
  readonly successRate: number;
  /** When first recorded */
  readonly createdAt: Date;
  /** When last used */
  readonly lastUsedAt: Date;
}

/**
 * A single step in an action sequence.
 */
export interface ActionStep {
  /** Step index (0-based) */
  readonly index: number;
  /** Action type (e.g., "tool_call", "model_query", "agent_delegate") */
  readonly actionType: string;
  /** Action-specific parameters */
  readonly parameters: Record<string, unknown>;
  /** Duration in milliseconds */
  readonly durationMs: number;
  /** Whether this step succeeded */
  readonly success: boolean;
}

/**
 * Outcome of a workflow execution.
 */
export interface ExecutionOutcome {
  /** Whether the overall execution succeeded */
  readonly success: boolean;
  /** Quality score if available (0-1) */
  readonly qualityScore?: number;
  /** Error type if failed */
  readonly errorType?: string;
  /** Total execution time */
  readonly totalDurationMs: number;
  /** Total tokens used */
  readonly tokensUsed: number;
  /**
   * #3234: deterministic research-maturity `[0,1]` of the run that produced this
   * outcome (RECORD + measure). Absent when no research context was threaded.
   * The measurement surface buckets outcomes by this; live routing use is gated
   * on a measured success-rate lift (#3815).
   */
  readonly researchMaturity?: number;
}

/**
 * Action cache entry for rapid retrieval of successful interactions.
 */
export interface ActionCacheEntry {
  /** Unique identifier */
  readonly id: string;
  /** Input hash for quick matching */
  readonly inputHash: string;
  /** Original input that produced this result */
  readonly input: unknown;
  /** Cached result */
  readonly result: unknown;
  /** Time to generate original result */
  readonly originalDurationMs: number;
  /** Number of cache hits */
  readonly hitCount: number;
  /** Time saved through caching (hitCount * originalDurationMs) */
  readonly timeSavedMs: number;
  /** When cached */
  readonly cachedAt: Date;
  /** When last accessed */
  readonly lastAccessedAt: Date;
  /** Cache entry TTL */
  readonly expiresAt: Date;
}

/**
 * MobiMEM configuration.
 */
export interface MobiMemConfig {
  /** Database path for persistence */
  readonly dbPath: string;
  /** Maximum profile entries per entity */
  readonly maxProfileEntries: number;
  /** Maximum experience patterns to track */
  readonly maxExperiencePatterns: number;
  /** Maximum action cache entries */
  readonly maxActionCacheEntries: number;
  /** Action cache TTL in milliseconds */
  readonly actionCacheTtlMs: number;
  /** Minimum confidence to consider a profile preference established */
  readonly minProfileConfidence: number;
  /** Minimum success rate to consider an experience pattern reliable */
  readonly minExperienceSuccessRate: number;
  /** Enable automatic cache eviction */
  readonly autoEviction: boolean;
}

/**
 * Default MobiMEM configuration.
 */
export const DEFAULT_MOBIMEM_CONFIG: MobiMemConfig = {
  dbPath: ':memory:',
  maxProfileEntries: 100,
  maxExperiencePatterns: 500,
  maxActionCacheEntries: 1000,
  actionCacheTtlMs: 3600000, // 1 hour
  minProfileConfidence: 0.6,
  minExperienceSuccessRate: 0.7,
  autoEviction: true,
};

/**
 * Zod schema for config validation.
 */
export const MobiMemConfigSchema = z.object({
  dbPath: z.string(),
  maxProfileEntries: z.number().int().positive().default(100),
  maxExperiencePatterns: z.number().int().positive().default(500),
  maxActionCacheEntries: z.number().int().positive().default(1000),
  actionCacheTtlMs: z.number().int().positive().default(3600000),
  minProfileConfidence: z.number().min(0).max(1).default(0.6),
  minExperienceSuccessRate: z.number().min(0).max(1).default(0.7),
  autoEviction: z.boolean().default(true),
});

/**
 * Statistics for MobiMEM system.
 */
export interface MobiMemStats {
  /** Profile memory stats */
  readonly profile: {
    readonly totalEntries: number;
    readonly uniqueEntities: number;
    readonly avgConfidence: number;
  };
  /** Experience memory stats */
  readonly experience: {
    readonly totalPatterns: number;
    readonly uniqueTaskTypes: number;
    readonly avgSuccessRate: number;
  };
  /** Action cache stats */
  readonly action: {
    readonly totalEntries: number;
    readonly totalHits: number;
    readonly hitRate: number;
    readonly timeSavedMs: number;
  };
}

/**
 * Profile memory interface.
 */
export interface IProfileMemory {
  /** Record a preference observation */
  observe(
    entityId: string,
    entityType: 'agent' | 'user',
    preferenceKey: string,
    preferenceValue: unknown
  ): ProfileEntry;

  /** Get preferences for an entity */
  getPreferences(entityId: string): readonly ProfileEntry[];

  /** Get a specific preference */
  getPreference(entityId: string, preferenceKey: string): ProfileEntry | null;

  /** Get established preferences (above confidence threshold) */
  getEstablishedPreferences(entityId: string): readonly ProfileEntry[];

  /** Clear preferences for an entity */
  clearPreferences(entityId: string): number;
}

/**
 * Experience memory interface.
 */
export interface IExperienceMemory {
  /** Record a workflow execution */
  recordExecution(
    taskType: string,
    actionSequence: readonly ActionStep[],
    outcome: ExecutionOutcome,
    contextSignature: string
  ): ExperienceEntry;

  /** Find matching patterns for a task type */
  findPatterns(taskType: string, limit?: number): readonly ExperienceEntry[];

  /** Find reliable patterns (above success rate threshold) */
  findReliablePatterns(taskType: string): readonly ExperienceEntry[];

  /** #3234: all recorded entries across task types (for the research-maturity measurement). */
  getAllPatterns(): readonly ExperienceEntry[];

  /** Get the best pattern for a context */
  getBestPattern(taskType: string, contextSignature: string): ExperienceEntry | null;

  /** Update pattern metrics after execution */
  updatePatternMetrics(patternId: string, success: boolean): void;
}

/**
 * Action cache interface.
 */
export interface IActionCache {
  /** Cache a successful action result */
  cache(input: unknown, result: unknown, durationMs: number): ActionCacheEntry;

  /** Try to get a cached result */
  get(input: unknown): ActionCacheEntry | null;

  /** Record a cache hit */
  recordHit(entryId: string): void;

  /** Evict expired entries */
  evictExpired(): number;

  /** Clear all cache entries */
  clear(): number;

  /** Get cache statistics */
  getStats(): { entries: number; hits: number; hitRate: number; timeSavedMs: number };
}

/**
 * MobiMEM interface combining all three modules.
 */
export interface IMobiMem {
  /** Profile memory module */
  readonly profile: IProfileMemory;
  /** Experience memory module */
  readonly experience: IExperienceMemory;
  /** Action cache module */
  readonly action: IActionCache;

  /** Get overall statistics */
  getStats(): MobiMemStats;

  /** Run maintenance (eviction, compaction) */
  runMaintenance(): void;

  /** Close and cleanup resources */
  close(): void;
}
