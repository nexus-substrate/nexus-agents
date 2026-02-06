/**
 * nexus-agents/config - Routing Configuration Schemas Tests
 *
 * Comprehensive tests for all Zod schemas in schemas-routing.ts.
 * Tests valid inputs, invalid inputs, defaults, boundaries, and nested structures.
 *
 * @module config/schemas-routing.test
 */

import { describe, it, expect } from 'vitest';
import {
  BudgetConstraintsSchema,
  TopsisCriterionSchema,
  TopsisConfigSchema,
  DifficultyWeightsConfigSchema,
  DifficultyThresholdsSchema,
  ZeroRouterConfigSchema,
  LatencyTrackerConfigSchema,
  RoutingMemoryConfigSchema,
  RoutingConfigSchema,
  DEFAULT_ROUTING_CONFIG,
} from './schemas-routing.js';

describe('BudgetConstraintsSchema', () => {
  it('accepts valid budget constraints', () => {
    const valid = { maxTokens: 1000, maxCostUsd: 0.5, maxLatencyMs: 200 };
    expect(BudgetConstraintsSchema.parse(valid)).toEqual(valid);
  });

  it('accepts partial budget constraints', () => {
    expect(BudgetConstraintsSchema.parse({ maxTokens: 500 })).toEqual({ maxTokens: 500 });
  });

  it('accepts empty object', () => {
    expect(BudgetConstraintsSchema.parse({})).toEqual({});
  });

  it('accepts undefined', () => {
    expect(BudgetConstraintsSchema.parse(undefined)).toBeUndefined();
  });

  it('rejects zero maxTokens', () => {
    expect(() => BudgetConstraintsSchema.parse({ maxTokens: 0 })).toThrow();
  });

  it('rejects negative maxCostUsd', () => {
    expect(() => BudgetConstraintsSchema.parse({ maxCostUsd: -0.1 })).toThrow();
  });

  it('rejects negative maxLatencyMs', () => {
    expect(() => BudgetConstraintsSchema.parse({ maxLatencyMs: -100 })).toThrow();
  });

  it('accepts boundary positive values', () => {
    const tiny = { maxTokens: 0.0001, maxCostUsd: 0.0001, maxLatencyMs: 1 };
    expect(BudgetConstraintsSchema.parse(tiny)).toEqual(tiny);
  });
});

describe('TopsisCriterionSchema', () => {
  it('accepts valid criterion', () => {
    const valid = { name: 'quality', weight: 0.5, beneficial: true };
    expect(TopsisCriterionSchema.parse(valid)).toEqual(valid);
  });

  it('rejects empty name', () => {
    expect(() =>
      TopsisCriterionSchema.parse({ name: '', weight: 0.5, beneficial: true })
    ).toThrow();
  });

  it('rejects weight below 0', () => {
    expect(() =>
      TopsisCriterionSchema.parse({ name: 'cost', weight: -0.1, beneficial: false })
    ).toThrow();
  });

  it('rejects weight above 1', () => {
    expect(() =>
      TopsisCriterionSchema.parse({ name: 'latency', weight: 1.1, beneficial: false })
    ).toThrow();
  });

  it('accepts boundary weights', () => {
    expect(TopsisCriterionSchema.parse({ name: 'test', weight: 0, beneficial: true })).toEqual({
      name: 'test',
      weight: 0,
      beneficial: true,
    });
    expect(TopsisCriterionSchema.parse({ name: 'test', weight: 1, beneficial: false })).toEqual({
      name: 'test',
      weight: 1,
      beneficial: false,
    });
  });

  it('rejects missing fields', () => {
    expect(() => TopsisCriterionSchema.parse({ name: 'quality' })).toThrow();
    expect(() => TopsisCriterionSchema.parse({ weight: 0.5, beneficial: true })).toThrow();
  });
});

describe('TopsisConfigSchema', () => {
  it('accepts valid config with defaults', () => {
    const result = TopsisConfigSchema.parse({});
    expect(result).toEqual({ minQualityThreshold: 5, verbose: false });
  });

  it('accepts full config', () => {
    const valid = {
      criteria: [{ name: 'quality', weight: 0.7, beneficial: true }],
      minQualityThreshold: 7,
      maxLatencyMs: 500,
      maxCostPerRequest: 1.0,
      verbose: true,
    };
    expect(TopsisConfigSchema.parse(valid)).toEqual(valid);
  });

  it('rejects minQualityThreshold below 0', () => {
    expect(() => TopsisConfigSchema.parse({ minQualityThreshold: -1 })).toThrow();
  });

  it('rejects minQualityThreshold above 10', () => {
    expect(() => TopsisConfigSchema.parse({ minQualityThreshold: 11 })).toThrow();
  });

  it('accepts boundary quality thresholds', () => {
    expect(TopsisConfigSchema.parse({ minQualityThreshold: 0 })).toMatchObject({
      minQualityThreshold: 0,
    });
    expect(TopsisConfigSchema.parse({ minQualityThreshold: 10 })).toMatchObject({
      minQualityThreshold: 10,
    });
  });

  it('rejects zero maxLatencyMs', () => {
    expect(() => TopsisConfigSchema.parse({ maxLatencyMs: 0 })).toThrow();
  });

  it('accepts undefined', () => {
    expect(TopsisConfigSchema.parse(undefined)).toBeUndefined();
  });
});

describe('DifficultyWeightsConfigSchema', () => {
  it('accepts defaults', () => {
    const result = DifficultyWeightsConfigSchema.parse({});
    expect(result).toEqual({
      reasoning: 0.3,
      knowledge: 0.15,
      creativity: 0.15,
      precision: 0.25,
      context_length: 0.15,
    });
  });

  it('accepts custom weights', () => {
    const weights = {
      reasoning: 0.5,
      knowledge: 0.1,
      creativity: 0.1,
      precision: 0.2,
      context_length: 0.1,
    };
    expect(DifficultyWeightsConfigSchema.parse(weights)).toEqual(weights);
  });

  it('rejects negative weights', () => {
    expect(() => DifficultyWeightsConfigSchema.parse({ reasoning: -0.1 })).toThrow();
  });

  it('rejects weights above 1', () => {
    expect(() => DifficultyWeightsConfigSchema.parse({ creativity: 1.1 })).toThrow();
  });

  it('accepts boundary weights', () => {
    const boundary = {
      reasoning: 0,
      knowledge: 1,
      creativity: 0.5,
      precision: 0,
      context_length: 1,
    };
    expect(DifficultyWeightsConfigSchema.parse(boundary)).toMatchObject(boundary);
  });
});

describe('DifficultyThresholdsSchema', () => {
  it('accepts defaults', () => {
    const result = DifficultyThresholdsSchema.parse({});
    expect(result).toEqual({ easyUpperBound: 0.3, hardLowerBound: 0.7 });
  });

  it('accepts custom thresholds', () => {
    const custom = { easyUpperBound: 0.4, hardLowerBound: 0.8 };
    expect(DifficultyThresholdsSchema.parse(custom)).toEqual(custom);
  });

  it('rejects negative bounds', () => {
    expect(() => DifficultyThresholdsSchema.parse({ easyUpperBound: -0.1 })).toThrow();
  });

  it('rejects bounds above 1', () => {
    expect(() => DifficultyThresholdsSchema.parse({ hardLowerBound: 1.1 })).toThrow();
  });

  it('accepts boundary values', () => {
    expect(DifficultyThresholdsSchema.parse({ easyUpperBound: 0, hardLowerBound: 1 })).toEqual({
      easyUpperBound: 0,
      hardLowerBound: 1,
    });
  });
});

describe('ZeroRouterConfigSchema', () => {
  it('accepts defaults', () => {
    const result = ZeroRouterConfigSchema.parse({});
    expect(result).toMatchObject({
      enableCalibration: true,
      maxCalibrationOutcomes: 1000,
      minCalibrationOutcomes: 50,
      verbose: false,
    });
  });

  it('accepts full config', () => {
    const full = {
      thresholds: { easyUpperBound: 0.2, hardLowerBound: 0.8 },
      weights: {
        reasoning: 0.4,
        knowledge: 0.2,
        creativity: 0.1,
        precision: 0.2,
        context_length: 0.1,
      },
      difficultyToTier: { easy: 'fast', medium: 'balanced', hard: 'powerful' },
      tierToClis: { fast: ['claude'], balanced: ['gemini'], powerful: ['codex'] },
      enableCalibration: false,
      maxCalibrationOutcomes: 500,
      minCalibrationOutcomes: 100,
      verbose: true,
    };
    expect(ZeroRouterConfigSchema.parse(full)).toEqual(full);
  });

  it('rejects non-integer maxCalibrationOutcomes', () => {
    expect(() => ZeroRouterConfigSchema.parse({ maxCalibrationOutcomes: 100.5 })).toThrow();
  });

  it('rejects zero minCalibrationOutcomes', () => {
    expect(() => ZeroRouterConfigSchema.parse({ minCalibrationOutcomes: 0 })).toThrow();
  });

  it('accepts undefined', () => {
    expect(ZeroRouterConfigSchema.parse(undefined)).toBeUndefined();
  });

  it('validates difficulty level enum', () => {
    const invalid = { difficultyToTier: { invalid: 'fast' } };
    expect(() => ZeroRouterConfigSchema.parse(invalid)).toThrow();
  });

  it('validates model tier enum', () => {
    const invalid = { difficultyToTier: { easy: 'invalid' } };
    expect(() => ZeroRouterConfigSchema.parse(invalid)).toThrow();
  });

  it('validates CLI name enum', () => {
    const invalid = { tierToClis: { fast: ['invalid'] } };
    expect(() => ZeroRouterConfigSchema.parse(invalid)).toThrow();
  });
});

describe('LatencyTrackerConfigSchema', () => {
  it('accepts defaults', () => {
    const result = LatencyTrackerConfigSchema.parse({});
    expect(result).toEqual({
      windowSize: 100,
      decayFactor: 0.95,
      maxSampleAgeMs: 3600000,
      percentiles: [50, 95, 99],
    });
  });

  it('accepts custom config', () => {
    const custom = {
      windowSize: 200,
      decayFactor: 0.9,
      maxSampleAgeMs: 7200000,
      percentiles: [25, 50, 75, 90],
    };
    expect(LatencyTrackerConfigSchema.parse(custom)).toEqual(custom);
  });

  it('rejects non-integer windowSize', () => {
    expect(() => LatencyTrackerConfigSchema.parse({ windowSize: 50.5 })).toThrow();
  });

  it('rejects zero windowSize', () => {
    expect(() => LatencyTrackerConfigSchema.parse({ windowSize: 0 })).toThrow();
  });

  it('rejects decayFactor below 0', () => {
    expect(() => LatencyTrackerConfigSchema.parse({ decayFactor: -0.1 })).toThrow();
  });

  it('rejects decayFactor above 1', () => {
    expect(() => LatencyTrackerConfigSchema.parse({ decayFactor: 1.1 })).toThrow();
  });

  it('rejects percentiles outside 0-100', () => {
    expect(() => LatencyTrackerConfigSchema.parse({ percentiles: [-1, 50] })).toThrow();
    expect(() => LatencyTrackerConfigSchema.parse({ percentiles: [50, 101] })).toThrow();
  });

  it('rejects too many percentiles', () => {
    const tooMany = Array.from({ length: 21 }, (_, i) => i * 5);
    expect(() => LatencyTrackerConfigSchema.parse({ percentiles: tooMany })).toThrow();
  });

  it('accepts boundary percentiles', () => {
    expect(LatencyTrackerConfigSchema.parse({ percentiles: [0, 100] })).toMatchObject({
      percentiles: [0, 100],
    });
  });

  it('accepts undefined', () => {
    expect(LatencyTrackerConfigSchema.parse(undefined)).toBeUndefined();
  });
});

describe('RoutingMemoryConfigSchema', () => {
  it('accepts defaults', () => {
    const result = RoutingMemoryConfigSchema.parse({});
    expect(result).toEqual({
      minObservations: 5,
      confidenceThreshold: 0.6,
      successRateThreshold: 0.7,
      actionCacheMaxAgeMs: 3600000,
    });
  });

  it('accepts custom config', () => {
    const custom = {
      minObservations: 10,
      confidenceThreshold: 0.8,
      successRateThreshold: 0.9,
      actionCacheMaxAgeMs: 7200000,
    };
    expect(RoutingMemoryConfigSchema.parse(custom)).toEqual(custom);
  });

  it('rejects non-integer minObservations', () => {
    expect(() => RoutingMemoryConfigSchema.parse({ minObservations: 5.5 })).toThrow();
  });

  it('rejects zero minObservations', () => {
    expect(() => RoutingMemoryConfigSchema.parse({ minObservations: 0 })).toThrow();
  });

  it('rejects confidenceThreshold below 0', () => {
    expect(() => RoutingMemoryConfigSchema.parse({ confidenceThreshold: -0.1 })).toThrow();
  });

  it('rejects successRateThreshold above 1', () => {
    expect(() => RoutingMemoryConfigSchema.parse({ successRateThreshold: 1.1 })).toThrow();
  });

  it('accepts boundary thresholds', () => {
    const boundary = { confidenceThreshold: 0, successRateThreshold: 1 };
    expect(RoutingMemoryConfigSchema.parse(boundary)).toMatchObject(boundary);
  });

  it('accepts undefined', () => {
    expect(RoutingMemoryConfigSchema.parse(undefined)).toBeUndefined();
  });
});

describe('RoutingConfigSchema', () => {
  it('accepts minimal config with defaults', () => {
    const result = RoutingConfigSchema.parse({});
    expect(result).toMatchObject({
      latencyScoreWeight: 0.2,
    });
  });

  it('accepts full config', () => {
    const full = {
      stages: {
        budgetFilter: false,
        zeroRouter: true,
        preferenceRouting: true,
        topsisRanking: false,
        linucbSelection: true,
        latencyTracking: false,
        routingMemory: true,
        confidenceCascade: true,
        capabilityMatch: true,
        qualityConstraint: true,
      },
      budget: { maxTokens: 2000, maxCostUsd: 1.0 },
      topsis: { minQualityThreshold: 6, verbose: true },
      zeroRouter: { enableCalibration: false, verbose: true },
      latencyTracker: { windowSize: 50, decayFactor: 0.9 },
      routingMemory: { minObservations: 10, confidenceThreshold: 0.8 },
      linucb: { alpha: 2.0, maxDecisionTimeMs: 100 },
      preference: { minDataPoints: 20 },
      latencyScoreWeight: 0.5,
    };
    expect(RoutingConfigSchema.parse(full)).toMatchObject(full);
  });

  it('rejects latencyScoreWeight below 0', () => {
    expect(() => RoutingConfigSchema.parse({ latencyScoreWeight: -0.1 })).toThrow();
  });

  it('rejects latencyScoreWeight above 1', () => {
    expect(() => RoutingConfigSchema.parse({ latencyScoreWeight: 1.1 })).toThrow();
  });

  it('rejects negative linucb alpha', () => {
    expect(() => RoutingConfigSchema.parse({ linucb: { alpha: -1 } })).toThrow();
  });

  it('rejects non-integer preference minDataPoints', () => {
    expect(() => RoutingConfigSchema.parse({ preference: { minDataPoints: 10.5 } })).toThrow();
  });

  it('accepts nested optional configs', () => {
    const partial = {
      stages: { budgetFilter: false },
      topsis: { minQualityThreshold: 8 },
    };
    expect(RoutingConfigSchema.parse(partial)).toMatchObject(partial);
  });
});

describe('DEFAULT_ROUTING_CONFIG', () => {
  it('matches RoutingConfigSchema', () => {
    expect(() => RoutingConfigSchema.parse(DEFAULT_ROUTING_CONFIG)).not.toThrow();
  });

  it('has expected stage defaults', () => {
    expect(DEFAULT_ROUTING_CONFIG.stages).toEqual({
      budgetFilter: true,
      zeroRouter: true,
      preferenceRouting: false,
      topsisRanking: true,
      linucbSelection: true,
      latencyTracking: true,
      routingMemory: false,
      confidenceCascade: false,
      capabilityMatch: false,
      qualityConstraint: false,
    });
  });

  it('has expected numeric defaults', () => {
    expect(DEFAULT_ROUTING_CONFIG.latencyScoreWeight).toBe(0.2);
    expect(DEFAULT_ROUTING_CONFIG.linucb?.alpha).toBe(1.0);
    expect(DEFAULT_ROUTING_CONFIG.topsis?.minQualityThreshold).toBe(5);
  });

  it('has expected calibration defaults', () => {
    expect(DEFAULT_ROUTING_CONFIG.zeroRouter?.enableCalibration).toBe(true);
    expect(DEFAULT_ROUTING_CONFIG.zeroRouter?.maxCalibrationOutcomes).toBe(1000);
    expect(DEFAULT_ROUTING_CONFIG.zeroRouter?.minCalibrationOutcomes).toBe(50);
  });

  it('has expected latency tracker defaults', () => {
    expect(DEFAULT_ROUTING_CONFIG.latencyTracker?.windowSize).toBe(100);
    expect(DEFAULT_ROUTING_CONFIG.latencyTracker?.decayFactor).toBe(0.95);
    expect(DEFAULT_ROUTING_CONFIG.latencyTracker?.percentiles).toEqual([50, 95, 99]);
  });
});
