/**
 * nexus-agents/cli-adapters - Preference Router Implementation
 *
 * Implements preference-trained routing (RouteLLM pattern) that learns
 * from human preference data to route queries optimally.
 *
 * @module cli-adapters/preference-router
 * (Source: Issue #148, arXiv:2406.18665)
 */

import { randomUUID } from 'node:crypto';
import { createLogger } from '../core/logger.js';
import type {
  PreferenceDataPoint,
  QueryFeatures,
  PreferencePrediction,
  PreferenceRoutingDecision,
  PreferenceRouterConfig,
  PreferenceModelStats,
  IPreferenceDataStore,
} from './preference-router-types.js';
import {
  DEFAULT_PREFERENCE_ROUTER_CONFIG,
  PreferenceRouterConfigSchema,
} from './preference-router-types.js';
import { InMemoryPreferenceStore } from './preference-router-store.js';
import { QueryFeatureExtractor } from './preference-router-extractor.js';

// Re-export types and classes for backward compatibility
export type {
  PreferenceDataPoint,
  QueryFeatures,
  PreferencePrediction,
  PreferenceRoutingDecision,
  PreferenceRouterConfig,
  PreferenceModelStats,
  IPreferenceDataStore,
} from './preference-router-types.js';
export { DEFAULT_PREFERENCE_ROUTER_CONFIG } from './preference-router-types.js';
export { InMemoryPreferenceStore } from './preference-router-store.js';
export { QueryFeatureExtractor } from './preference-router-extractor.js';

const logger = createLogger({ component: 'PreferenceRouter' });

/**
 * Preference-trained router that learns from human preference data.
 */
export class PreferenceRouter {
  private readonly config: PreferenceRouterConfig;
  private readonly dataStore: IPreferenceDataStore;
  private readonly featureExtractor: QueryFeatureExtractor;

  constructor(config: Partial<PreferenceRouterConfig> = {}, dataStore?: IPreferenceDataStore) {
    const validated = PreferenceRouterConfigSchema.parse({
      ...DEFAULT_PREFERENCE_ROUTER_CONFIG,
      ...config,
    });
    this.config = validated;
    this.dataStore = dataStore ?? new InMemoryPreferenceStore(validated.maxDataPoints);
    this.featureExtractor = new QueryFeatureExtractor();

    logger.info('PreferenceRouter initialized', {
      strongModel: this.config.strongModel.cli,
      weakModel: this.config.weakModel.cli,
      threshold: this.config.routingThreshold,
    });
  }

  /**
   * Route a query to the optimal model based on learned preferences.
   */
  route(query: string): PreferenceRoutingDecision {
    const startTime = Date.now();
    const features = this.featureExtractor.extract(query);
    const prediction = this.predict(features);

    const threshold = this.getDomainThreshold(features.domain);
    const useStrong = prediction.strongModelProbability >= threshold;

    const selectedTier = useStrong ? 'strong' : 'weak';
    const selectedConfig = useStrong ? this.config.strongModel : this.config.weakModel;

    const costSavings = useStrong ? 0 : this.calculateCostSavings();

    const decision: PreferenceRoutingDecision = {
      selectedTier,
      selectedCli: selectedConfig.cli,
      prediction,
      reason: this.generateReason(prediction, threshold, useStrong),
      routingLatencyMs: Date.now() - startTime,
      estimatedCostSavings: costSavings,
    };

    logger.debug('Routing decision made', {
      tier: selectedTier,
      cli: selectedConfig.cli,
      probability: prediction.strongModelProbability,
      confidence: prediction.confidence,
    });

    return decision;
  }

  /**
   * Record a preference data point for online learning.
   */
  recordPreference(
    query: string,
    strongModelPreferred: boolean,
    strongModelQuality?: number,
    weakModelQuality?: number
  ): PreferenceDataPoint {
    const features = this.featureExtractor.extract(query);

    const dataPoint: PreferenceDataPoint = {
      id: randomUUID(),
      query,
      features,
      strongModelPreferred,
      strongModelQuality,
      weakModelQuality,
      recordedAt: new Date(),
      domain: features.domain,
    };

    if (this.config.enableOnlineLearning) {
      this.dataStore.store(dataPoint);
      logger.debug('Preference recorded', {
        strongPreferred: strongModelPreferred,
        domain: features.domain,
      });
    }

    return dataPoint;
  }

  /**
   * Get statistics about the learned preference model.
   */
  getStats(): PreferenceModelStats {
    return this.dataStore.getStats();
  }

  /**
   * Check if the router has enough data to make informed decisions.
   */
  hasMinimumData(): boolean {
    return this.dataStore.getAll().length >= this.config.minDataPoints;
  }

  private predict(features: QueryFeatures): PreferencePrediction {
    const similarPoints = this.dataStore.findSimilar(features, 20);

    if (similarPoints.length === 0) {
      // No data - use heuristic based on complexity
      return this.heuristicPrediction(features);
    }

    // Calculate weighted preference rate
    let weightedSum = 0;
    let totalWeight = 0;

    for (let i = 0; i < similarPoints.length; i++) {
      const point = similarPoints[i];
      if (point === undefined) continue;

      // Weight by position (more similar = higher weight)
      const weight = 1 / (i + 1);
      weightedSum += point.strongModelPreferred ? weight : 0;
      totalWeight += weight;
    }

    const probability = totalWeight > 0 ? weightedSum / totalWeight : 0.5;

    // Confidence based on number of similar points and data density
    const dataConfidence = Math.min(1, similarPoints.length / 10);
    const complexityConfidence = features.complexity > 0.5 ? 0.8 : 0.6;
    const confidence = (dataConfidence + complexityConfidence) / 2;

    return {
      strongModelProbability: probability,
      confidence,
      features,
      supportingDataPoints: similarPoints.length,
    };
  }

  private heuristicPrediction(features: QueryFeatures): PreferencePrediction {
    // Heuristic: Use strong model for complex, reasoning, or coding tasks
    let probability = 0.5;

    if (features.complexity > 0.7) probability += 0.2;
    if (features.requiresReasoning) probability += 0.15;
    if (features.requiresCode) probability += 0.1;
    if (features.hasAmbiguity) probability += 0.1;
    if (features.requiresCreativity) probability += 0.05;

    probability = Math.min(1, probability);

    return {
      strongModelProbability: probability,
      confidence: 0.3, // Low confidence for heuristic predictions
      features,
      supportingDataPoints: 0,
    };
  }

  private getDomainThreshold(domain: string): number {
    return this.config.domainThresholds?.[domain] ?? this.config.routingThreshold;
  }

  private calculateCostSavings(): number {
    const strongCost = this.config.strongModel.costPerMillionTokens;
    const weakCost = this.config.weakModel.costPerMillionTokens;
    return (strongCost - weakCost) / strongCost;
  }

  private generateReason(
    prediction: PreferencePrediction,
    threshold: number,
    useStrong: boolean
  ): string {
    const { features, confidence, supportingDataPoints } = prediction;

    if (supportingDataPoints === 0) {
      return useStrong
        ? `Heuristic: High complexity (${features.complexity.toFixed(2)}) suggests strong model needed`
        : `Heuristic: Low complexity (${features.complexity.toFixed(2)}) allows weak model usage`;
    }

    const dataSource = `Based on ${String(supportingDataPoints)} similar queries`;
    const confidenceNote = confidence > 0.7 ? 'high confidence' : 'moderate confidence';

    return useStrong
      ? `${dataSource} (${confidenceNote}): Strong model preferred for ${features.domain} tasks`
      : `${dataSource} (${confidenceNote}): Weak model sufficient for ${features.domain} tasks`;
  }
}

/**
 * Create a PreferenceRouter instance.
 */
export function createPreferenceRouter(
  config?: Partial<PreferenceRouterConfig>,
  dataStore?: IPreferenceDataStore
): PreferenceRouter {
  return new PreferenceRouter(config, dataStore);
}
