/* eslint-disable max-lines -- Cohesive in-memory routing context store; 402 lines with injectable time (governance allows 400-600). */
/**
 * RoutingContextStore Implementation (ADR-0008)
 *
 * In-memory implementation of the unified routing context store.
 *
 * @module core/routing/routing-context-store-impl
 */

import { ok, err, type Result } from '../result.js';
import { getTimeProvider } from '../time-provider.js';
import type { CliName } from '../../cli-adapters/types.js';
import type {
  IRoutingContextStore,
  RoutingContextStoreConfig,
  RoutingContextError,
  RoutingContextStats,
  PreferenceDataPoint,
  PreferenceStats,
  QueryFeatures,
  ModelPerformance,
  ModelPreference,
  ExperiencePattern,
  CachedActionResult,
  RoutingDecision,
  TaskOutcome,
  RoutingMetricsSummary,
  Domain,
  TaskType,
} from './routing-context-store.js';
import {
  buildOutcomeMap,
  aggregateByModel,
  buildModelMetrics,
  calculateSimilarity,
  calculateStrength,
  cleanupOldRecords,
  type PerformanceAccumulator,
  type ExperienceAccumulator,
  type SerializedStoreData,
} from './routing-context-helpers.js';
import { getErrorMessage } from '../errors.js';

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: Required<RoutingContextStoreConfig> = {
  maxPreferenceDataPoints: 10000,
  maxRoutingDecisions: 10000,
  maxTaskOutcomes: 10000,
  retentionHours: 168,
  minObservations: 5,
  confidenceThreshold: 0.6,
  actionCacheTtlMs: 3600000,
};

// ============================================================================
// Implementation
// ============================================================================

/**
 * In-memory implementation of the routing context store.
 */
export class RoutingContextStore implements IRoutingContextStore {
  private readonly config: Required<RoutingContextStoreConfig>;
  private readonly preferences = new Map<string, PreferenceDataPoint>();
  private readonly performanceByTaskType = new Map<
    TaskType,
    Map<CliName, PerformanceAccumulator>
  >();
  private readonly experienceByWorkflow = new Map<
    string,
    Map<string, ExperienceAccumulator & { modelSequence: readonly CliName[] }>
  >();
  private readonly actionCache = new Map<string, CachedActionResult>();
  private cacheHits = 0;
  private cacheMisses = 0;
  private readonly routingDecisions: RoutingDecision[] = [];
  private readonly taskOutcomes: TaskOutcome[] = [];

  constructor(config?: RoutingContextStoreConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // =========================================================================
  // Preference Data Methods
  // =========================================================================

  storePreference(dataPoint: PreferenceDataPoint): Result<void, RoutingContextError> {
    if (this.preferences.size >= this.config.maxPreferenceDataPoints) {
      this.evictOldestPreferences();
    }
    this.preferences.set(dataPoint.id, dataPoint);
    return ok(undefined);
  }

  getAllPreferences(): readonly PreferenceDataPoint[] {
    return Array.from(this.preferences.values());
  }

  getPreferencesByDomain(domain: Domain): readonly PreferenceDataPoint[] {
    return Array.from(this.preferences.values()).filter(
      (p) => p.domain === domain || p.features.domain === domain
    );
  }

  findSimilarPreferences(features: QueryFeatures, limit: number): readonly PreferenceDataPoint[] {
    const scored = Array.from(this.preferences.values()).map((p) => ({
      dataPoint: p,
      similarity: calculateSimilarity(features, p.features),
    }));
    return scored
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
      .map((s) => s.dataPoint);
  }

  getPreferenceStats(): PreferenceStats {
    const dataPoints = Array.from(this.preferences.values());
    const dataPointsByDomain: Record<Domain, number> = {};
    let strongModelPreferred = 0;
    let latestUpdate = new Date(0);

    for (const dp of dataPoints) {
      const domain = dp.domain ?? dp.features.domain;
      dataPointsByDomain[domain] = (dataPointsByDomain[domain] ?? 0) + 1;
      if (dp.strongModelPreferred) strongModelPreferred++;
      if (dp.recordedAt > latestUpdate) latestUpdate = dp.recordedAt;
    }

    const total = dataPoints.length;
    const preferenceRate = total > 0 ? strongModelPreferred / total : 0;
    return {
      totalDataPoints: total,
      dataPointsByDomain,
      strongModelPreferenceRate: preferenceRate,
      estimatedCostSavingsRate: 1 - preferenceRate,
      lastUpdatedAt: latestUpdate,
    };
  }

  // =========================================================================
  // Performance Methods
  // =========================================================================

  storeModelPerformance(
    model: CliName,
    taskType: TaskType,
    performance: ModelPerformance
  ): Result<void, RoutingContextError> {
    let taskMap = this.performanceByTaskType.get(taskType);
    if (taskMap === undefined) {
      taskMap = new Map();
      this.performanceByTaskType.set(taskType, taskMap);
    }

    let acc = taskMap.get(model);
    if (acc === undefined) {
      acc = {
        totalQuality: 0,
        totalSuccesses: 0,
        totalLatencyMs: 0,
        totalTokens: 0,
        observations: 0,
      };
      taskMap.set(model, acc);
    }

    acc.totalQuality += performance.avgQuality * performance.observations;
    acc.totalSuccesses += performance.successRate * performance.observations;
    acc.totalLatencyMs += performance.avgLatencyMs * performance.observations;
    acc.totalTokens += performance.avgTokens * performance.observations;
    acc.observations += performance.observations;
    return ok(undefined);
  }

  getModelPreferences(taskType: TaskType): readonly ModelPreference[] {
    const taskMap = this.performanceByTaskType.get(taskType);
    if (taskMap === undefined) return [];

    const preferences: ModelPreference[] = [];
    for (const [model, acc] of taskMap) {
      if (acc.observations < this.config.minObservations) continue;
      const perf: ModelPerformance = {
        avgQuality: acc.totalQuality / acc.observations,
        successRate: acc.totalSuccesses / acc.observations,
        avgLatencyMs: acc.totalLatencyMs / acc.observations,
        avgTokens: acc.totalTokens / acc.observations,
        observations: acc.observations,
      };
      preferences.push({
        model,
        strength: calculateStrength(perf),
        performance: perf,
        confidence: Math.min(1, acc.observations / (this.config.minObservations * 2)),
      });
    }
    return preferences.sort((a, b) => b.strength - a.strength);
  }

  getRecommendation(taskType: TaskType): CliName | undefined {
    const preferences = this.getModelPreferences(taskType);
    for (const pref of preferences) {
      if (pref.confidence >= this.config.confidenceThreshold) return pref.model;
    }
    return undefined;
  }

  recordExperience(
    workflow: string,
    models: readonly CliName[],
    success: boolean,
    durationMs: number
  ): Result<void, RoutingContextError> {
    let workflowMap = this.experienceByWorkflow.get(workflow);
    if (workflowMap === undefined) {
      workflowMap = new Map();
      this.experienceByWorkflow.set(workflow, workflowMap);
    }

    const key = models.join(',');
    let acc = workflowMap.get(key);
    if (acc === undefined) {
      acc = { modelSequence: models, totalDurationMs: 0, successCount: 0, usageCount: 0 };
      workflowMap.set(key, acc);
    }

    acc.totalDurationMs += durationMs;
    if (success) acc.successCount++;
    acc.usageCount++;
    return ok(undefined);
  }

  getExperiencePatterns(workflow: string): readonly ExperiencePattern[] {
    const workflowMap = this.experienceByWorkflow.get(workflow);
    if (workflowMap === undefined) return [];

    const patterns: ExperiencePattern[] = [];
    for (const acc of workflowMap.values()) {
      patterns.push({
        workflow,
        modelSequence: acc.modelSequence,
        successRate: acc.usageCount > 0 ? acc.successCount / acc.usageCount : 0,
        avgDurationMs: acc.usageCount > 0 ? acc.totalDurationMs / acc.usageCount : 0,
        usageCount: acc.usageCount,
      });
    }
    return patterns.sort((a, b) => b.usageCount - a.usageCount);
  }

  cacheAction(
    action: string,
    model: CliName,
    result: unknown,
    durationMs: number
  ): Result<void, RoutingContextError> {
    this.actionCache.set(action, {
      action,
      result,
      model,
      cachedAt: new Date(),
      timeSavedMs: durationMs,
    });
    return ok(undefined);
  }

  getCachedAction(action: string): CachedActionResult | undefined {
    const cached = this.actionCache.get(action);
    if (cached === undefined) {
      this.cacheMisses++;
      return undefined;
    }
    if (getTimeProvider().now() - cached.cachedAt.getTime() > this.config.actionCacheTtlMs) {
      this.actionCache.delete(action);
      this.cacheMisses++;
      return undefined;
    }
    this.cacheHits++;
    return cached;
  }

  // =========================================================================
  // Metrics Methods
  // =========================================================================

  recordRoutingDecision(decision: RoutingDecision): Result<void, RoutingContextError> {
    if (this.routingDecisions.length >= this.config.maxRoutingDecisions) {
      this.routingDecisions.shift();
    }
    this.routingDecisions.push(decision);
    return ok(undefined);
  }

  recordTaskOutcome(outcome: TaskOutcome): Result<void, RoutingContextError> {
    if (this.taskOutcomes.length >= this.config.maxTaskOutcomes) {
      this.taskOutcomes.shift();
    }
    this.taskOutcomes.push(outcome);
    return ok(undefined);
  }

  getMetrics(periodHours: number): RoutingMetricsSummary {
    const cutoff = new Date(getTimeProvider().now() - periodHours * 60 * 60 * 1000);
    const cutoffStr = cutoff.toISOString();
    const recentDecisions = this.routingDecisions.filter((d) => d.timestamp >= cutoffStr);
    const recentOutcomes = this.taskOutcomes.filter((o) => o.timestamp >= cutoffStr);
    const outcomeByTrace = buildOutcomeMap(recentOutcomes);
    const modelAggs = aggregateByModel(recentDecisions, outcomeByTrace);
    const { modelMetrics, totals } = buildModelMetrics(modelAggs, recentDecisions.length);

    return {
      periodStart: cutoff.toISOString(),
      periodEnd: new Date().toISOString(),
      totalDecisions: recentDecisions.length,
      totalOutcomes: recentOutcomes.length,
      modelMetrics,
      explorationRate: totals.explorationRate,
      avgReward: totals.avgReward,
      avgRewardTrend: 0,
      avgRoutingLatencyMs: totals.avgLatency,
    };
  }

  getRoutingDecisions(periodHours: number): readonly RoutingDecision[] {
    const cutoff = new Date(getTimeProvider().now() - periodHours * 60 * 60 * 1000).toISOString();
    return this.routingDecisions.filter((d) => d.timestamp >= cutoff);
  }

  getTaskOutcomes(periodHours: number): readonly TaskOutcome[] {
    const cutoff = new Date(getTimeProvider().now() - periodHours * 60 * 60 * 1000).toISOString();
    return this.taskOutcomes.filter((o) => o.timestamp >= cutoff);
  }

  // =========================================================================
  // Unified Methods
  // =========================================================================

  getStats(): RoutingContextStats {
    const prefStats = this.getPreferenceStats();
    const metrics = this.getMetrics(this.config.retentionHours);

    let totalPreferences = 0;
    for (const taskMap of this.performanceByTaskType.values()) totalPreferences += taskMap.size;

    let totalExperiences = 0;
    for (const workflowMap of this.experienceByWorkflow.values())
      totalExperiences += workflowMap.size;

    return {
      preferenceDataPoints: prefStats.totalDataPoints,
      strongModelPreferenceRate: prefStats.strongModelPreferenceRate,
      modelPreferences: totalPreferences,
      experiencePatterns: totalExperiences,
      cachedActions: this.actionCache.size,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      routingDecisions: this.routingDecisions.length,
      taskOutcomes: this.taskOutcomes.length,
      explorationRate: metrics.explorationRate,
      avgReward: metrics.avgReward,
    };
  }

  clear(): void {
    this.preferences.clear();
    this.performanceByTaskType.clear();
    this.experienceByWorkflow.clear();
    this.actionCache.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.routingDecisions.length = 0;
    this.taskOutcomes.length = 0;
  }

  cleanup(): void {
    this.cleanupActionCache();
    const cutoff = new Date(
      getTimeProvider().now() - this.config.retentionHours * 60 * 60 * 1000
    ).toISOString();
    cleanupOldRecords(this.routingDecisions, cutoff, (r) => r.timestamp);
    cleanupOldRecords(this.taskOutcomes, cutoff, (r) => r.timestamp);
  }

  toJSON(): string {
    return JSON.stringify({
      preferences: [...this.preferences],
      performanceByTaskType: [...this.performanceByTaskType].map(([taskType, map]) => [
        taskType,
        [...map],
      ]),
      experienceByWorkflow: [...this.experienceByWorkflow].map(([workflow, map]) => [
        workflow,
        [...map],
      ]),
      actionCache: [...this.actionCache],
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      routingDecisions: this.routingDecisions,
      taskOutcomes: this.taskOutcomes,
    });
  }

  fromJSON(json: string): Result<void, RoutingContextError> {
    try {
      const data = JSON.parse(json) as SerializedStoreData;
      this.clear();
      this.loadPreferences(data.preferences);
      this.loadPerformance(data.performanceByTaskType);
      this.loadExperience(data.experienceByWorkflow);
      this.loadActionCache(data.actionCache);
      this.cacheHits = data.cacheHits;
      this.cacheMisses = data.cacheMisses;
      this.routingDecisions.push(...data.routingDecisions);
      this.taskOutcomes.push(...data.taskOutcomes);
      return ok(undefined);
    } catch (error) {
      return err({
        type: 'INVALID_DATA',
        message: `Failed to parse JSON: ${getErrorMessage(error)}`,
      });
    }
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  private evictOldestPreferences(): void {
    const toRemove = Math.ceil(this.preferences.size * 0.1);
    const sorted = [...this.preferences].sort(
      (a, b) => a[1].recordedAt.getTime() - b[1].recordedAt.getTime()
    );
    for (let i = 0; i < toRemove && i < sorted.length; i++) {
      const entry = sorted[i];
      if (entry !== undefined) this.preferences.delete(entry[0]);
    }
  }

  private cleanupActionCache(): void {
    const now = getTimeProvider().now();
    for (const [key, cached] of this.actionCache) {
      if (now - cached.cachedAt.getTime() > this.config.actionCacheTtlMs) {
        this.actionCache.delete(key);
      }
    }
  }

  private loadPreferences(data: Array<[string, PreferenceDataPoint]>): void {
    for (const [id, dp] of data) {
      this.preferences.set(id, { ...dp, recordedAt: new Date(dp.recordedAt) });
    }
  }

  private loadPerformance(data: Array<[string, Array<[CliName, PerformanceAccumulator]>]>): void {
    for (const [taskType, entries] of data) {
      const map = new Map<CliName, PerformanceAccumulator>();
      for (const [model, acc] of entries) map.set(model, acc);
      this.performanceByTaskType.set(taskType, map);
    }
  }

  private loadExperience(
    data: Array<
      [string, Array<[string, ExperienceAccumulator & { modelSequence: readonly CliName[] }]>]
    >
  ): void {
    for (const [workflow, entries] of data) {
      const map = new Map<string, ExperienceAccumulator & { modelSequence: readonly CliName[] }>();
      for (const [key, acc] of entries) map.set(key, acc);
      this.experienceByWorkflow.set(workflow, map);
    }
  }

  private loadActionCache(data: Array<[string, CachedActionResult]>): void {
    for (const [key, cached] of data) {
      this.actionCache.set(key, { ...cached, cachedAt: new Date(cached.cachedAt) });
    }
  }
}

/**
 * Create a new routing context store.
 */
export function createRoutingContextStore(
  config?: RoutingContextStoreConfig
): IRoutingContextStore {
  return new RoutingContextStore(config);
}
