/**
 * Tests for Tier Recommender
 * @module mcp/gateway/tier-recommender.test
 */

import { describe, it, expect } from 'vitest';
import type { PerformanceSummary, GroupStats } from '../../orchestration/outcomes/outcome-types.js';
import { generateTierRecommendations, type TierRecommenderConfig } from './tier-recommender.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeStats(count: number, successRate: number): GroupStats {
  return { count, successRate, avgDurationMs: 100 };
}

function makeSummary(categories: Record<string, GroupStats>): PerformanceSummary {
  return {
    totalTasks: Object.values(categories).reduce((s, c) => s + c.count, 0),
    successRate: 0.8,
    avgDurationMs: 100,
    byCli: new Map(),
    byCategory: new Map(Object.entries(categories)),
  };
}

// ============================================================================
// Empty / insufficient data
// ============================================================================

describe('generateTierRecommendations — insufficient data', () => {
  it('returns empty for no categories', () => {
    const result = generateTierRecommendations(makeSummary({}));
    expect(result).toEqual([]);
  });

  it('returns empty when below minimum sample size', () => {
    const summary = makeSummary({ code_generation: makeStats(10, 0.5) });
    const result = generateTierRecommendations(summary);
    expect(result).toEqual([]);
  });

  it('returns empty at exactly minimum samples with ok rates', () => {
    const summary = makeSummary({ code_generation: makeStats(20, 0.75) });
    const result = generateTierRecommendations(summary);
    expect(result).toEqual([]);
  });
});

// ============================================================================
// Promotion recommendations
// ============================================================================

describe('generateTierRecommendations — promotion', () => {
  it('recommends promotion when failure rate > 30%', () => {
    const summary = makeSummary({
      code_generation: makeStats(25, 0.6), // 40% failure
    });
    const result = generateTierRecommendations(summary);
    expect(result).toHaveLength(1);
    expect(result[0]!.direction).toBe('promote');
    expect(result[0]!.category).toBe('code_generation');
    expect(result[0]!.successRate).toBe(0.6);
    expect(result[0]!.sampleCount).toBe(25);
  });

  it('promotion reason includes category and failure rate', () => {
    const summary = makeSummary({
      code_generation: makeStats(30, 0.5),
    });
    const result = generateTierRecommendations(summary);
    expect(result[0]!.reason).toContain('code_generation');
    expect(result[0]!.reason).toContain('50%');
    expect(result[0]!.reason).toContain('promoting');
  });

  it('does not promote when below 30% failure rate', () => {
    const summary = makeSummary({
      code_generation: makeStats(30, 0.75), // 25% failure — below threshold
    });
    const result = generateTierRecommendations(summary);
    expect(result).toEqual([]);
  });

  it('does not promote Tier 3 tools (already at max)', () => {
    const summary = makeSummary({
      architecture: makeStats(30, 0.5), // architecture → orchestrate → Tier 3
    });
    const result = generateTierRecommendations(summary);
    expect(result).toEqual([]);
  });
});

// ============================================================================
// Demotion recommendations
// ============================================================================

describe('generateTierRecommendations — demotion', () => {
  it('recommends demotion when success rate > 95% with 50+ samples', () => {
    const summary = makeSummary({
      code_generation: makeStats(55, 0.97),
    });
    const result = generateTierRecommendations(summary);
    expect(result).toHaveLength(1);
    expect(result[0]!.direction).toBe('demote');
    expect(result[0]!.successRate).toBe(0.97);
  });

  it('demotion reason includes success rate and sample count', () => {
    const summary = makeSummary({
      code_generation: makeStats(60, 0.98),
    });
    const result = generateTierRecommendations(summary);
    expect(result[0]!.reason).toContain('98%');
    expect(result[0]!.reason).toContain('60');
    expect(result[0]!.reason).toContain('demotion');
  });

  it('does not demote when below 50 samples', () => {
    const summary = makeSummary({
      code_generation: makeStats(30, 0.97),
    });
    const result = generateTierRecommendations(summary);
    expect(result).toEqual([]);
  });

  it('does not demote when success rate is at 95%', () => {
    const summary = makeSummary({
      code_generation: makeStats(60, 0.95),
    });
    const result = generateTierRecommendations(summary);
    expect(result).toEqual([]);
  });

  it('does not demote Tier 1 tools (already at min)', () => {
    const summary = makeSummary({
      research: makeStats(55, 0.98), // research → research_query → Tier 1
    });
    const result = generateTierRecommendations(summary);
    expect(result).toEqual([]);
  });
});

// ============================================================================
// Multiple categories
// ============================================================================

describe('generateTierRecommendations — multiple categories', () => {
  it('generates recommendations for multiple categories', () => {
    const summary = makeSummary({
      code_generation: makeStats(30, 0.5), // promote
      devops: makeStats(60, 0.98), // demote
      testing: makeStats(10, 0.2), // insufficient data
    });
    const result = generateTierRecommendations(summary);
    expect(result).toHaveLength(2);
    const dirs = result.map((r) => r.direction);
    expect(dirs).toContain('promote');
    expect(dirs).toContain('demote');
  });
});

// ============================================================================
// Custom thresholds
// ============================================================================

describe('generateTierRecommendations — custom config', () => {
  it('respects custom minimum samples', () => {
    const summary = makeSummary({ code_generation: makeStats(15, 0.4) });
    // Default min is 20, custom is 10
    const result = generateTierRecommendations(summary, { minSamples: 10 });
    expect(result).toHaveLength(1);
    expect(result[0]!.direction).toBe('promote');
  });

  it('respects custom promotion failure threshold', () => {
    const summary = makeSummary({ code_generation: makeStats(30, 0.6) });
    // 40% failure, but threshold is 50%
    const result = generateTierRecommendations(summary, { promoteFailureRate: 0.5 });
    expect(result).toEqual([]);
  });

  it('respects custom demotion thresholds', () => {
    const cfg: Partial<TierRecommenderConfig> = {
      demoteSuccessRate: 0.9,
      demoteMinSamples: 30,
    };
    const summary = makeSummary({ code_generation: makeStats(35, 0.92) });
    const result = generateTierRecommendations(summary, cfg);
    expect(result).toHaveLength(1);
    expect(result[0]!.direction).toBe('demote');
  });
});
