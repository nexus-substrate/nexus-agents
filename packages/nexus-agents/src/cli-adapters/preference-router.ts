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
import { createHash } from 'node:crypto';
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

// Re-export types
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

const logger = createLogger({ component: 'PreferenceRouter' });

/**
 * In-memory preference data store implementation.
 */
export class InMemoryPreferenceStore implements IPreferenceDataStore {
  private readonly dataPoints: Map<string, PreferenceDataPoint> = new Map();
  private readonly maxSize: number;

  constructor(maxSize = 10000) {
    this.maxSize = maxSize;
  }

  store(dataPoint: PreferenceDataPoint): void {
    this.enforceLimit();
    this.dataPoints.set(dataPoint.id, dataPoint);
  }

  getAll(): readonly PreferenceDataPoint[] {
    return [...this.dataPoints.values()];
  }

  getByDomain(domain: string): readonly PreferenceDataPoint[] {
    const results: PreferenceDataPoint[] = [];
    for (const dp of this.dataPoints.values()) {
      if (dp.domain === domain) {
        results.push(dp);
      }
    }
    return results;
  }

  findSimilar(features: QueryFeatures, limit: number): readonly PreferenceDataPoint[] {
    const scored: Array<{ point: PreferenceDataPoint; similarity: number }> = [];

    for (const point of this.dataPoints.values()) {
      const similarity = this.calculateSimilarity(features, point.features);
      scored.push({ point, similarity });
    }

    return scored
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
      .map((s) => s.point);
  }

  getStats(): PreferenceModelStats {
    const domainCounts: Record<string, number> = {};
    let strongPreferred = 0;

    for (const point of this.dataPoints.values()) {
      const domain = point.domain ?? 'unknown';
      domainCounts[domain] = (domainCounts[domain] ?? 0) + 1;
      if (point.strongModelPreferred) {
        strongPreferred++;
      }
    }

    const total = this.dataPoints.size;
    return {
      totalDataPoints: total,
      dataPointsByDomain: domainCounts,
      strongModelPreferenceRate: total > 0 ? strongPreferred / total : 0,
      estimatedCostSavingsRate: total > 0 ? 1 - strongPreferred / total : 0,
      lastUpdatedAt: new Date(),
    };
  }

  clear(): void {
    this.dataPoints.clear();
  }

  private calculateSimilarity(a: QueryFeatures, b: QueryFeatures): number {
    let score = 0;
    const maxScore = 7;

    // Token count similarity (normalized)
    const tokenDiff = Math.abs(a.tokenCount - b.tokenCount);
    score += Math.max(0, 1 - tokenDiff / 1000);

    // Complexity similarity
    score += 1 - Math.abs(a.complexity - b.complexity);

    // Boolean feature matches
    if (a.requiresReasoning === b.requiresReasoning) score += 1;
    if (a.requiresCode === b.requiresCode) score += 1;
    if (a.requiresCreativity === b.requiresCreativity) score += 1;
    if (a.hasAmbiguity === b.hasAmbiguity) score += 1;

    // Domain match
    if (a.domain === b.domain) score += 1;

    return score / maxScore;
  }

  private enforceLimit(): void {
    if (this.dataPoints.size >= this.maxSize) {
      const oldest = [...this.dataPoints.entries()]
        .sort((a, b) => a[1].recordedAt.getTime() - b[1].recordedAt.getTime())
        .slice(0, Math.floor(this.maxSize * 0.1));

      for (const [id] of oldest) {
        this.dataPoints.delete(id);
      }
    }
  }
}

/**
 * Feature extractor for queries.
 */
export class QueryFeatureExtractor {
  private static readonly CODE_KEYWORDS = [
    'function',
    'class',
    'import',
    'export',
    'const',
    'let',
    'var',
    'implement',
    'refactor',
    'debug',
    'compile',
    'test',
    'typescript',
    'javascript',
    'python',
    'code',
  ];

  private static readonly REASONING_KEYWORDS = [
    'analyze',
    'compare',
    'evaluate',
    'why',
    'how',
    'explain',
    'reason',
    'logic',
    'prove',
    'deduce',
    'infer',
  ];

  private static readonly CREATIVITY_KEYWORDS = [
    'create',
    'design',
    'imagine',
    'brainstorm',
    'innovative',
    'creative',
    'story',
    'write',
    'compose',
  ];

  private static readonly AMBIGUITY_INDICATORS = [
    'maybe',
    'might',
    'could',
    'or',
    'possibly',
    'uncertain',
    'unclear',
    'depends',
  ];

  extract(query: string): QueryFeatures {
    const lowerQuery = query.toLowerCase();
    const words = lowerQuery.split(/\s+/);
    const tokenCount = this.estimateTokens(query);

    return {
      tokenCount,
      complexity: this.calculateComplexity(query, words),
      requiresReasoning: this.hasKeywords(words, QueryFeatureExtractor.REASONING_KEYWORDS),
      requiresCode: this.hasKeywords(words, QueryFeatureExtractor.CODE_KEYWORDS),
      requiresCreativity: this.hasKeywords(words, QueryFeatureExtractor.CREATIVITY_KEYWORDS),
      hasAmbiguity: this.hasKeywords(words, QueryFeatureExtractor.AMBIGUITY_INDICATORS),
      domain: this.detectDomain(words),
      keywordSignature: this.generateKeywordSignature(words),
    };
  }

  private estimateTokens(text: string): number {
    // Rough estimate: ~4 chars per token on average
    return Math.ceil(text.length / 4);
  }

  private calculateComplexity(query: string, words: string[]): number {
    let complexity = 0;

    // Length factor (0-0.3)
    complexity += Math.min(0.3, words.length / 100);

    // Sentence structure (0-0.2)
    const sentences = query.split(/[.!?]+/).filter(Boolean);
    complexity += Math.min(0.2, sentences.length / 10);

    // Technical terms (0-0.3)
    const technicalCount =
      this.countKeywords(words, QueryFeatureExtractor.CODE_KEYWORDS) +
      this.countKeywords(words, QueryFeatureExtractor.REASONING_KEYWORDS);
    complexity += Math.min(0.3, technicalCount / 20);

    // Question depth (0-0.2)
    const questionWords = words.filter((w) =>
      ['what', 'why', 'how', 'when', 'where', 'which'].includes(w)
    );
    complexity += Math.min(0.2, questionWords.length / 5);

    return Math.min(1, complexity);
  }

  private hasKeywords(words: string[], keywords: string[]): boolean {
    return words.some((w) => keywords.includes(w));
  }

  private countKeywords(words: string[], keywords: string[]): number {
    return words.filter((w) => keywords.includes(w)).length;
  }

  private detectDomain(words: string[]): string {
    const domainScores: Record<string, number> = {
      coding: this.countKeywords(words, QueryFeatureExtractor.CODE_KEYWORDS),
      reasoning: this.countKeywords(words, QueryFeatureExtractor.REASONING_KEYWORDS),
      creative: this.countKeywords(words, QueryFeatureExtractor.CREATIVITY_KEYWORDS),
    };

    let maxDomain = 'general';
    let maxScore = 0;

    for (const [domain, score] of Object.entries(domainScores)) {
      if (score > maxScore) {
        maxScore = score;
        maxDomain = domain;
      }
    }

    return maxDomain;
  }

  private generateKeywordSignature(words: string[]): string {
    const allKeywords = [
      ...QueryFeatureExtractor.CODE_KEYWORDS,
      ...QueryFeatureExtractor.REASONING_KEYWORDS,
      ...QueryFeatureExtractor.CREATIVITY_KEYWORDS,
    ];

    const presentKeywords = words.filter((w) => allKeywords.includes(w)).sort();

    return createHash('sha256').update(presentKeywords.join(',')).digest('hex').slice(0, 16);
  }
}

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
