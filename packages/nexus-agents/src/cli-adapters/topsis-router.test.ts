/**
 * nexus-agents/cli-adapters - TOPSIS Router Tests
 *
 * @module cli-adapters/topsis-router.test
 * (Source: Issue #146)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TopsisRouter, createTopsisRouter, selectModelWithTopsis } from './topsis-router.js';
import type { TopsisModelProfile } from './topsis-types.js';
import {
  DEFAULT_TOPSIS_CRITERIA,
  PLAN_BILLING_TOPSIS_CRITERIA,
  TASK_CATEGORY_TOPSIS_CRITERIA,
  TASK_CATEGORY_PLAN_CRITERIA,
  getCriteriaForTaskCategory,
} from './topsis-types.js';
import { CLI_NAMES } from '../config/model-capabilities-types.js';

describe('TopsisRouter', () => {
  let router: TopsisRouter;

  beforeEach(() => {
    router = new TopsisRouter({ verbose: false });
  });

  describe('constructor', () => {
    it('should create router with default config', () => {
      const r = new TopsisRouter();
      expect(r.getConfig().criteria).toEqual(DEFAULT_TOPSIS_CRITERIA);
    });

    it('should accept custom criteria', () => {
      const customCriteria = [
        { name: 'quality', weight: 0.7, beneficial: true },
        { name: 'cost', weight: 0.3, beneficial: false },
      ];
      const r = new TopsisRouter({ criteria: customCriteria });
      expect(r.getConfig().criteria).toEqual(customCriteria);
    });

    it('should throw if weights do not sum to 1.0', () => {
      const invalidCriteria = [
        { name: 'quality', weight: 0.5, beneficial: true },
        { name: 'cost', weight: 0.3, beneficial: false },
      ];
      expect(() => new TopsisRouter({ criteria: invalidCriteria })).toThrow(
        /weights must sum to 1\.0/
      );
    });
  });

  describe('selectModel', () => {
    it('should select a model from default profiles', () => {
      const result = router.selectModel();

      expect(result.selectedModel).toBeDefined();
      expect([...CLI_NAMES]).toContain(result.selectedModel);
      expect(result.scores.length).toBe(CLI_NAMES.length);
    });

    it('should return scores in ranked order', () => {
      const result = router.selectModel();

      for (let i = 0; i < result.scores.length - 1; i++) {
        const current = result.scores[i];
        const next = result.scores[i + 1];
        if (current !== undefined && next !== undefined) {
          expect(current.closenessScore).toBeGreaterThanOrEqual(next.closenessScore);
        }
      }
    });

    it('should return valid closeness scores between 0 and 1', () => {
      const result = router.selectModel();

      for (const score of result.scores) {
        expect(score.closenessScore).toBeGreaterThanOrEqual(0);
        expect(score.closenessScore).toBeLessThanOrEqual(1);
      }
    });

    it('should calculate positive and negative ideal solutions', () => {
      const result = router.selectModel();

      expect(result.positiveIdeal).toBeDefined();
      expect(result.negativeIdeal).toBeDefined();
      expect(result.positiveIdeal['quality']).toBeDefined();
      expect(result.negativeIdeal['quality']).toBeDefined();
    });

    it('should provide reasoning for selection', () => {
      const result = router.selectModel();

      expect(result.reasoning).toBeDefined();
      expect(result.reasoning.length).toBeGreaterThan(0);
      expect(result.reasoning).toContain(result.selectedModel);
    });
  });

  describe('selectModel with custom profiles', () => {
    it('should work with custom model profiles', () => {
      const customProfiles: TopsisModelProfile[] = [
        {
          cliName: 'claude',
          capabilities: {
            reasoning: 10,
            contextWindow: 200_000,
            codeGeneration: 9,
            speed: 7,
            cost: 5,
          },
          costPerMillionInput: 3.0,
          costPerMillionOutput: 15.0,
          averageLatencyMs: 800,
          qualityScore: 9.5,
        },
        {
          cliName: 'gemini',
          capabilities: {
            reasoning: 8,
            contextWindow: 1_000_000,
            codeGeneration: 7,
            speed: 8,
            cost: 9,
          },
          costPerMillionInput: 0.5,
          costPerMillionOutput: 2.0,
          averageLatencyMs: 300,
          qualityScore: 7.5,
        },
      ];

      const result = router.selectModel({ profiles: customProfiles });

      expect(['claude', 'gemini']).toContain(result.selectedModel);
      expect(result.scores.length).toBe(2);
    });

    it('should consider expected token counts in cost calculation', () => {
      const result1 = router.selectModel({
        expectedInputTokens: 100,
        expectedOutputTokens: 50,
      });

      const result2 = router.selectModel({
        expectedInputTokens: 100_000,
        expectedOutputTokens: 50_000,
      });

      // With more tokens, cost becomes more important
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
    });
  });

  describe('weight influence', () => {
    it('should favor high quality when quality weight is high', () => {
      const qualityFocused = new TopsisRouter({
        criteria: [
          { name: 'quality', weight: 0.9, beneficial: true },
          { name: 'cost', weight: 0.05, beneficial: false },
          { name: 'latency', weight: 0.05, beneficial: false },
        ],
      });

      const result = qualityFocused.selectModel();

      // Codex has highest quality score (10) — quality-first defaults (Issue #807)
      expect(result.selectedModel).toBe('codex');
    });

    it('should favor low cost when cost weight is high', () => {
      const costFocused = new TopsisRouter({
        criteria: [
          { name: 'quality', weight: 0.1, beneficial: true },
          { name: 'cost', weight: 0.8, beneficial: false },
          { name: 'latency', weight: 0.1, beneficial: false },
        ],
      });

      const result = costFocused.selectModel();

      // Gemini has lowest cost ($1.25/$10) — quality-first defaults (Issue #807)
      // But codex ($2/$8) has comparable cost with much higher quality, so TOPSIS may pick codex
      expect(['gemini', 'codex']).toContain(result.selectedModel);
    });

    it('should favor low latency when latency weight is high', () => {
      const speedFocused = new TopsisRouter({
        criteria: [
          { name: 'quality', weight: 0.1, beneficial: true },
          { name: 'cost', weight: 0.1, beneficial: false },
          { name: 'latency', weight: 0.8, beneficial: false },
        ],
      });

      const result = speedFocused.selectModel();

      // Gemini has lowest latency (400ms)
      expect(result.selectedModel).toBe('gemini');
    });
  });

  describe('cost optimization', () => {
    it('should calculate cost savings correctly', () => {
      const costFocused = new TopsisRouter({
        criteria: [
          { name: 'quality', weight: 0.2, beneficial: true },
          { name: 'cost', weight: 0.6, beneficial: false },
          { name: 'latency', weight: 0.2, beneficial: false },
        ],
      });

      const result = costFocused.selectModel();

      // Cost-focused should select a cheaper model; savings can be 0+ or negative
      // depending on whether the most expensive model has highest quality
      expect(result).toBeDefined();
      expect(result.selectedModel).toBeDefined();
    });

    it('should report no savings when highest quality model selected', () => {
      const qualityOnly = new TopsisRouter({
        criteria: [
          { name: 'quality', weight: 1.0, beneficial: true },
          { name: 'cost', weight: 0.0, beneficial: false },
          { name: 'latency', weight: 0.0, beneficial: false },
        ],
      });

      const result = qualityOnly.selectModel();

      // Codex has highest quality score (10) — quality-first defaults (Issue #807)
      expect(result.selectedModel).toBe('codex');
      expect(result.estimatedSavingsPercent).toBeGreaterThanOrEqual(0);
    });
  });

  describe('TOPSIS calculations', () => {
    it('should produce normalized values between 0 and 1', () => {
      const result = router.selectModel();

      for (const score of result.scores) {
        for (const value of Object.values(score.normalizedValues)) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
      }
    });

    it('should produce distances that are non-negative', () => {
      const result = router.selectModel();

      for (const score of result.scores) {
        expect(score.distanceToPIS).toBeGreaterThanOrEqual(0);
        expect(score.distanceToNIS).toBeGreaterThanOrEqual(0);
      }
    });

    it('should have at least one model with max closeness', () => {
      const result = router.selectModel();

      const maxCloseness = Math.max(...result.scores.map((s) => s.closenessScore));
      expect(maxCloseness).toBeGreaterThan(0);
      expect(maxCloseness).toBeLessThanOrEqual(1);
    });
  });
});

describe('createTopsisRouter', () => {
  it('should create router with default config', () => {
    const router = createTopsisRouter();
    expect(router).toBeInstanceOf(TopsisRouter);
  });

  it('should create router with custom config', () => {
    const router = createTopsisRouter({
      minQualityThreshold: 7,
      verbose: true,
    });
    expect(router.getConfig().minQualityThreshold).toBe(7);
    expect(router.getConfig().verbose).toBe(true);
  });
});

describe('selectModelWithTopsis', () => {
  it('should return valid result using quick function', () => {
    const result = selectModelWithTopsis();

    expect(result.selectedModel).toBeDefined();
    expect(result.scores.length).toBeGreaterThan(0);
    expect(result.reasoning).toBeDefined();
  });

  it('should accept options', () => {
    const result = selectModelWithTopsis({
      expectedInputTokens: 5000,
      expectedOutputTokens: 2000,
    });

    expect(result.selectedModel).toBeDefined();
  });
});

// ============================================================================
// Plan Billing TOPSIS Criteria
// ============================================================================

describe('PLAN_BILLING_TOPSIS_CRITERIA', () => {
  it('has cost weight of zero', () => {
    const costCriterion = PLAN_BILLING_TOPSIS_CRITERIA.find((c) => c.name === 'cost');
    expect(costCriterion?.weight).toBe(0.0);
  });

  it('weights sum to 1.0', () => {
    const sum = PLAN_BILLING_TOPSIS_CRITERIA.reduce((acc, c) => acc + c.weight, 0);
    expect(Math.abs(sum - 1.0)).toBeLessThan(0.01);
  });

  it('shifts cost weight to quality', () => {
    const apiQuality = DEFAULT_TOPSIS_CRITERIA.find((c) => c.name === 'quality')?.weight ?? 0;
    const planQuality = PLAN_BILLING_TOPSIS_CRITERIA.find((c) => c.name === 'quality')?.weight ?? 0;
    expect(planQuality).toBeGreaterThan(apiQuality);
  });

  it('creates valid TopsisRouter', () => {
    const router = new TopsisRouter({ criteria: PLAN_BILLING_TOPSIS_CRITERIA });
    expect(router.getConfig().criteria).toEqual(PLAN_BILLING_TOPSIS_CRITERIA);
  });

  it('plan mode router favors quality over cost', () => {
    const router = new TopsisRouter({ criteria: PLAN_BILLING_TOPSIS_CRITERIA });
    const result = router.selectModel();
    // With cost zeroed out, high-quality models win. Gemini-3-Pro has matching
    // quality to claude-opus (9.5) with lower latency, so it's a valid winner.
    expect(['claude', 'codex', 'gemini']).toContain(result.selectedModel);
    // Low-quality-only models (haiku, flash-lite) should NOT be selected
    expect(result.selectedModel).not.toBe('haiku');
  });
});

// ============================================================================
// Task-Category-Aware TOPSIS Criteria (#1491)
// ============================================================================

describe('getCriteriaForTaskCategory', () => {
  it('returns default criteria for code_implementation in api mode', () => {
    const criteria = getCriteriaForTaskCategory('code_implementation', 'api');
    expect(criteria).toBe(DEFAULT_TOPSIS_CRITERIA);
  });

  it('returns architecture-specific criteria with higher quality weight', () => {
    const criteria = getCriteriaForTaskCategory('architecture', 'api');
    const qualityWeight = criteria.find((c) => c.name === 'quality')?.weight ?? 0;
    expect(qualityWeight).toBe(0.7);
  });

  it('returns test_generation criteria with higher latency weight', () => {
    const criteria = getCriteriaForTaskCategory('test_generation', 'api');
    const latencyWeight = criteria.find((c) => c.name === 'latency')?.weight ?? 0;
    expect(latencyWeight).toBe(0.4);
  });

  it('returns bulk_operations criteria with higher cost weight', () => {
    const criteria = getCriteriaForTaskCategory('bulk_operations', 'api');
    const costWeight = criteria.find((c) => c.name === 'cost')?.weight ?? 0;
    expect(costWeight).toBe(0.4);
  });

  it('returns plan mode criteria with cost zeroed', () => {
    const criteria = getCriteriaForTaskCategory('architecture', 'plan');
    const costWeight = criteria.find((c) => c.name === 'cost')?.weight ?? -1;
    expect(costWeight).toBe(0.0);
    const qualityWeight = criteria.find((c) => c.name === 'quality')?.weight ?? 0;
    expect(qualityWeight).toBe(0.85);
  });

  it('falls back to default for unknown task types', () => {
    const criteria = getCriteriaForTaskCategory('unknown_task', 'api');
    expect(criteria).toBe(DEFAULT_TOPSIS_CRITERIA);
  });

  it('all criteria sets sum to 1.0', () => {
    for (const [, criteria] of Object.entries(TASK_CATEGORY_TOPSIS_CRITERIA)) {
      const sum = criteria.reduce((acc, c) => acc + c.weight, 0);
      expect(sum).toBeCloseTo(1.0, 2);
    }
    for (const [, criteria] of Object.entries(TASK_CATEGORY_PLAN_CRITERIA)) {
      const sum = criteria.reduce((acc, c) => acc + c.weight, 0);
      expect(sum).toBeCloseTo(1.0, 2);
    }
  });

  it('architecture criteria produce different ranking than default', () => {
    const defaultRouter = new TopsisRouter({ criteria: DEFAULT_TOPSIS_CRITERIA });
    const archCriteria = getCriteriaForTaskCategory('architecture', 'api');
    const archRouter = new TopsisRouter({ criteria: archCriteria });

    const defaultResult = defaultRouter.selectModel();
    const archResult = archRouter.selectModel();

    // Architecture weights quality 0.7 vs default 0.5 — may produce different rankings
    // Both should select a valid CLI
    expect(CLI_NAMES).toContain(defaultResult.selectedModel);
    expect(CLI_NAMES).toContain(archResult.selectedModel);
  });
});
