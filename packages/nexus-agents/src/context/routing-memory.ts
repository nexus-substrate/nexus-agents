/**
 * nexus-agents/context - Routing Memory Bridge
 *
 * Bridges MobiMem's three modules (Profile, Experience, Action) with
 * the model routing system to enable learned routing based on history.
 *
 * @module context/routing-memory
 * @see Issue #461 - Implement routing memory bridge
 * @see Issue #148 - Preference-Trained Routing
 * @see Issue #149 - MobiMem Post-Deployment Evolution (arXiv:2512.15784)
 */

import { createLogger } from '../core/logger.js';
import { getTimeProvider } from '../core/index.js';
import type { ILogger } from '../core/logger.js';
import type { CliName } from '../cli-adapters/types.js';
import { CLI_NAMES } from '../config/model-capabilities-types.js';
import {
  MobiMem,
  getSharedMobiMem,
  type ExperienceEntry,
  type ActionStep,
  type ExecutionOutcome,
} from './mobimem.js';

/**
 * Performance metrics for a model on a task type.
 */
export interface ModelPerformance {
  /** Average quality score (0-1) */
  readonly avgQuality: number;
  /** Success rate (0-1) */
  readonly successRate: number;
  /** Average latency in milliseconds */
  readonly avgLatencyMs: number;
  /** Average tokens used */
  readonly avgTokens: number;
  /** Number of observations */
  readonly observations: number;
}

/**
 * Model preference with performance context.
 */
export interface ModelPreference {
  /** Model/CLI name */
  readonly model: CliName;
  /** Preference strength (0-1) */
  readonly strength: number;
  /** Historical performance */
  readonly performance: ModelPerformance;
  /** Confidence in this preference */
  readonly confidence: number;
}

/**
 * Experience pattern for workflow execution.
 */
export interface ExperiencePattern {
  /** Workflow or task type */
  readonly workflow: string;
  /** Sequence of models used */
  readonly modelSequence: readonly CliName[];
  /** Success rate for this pattern */
  readonly successRate: number;
  /** Average total duration */
  readonly avgDurationMs: number;
  /** How often this pattern was used */
  readonly usageCount: number;
}

/**
 * Cached action result.
 */
export interface CachedActionResult {
  /** Action signature/hash */
  readonly action: string;
  /** Cached result */
  readonly result: unknown;
  /** Model that produced the result */
  readonly model: CliName;
  /** When cached */
  readonly cachedAt: Date;
  /** Time saved by using cache (ms) */
  readonly timeSavedMs: number;
}

/**
 * Configuration for routing memory.
 */
export interface RoutingMemoryConfig {
  /** Minimum observations before considering preference */
  readonly minObservations: number;
  /** Confidence threshold for preferences */
  readonly confidenceThreshold: number;
  /** Success rate threshold for experience patterns */
  readonly successRateThreshold: number;
  /** Maximum age for cached actions (ms) */
  readonly actionCacheMaxAgeMs: number;
  /** Logger instance */
  readonly logger?: ILogger;
}

/**
 * Default routing memory configuration.
 */
export const DEFAULT_ROUTING_MEMORY_CONFIG: RoutingMemoryConfig = {
  minObservations: 5,
  confidenceThreshold: 0.6,
  successRateThreshold: 0.7,
  actionCacheMaxAgeMs: 3600_000, // 1 hour
};

/**
 * Interface for routing memory operations.
 */
export interface IRoutingMemory {
  /** Store model preference for a task type */
  storePreference(model: CliName, taskType: string, performance: ModelPerformance): void;

  /** Get preferences for a task type */
  getPreferences(taskType: string): readonly ModelPreference[];

  /** Record workflow execution experience */
  recordExperience(
    workflow: string,
    models: readonly CliName[],
    success: boolean,
    metrics: { durationMs: number; tokensUsed: number; qualityScore?: number }
  ): void;

  /** Get experience patterns for a workflow type */
  getExperiencePatterns(workflow: string): readonly ExperiencePattern[];

  /** Cache an action result */
  cacheAction(action: string, model: CliName, result: unknown, durationMs: number): void;

  /** Get cached action result if available */
  getCachedAction(action: string): CachedActionResult | undefined;

  /** Get routing recommendation based on history */
  getRecommendation(taskType: string): CliName | undefined;

  /** Get statistics */
  getStats(): RoutingMemoryStats;
}

/**
 * Statistics for routing memory.
 */
export interface RoutingMemoryStats {
  readonly totalPreferences: number;
  readonly totalExperiences: number;
  readonly cacheHits: number;
  readonly cacheMisses: number;
  readonly recommendationsMade: number;
}

/**
 * Routing Memory Bridge implementation.
 *
 * Connects MobiMem's three modules to the routing system:
 * - Profile Memory: Stores model preferences per task type
 * - Experience Memory: Tracks workflow execution patterns
 * - Action Cache: Provides fast retrieval of successful results
 */
export class RoutingMemory implements IRoutingMemory {
  private readonly mobimem: MobiMem;
  private readonly config: RoutingMemoryConfig;
  private readonly logger: ILogger;

  // Statistics
  private cacheHits = 0;
  private cacheMisses = 0;
  private recommendationsMade = 0;

  /**
   * Per-taskType cache of `getPreferences()` results (#2955 site 4).
   *
   * Pre-fix, every `getPreferences()` call did N=`CLI_NAMES.length`
   * MobiMem profile lookups followed by an in-place sort, on every
   * CompositeRouter `route()` invocation. With `enableRoutingMemory=true`
   * (default with persistence on), most calls produced empty results
   * after the N lookups — pure waste on the routing hot path.
   *
   * The cache stores the sorted preference array per taskType and is
   * invalidated by `storePreference(_, taskType, _)` writes. MobiMem
   * mutations performed by other RoutingMemory instances or prior
   * sessions are not detected; the cache is only correct within a
   * single instance's lifetime, which matches CompositeRouter's
   * usage pattern (singleton per process).
   */
  private preferencesCache = new Map<string, readonly ModelPreference[]>();

  constructor(config?: Partial<RoutingMemoryConfig>, mobimem?: MobiMem) {
    this.config = { ...DEFAULT_ROUTING_MEMORY_CONFIG, ...config };
    this.logger = this.config.logger ?? createLogger({ component: 'RoutingMemory' });
    // #2719 fix: default to the shared singleton instead of `new MobiMem()`
    // (which used `:memory:` and lost data on process exit, leaving
    // KnnRoutingStage with no patterns to retrieve). Callers can still
    // inject an instance for tests.
    this.mobimem = mobimem ?? getSharedMobiMem();

    this.logger.info('RoutingMemory initialized', {
      minObservations: this.config.minObservations,
      confidenceThreshold: this.config.confidenceThreshold,
    });
  }

  storePreference(model: CliName, taskType: string, performance: ModelPerformance): void {
    // Store in MobiMem's profile memory using observe()
    const preferenceKey = `model_preference:${taskType}`;
    const entityId = `routing:${model}`;

    // Use observe() which handles incrementing observation count and updating confidence
    const entry = this.mobimem.profile.observe(entityId, 'agent', preferenceKey, {
      model,
      performance,
      updatedAt: getTimeProvider().nowIso(),
    });

    // #2955 site 4: invalidate the per-taskType preferences cache so the
    // next getPreferences() call rebuilds with the new observation
    // included. Cheap O(1) delete; no need to recompute eagerly.
    this.preferencesCache.delete(taskType);

    this.logger.debug('Stored model preference', {
      model,
      taskType,
      confidence: entry.confidence,
      observations: entry.observationCount,
    });
  }

  getPreferences(taskType: string): readonly ModelPreference[] {
    // #2955 site 4: cache the sorted preference array per taskType so
    // subsequent calls skip the N MobiMem lookups + sort. Invalidation
    // happens in storePreference. On a cache miss, do the original full
    // CLI_NAMES sweep so MobiMem data written by another RoutingMemory
    // instance (or a prior session — shared singleton from #2719) is
    // still observed correctly on first read.
    const cached = this.preferencesCache.get(taskType);
    if (cached !== undefined) return cached;

    const preferenceKey = `model_preference:${taskType}`;
    const preferences: ModelPreference[] = [];

    for (const model of CLI_NAMES) {
      const entityId = `routing:${model}`;
      const entry = this.mobimem.profile.getPreference(entityId, preferenceKey);

      if (entry !== null && entry.observationCount >= this.config.minObservations) {
        const value = entry.preferenceValue as {
          model: CliName;
          performance: ModelPerformance;
        };

        preferences.push({
          model: value.model,
          strength: this.calculateStrength(value.performance),
          performance: value.performance,
          confidence: entry.confidence,
        });
      }
    }

    // Sort by strength (descending) and freeze for cache safety.
    preferences.sort((a, b) => b.strength - a.strength);
    const result: readonly ModelPreference[] = Object.freeze([...preferences]);
    this.preferencesCache.set(taskType, result);
    return result;
  }

  recordExperience(
    workflow: string,
    models: readonly CliName[],
    success: boolean,
    metrics: { durationMs: number; tokensUsed: number; qualityScore?: number }
  ): void {
    // Create context signature from model sequence
    const contextSignature = models.join('->');

    // Build action sequence matching ActionStep interface
    const actionSequence: ActionStep[] = models.map((model, index) => ({
      index,
      actionType: 'model_route',
      parameters: { model },
      durationMs: Math.floor(metrics.durationMs / models.length),
      success,
    }));

    // Build outcome matching ExecutionOutcome interface
    const outcome: ExecutionOutcome =
      metrics.qualityScore !== undefined
        ? {
            success,
            qualityScore: metrics.qualityScore,
            totalDurationMs: metrics.durationMs,
            tokensUsed: metrics.tokensUsed,
          }
        : {
            success,
            totalDurationMs: metrics.durationMs,
            tokensUsed: metrics.tokensUsed,
          };

    // Store in MobiMem's experience memory using recordExecution()
    this.mobimem.experience.recordExecution(workflow, actionSequence, outcome, contextSignature);

    this.logger.debug('Recorded routing experience', {
      workflow,
      models: models.join('->'),
      success,
      durationMs: metrics.durationMs,
    });
  }

  getExperiencePatterns(workflow: string): readonly ExperiencePattern[] {
    const experiences = this.mobimem.experience.findPatterns(workflow);

    return experiences
      .filter((exp) => exp.successRate >= this.config.successRateThreshold)
      .map((exp) => this.mapExperienceToPattern(exp));
  }

  cacheAction(action: string, model: CliName, result: unknown, durationMs: number): void {
    // Cache using input object that includes action signature and model
    const input = { actionSignature: action, model };
    this.mobimem.action.cache(input, result, durationMs);

    this.logger.debug('Cached action result', { action: action.slice(0, 50), model, durationMs });
  }

  getCachedAction(action: string): CachedActionResult | undefined {
    // Look up using the same input structure used for caching
    // Note: We try with undefined model first, then specific models
    for (const model of CLI_NAMES) {
      const input = { actionSignature: action, model };
      const entry = this.mobimem.action.get(input);

      if (entry !== null) {
        // MobiMem's get() already handles expiration internally
        this.cacheHits++;
        const inputData = entry.input as { actionSignature: string; model: CliName };

        return {
          action,
          result: entry.result,
          model: inputData.model,
          cachedAt: entry.cachedAt,
          timeSavedMs: entry.timeSavedMs,
        };
      }
    }

    this.cacheMisses++;
    return undefined;
  }

  getRecommendation(taskType: string): CliName | undefined {
    const preferences = this.getPreferences(taskType);

    // Return highest-strength preference above threshold
    const top = preferences[0];
    if (top !== undefined && top.confidence >= this.config.confidenceThreshold) {
      this.recommendationsMade++;

      this.logger.debug('Generated routing recommendation', {
        taskType,
        recommended: top.model,
        confidence: top.confidence,
        strength: top.strength,
      });

      return top.model;
    }

    return undefined;
  }

  getStats(): RoutingMemoryStats {
    const mobiStats = this.mobimem.getStats();

    return {
      totalPreferences: mobiStats.profile.totalEntries,
      totalExperiences: mobiStats.experience.totalPatterns,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      recommendationsMade: this.recommendationsMade,
    };
  }

  // ========================================================================
  // Private Helpers
  // ========================================================================

  /**
   * Calculate preference strength from performance metrics.
   */
  private calculateStrength(performance: ModelPerformance): number {
    // Weighted combination of performance factors
    const qualityWeight = 0.4;
    const successWeight = 0.3;
    const speedWeight = 0.2;
    const efficiencyWeight = 0.1;

    // Normalize latency (lower is better, cap at 10s)
    const normalizedLatency = 1 - Math.min(performance.avgLatencyMs / 10000, 1);

    // Normalize tokens (lower is better, cap at 100k)
    const normalizedTokens = 1 - Math.min(performance.avgTokens / 100000, 1);

    return (
      performance.avgQuality * qualityWeight +
      performance.successRate * successWeight +
      normalizedLatency * speedWeight +
      normalizedTokens * efficiencyWeight
    );
  }

  /**
   * Map MobiMem experience entry to routing pattern.
   */
  private mapExperienceToPattern(exp: ExperienceEntry): ExperiencePattern {
    const models = exp.actionSequence
      .filter((step) => step.actionType === 'model_route')
      .map((step) => (step.parameters as { model: CliName }).model);

    const avgDuration = exp.outcome.totalDurationMs;

    return {
      workflow: exp.taskType,
      modelSequence: models,
      successRate: exp.successRate,
      avgDurationMs: avgDuration,
      usageCount: exp.attemptCount,
    };
  }
}

/**
 * Create a routing memory instance.
 */
export function createRoutingMemory(
  config?: Partial<RoutingMemoryConfig>,
  mobimem?: MobiMem
): IRoutingMemory {
  return new RoutingMemory(config, mobimem);
}
