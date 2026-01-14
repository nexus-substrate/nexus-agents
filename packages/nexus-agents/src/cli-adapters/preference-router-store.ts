/**
 * Preference Router Data Store
 *
 * In-memory storage for preference data points used by the PreferenceRouter.
 *
 * @module cli-adapters/preference-router-store
 * (Source: Issue #148, arXiv:2406.18665)
 */

import type {
  PreferenceDataPoint,
  QueryFeatures,
  PreferenceModelStats,
  IPreferenceDataStore,
} from './preference-router-types.js';

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
