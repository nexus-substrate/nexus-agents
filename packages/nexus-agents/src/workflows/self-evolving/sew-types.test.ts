/**
 * nexus-agents/workflows - SEW Types Tests
 *
 * Tests for Self-Evolving Workflows type definitions and utilities.
 *
 * @module workflows/self-evolving/sew-types.test
 * (Source: Issue #330)
 */

import { describe, it, expect } from 'vitest';
import type { WorkflowStep } from '../../core/index.js';
import {
  parseVersion,
  formatVersion,
  incrementVersion,
  computeFitnessScore,
  stepsAreDependent,
  findReorderableSteps,
  findParallelizableSteps,
  DEFAULT_FITNESS_METRICS,
  DEFAULT_FITNESS_WEIGHTS,
  DEFAULT_EVOLUTION_CONFIG,
  EvolutionConfigSchema,
} from './sew-types.js';
import type { FitnessMetrics, SemanticVersion, FitnessWeights } from './sew-types.js';

describe('SEW Types', () => {
  describe('parseVersion', () => {
    it('should parse full semantic version', () => {
      const version = parseVersion('1.2.3');
      expect(version).toEqual({ major: 1, minor: 2, patch: 3 });
    });

    it('should handle missing minor and patch', () => {
      const version = parseVersion('2');
      expect(version).toEqual({ major: 2, minor: 0, patch: 0 });
    });

    it('should handle missing patch only', () => {
      const version = parseVersion('1.5');
      expect(version).toEqual({ major: 1, minor: 5, patch: 0 });
    });

    it('should handle empty string with defaults', () => {
      const version = parseVersion('');
      expect(version).toEqual({ major: 1, minor: 0, patch: 0 });
    });
  });

  describe('formatVersion', () => {
    it('should format semantic version to string', () => {
      const version: SemanticVersion = { major: 2, minor: 1, patch: 5 };
      expect(formatVersion(version)).toBe('2.1.5');
    });

    it('should handle zeros', () => {
      const version: SemanticVersion = { major: 1, minor: 0, patch: 0 };
      expect(formatVersion(version)).toBe('1.0.0');
    });
  });

  describe('incrementVersion', () => {
    it('should increment major version and reset others', () => {
      const version: SemanticVersion = { major: 1, minor: 2, patch: 3 };
      const incremented = incrementVersion(version, 'major');
      expect(incremented).toEqual({ major: 2, minor: 0, patch: 0 });
    });

    it('should increment minor version and reset patch', () => {
      const version: SemanticVersion = { major: 1, minor: 2, patch: 3 };
      const incremented = incrementVersion(version, 'minor');
      expect(incremented).toEqual({ major: 1, minor: 3, patch: 0 });
    });

    it('should increment patch version only', () => {
      const version: SemanticVersion = { major: 1, minor: 2, patch: 3 };
      const incremented = incrementVersion(version, 'patch');
      expect(incremented).toEqual({ major: 1, minor: 2, patch: 4 });
    });
  });

  describe('computeFitnessScore', () => {
    it('should compute fitness from default metrics', () => {
      const score = computeFitnessScore(DEFAULT_FITNESS_METRICS);
      // Default metrics have 0 success rate, so score should be low
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should compute high score for good metrics', () => {
      const metrics: FitnessMetrics = {
        successRate: 1.0,
        avgDurationMs: 100,
        avgCost: 10,
        executionCount: 10,
        durationVariance: 100,
        retryRate: 0,
      };
      const score = computeFitnessScore(metrics);
      expect(score).toBeGreaterThan(0.8);
    });

    it('should compute low score for poor metrics', () => {
      const metrics: FitnessMetrics = {
        successRate: 0.2,
        avgDurationMs: 100000,
        avgCost: 10000,
        executionCount: 10,
        durationVariance: 100000000,
        retryRate: 0.8,
      };
      const score = computeFitnessScore(metrics);
      expect(score).toBeLessThan(0.3);
    });

    it('should apply custom weights', () => {
      const metrics: FitnessMetrics = {
        successRate: 1.0,
        avgDurationMs: 1000000, // Very slow
        avgCost: 0,
        executionCount: 10,
        durationVariance: 0,
        retryRate: 0,
      };

      // Default weights emphasize success rate
      const defaultScore = computeFitnessScore(metrics);

      // Custom weights emphasize duration
      const customWeights: FitnessWeights = {
        successRate: 0.1,
        duration: 0.6,
        cost: 0.1,
        stability: 0.1,
        retryRate: 0.1,
      };
      const customScore = computeFitnessScore(metrics, customWeights);

      expect(customScore).toBeLessThan(defaultScore);
    });

    it('should handle zero duration and cost gracefully', () => {
      const metrics: FitnessMetrics = {
        successRate: 1.0,
        avgDurationMs: 0,
        avgCost: 0,
        executionCount: 1,
        durationVariance: 0,
        retryRate: 0,
      };
      const score = computeFitnessScore(metrics);
      expect(score).toBeCloseTo(1.0, 1);
    });
  });

  describe('stepsAreDependent', () => {
    const createStep = (id: string, dependsOn?: string[]): WorkflowStep => {
      const step: WorkflowStep = {
        id,
        agent: 'code_expert',
        action: 'test',
        inputs: {},
      };
      if (dependsOn !== undefined) step.dependsOn = dependsOn;
      return step;
    };

    it('should detect direct dependency', () => {
      const stepA = createStep('a');
      const stepB = createStep('b', ['a']);
      const allSteps = [stepA, stepB];

      expect(stepsAreDependent(stepA, stepB, allSteps)).toBe(true);
      expect(stepsAreDependent(stepB, stepA, allSteps)).toBe(true);
    });

    it('should detect transitive dependency', () => {
      const stepA = createStep('a');
      const stepB = createStep('b', ['a']);
      const stepC = createStep('c', ['b']);
      const allSteps = [stepA, stepB, stepC];

      expect(stepsAreDependent(stepA, stepC, allSteps)).toBe(true);
    });

    it('should detect independent steps', () => {
      const stepA = createStep('a');
      const stepB = createStep('b');
      const allSteps = [stepA, stepB];

      expect(stepsAreDependent(stepA, stepB, allSteps)).toBe(false);
    });

    it('should handle parallel independent branches', () => {
      const root = createStep('root');
      const branch1 = createStep('branch1', ['root']);
      const branch2 = createStep('branch2', ['root']);
      const allSteps = [root, branch1, branch2];

      // branch1 and branch2 are siblings, not dependent on each other
      expect(stepsAreDependent(branch1, branch2, allSteps)).toBe(false);
    });
  });

  describe('findReorderableSteps', () => {
    const createStep = (id: string, dependsOn?: string[]): WorkflowStep => {
      const step: WorkflowStep = {
        id,
        agent: 'code_expert',
        action: 'test',
        inputs: {},
      };
      if (dependsOn !== undefined) step.dependsOn = dependsOn;
      return step;
    };

    it('should find independent step pairs', () => {
      const steps = [createStep('a'), createStep('b'), createStep('c')];
      const pairs = findReorderableSteps(steps);

      expect(pairs.length).toBe(3); // (a,b), (a,c), (b,c)
    });

    it('should exclude dependent pairs', () => {
      const steps = [createStep('a'), createStep('b', ['a']), createStep('c')];
      const pairs = findReorderableSteps(steps);

      // Only (a,c) and (b,c) if b depends on a
      // Actually, b depends on a, so (a,b) is not reorderable
      // (a,c) and (b,c) are independent
      expect(pairs.length).toBe(2);
    });

    it('should return empty for fully sequential workflow', () => {
      const steps = [createStep('a'), createStep('b', ['a']), createStep('c', ['b'])];
      const pairs = findReorderableSteps(steps);

      expect(pairs.length).toBe(0);
    });

    it('should handle single step', () => {
      const steps = [createStep('a')];
      const pairs = findReorderableSteps(steps);

      expect(pairs.length).toBe(0);
    });
  });

  describe('findParallelizableSteps', () => {
    const createStep = (id: string, dependsOn?: string[], parallel?: boolean): WorkflowStep => {
      const step: WorkflowStep = {
        id,
        agent: 'code_expert',
        action: 'test',
        inputs: {},
      };
      if (dependsOn !== undefined) step.dependsOn = dependsOn;
      if (parallel !== undefined) step.parallel = parallel;
      return step;
    };

    it('should find groups of parallelizable steps', () => {
      const steps = [createStep('a'), createStep('b'), createStep('c'), createStep('d')];
      const groups = findParallelizableSteps(steps);

      // All steps are independent, should form one or more groups
      expect(groups.length).toBeGreaterThan(0);
      expect(groups[0]?.length).toBeGreaterThanOrEqual(2);
    });

    it('should exclude already parallel steps', () => {
      const steps = [
        createStep('a', undefined, true),
        createStep('b', undefined, true),
        createStep('c'),
        createStep('d'),
      ];
      const groups = findParallelizableSteps(steps);

      // a and b are already parallel, should find c and d
      const allStepIds = groups.flat().map((s) => s.id);
      expect(allStepIds).not.toContain('a');
      expect(allStepIds).not.toContain('b');
    });

    it('should not group dependent steps', () => {
      const steps = [createStep('a'), createStep('b', ['a']), createStep('c', ['b'])];
      const groups = findParallelizableSteps(steps);

      // All steps are dependent, no parallelizable groups
      expect(groups.length).toBe(0);
    });

    it('should find multiple independent groups', () => {
      const steps = [
        createStep('root'),
        createStep('a1', ['root']),
        createStep('a2', ['root']),
        createStep('b1', ['root']),
        createStep('b2', ['root']),
      ];
      const groups = findParallelizableSteps(steps);

      // a1, a2, b1, b2 can all be parallelized (siblings)
      expect(groups.length).toBeGreaterThan(0);
    });
  });

  describe('DEFAULT constants', () => {
    it('should have valid DEFAULT_FITNESS_METRICS', () => {
      expect(DEFAULT_FITNESS_METRICS.successRate).toBe(0);
      expect(DEFAULT_FITNESS_METRICS.avgDurationMs).toBe(0);
      expect(DEFAULT_FITNESS_METRICS.executionCount).toBe(0);
    });

    it('should have weights summing to 1', () => {
      const sum =
        DEFAULT_FITNESS_WEIGHTS.successRate +
        DEFAULT_FITNESS_WEIGHTS.duration +
        DEFAULT_FITNESS_WEIGHTS.cost +
        DEFAULT_FITNESS_WEIGHTS.stability +
        DEFAULT_FITNESS_WEIGHTS.retryRate;
      expect(sum).toBeCloseTo(1.0, 5);
    });

    it('should have valid DEFAULT_EVOLUTION_CONFIG', () => {
      expect(DEFAULT_EVOLUTION_CONFIG.mutationRate).toBeGreaterThan(0);
      expect(DEFAULT_EVOLUTION_CONFIG.mutationRate).toBeLessThanOrEqual(1);
      expect(DEFAULT_EVOLUTION_CONFIG.populationSize).toBeGreaterThanOrEqual(2);
      expect(DEFAULT_EVOLUTION_CONFIG.generations).toBeGreaterThanOrEqual(1);
    });
  });

  describe('EvolutionConfigSchema', () => {
    it('should validate valid config', () => {
      const config = {
        mutationRate: 0.5,
        populationSize: 5,
        generations: 10,
        minExecutionsForEval: 3,
        promotionThreshold: 0.8,
        regressionThreshold: 0.15,
        selectionPressure: 2.0,
        crossoverRate: 0.4,
        elitismCount: 2,
        timeoutAdjustmentRange: [0.5, 2.0] as [number, number],
        retryAdjustmentRange: [-1, 1] as [number, number],
      };

      const result = EvolutionConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should reject invalid mutation rate', () => {
      const config = { mutationRate: 1.5 };
      const result = EvolutionConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject invalid population size', () => {
      const config = { populationSize: 1 }; // Min is 2
      const result = EvolutionConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should apply defaults for missing fields', () => {
      const result = EvolutionConfigSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mutationRate).toBe(0.3);
        expect(result.data.populationSize).toBe(5);
      }
    });
  });
});
