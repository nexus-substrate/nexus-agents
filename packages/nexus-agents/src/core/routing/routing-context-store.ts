/**
 * RoutingContextStore - Unified Routing Storage (ADR-0008)
 *
 * Consolidates three routing storage systems into a single unified store:
 * - preference-router-store.ts (preference data)
 * - routing-memory.ts (performance history)
 * - routing-metrics.ts (observability metrics)
 *
 * @module core/routing/routing-context-store
 */

import type { Result } from '../result.js';
import type { CliName } from '../../cli-adapters/types.js';

// ============================================================================
// Common Types
// ============================================================================

/**
 * Timestamp for records.
 */
export type Timestamp = string; // ISO 8601 format

/**
 * Task type identifier for categorizing routing decisions.
 */
export type TaskType = string;

/**
 * Domain category for routing decisions.
 */
export type Domain = string;

// ============================================================================
// Preference Data Types (from preference-router-store)
// ============================================================================

/**
 * Features extracted from a query for similarity matching.
 */
export interface QueryFeatures {
  readonly tokenCount: number;
  readonly complexity: number; // 0-1 normalized
  readonly requiresReasoning: boolean;
  readonly requiresCode: boolean;
  readonly requiresCreativity: boolean;
  readonly hasAmbiguity: boolean;
  readonly domain: Domain;
  readonly keywordSignature: string;
}

/**
 * A preference data point recording model preference for a query.
 */
export interface PreferenceDataPoint {
  readonly id: string;
  readonly query: string;
  readonly features: QueryFeatures;
  readonly strongModelPreferred: boolean;
  readonly strongModelQuality?: number;
  readonly weakModelQuality?: number;
  readonly recordedAt: Date;
  readonly domain?: Domain;
}

/**
 * Statistics about preference data.
 */
export interface PreferenceStats {
  readonly totalDataPoints: number;
  readonly dataPointsByDomain: Record<Domain, number>;
  readonly strongModelPreferenceRate: number;
  /**
   * 1 - strongModelPreferenceRate over the recorded data points; 0 when
   * `totalDataPoints` is 0 (nothing routed, nothing saved — #5700).
   */
  readonly estimatedCostSavingsRate: number;
  readonly lastUpdatedAt: Date;
}

// ============================================================================
// Performance Types (from routing-memory)
// ============================================================================

/**
 * Performance metrics for a model.
 */
export interface ModelPerformance {
  readonly avgQuality: number; // 0-1
  readonly successRate: number; // 0-1
  readonly avgLatencyMs: number;
  readonly avgTokens: number;
  readonly observations: number;
}

/**
 * Model preference with performance data.
 */
export interface ModelPreference {
  readonly model: CliName;
  readonly strength: number; // 0-1
  readonly performance: ModelPerformance;
  readonly confidence: number;
}

/**
 * Experience pattern for a workflow.
 */
export interface ExperiencePattern {
  readonly workflow: string;
  readonly modelSequence: readonly CliName[];
  readonly successRate: number;
  readonly avgDurationMs: number;
  readonly usageCount: number;
}

/**
 * Cached action result.
 */
export interface CachedActionResult {
  readonly action: string;
  readonly result: unknown;
  readonly model: CliName;
  readonly cachedAt: Date;
  readonly timeSavedMs: number;
}

// ============================================================================
// Metrics Types (from routing-metrics)
// ============================================================================

/**
 * Record of a routing decision.
 */
export interface RoutingDecision {
  readonly timestamp: Timestamp;
  readonly traceId: string;
  readonly selectedModel: CliName;
  readonly alternativeModels: readonly CliName[];
  readonly isExploration: boolean;
  readonly taskType?: TaskType;
  readonly contextTokens?: number;
  readonly routingLatencyMs?: number;
}

/**
 * Record of a task outcome.
 */
export interface TaskOutcome {
  readonly timestamp: Timestamp;
  readonly traceId: string;
  readonly model: CliName;
  readonly success: boolean;
  readonly reward: number;
  readonly qualityScore?: number;
  readonly latencyMs?: number;
}

/**
 * Aggregated metrics for a model.
 */
export interface AggregatedModelMetrics {
  readonly model: CliName;
  readonly selectionCount: number;
  readonly selectionPercent: number;
  readonly avgReward: number;
  readonly avgQuality: number;
  readonly avgLatencyMs: number;
  readonly successRate: number;
  readonly explorationCount: number;
}

/**
 * Aggregated routing metrics for a period.
 */
export interface RoutingMetricsSummary {
  readonly periodStart: Timestamp;
  readonly periodEnd: Timestamp;
  readonly totalDecisions: number;
  readonly totalOutcomes: number;
  readonly modelMetrics: readonly AggregatedModelMetrics[];
  readonly explorationRate: number;
  readonly avgReward: number;
  readonly avgRewardTrend: number;
  readonly avgRoutingLatencyMs: number;
}

// ============================================================================
// Unified Statistics
// ============================================================================

/**
 * Comprehensive statistics from the routing context store.
 */
export interface RoutingContextStats {
  // Preference stats
  readonly preferenceDataPoints: number;
  readonly strongModelPreferenceRate: number;

  // Performance stats
  readonly modelPreferences: number;
  readonly experiencePatterns: number;
  readonly cachedActions: number;
  readonly cacheHits: number;
  readonly cacheMisses: number;

  // Metrics stats
  readonly routingDecisions: number;
  readonly taskOutcomes: number;
  readonly explorationRate: number;
  readonly avgReward: number;
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for the routing context store.
 */
export interface RoutingContextStoreConfig {
  /** Maximum preference data points to retain (default: 10000) */
  readonly maxPreferenceDataPoints?: number;

  /** Maximum routing decisions to retain (default: 10000) */
  readonly maxRoutingDecisions?: number;

  /** Maximum task outcomes to retain (default: 10000) */
  readonly maxTaskOutcomes?: number;

  /** Retention period in hours for metrics (default: 168 = 1 week) */
  readonly retentionHours?: number;

  /** Minimum observations before generating preference (default: 5) */
  readonly minObservations?: number;

  /** Confidence threshold for recommendations (default: 0.6) */
  readonly confidenceThreshold?: number;

  /** Action cache TTL in ms (default: 3600000 = 1 hour) */
  readonly actionCacheTtlMs?: number;
}

// ============================================================================
// Store Interface
// ============================================================================

/**
 * Error types for routing context store operations.
 */
export type RoutingContextError =
  | { readonly type: 'NOT_FOUND'; readonly message: string }
  | { readonly type: 'CAPACITY_EXCEEDED'; readonly message: string }
  | { readonly type: 'INVALID_DATA'; readonly message: string }
  | { readonly type: 'STORE_ERROR'; readonly message: string };

/**
 * Unified routing context store interface.
 *
 * Provides a single storage backend for all routing-related data with
 * typed query interfaces for each concern area.
 */
export interface IRoutingContextStore {
  // =========================================================================
  // Preference Data Methods (from preference-router-store)
  // =========================================================================

  /**
   * Store a preference data point.
   */
  storePreference(dataPoint: PreferenceDataPoint): Result<void, RoutingContextError>;

  /**
   * Get all preference data points.
   */
  getAllPreferences(): readonly PreferenceDataPoint[];

  /**
   * Get preference data points by domain.
   */
  getPreferencesByDomain(domain: Domain): readonly PreferenceDataPoint[];

  /**
   * Find similar preference data points using K-nearest neighbors.
   */
  findSimilarPreferences(features: QueryFeatures, limit: number): readonly PreferenceDataPoint[];

  /**
   * Get preference statistics.
   */
  getPreferenceStats(): PreferenceStats;

  // =========================================================================
  // Performance Methods (from routing-memory)
  // =========================================================================

  /**
   * Store model performance for a task type.
   */
  storeModelPerformance(
    model: CliName,
    taskType: TaskType,
    performance: ModelPerformance
  ): Result<void, RoutingContextError>;

  /**
   * Get model preferences for a task type.
   */
  getModelPreferences(taskType: TaskType): readonly ModelPreference[];

  /**
   * Get recommendation for a task type (top model above confidence threshold).
   */
  getRecommendation(taskType: TaskType): CliName | undefined;

  /**
   * Record an experience pattern.
   */
  recordExperience(
    workflow: string,
    models: readonly CliName[],
    success: boolean,
    durationMs: number
  ): Result<void, RoutingContextError>;

  /**
   * Get experience patterns for a workflow.
   */
  getExperiencePatterns(workflow: string): readonly ExperiencePattern[];

  /**
   * Cache an action result.
   */
  cacheAction(
    action: string,
    model: CliName,
    result: unknown,
    durationMs: number
  ): Result<void, RoutingContextError>;

  /**
   * Get cached action result.
   */
  getCachedAction(action: string): CachedActionResult | undefined;

  // =========================================================================
  // Metrics Methods (from routing-metrics)
  // =========================================================================

  /**
   * Record a routing decision.
   */
  recordRoutingDecision(decision: RoutingDecision): Result<void, RoutingContextError>;

  /**
   * Record a task outcome.
   */
  recordTaskOutcome(outcome: TaskOutcome): Result<void, RoutingContextError>;

  /**
   * Get aggregated metrics for a time period.
   */
  getMetrics(periodHours: number): RoutingMetricsSummary;

  /**
   * Get raw routing decisions for a time period.
   */
  getRoutingDecisions(periodHours: number): readonly RoutingDecision[];

  /**
   * Get raw task outcomes for a time period.
   */
  getTaskOutcomes(periodHours: number): readonly TaskOutcome[];

  // =========================================================================
  // Unified Methods
  // =========================================================================

  /**
   * Get comprehensive statistics.
   */
  getStats(): RoutingContextStats;

  /**
   * Clear all data.
   */
  clear(): void;

  /**
   * Clean up expired data based on retention policy.
   */
  cleanup(): void;

  /**
   * Export all data as JSON for persistence.
   */
  toJSON(): string;

  /**
   * Import data from JSON.
   */
  fromJSON(json: string): Result<void, RoutingContextError>;
}
