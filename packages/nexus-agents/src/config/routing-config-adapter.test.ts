/**
 * nexus-agents/config - Routing Config Adapter Tests
 *
 * Tests for adapting YAML routing config to runtime format.
 *
 * (Source: Issue #475 - Add routing configuration section to nexus-agents.yaml)
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { adaptRoutingConfig, getTopsisConfigFromYaml } from './routing-config-adapter.js';
import { DEFAULT_COMPOSITE_CONFIG } from '../cli-adapters/composite-router-types.js';
import { DEFAULT_TOPSIS_CONFIG } from '../cli-adapters/topsis-types.js';
import type { RoutingConfig } from './schemas-routing.js';
import { isPersistenceEnabled } from './learning-persistence.js';

vi.mock('./learning-persistence.js', () => ({
  isPersistenceEnabled: vi.fn(() => false),
}));

describe('routing-config-adapter', () => {
  describe('adaptRoutingConfig', () => {
    it('returns default config when no yaml config provided', () => {
      const result = adaptRoutingConfig(undefined);

      expect(result.enableBudgetFilter).toBe(DEFAULT_COMPOSITE_CONFIG.enableBudgetFilter);
      expect(result.enableZeroRouter).toBe(DEFAULT_COMPOSITE_CONFIG.enableZeroRouter);
      expect(result.enableTopsisRanking).toBe(DEFAULT_COMPOSITE_CONFIG.enableTopsisRanking);
      expect(result.latencyScoreWeight).toBe(0.2);
    });

    it('adapts stage toggles from yaml config', () => {
      const yamlConfig: RoutingConfig = {
        stages: {
          budgetFilter: false,
          zeroRouter: false,
          preferenceRouting: true,
          topsisRanking: false,
          linucbSelection: false,
          latencyTracking: false,
          routingMemory: true,
          // Issue #755: New replacement stages
          confidenceCascade: true,
          capabilityMatch: true,
          qualityConstraint: true,
          // Issue #998: Resource strategy
          resourceStrategy: false,
          // Issue #999: Strategy distillation
          strategyDistillation: true,
        },
        latencyScoreWeight: 0.5,
      };

      const result = adaptRoutingConfig(yamlConfig);

      expect(result.enableBudgetFilter).toBe(false);
      expect(result.enableZeroRouter).toBe(false);
      expect(result.enablePreferenceRouting).toBe(true);
      expect(result.enableTopsisRanking).toBe(false);
      expect(result.enableLinUCBSelection).toBe(false);
      expect(result.enableLatencyTracking).toBe(false);
      expect(result.enableRoutingMemory).toBe(true);
      expect(result.latencyScoreWeight).toBe(0.5);
      // Issue #755: Verify new replacement stages
      expect(result.enableConfidenceCascade).toBe(true);
      expect(result.enableCapabilityMatch).toBe(true);
      expect(result.enableQualityConstraint).toBe(true);
      // Issue #998: Resource strategy
      expect(result.enableResourceStrategy).toBe(false);
      // Issue #999: Strategy distillation
      expect(result.enableStrategyDistillation).toBe(true);
    });

    it('adapts budget constraints', () => {
      const yamlConfig: RoutingConfig = {
        budget: {
          maxTokens: 50000,
          maxCostUsd: 5,
          maxLatencyMs: 10000,
        },
        latencyScoreWeight: 0.2,
      };

      const result = adaptRoutingConfig(yamlConfig);

      expect(result.budgetConstraints).toEqual({
        maxTokens: 50000,
        maxCostUsd: 5,
        maxLatencyMs: 10000,
      });
    });

    it('plumbs budget.taskClassMaxCostUsd through to budgetConstraints (#4214)', () => {
      const yamlConfig: RoutingConfig = {
        budget: {
          maxCostUsd: 5,
          taskClassMaxCostUsd: { code_generation: 0.25, research: 1.0 },
        },
        latencyScoreWeight: 0.2,
      };

      const result = adaptRoutingConfig(yamlConfig);

      expect(result.budgetConstraints?.taskClassMaxCostUsd).toEqual({
        code_generation: 0.25,
        research: 1.0,
      });
    });

    it('adapts linucb parameters', () => {
      const yamlConfig: RoutingConfig = {
        linucb: {
          alpha: 2.0,
          maxDecisionTimeMs: 100,
        },
        latencyScoreWeight: 0.2,
      };

      const result = adaptRoutingConfig(yamlConfig);

      expect(result.linucbAlpha).toBe(2.0);
      expect(result.maxDecisionTimeMs).toBe(100);
    });

    it('adapts preference router parameters', () => {
      const yamlConfig: RoutingConfig = {
        preference: {
          minDataPoints: 20,
        },
        latencyScoreWeight: 0.2,
      };

      const result = adaptRoutingConfig(yamlConfig);

      expect(result.preferenceMinDataPoints).toBe(20);
    });

    it('adapts zeroRouter config', () => {
      const yamlConfig: RoutingConfig = {
        zeroRouter: {
          thresholds: {
            easyUpperBound: 0.2,
            hardLowerBound: 0.8,
          },
          enableCalibration: false,
          maxCalibrationOutcomes: 500,
          minCalibrationOutcomes: 25,
          verbose: true,
        },
        latencyScoreWeight: 0.2,
      };

      const result = adaptRoutingConfig(yamlConfig);

      expect(result.zeroRouterConfig).toBeDefined();
      expect(result.zeroRouterConfig?.thresholds).toEqual({
        easyUpperBound: 0.2,
        hardLowerBound: 0.8,
      });
      expect(result.zeroRouterConfig?.enableCalibration).toBe(false);
      expect(result.zeroRouterConfig?.verbose).toBe(true);
    });

    it('adapts latencyTracker config', () => {
      const yamlConfig: RoutingConfig = {
        latencyTracker: {
          windowSize: 50,
          decayFactor: 0.9,
          maxSampleAgeMs: 1800000,
          percentiles: [50, 90],
        },
        latencyScoreWeight: 0.2,
      };

      const result = adaptRoutingConfig(yamlConfig);

      expect(result.latencyTrackerConfig).toBeDefined();
      expect(result.latencyTrackerConfig?.windowSize).toBe(50);
      expect(result.latencyTrackerConfig?.decayFactor).toBe(0.9);
      expect(result.latencyTrackerConfig?.maxSampleAgeMs).toBe(1800000);
      expect(result.latencyTrackerConfig?.percentiles).toEqual([50, 90]);
    });

    it('adapts routingMemory config', () => {
      const yamlConfig: RoutingConfig = {
        routingMemory: {
          minObservations: 10,
          confidenceThreshold: 0.8,
          successRateThreshold: 0.9,
          actionCacheMaxAgeMs: 7200000,
        },
        latencyScoreWeight: 0.2,
      };

      const result = adaptRoutingConfig(yamlConfig);

      expect(result.routingMemoryConfig).toBeDefined();
      expect(result.routingMemoryConfig?.minObservations).toBe(10);
      expect(result.routingMemoryConfig?.confidenceThreshold).toBe(0.8);
      expect(result.routingMemoryConfig?.successRateThreshold).toBe(0.9);
      expect(result.routingMemoryConfig?.actionCacheMaxAgeMs).toBe(7200000);
    });

    it('uses defaults for missing nested configs', () => {
      const yamlConfig: RoutingConfig = {
        latencyScoreWeight: 0.3,
      };

      const result = adaptRoutingConfig(yamlConfig);

      // Should use defaults for stages
      expect(result.enableBudgetFilter).toBe(true);
      expect(result.enableZeroRouter).toBe(true);
      expect(result.enableTopsisRanking).toBe(true);

      // Nested configs should be empty or undefined partials
      expect(result.zeroRouterConfig).toEqual({});
      expect(result.latencyTrackerConfig).toEqual({});
      expect(result.routingMemoryConfig).toEqual({});
    });

    it('enables persistence-aware flags when persistence is on (#1353)', () => {
      vi.mocked(isPersistenceEnabled).mockReturnValue(true);

      const result = adaptRoutingConfig(undefined);

      expect(result.enablePreferenceRouting).toBe(true);
      expect(result.enableRoutingMemory).toBe(true);
      expect(result.enableStrategyDistillation).toBe(true);
    });

    it('keeps persistence-aware flags off when persistence is off', () => {
      vi.mocked(isPersistenceEnabled).mockReturnValue(false);

      const result = adaptRoutingConfig(undefined);

      expect(result.enablePreferenceRouting).toBe(false);
      expect(result.enableRoutingMemory).toBe(false);
      expect(result.enableStrategyDistillation).toBe(false);
    });

    it('respects explicit preferenceRouting: false even with persistence on', () => {
      vi.mocked(isPersistenceEnabled).mockReturnValue(true);

      // Simulate parsed YAML where user explicitly sets preferenceRouting: false
      // but doesn't specify other stages (they get schema defaults)
      const yamlConfig: RoutingConfig = {
        stages: {
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
          resourceStrategy: true,
          strategyDistillation: false,
        },
        latencyScoreWeight: 0.2,
      };

      const result = adaptRoutingConfig(yamlConfig);

      expect(result.enablePreferenceRouting).toBe(false);
    });
  });

  describe('getTopsisConfigFromYaml', () => {
    it('returns default config when no yaml provided', () => {
      const result = getTopsisConfigFromYaml(undefined);

      expect(result.criteria).toEqual(DEFAULT_TOPSIS_CONFIG.criteria);
      expect(result.minQualityThreshold).toBe(DEFAULT_TOPSIS_CONFIG.minQualityThreshold);
      expect(result.verbose).toBe(DEFAULT_TOPSIS_CONFIG.verbose);
    });

    it('adapts topsis config from yaml', () => {
      const yamlConfig: RoutingConfig = {
        topsis: {
          minQualityThreshold: 7,
          maxLatencyMs: 5000,
          maxCostPerRequest: 0.5,
          verbose: true,
        },
        latencyScoreWeight: 0.2,
      };

      const result = getTopsisConfigFromYaml(yamlConfig);

      expect(result.minQualityThreshold).toBe(7);
      expect(result.maxLatencyMs).toBe(5000);
      expect(result.maxCostPerRequest).toBe(0.5);
      expect(result.verbose).toBe(true);
    });

    it('uses default criteria when not provided', () => {
      const yamlConfig: RoutingConfig = {
        topsis: {
          minQualityThreshold: 6,
          verbose: false,
        },
        latencyScoreWeight: 0.2,
      };

      const result = getTopsisConfigFromYaml(yamlConfig);

      expect(result.criteria).toEqual(DEFAULT_TOPSIS_CONFIG.criteria);
    });

    it('adapts custom criteria', () => {
      const customCriteria = [
        { name: 'quality', weight: 0.6, beneficial: true },
        { name: 'cost', weight: 0.4, beneficial: false },
      ];

      const yamlConfig: RoutingConfig = {
        topsis: {
          criteria: customCriteria,
          minQualityThreshold: 5,
          verbose: false,
        },
        latencyScoreWeight: 0.2,
      };

      const result = getTopsisConfigFromYaml(yamlConfig);

      expect(result.criteria).toEqual(customCriteria);
    });

    it('does not include undefined optional properties', () => {
      const yamlConfig: RoutingConfig = {
        topsis: {
          minQualityThreshold: 5,
          verbose: false,
        },
        latencyScoreWeight: 0.2,
      };

      const result = getTopsisConfigFromYaml(yamlConfig);

      // Should not have undefined properties set
      expect(Object.prototype.hasOwnProperty.call(result, 'maxLatencyMs')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(result, 'maxCostPerRequest')).toBe(false);
    });
  });
});

// ============================================================================
// #4196 — NEXUS_BILLING_MODE wiring into composite config
// ============================================================================

describe('adaptRoutingConfig billing mode (#4196)', () => {
  afterEach(() => {
    delete process.env['NEXUS_BILLING_MODE'];
  });

  it('defaults to plan when NEXUS_BILLING_MODE is unset', () => {
    delete process.env['NEXUS_BILLING_MODE'];
    expect(adaptRoutingConfig(undefined).billingMode).toBe('plan');
  });

  it('resolves api when NEXUS_BILLING_MODE=api', () => {
    process.env['NEXUS_BILLING_MODE'] = 'api';
    expect(adaptRoutingConfig(undefined).billingMode).toBe('api');
  });

  it('treats unknown values as plan (fail-safe default)', () => {
    process.env['NEXUS_BILLING_MODE'] = 'weird';
    expect(adaptRoutingConfig(undefined).billingMode).toBe('plan');
  });
});
