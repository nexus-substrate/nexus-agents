/**
 * Tests for zero-router-calibration.
 *
 * Covers: groupOutcomesByLevel, calculateSuccessRateByLevel,
 * calculateAvgQualityByLevel, calculateMeanAbsoluteError,
 * calculateDifficultySuccessCorrelation, calculateCalibrationBias,
 * hashTaskContent, buildRoutingReason.
 */

import { describe, expect, it, vi } from 'vitest';
import type { DifficultyOutcome, DifficultyThresholds } from './zero-router-types.js';
import {
  groupOutcomesByLevel,
  calculateSuccessRateByLevel,
  calculateAvgQualityByLevel,
  calculateMeanAbsoluteError,
  calculateDifficultySuccessCorrelation,
  calculateCalibrationBias,
  hashTaskContent,
  buildRoutingReason,
  type BuildRoutingReasonOptions,
} from './zero-router-calibration.js';

// Mock difficulty-space.js
vi.mock('./difficulty-space.js', () => ({
  classifyDifficultyLevel: vi.fn((score: number, thresholds: DifficultyThresholds) => {
    if (score < thresholds.easyUpperBound) return 'easy';
    if (score > thresholds.hardLowerBound) return 'hard';
    return 'medium';
  }),
}));

// ============================================================================
// Helpers
// ============================================================================

function makeOutcome(overrides: Partial<DifficultyOutcome> = {}): DifficultyOutcome {
  return {
    taskHash: 'abc123',
    estimatedDifficulty: 0.5,
    selectedCli: 'claude',
    success: true,
    timestamp: Date.now(),
    ...overrides,
  };
}

const defaultThresholds: DifficultyThresholds = {
  easyUpperBound: 0.3,
  hardLowerBound: 0.7,
};

// ============================================================================
// groupOutcomesByLevel
// ============================================================================

describe('groupOutcomesByLevel', () => {
  it('returns empty groups for empty outcomes', () => {
    const result = groupOutcomesByLevel([], defaultThresholds);
    expect(result.easy).toEqual([]);
    expect(result.medium).toEqual([]);
    expect(result.hard).toEqual([]);
  });

  it('groups outcomes by difficulty level', () => {
    const outcomes: DifficultyOutcome[] = [
      makeOutcome({ estimatedDifficulty: 0.2 }), // easy
      makeOutcome({ estimatedDifficulty: 0.5 }), // medium
      makeOutcome({ estimatedDifficulty: 0.8 }), // hard
      makeOutcome({ estimatedDifficulty: 0.1 }), // easy
    ];

    const result = groupOutcomesByLevel(outcomes, defaultThresholds);
    expect(result.easy).toHaveLength(2);
    expect(result.medium).toHaveLength(1);
    expect(result.hard).toHaveLength(1);
  });

  it('handles boundary values correctly', () => {
    const outcomes: DifficultyOutcome[] = [
      makeOutcome({ estimatedDifficulty: 0.3 }), // medium (>= easyUpperBound)
      makeOutcome({ estimatedDifficulty: 0.7 }), // medium (<= hardLowerBound)
    ];

    const result = groupOutcomesByLevel(outcomes, defaultThresholds);
    expect(result.easy).toHaveLength(0);
    expect(result.medium).toHaveLength(2);
    expect(result.hard).toHaveLength(0);
  });

  it('uses custom thresholds', () => {
    const outcomes: DifficultyOutcome[] = [
      makeOutcome({ estimatedDifficulty: 0.4 }),
      makeOutcome({ estimatedDifficulty: 0.6 }),
    ];

    const customThresholds: DifficultyThresholds = {
      easyUpperBound: 0.5,
      hardLowerBound: 0.8,
    };

    const result = groupOutcomesByLevel(outcomes, customThresholds);
    expect(result.easy).toHaveLength(1);
    expect(result.medium).toHaveLength(1);
    expect(result.hard).toHaveLength(0);
  });
});

// ============================================================================
// calculateSuccessRateByLevel
// ============================================================================

describe('calculateSuccessRateByLevel', () => {
  it('returns 0 for empty groups', () => {
    const groups = { easy: [], medium: [], hard: [] };
    const result = calculateSuccessRateByLevel(groups);
    expect(result.easy).toBe(0);
    expect(result.medium).toBe(0);
    expect(result.hard).toBe(0);
  });

  it('calculates success rates correctly', () => {
    const groups = {
      easy: [makeOutcome({ success: true }), makeOutcome({ success: true })],
      medium: [makeOutcome({ success: true }), makeOutcome({ success: false })],
      hard: [makeOutcome({ success: false })],
    };
    const result = calculateSuccessRateByLevel(groups);
    expect(result.easy).toBe(1.0);
    expect(result.medium).toBe(0.5);
    expect(result.hard).toBe(0);
  });
});

// ============================================================================
// calculateAvgQualityByLevel
// ============================================================================

describe('calculateAvgQualityByLevel', () => {
  it('returns 0 for empty groups or missing quality scores', () => {
    const emptyGroups = { easy: [], medium: [], hard: [] };
    expect(calculateAvgQualityByLevel(emptyGroups)).toEqual({ easy: 0, medium: 0, hard: 0 });

    const noQualityGroups = {
      easy: [makeOutcome({ qualityScore: undefined })],
      medium: [],
      hard: [],
    };
    expect(calculateAvgQualityByLevel(noQualityGroups).easy).toBe(0);
  });

  it('calculates average quality scores and ignores undefined', () => {
    const groups = {
      easy: [
        makeOutcome({ qualityScore: 0.9 }),
        makeOutcome({ qualityScore: undefined }),
        makeOutcome({ qualityScore: 0.7 }),
      ],
      medium: [makeOutcome({ qualityScore: 0.6 })],
      hard: [makeOutcome({ qualityScore: 0.3 }), makeOutcome({ qualityScore: 0.5 })],
    };
    const result = calculateAvgQualityByLevel(groups);
    expect(result.easy).toBeCloseTo(0.8); // Avg of 0.9, 0.7
    expect(result.medium).toBe(0.6);
    expect(result.hard).toBeCloseTo(0.4);
  });
});

// ============================================================================
// calculateMeanAbsoluteError
// ============================================================================

describe('calculateMeanAbsoluteError', () => {
  it('returns 0 for empty outcomes', () => {
    const result = calculateMeanAbsoluteError([]);
    expect(result).toBe(0);
  });

  it('uses quality score when available', () => {
    const outcomes: DifficultyOutcome[] = [
      makeOutcome({ estimatedDifficulty: 0.5, qualityScore: 0.9 }), // actual = 0.1
      makeOutcome({ estimatedDifficulty: 0.3, qualityScore: 0.6 }), // actual = 0.4
    ];
    const result = calculateMeanAbsoluteError(outcomes);
    // MAE = (|0.5 - 0.1| + |0.3 - 0.4|) / 2 = (0.4 + 0.1) / 2 = 0.25
    expect(result).toBeCloseTo(0.25);
  });

  it('uses success binary when quality score not available', () => {
    const outcomes: DifficultyOutcome[] = [
      makeOutcome({ estimatedDifficulty: 0.5, success: true }), // actual = 0.3
      makeOutcome({ estimatedDifficulty: 0.6, success: false }), // actual = 0.8
    ];
    const result = calculateMeanAbsoluteError(outcomes);
    // MAE = (|0.5 - 0.3| + |0.6 - 0.8|) / 2 = (0.2 + 0.2) / 2 = 0.2
    expect(result).toBeCloseTo(0.2);
  });

  it('handles mixed quality and success indicators', () => {
    const outcomes: DifficultyOutcome[] = [
      makeOutcome({ estimatedDifficulty: 0.4, qualityScore: 0.8 }), // actual = 0.2
      makeOutcome({ estimatedDifficulty: 0.7, success: false }), // actual = 0.8
      makeOutcome({ estimatedDifficulty: 0.2, success: true }), // actual = 0.3
    ];
    const result = calculateMeanAbsoluteError(outcomes);
    // MAE = (|0.4 - 0.2| + |0.7 - 0.8| + |0.2 - 0.3|) / 3 = (0.2 + 0.1 + 0.1) / 3
    expect(result).toBeCloseTo(0.4 / 3);
  });

  it('handles extreme values', () => {
    const outcomes: DifficultyOutcome[] = [
      makeOutcome({ estimatedDifficulty: 0, qualityScore: 1.0 }), // actual = 0
      makeOutcome({ estimatedDifficulty: 1, qualityScore: 0 }), // actual = 1
    ];
    const result = calculateMeanAbsoluteError(outcomes);
    expect(result).toBe(0); // Perfect estimates
  });
});

// ============================================================================
// calculateDifficultySuccessCorrelation
// ============================================================================

describe('calculateDifficultySuccessCorrelation', () => {
  it('returns 0 for edge cases', () => {
    expect(calculateDifficultySuccessCorrelation([])).toBe(0);
    expect(calculateDifficultySuccessCorrelation([makeOutcome()])).toBe(0);

    // No variance in success
    const allSuccess = [
      makeOutcome({ estimatedDifficulty: 0.2, success: true }),
      makeOutcome({ estimatedDifficulty: 0.8, success: true }),
    ];
    expect(calculateDifficultySuccessCorrelation(allSuccess)).toBe(0);

    // No variance in difficulty
    const sameDifficulty = [
      makeOutcome({ estimatedDifficulty: 0.5, success: true }),
      makeOutcome({ estimatedDifficulty: 0.5, success: false }),
    ];
    expect(calculateDifficultySuccessCorrelation(sameDifficulty)).toBe(0);
  });

  it('calculates correlation correctly', () => {
    const negativeCorr: DifficultyOutcome[] = [
      makeOutcome({ estimatedDifficulty: 0.2, success: true }),
      makeOutcome({ estimatedDifficulty: 0.4, success: true }),
      makeOutcome({ estimatedDifficulty: 0.6, success: false }),
      makeOutcome({ estimatedDifficulty: 0.8, success: false }),
    ];
    expect(calculateDifficultySuccessCorrelation(negativeCorr)).toBeLessThan(0);

    const positiveCorr: DifficultyOutcome[] = [
      makeOutcome({ estimatedDifficulty: 0.2, success: false }),
      makeOutcome({ estimatedDifficulty: 0.8, success: true }),
    ];
    expect(calculateDifficultySuccessCorrelation(positiveCorr)).toBeGreaterThan(0);
  });
});

// ============================================================================
// calculateCalibrationBias
// ============================================================================

describe('calculateCalibrationBias', () => {
  it('returns 0 when fewer than 10 outcomes', () => {
    expect(
      calculateCalibrationBias(
        Array(9)
          .fill(null)
          .map(() => makeOutcome())
      )
    ).toBe(0);
  });

  it('calculates bias with learning rate and clamping', () => {
    // All failures: actual = 1.0, error = 0.5, bias = 0.5 * 0.1 = 0.05
    const allFail = Array(10)
      .fill(null)
      .map(() => makeOutcome({ estimatedDifficulty: 0.5, success: false }));
    expect(calculateCalibrationBias(allFail)).toBeCloseTo(0.05);

    // All successes: actual = estimated, error = 0, bias = 0
    const allSuccess = Array(10)
      .fill(null)
      .map(() => makeOutcome({ estimatedDifficulty: 0.5, success: true }));
    expect(calculateCalibrationBias(allSuccess)).toBe(0);

    // Mixed: 5 success (error=0), 5 fail (error=0.5), avg=0.25, bias=0.025
    const mixed = [
      ...Array(5)
        .fill(null)
        .map(() => makeOutcome({ estimatedDifficulty: 0.5, success: true })),
      ...Array(5)
        .fill(null)
        .map(() => makeOutcome({ estimatedDifficulty: 0.5, success: false })),
    ];
    expect(calculateCalibrationBias(mixed)).toBeCloseTo(0.025);

    // Verify clamping works
    const highError = Array(10)
      .fill(null)
      .map(() => makeOutcome({ estimatedDifficulty: 0.1, success: false }));
    expect(calculateCalibrationBias(highError)).toBeLessThanOrEqual(0.2);
    expect(calculateCalibrationBias(highError)).toBeGreaterThanOrEqual(-0.2);
  });
});

// ============================================================================
// hashTaskContent
// ============================================================================

describe('hashTaskContent', () => {
  it('is deterministic and returns hex string', () => {
    expect(hashTaskContent('test')).toBe(hashTaskContent('test'));
    expect(hashTaskContent('test')).toMatch(/^[0-9a-f]+$/);
    expect(hashTaskContent('A')).not.toBe(hashTaskContent('B'));
  });

  it('handles edge cases', () => {
    expect(hashTaskContent('')).toBe('0');
    expect(hashTaskContent('x'.repeat(10000))).toMatch(/^[0-9a-f]+$/);
    expect(hashTaskContent('Hello 世界! 🚀')).toMatch(/^[0-9a-f]+$/);
  });
});

// ============================================================================
// buildRoutingReason
// ============================================================================

describe('buildRoutingReason', () => {
  it('builds reason without calibration', () => {
    const options: BuildRoutingReasonOptions = {
      level: 'medium',
      aggregateScore: 0.5,
      dominantDimension: 'reasoning',
      recommendedTier: 'balanced',
      selectedCli: 'codex',
      calibrationApplied: false,
      calibrationBias: 0,
    };
    expect(buildRoutingReason(options)).toBe(
      'Difficulty: medium (50.0%) | Dominant: reasoning | Tier: balanced → codex'
    );
  });

  it('builds reason with calibration and formats percentages', () => {
    const positive: BuildRoutingReasonOptions = {
      level: 'hard',
      aggregateScore: 0.75,
      dominantDimension: 'context_length',
      recommendedTier: 'powerful',
      selectedCli: 'claude',
      calibrationApplied: true,
      calibrationBias: 0.05,
    };
    const result = buildRoutingReason(positive);
    expect(result).toContain('hard (75.0%)');
    expect(result).toContain('(calibrated: +5.0%)');

    const negative: BuildRoutingReasonOptions = { ...positive, calibrationBias: -0.03 };
    expect(buildRoutingReason(negative)).toContain('(calibrated: -3.0%)');

    const precise: BuildRoutingReasonOptions = {
      ...positive,
      aggregateScore: 0.456789,
      calibrationBias: 0.123456,
    };
    const preciseResult = buildRoutingReason(precise);
    expect(preciseResult).toContain('45.7%');
    expect(preciseResult).toContain('12.3%');
  });
});
