/**
 * Tests for TOPSIS Helper Functions
 * @module cli-adapters/topsis-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { CliName } from './types.js';
import type { TopsisModelProfile, TopsisConfig, TopsisScore } from './topsis-types.js';
import {
  estimateCost,
  calculateSumOfSquares,
  calculateNormFactors,
  calculateDistance,
  calculateSavings,
  generateReasoning,
} from './topsis-helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeProfile(overrides: Partial<TopsisModelProfile> = {}): TopsisModelProfile {
  return {
    cliName: 'claude' as CliName,
    capabilities: { reasoning: 9, coding: 8, speed: 6, contextWindow: 200000 },
    costPerMillionInput: 3.0,
    costPerMillionOutput: 15.0,
    averageLatencyMs: 1500,
    qualityScore: 9.0,
    ...overrides,
  };
}

const criteria: TopsisConfig['criteria'] = [
  { name: 'quality', weight: 0.4, beneficial: true },
  { name: 'cost', weight: 0.3, beneficial: false },
  { name: 'speed', weight: 0.3, beneficial: false },
];

// ============================================================================
// estimateCost
// ============================================================================

describe('estimateCost', () => {
  it('calculates cost correctly', () => {
    const profile = makeProfile({ costPerMillionInput: 3.0, costPerMillionOutput: 15.0 });
    const cost = estimateCost(profile, 1_000_000, 1_000_000);
    expect(cost).toBe(18.0); // 3 + 15
  });

  it('handles zero tokens', () => {
    expect(estimateCost(makeProfile(), 0, 0)).toBe(0);
  });

  it('scales linearly with token count', () => {
    const profile = makeProfile({ costPerMillionInput: 10.0, costPerMillionOutput: 20.0 });
    const cost = estimateCost(profile, 500_000, 250_000);
    // 0.5 * 10 + 0.25 * 20 = 5 + 5 = 10
    expect(cost).toBe(10);
  });
});

// ============================================================================
// calculateSumOfSquares
// ============================================================================

describe('calculateSumOfSquares', () => {
  it('calculates sum of squares for single entry', () => {
    const matrix = new Map<CliName, Record<string, number>>();
    matrix.set('claude', { quality: 3, cost: 4, speed: 5 });
    const result = calculateSumOfSquares(matrix, criteria);
    expect(result.quality).toBe(9); // 3^2
    expect(result.cost).toBe(16); // 4^2
    expect(result.speed).toBe(25); // 5^2
  });

  it('sums across multiple entries', () => {
    const matrix = new Map<CliName, Record<string, number>>();
    matrix.set('claude', { quality: 3, cost: 0, speed: 0 });
    matrix.set('gemini', { quality: 4, cost: 0, speed: 0 });
    const result = calculateSumOfSquares(matrix, criteria);
    expect(result.quality).toBe(25); // 9 + 16
  });

  it('handles empty matrix', () => {
    const matrix = new Map<CliName, Record<string, number>>();
    const result = calculateSumOfSquares(matrix, criteria);
    expect(result.quality).toBe(0);
  });

  it('defaults missing values to 0', () => {
    const matrix = new Map<CliName, Record<string, number>>();
    matrix.set('claude', { quality: 5 }); // missing cost and speed
    const result = calculateSumOfSquares(matrix, criteria);
    expect(result.quality).toBe(25);
    expect(result.cost).toBe(0);
  });
});

// ============================================================================
// calculateNormFactors
// ============================================================================

describe('calculateNormFactors', () => {
  it('calculates sqrt of sum of squares', () => {
    const sos = { quality: 25, cost: 16, speed: 9 };
    const result = calculateNormFactors(sos, criteria);
    expect(result.quality).toBe(5);
    expect(result.cost).toBe(4);
    expect(result.speed).toBe(3);
  });

  it('handles zero sum of squares', () => {
    const sos = { quality: 0 };
    const result = calculateNormFactors(sos, criteria);
    expect(result.quality).toBe(0);
  });
});

// ============================================================================
// calculateDistance
// ============================================================================

describe('calculateDistance', () => {
  it('returns 0 for identical values', () => {
    const values = { quality: 1, cost: 2, speed: 3 };
    expect(calculateDistance(values, values, criteria)).toBe(0);
  });

  it('calculates Euclidean distance', () => {
    const values = { quality: 0, cost: 0, speed: 0 };
    const ideal = { quality: 3, cost: 4, speed: 0 };
    const dist = calculateDistance(values, ideal, criteria);
    expect(dist).toBe(5); // sqrt(9 + 16 + 0) = 5
  });

  it('handles missing values', () => {
    const values = {};
    const ideal = { quality: 3 };
    const dist = calculateDistance(values, ideal, criteria);
    expect(dist).toBe(3); // sqrt(9 + 0 + 0) = 3
  });
});

// ============================================================================
// calculateSavings
// ============================================================================

describe('calculateSavings', () => {
  it('returns savings percentage', () => {
    const profiles = [
      makeProfile({
        cliName: 'claude',
        qualityScore: 9,
        costPerMillionInput: 3,
        costPerMillionOutput: 15,
      }),
      makeProfile({
        cliName: 'gemini',
        qualityScore: 7,
        costPerMillionInput: 0.075,
        costPerMillionOutput: 0.3,
      }),
    ];
    const savings = calculateSavings(profiles, 'gemini');
    expect(savings).toBeGreaterThan(0);
    expect(savings).toBeLessThan(100);
  });

  it('returns 0 when selected is highest quality', () => {
    const profiles = [makeProfile({ cliName: 'claude', qualityScore: 9 })];
    expect(calculateSavings(profiles, 'claude')).toBe(0);
  });

  it('returns 0 when profile not found', () => {
    const profiles = [makeProfile({ cliName: 'claude' })];
    expect(calculateSavings(profiles, 'gemini')).toBe(0);
  });
});

// ============================================================================
// generateReasoning
// ============================================================================

describe('generateReasoning', () => {
  const bestScore: TopsisScore = {
    cliName: 'claude',
    rawValues: {},
    normalizedValues: {},
    weightedValues: {},
    distanceToPIS: 0.1,
    distanceToNIS: 0.9,
    closenessScore: 0.9,
  };

  it('includes model name and score', () => {
    const result = generateReasoning(bestScore, [], 0);
    expect(result).toContain('claude');
    expect(result).toContain('0.900');
  });

  it('includes runner-up comparison when available', () => {
    const runnerUp: TopsisScore = {
      ...bestScore,
      cliName: 'gemini',
      closenessScore: 0.7,
    };
    const result = generateReasoning(bestScore, [bestScore, runnerUp], 0);
    expect(result).toContain('gemini');
    expect(result).toContain('better than');
  });

  it('includes cost savings when significant', () => {
    const result = generateReasoning(bestScore, [], 25);
    expect(result).toContain('25.0%');
    expect(result).toContain('Cost savings');
  });

  it('omits cost savings when low', () => {
    const result = generateReasoning(bestScore, [], 5);
    expect(result).not.toContain('Cost savings');
  });

  it('handles single model (no runner-up)', () => {
    const result = generateReasoning(bestScore, [bestScore], 0);
    expect(result).not.toContain('better than');
  });
});
