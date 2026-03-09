/**
 * Tests for router-scoring.ts
 *
 * Covers scoring functions for capability-based task router:
 * - CAPABILITY_MATRIX integrity
 * - SCORING_WEIGHTS summation
 * - Each scoring function's early returns and normal scoring
 * - Reason pushing logic (above/below thresholds)
 */

import { describe, it, expect } from 'vitest';
import type { TaskProfile } from '../core/task-analysis/task-profile-adapter.js';
import type { CapabilityProfile, CliName } from './types.js';
import {
  CAPABILITY_MATRIX,
  SCORING_WEIGHTS,
  SCORING_THRESHOLDS,
  getTypePreference,
  scoreTaskType,
  scoreReasoning,
  scoreCodeGeneration,
  scoreContextWindow,
  scoreCostEfficiency,
  scoreSpeed,
} from './router-scoring.js';

describe('router-scoring', () => {
  describe('CAPABILITY_MATRIX', () => {
    const cliNames: CliName[] = ['claude', 'gemini', 'codex'];
    const taskTypes = [
      'architecture',
      'large_codebase',
      'code_implementation',
      'test_generation',
      'bulk_operations',
      'code_review',
      'security_review',
      'documentation',
      'general',
    ] as const;

    it('has entries for all 9 task types with CLI preferences each', () => {
      expect(Object.keys(CAPABILITY_MATRIX)).toHaveLength(9);
      taskTypes.forEach((taskType) => {
        expect(CAPABILITY_MATRIX[taskType]).toBeDefined();
        cliNames.forEach((cli) => {
          const pref = CAPABILITY_MATRIX[taskType][cli];
          expect(pref).toBeGreaterThanOrEqual(0);
          expect(pref).toBeLessThanOrEqual(1);
        });
      });
    });

    it('assigns optimal CLI per task type', () => {
      expect(CAPABILITY_MATRIX.architecture.gemini).toBe(1.0);
      expect(CAPABILITY_MATRIX.large_codebase.gemini).toBe(1.0);
      expect(CAPABILITY_MATRIX.code_implementation.codex).toBe(1.0);
      expect(CAPABILITY_MATRIX.test_generation.codex).toBe(1.0);
      expect(CAPABILITY_MATRIX.bulk_operations.gemini).toBe(1.0);
      expect(CAPABILITY_MATRIX.code_review.claude).toBe(1.0);
      expect(CAPABILITY_MATRIX.documentation.claude).toBe(0.9);
    });
  });

  describe('SCORING_WEIGHTS', () => {
    it('sums to 1.0', () => {
      const sum =
        SCORING_WEIGHTS.taskType +
        SCORING_WEIGHTS.reasoning +
        SCORING_WEIGHTS.codeGeneration +
        SCORING_WEIGHTS.contextWindow +
        SCORING_WEIGHTS.cost +
        SCORING_WEIGHTS.speed;
      expect(sum).toBe(1.0);
    });

    it('has expected individual weights', () => {
      expect(SCORING_WEIGHTS.taskType).toBe(0.3);
      expect(SCORING_WEIGHTS.reasoning).toBe(0.25);
      expect(SCORING_WEIGHTS.codeGeneration).toBe(0.15);
      expect(SCORING_WEIGHTS.contextWindow).toBe(0.1);
      expect(SCORING_WEIGHTS.cost).toBe(0.1);
      expect(SCORING_WEIGHTS.speed).toBe(0.1);
    });
  });

  describe('SCORING_THRESHOLDS', () => {
    it('has expected threshold values', () => {
      expect(SCORING_THRESHOLDS.highComplexity).toBe(7);
      expect(SCORING_THRESHOLDS.highReasoning).toBe(9);
      expect(SCORING_THRESHOLDS.highCodeGen).toBe(9);
      expect(SCORING_THRESHOLDS.largeContext).toBe(100_000);
      expect(SCORING_THRESHOLDS.veryLargeContext).toBe(500_000);
      expect(SCORING_THRESHOLDS.highCost).toBe(8);
      expect(SCORING_THRESHOLDS.highSpeed).toBe(8);
    });
  });

  describe('getTypePreference', () => {
    it('returns correct preference from matrix', () => {
      expect(getTypePreference('architecture', 'gemini')).toBe(1.0);
      expect(getTypePreference('large_codebase', 'gemini')).toBe(1.0);
      expect(getTypePreference('code_implementation', 'codex')).toBe(1.0);
    });

    it('returns lower preferences for non-optimal CLIs', () => {
      expect(getTypePreference('architecture', 'codex')).toBe(0.5);
      expect(getTypePreference('test_generation', 'claude')).toBe(0.5);
    });
  });

  describe('scoreTaskType', () => {
    const baseProfile: TaskProfile = {
      taskType: 'architecture',
      reasoningComplexity: 8,
      codeGeneration: false,
      contextRequired: 50_000,
      budgetSensitive: false,
      parallelizable: false,
      multimodal: false,
    };

    it('multiplies preference by weight and pushes reason when > 0.5', () => {
      const reasons: string[] = [];
      // architecture → gemini=1.0 (primary), claude=0.7 (secondary)
      const score = scoreTaskType(baseProfile, 'gemini', reasons);
      expect(score).toBe(1.0 * SCORING_WEIGHTS.taskType);
      expect(reasons).toContain('Preferred for architecture');
    });

    it('does not push reason when preference ≤ 0.5', () => {
      const reasons: string[] = [];
      const score = scoreTaskType(baseProfile, 'codex', reasons);
      expect(score).toBe(0.5 * SCORING_WEIGHTS.taskType);
      expect(reasons).toHaveLength(0);
    });
  });

  describe('scoreReasoning', () => {
    const highProfile: TaskProfile = {
      taskType: 'architecture',
      reasoningComplexity: 9,
      codeGeneration: false,
      contextRequired: 50_000,
      budgetSensitive: false,
      parallelizable: false,
      multimodal: false,
    };
    const lowProfile: TaskProfile = { ...highProfile, reasoningComplexity: 6 };
    const capabilities: CapabilityProfile = {
      reasoning: 10,
      codeGeneration: 8,
      contextWindow: 200_000,
      cost: 7,
      speed: 6,
    };

    it('returns 0 when complexity < highComplexity threshold', () => {
      const reasons: string[] = [];
      const score = scoreReasoning(lowProfile, capabilities, reasons);
      expect(score).toBe(0);
      expect(reasons).toHaveLength(0);
    });

    it('pushes reason when reasoning ≥ highReasoning threshold', () => {
      const reasons: string[] = [];
      const score = scoreReasoning(highProfile, capabilities, reasons);
      expect(score).toBe((10 / 10) * SCORING_WEIGHTS.reasoning);
      expect(reasons).toContain('High reasoning capability');
    });

    it('does not push reason when reasoning < highReasoning', () => {
      const lowerCaps: CapabilityProfile = { ...capabilities, reasoning: 8 };
      const reasons: string[] = [];
      const score = scoreReasoning(highProfile, lowerCaps, reasons);
      expect(score).toBe((8 / 10) * SCORING_WEIGHTS.reasoning);
      expect(reasons).toHaveLength(0);
    });
  });

  describe('scoreCodeGeneration', () => {
    const codeProfile: TaskProfile = {
      taskType: 'code_implementation',
      reasoningComplexity: 6,
      codeGeneration: true,
      contextRequired: 50_000,
      budgetSensitive: false,
      parallelizable: false,
      multimodal: false,
    };
    const docsProfile: TaskProfile = { ...codeProfile, codeGeneration: false };
    const capabilities: CapabilityProfile = {
      reasoning: 8,
      codeGeneration: 10,
      contextWindow: 200_000,
      cost: 7,
      speed: 6,
    };

    it('returns 0 when codeGeneration is false', () => {
      const reasons: string[] = [];
      const score = scoreCodeGeneration(docsProfile, capabilities, reasons);
      expect(score).toBe(0);
      expect(reasons).toHaveLength(0);
    });

    it('pushes reason when codeGeneration ≥ highCodeGen', () => {
      const reasons: string[] = [];
      const score = scoreCodeGeneration(codeProfile, capabilities, reasons);
      expect(score).toBe((10 / 10) * SCORING_WEIGHTS.codeGeneration);
      expect(reasons).toContain('Excellent code generation');
    });

    it('does not push reason when codeGeneration < highCodeGen', () => {
      const lowerCaps: CapabilityProfile = { ...capabilities, codeGeneration: 8 };
      const reasons: string[] = [];
      const score = scoreCodeGeneration(codeProfile, lowerCaps, reasons);
      expect(score).toBe((8 / 10) * SCORING_WEIGHTS.codeGeneration);
      expect(reasons).toHaveLength(0);
    });
  });

  describe('scoreContextWindow', () => {
    const largeProfile: TaskProfile = {
      taskType: 'large_codebase',
      reasoningComplexity: 6,
      codeGeneration: false,
      contextRequired: 400_000,
      budgetSensitive: false,
      parallelizable: false,
      multimodal: false,
    };
    const smallProfile: TaskProfile = { ...largeProfile, contextRequired: 80_000 };
    const capabilities: CapabilityProfile = {
      reasoning: 8,
      codeGeneration: 9,
      contextWindow: 600_000,
      cost: 7,
      speed: 6,
    };

    it('returns 0 when contextRequired ≤ largeContext', () => {
      const reasons: string[] = [];
      const score = scoreContextWindow(smallProfile, capabilities, reasons);
      expect(score).toBe(0);
      expect(reasons).toHaveLength(0);
    });

    it('pushes reason when contextWindow ≥ veryLargeContext', () => {
      const reasons: string[] = [];
      const score = scoreContextWindow(largeProfile, capabilities, reasons);
      const contextRatio = Math.min(600_000 / 400_000, 2);
      expect(score).toBe((contextRatio - 1) * SCORING_WEIGHTS.contextWindow);
      expect(reasons).toContain('Large context window');
    });

    it('does not push reason when contextWindow < veryLargeContext', () => {
      const smallerCaps: CapabilityProfile = { ...capabilities, contextWindow: 300_000 };
      const reasons: string[] = [];
      const score = scoreContextWindow(largeProfile, smallerCaps, reasons);
      const contextRatio = Math.min(300_000 / 400_000, 2);
      expect(score).toBe((contextRatio - 1) * SCORING_WEIGHTS.contextWindow);
      expect(reasons).toHaveLength(0);
    });

    it('caps contextRatio at 2', () => {
      const hugeCaps: CapabilityProfile = { ...capabilities, contextWindow: 2_000_000 };
      const hugeProfile: TaskProfile = { ...largeProfile, contextRequired: 150_000 };
      const reasons: string[] = [];
      const score = scoreContextWindow(hugeProfile, hugeCaps, reasons);
      expect(score).toBe((2 - 1) * SCORING_WEIGHTS.contextWindow);
    });
  });

  describe('scoreCostEfficiency', () => {
    const budgetProfile: TaskProfile = {
      taskType: 'bulk_operations',
      reasoningComplexity: 4,
      codeGeneration: false,
      contextRequired: 50_000,
      budgetSensitive: true,
      parallelizable: true,
      multimodal: false,
    };
    const nonBudgetProfile: TaskProfile = { ...budgetProfile, budgetSensitive: false };
    const capabilities: CapabilityProfile = {
      reasoning: 8,
      codeGeneration: 9,
      contextWindow: 200_000,
      cost: 9,
      speed: 6,
    };

    it('returns 0 when not budgetSensitive and not preferCostEfficient', () => {
      const reasons: string[] = [];
      const score = scoreCostEfficiency(nonBudgetProfile, capabilities, reasons, false);
      expect(score).toBe(0);
      expect(reasons).toHaveLength(0);
    });

    it('pushes reason when cost ≥ highCost threshold', () => {
      const reasons: string[] = [];
      const score = scoreCostEfficiency(budgetProfile, capabilities, reasons, false);
      expect(score).toBe((9 / 10) * SCORING_WEIGHTS.cost);
      expect(reasons).toContain('Cost efficient');
    });

    it('does not push reason when cost < highCost', () => {
      const lowerCaps: CapabilityProfile = { ...capabilities, cost: 7 };
      const reasons: string[] = [];
      const score = scoreCostEfficiency(budgetProfile, lowerCaps, reasons, false);
      expect(score).toBe((7 / 10) * SCORING_WEIGHTS.cost);
      expect(reasons).toHaveLength(0);
    });

    it('scores when preferCostEfficient is true', () => {
      const reasons: string[] = [];
      const score = scoreCostEfficiency(nonBudgetProfile, capabilities, reasons, true);
      expect(score).toBe((9 / 10) * SCORING_WEIGHTS.cost);
    });
  });

  describe('scoreSpeed', () => {
    const parallelProfile: TaskProfile = {
      taskType: 'bulk_operations',
      reasoningComplexity: 4,
      codeGeneration: false,
      contextRequired: 50_000,
      budgetSensitive: true,
      parallelizable: true,
      multimodal: false,
    };
    const nonParallelProfile: TaskProfile = { ...parallelProfile, parallelizable: false };
    const capabilities: CapabilityProfile = {
      reasoning: 8,
      codeGeneration: 9,
      contextWindow: 200_000,
      cost: 7,
      speed: 9,
    };

    it('returns 0 when not parallelizable', () => {
      const reasons: string[] = [];
      const score = scoreSpeed(nonParallelProfile, capabilities, reasons);
      expect(score).toBe(0);
      expect(reasons).toHaveLength(0);
    });

    it('pushes reason when speed ≥ highSpeed threshold', () => {
      const reasons: string[] = [];
      const score = scoreSpeed(parallelProfile, capabilities, reasons);
      expect(score).toBe((9 / 10) * SCORING_WEIGHTS.speed);
      expect(reasons).toContain('Fast execution');
    });

    it('does not push reason when speed < highSpeed', () => {
      const lowerCaps: CapabilityProfile = { ...capabilities, speed: 7 };
      const reasons: string[] = [];
      const score = scoreSpeed(parallelProfile, lowerCaps, reasons);
      expect(score).toBe((7 / 10) * SCORING_WEIGHTS.speed);
      expect(reasons).toHaveLength(0);
    });
  });
});
