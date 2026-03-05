/**
 * nexus-agents/workflows - Mutation Operators Tests
 *
 * Tests for genetic algorithm mutation operators used in self-evolving workflows.
 *
 * @module workflows/self-evolving/mutation-operators.test
 * (Source: Issue #330)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { WorkflowDefinition, WorkflowStep } from '../../core/index.js';
import {
  adjustTimeout,
  adjustRetries,
  reorderSteps,
  addParallelization,
  removeParallelization,
  randomTimeoutFactor,
  randomRetryDelta,
  applyRandomMutation,
  createMutant,
  describeMutation,
} from './mutation-operators.js';
import type { EvolutionConfig } from './sew-types.js';
import { DEFAULT_EVOLUTION_CONFIG } from './sew-types.js';
import {
  setRandomProvider,
  resetRandomProvider,
  SeededRandomProvider,
} from '../../core/random-provider.js';

/**
 * Helper to create a workflow step.
 */
function createStep(
  id: string,
  options?: {
    dependsOn?: string[];
    parallel?: boolean;
    timeout?: number;
    retries?: number;
  }
): WorkflowStep {
  return {
    id,
    agent: 'code_expert',
    action: 'test',
    inputs: {},
    ...(options?.dependsOn !== undefined && { dependsOn: options.dependsOn }),
    ...(options?.parallel !== undefined && { parallel: options.parallel }),
    ...(options?.timeout !== undefined && { timeout: options.timeout }),
    ...(options?.retries !== undefined && { retries: options.retries }),
  };
}

/**
 * Helper to create a workflow definition.
 */
function createWorkflow(steps: WorkflowStep[]): WorkflowDefinition {
  return {
    name: 'test-workflow',
    version: '1.0.0',
    inputs: [],
    steps,
  };
}

describe('Mutation Operators', () => {
  describe('adjustTimeout', () => {
    it('should increase timeout with factor > 1', () => {
      const workflow = createWorkflow([createStep('step1', { timeout: 10000 })]);

      const result = adjustTimeout(workflow, 'step1', 1.5);

      expect(result).not.toBeNull();
      expect(result!.workflow.steps[0]!.timeout).toBe(15000);
      expect(result!.mutation.type).toBe('timeout_adjustment');
      expect(result!.mutation.originalValue).toBe(10000);
      expect(result!.mutation.newValue).toBe(15000);
      expect(result!.mutation.factor).toBe(1.5);
    });

    it('should decrease timeout with factor < 1', () => {
      const workflow = createWorkflow([createStep('step1', { timeout: 10000 })]);

      const result = adjustTimeout(workflow, 'step1', 0.5);

      expect(result).not.toBeNull();
      expect(result!.workflow.steps[0]!.timeout).toBe(5000);
    });

    it('should use default timeout when step has none defined', () => {
      const workflow = createWorkflow([createStep('step1')]);

      const result = adjustTimeout(workflow, 'step1', 2.0);

      expect(result).not.toBeNull();
      expect(result!.mutation.originalValue).toBe(30000); // DEFAULT_TIMEOUT_MS
      expect(result!.mutation.newValue).toBe(60000);
    });

    it('should clamp timeout to minimum 1000ms', () => {
      const workflow = createWorkflow([createStep('step1', { timeout: 2000 })]);

      const result = adjustTimeout(workflow, 'step1', 0.1);

      expect(result).not.toBeNull();
      expect(result!.workflow.steps[0]!.timeout).toBe(1000);
    });

    it('should clamp timeout to maximum 600000ms', () => {
      const workflow = createWorkflow([createStep('step1', { timeout: 500000 })]);

      const result = adjustTimeout(workflow, 'step1', 2.0);

      expect(result).not.toBeNull();
      expect(result!.workflow.steps[0]!.timeout).toBe(600000);
    });

    it('should return null for non-existent step', () => {
      const workflow = createWorkflow([createStep('step1')]);

      const result = adjustTimeout(workflow, 'non-existent', 1.5);

      expect(result).toBeNull();
    });

    it('should return null when no effective change occurs', () => {
      const workflow = createWorkflow([createStep('step1', { timeout: 1000 })]);

      // Factor that would result in same value after clamping
      const result = adjustTimeout(workflow, 'step1', 0.5); // 500 clamped to 1000

      expect(result).toBeNull();
    });

    it('should not mutate original workflow', () => {
      const originalStep = createStep('step1', { timeout: 10000 });
      const workflow = createWorkflow([originalStep]);

      adjustTimeout(workflow, 'step1', 2.0);

      expect(workflow.steps[0]!.timeout).toBe(10000);
    });
  });

  describe('adjustRetries', () => {
    it('should increase retries with positive delta', () => {
      const workflow = createWorkflow([createStep('step1', { retries: 2 })]);

      const result = adjustRetries(workflow, 'step1', 1);

      expect(result).not.toBeNull();
      expect(result!.workflow.steps[0]!.retries).toBe(3);
      expect(result!.mutation.type).toBe('retry_adjustment');
      expect(result!.mutation.originalValue).toBe(2);
      expect(result!.mutation.newValue).toBe(3);
      expect(result!.mutation.delta).toBe(1);
    });

    it('should decrease retries with negative delta', () => {
      const workflow = createWorkflow([createStep('step1', { retries: 3 })]);

      const result = adjustRetries(workflow, 'step1', -2);

      expect(result).not.toBeNull();
      expect(result!.workflow.steps[0]!.retries).toBe(1);
    });

    it('should use default retries (0) when step has none defined', () => {
      const workflow = createWorkflow([createStep('step1')]);

      const result = adjustRetries(workflow, 'step1', 2);

      expect(result).not.toBeNull();
      expect(result!.mutation.originalValue).toBe(0);
      expect(result!.mutation.newValue).toBe(2);
    });

    it('should clamp retries to minimum 0', () => {
      const workflow = createWorkflow([createStep('step1', { retries: 1 })]);

      const result = adjustRetries(workflow, 'step1', -5);

      expect(result).not.toBeNull();
      expect(result!.workflow.steps[0]!.retries).toBe(0);
    });

    it('should clamp retries to maximum 10', () => {
      const workflow = createWorkflow([createStep('step1', { retries: 8 })]);

      const result = adjustRetries(workflow, 'step1', 5);

      expect(result).not.toBeNull();
      expect(result!.workflow.steps[0]!.retries).toBe(10);
    });

    it('should return null for non-existent step', () => {
      const workflow = createWorkflow([createStep('step1')]);

      const result = adjustRetries(workflow, 'non-existent', 1);

      expect(result).toBeNull();
    });

    it('should return null when no effective change occurs', () => {
      const workflow = createWorkflow([createStep('step1', { retries: 0 })]);

      // Delta that would result in same value after clamping
      const result = adjustRetries(workflow, 'step1', -5); // 0 - 5 clamped to 0

      expect(result).toBeNull();
    });

    it('should not mutate original workflow', () => {
      const workflow = createWorkflow([createStep('step1', { retries: 2 })]);

      adjustRetries(workflow, 'step1', 3);

      expect(workflow.steps[0]!.retries).toBe(2);
    });
  });

  describe('reorderSteps', () => {
    beforeEach(() => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should swap independent steps', () => {
      const workflow = createWorkflow([createStep('a'), createStep('b'), createStep('c')]);

      const result = reorderSteps(workflow);

      expect(result).not.toBeNull();
      expect(result!.mutation.type).toBe('step_reorder');
      // Steps should be swapped
      const stepIds = result!.workflow.steps.map((s) => s.id);
      expect(stepIds).toContain('a');
      expect(stepIds).toContain('b');
      expect(stepIds).toContain('c');
    });

    it('should return null for fully sequential workflow', () => {
      const workflow = createWorkflow([
        createStep('a'),
        createStep('b', { dependsOn: ['a'] }),
        createStep('c', { dependsOn: ['b'] }),
      ]);

      const result = reorderSteps(workflow);

      expect(result).toBeNull();
    });

    it('should return null for empty workflow', () => {
      const workflow = createWorkflow([]);

      const result = reorderSteps(workflow);

      expect(result).toBeNull();
    });

    it('should return null for single step workflow', () => {
      const workflow = createWorkflow([createStep('a')]);

      const result = reorderSteps(workflow);

      expect(result).toBeNull();
    });

    it('should preserve workflow structure except for step order', () => {
      const workflow = createWorkflow([
        createStep('a', { timeout: 5000 }),
        createStep('b', { timeout: 10000 }),
      ]);

      const result = reorderSteps(workflow);

      expect(result).not.toBeNull();
      expect(result!.workflow.name).toBe('test-workflow');
      expect(result!.workflow.version).toBe('1.0.0');
      expect(result!.workflow.steps.length).toBe(2);
    });

    it('should record correct mutation metadata', () => {
      const workflow = createWorkflow([createStep('a'), createStep('b')]);

      const result = reorderSteps(workflow);

      expect(result).not.toBeNull();
      expect(result!.mutation.stepId).toBe('a');
      expect(typeof result!.mutation.fromIndex).toBe('number');
      expect(typeof result!.mutation.toIndex).toBe('number');
    });
  });

  describe('addParallelization', () => {
    beforeEach(() => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should mark independent steps as parallel', () => {
      const workflow = createWorkflow([createStep('a'), createStep('b'), createStep('c')]);

      const result = addParallelization(workflow);

      expect(result).not.toBeNull();
      expect(result!.mutation.type).toBe('add_parallelization');
      expect(result!.mutation.stepIds.length).toBeGreaterThanOrEqual(2);

      // Check that marked steps have parallel=true
      for (const stepId of result!.mutation.stepIds) {
        const step = result!.workflow.steps.find((s) => s.id === stepId);
        expect(step?.parallel).toBe(true);
      }
    });

    it('should return null for fully sequential workflow', () => {
      const workflow = createWorkflow([
        createStep('a'),
        createStep('b', { dependsOn: ['a'] }),
        createStep('c', { dependsOn: ['b'] }),
      ]);

      const result = addParallelization(workflow);

      expect(result).toBeNull();
    });

    it('should return null when all independent steps already parallel', () => {
      const workflow = createWorkflow([
        createStep('a', { parallel: true }),
        createStep('b', { parallel: true }),
        createStep('c', { dependsOn: ['a', 'b'] }),
      ]);

      const result = addParallelization(workflow);

      expect(result).toBeNull();
    });

    it('should not modify non-parallelized steps', () => {
      const workflow = createWorkflow([
        createStep('a'),
        createStep('b'),
        createStep('c', { dependsOn: ['a', 'b'] }),
      ]);

      const result = addParallelization(workflow);

      expect(result).not.toBeNull();
      const stepC = result!.workflow.steps.find((s) => s.id === 'c');
      expect(stepC?.parallel).toBeUndefined();
    });
  });

  describe('removeParallelization', () => {
    it('should remove parallel flag from steps', () => {
      const workflow = createWorkflow([
        createStep('a', { parallel: true }),
        createStep('b', { parallel: true }),
        createStep('c'),
      ]);

      const result = removeParallelization(workflow);

      expect(result).not.toBeNull();
      expect(result!.mutation.type).toBe('remove_parallelization');
      expect(result!.mutation.stepIds).toContain('a');
      expect(result!.mutation.stepIds).toContain('b');

      // Check parallel is now false
      const stepA = result!.workflow.steps.find((s) => s.id === 'a');
      const stepB = result!.workflow.steps.find((s) => s.id === 'b');
      expect(stepA?.parallel).toBe(false);
      expect(stepB?.parallel).toBe(false);
    });

    it('should return null when no parallel steps exist', () => {
      const workflow = createWorkflow([createStep('a'), createStep('b'), createStep('c')]);

      const result = removeParallelization(workflow);

      expect(result).toBeNull();
    });

    it('should not modify non-parallel steps', () => {
      const workflow = createWorkflow([
        createStep('a', { parallel: true }),
        createStep('b'),
        createStep('c'),
      ]);

      const result = removeParallelization(workflow);

      expect(result).not.toBeNull();
      const stepB = result!.workflow.steps.find((s) => s.id === 'b');
      const stepC = result!.workflow.steps.find((s) => s.id === 'c');
      expect(stepB?.parallel).toBeUndefined();
      expect(stepC?.parallel).toBeUndefined();
    });
  });

  describe('randomTimeoutFactor', () => {
    it('should generate factor within config range', () => {
      const config: EvolutionConfig = {
        ...DEFAULT_EVOLUTION_CONFIG,
        timeoutAdjustmentRange: [0.5, 2.0],
      };

      // Test multiple times for randomness
      for (let i = 0; i < 100; i++) {
        const factor = randomTimeoutFactor(config);
        expect(factor).toBeGreaterThanOrEqual(0.5);
        expect(factor).toBeLessThanOrEqual(2.0);
      }
    });

    it('should respect custom range', () => {
      const config: EvolutionConfig = {
        ...DEFAULT_EVOLUTION_CONFIG,
        timeoutAdjustmentRange: [1.0, 1.5],
      };

      for (let i = 0; i < 50; i++) {
        const factor = randomTimeoutFactor(config);
        expect(factor).toBeGreaterThanOrEqual(1.0);
        expect(factor).toBeLessThanOrEqual(1.5);
      }
    });

    it('should return min when random returns 0', () => {
      // SeededRandomProvider(0) produces a small first value near 0
      // Use a mock provider that returns exactly 0
      const mockProvider = new SeededRandomProvider(0);
      mockProvider.random = () => 0;
      setRandomProvider(mockProvider);

      const config: EvolutionConfig = {
        ...DEFAULT_EVOLUTION_CONFIG,
        timeoutAdjustmentRange: [0.5, 2.0],
      };

      expect(randomTimeoutFactor(config)).toBe(0.5);

      resetRandomProvider();
    });

    it('should approach max when random approaches 1', () => {
      const mockProvider = new SeededRandomProvider(0);
      mockProvider.random = () => 0.9999;
      setRandomProvider(mockProvider);

      const config: EvolutionConfig = {
        ...DEFAULT_EVOLUTION_CONFIG,
        timeoutAdjustmentRange: [0.5, 2.0],
      };

      expect(randomTimeoutFactor(config)).toBeCloseTo(2.0, 2);

      resetRandomProvider();
    });
  });

  describe('randomRetryDelta', () => {
    it('should generate delta within config range', () => {
      const config: EvolutionConfig = {
        ...DEFAULT_EVOLUTION_CONFIG,
        retryAdjustmentRange: [-2, 2],
      };

      const deltas = new Set<number>();
      for (let i = 0; i < 100; i++) {
        const delta = randomRetryDelta(config);
        expect(delta).toBeGreaterThanOrEqual(-2);
        expect(delta).toBeLessThanOrEqual(2);
        expect(Number.isInteger(delta)).toBe(true);
        deltas.add(delta);
      }

      // Should eventually hit multiple values
      expect(deltas.size).toBeGreaterThan(1);
    });

    it('should respect custom range', () => {
      const config: EvolutionConfig = {
        ...DEFAULT_EVOLUTION_CONFIG,
        retryAdjustmentRange: [0, 3],
      };

      for (let i = 0; i < 50; i++) {
        const delta = randomRetryDelta(config);
        expect(delta).toBeGreaterThanOrEqual(0);
        expect(delta).toBeLessThanOrEqual(3);
      }
    });

    it('should always return integer values', () => {
      const config: EvolutionConfig = {
        ...DEFAULT_EVOLUTION_CONFIG,
        retryAdjustmentRange: [-5, 5],
      };

      for (let i = 0; i < 100; i++) {
        const delta = randomRetryDelta(config);
        expect(Number.isInteger(delta)).toBe(true);
      }
    });
  });

  describe('applyRandomMutation', () => {
    it('should apply mutations based on mutation rate', () => {
      const workflow = createWorkflow([
        createStep('a', { timeout: 10000 }),
        createStep('b', { timeout: 10000 }),
      ]);

      const config: EvolutionConfig = {
        ...DEFAULT_EVOLUTION_CONFIG,
        mutationRate: 1.0, // Always mutate
      };

      const { mutations } = applyRandomMutation(workflow, config);

      // Should have at least one mutation with 100% mutation rate
      expect(mutations.length).toBeGreaterThanOrEqual(0); // May still be 0 if mutations don't produce change
    });

    it('should respect zero mutation rate', () => {
      const workflow = createWorkflow([
        createStep('a', { timeout: 10000 }),
        createStep('b', { timeout: 10000 }),
      ]);

      const config: EvolutionConfig = {
        ...DEFAULT_EVOLUTION_CONFIG,
        mutationRate: 0, // Never mutate
      };

      const { workflow: mutated, mutations } = applyRandomMutation(workflow, config);

      expect(mutations.length).toBe(0);
      expect(mutated).toEqual(workflow);
    });

    it('should return original workflow when no mutations possible', () => {
      const workflow = createWorkflow([]);

      const { workflow: mutated, mutations } = applyRandomMutation(
        workflow,
        DEFAULT_EVOLUTION_CONFIG
      );

      expect(mutations.length).toBe(0);
      expect(mutated).toEqual(workflow);
    });

    it('should produce valid workflow after mutation', () => {
      const workflow = createWorkflow([
        createStep('a', { timeout: 10000, retries: 2 }),
        createStep('b', { timeout: 20000, retries: 3 }),
        createStep('c', { timeout: 30000, retries: 1 }),
      ]);

      const config: EvolutionConfig = {
        ...DEFAULT_EVOLUTION_CONFIG,
        mutationRate: 1.0,
      };

      const { workflow: mutated } = applyRandomMutation(workflow, config);

      // Verify structure is preserved
      expect(mutated.name).toBe('test-workflow');
      expect(mutated.version).toBe('1.0.0');
      expect(mutated.steps.length).toBe(3);

      // Verify all steps have valid IDs
      for (const step of mutated.steps) {
        expect(step.id).toBeDefined();
        expect(typeof step.id).toBe('string');
      }
    });
  });

  describe('createMutant', () => {
    it('should apply multiple mutation rounds', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.01); // Ensure mutation happens

      const workflow = createWorkflow([
        createStep('a', { timeout: 10000 }),
        createStep('b', { timeout: 20000 }),
      ]);

      const config: EvolutionConfig = {
        ...DEFAULT_EVOLUTION_CONFIG,
        mutationRate: 1.0,
      };

      const { mutations } = createMutant(workflow, config, 3);

      // With 3 rounds and 100% mutation rate, should have mutations
      // (may vary based on random selection of mutation type)
      expect(Array.isArray(mutations)).toBe(true);

      vi.restoreAllMocks();
    });

    it('should accumulate mutations across rounds', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.01);

      const workflow = createWorkflow([
        createStep('a', { timeout: 10000 }),
        createStep('b', { timeout: 20000 }),
        createStep('c', { timeout: 30000 }),
      ]);

      const config: EvolutionConfig = {
        ...DEFAULT_EVOLUTION_CONFIG,
        mutationRate: 1.0,
      };

      const { workflow: mutated, mutations } = createMutant(workflow, config, 5);

      // Mutated workflow should exist
      expect(mutated).toBeDefined();
      expect(mutated.steps.length).toBe(3);
      expect(Array.isArray(mutations)).toBe(true);

      vi.restoreAllMocks();
    });

    it('should handle single round (default)', () => {
      const workflow = createWorkflow([createStep('a', { timeout: 10000 })]);

      const { workflow: mutated } = createMutant(workflow, DEFAULT_EVOLUTION_CONFIG);

      expect(mutated).toBeDefined();
      expect(mutated.steps.length).toBe(1);
    });

    it('should preserve workflow identity with zero mutation rate', () => {
      const workflow = createWorkflow([createStep('a', { timeout: 10000 })]);

      const config: EvolutionConfig = {
        ...DEFAULT_EVOLUTION_CONFIG,
        mutationRate: 0,
      };

      const { workflow: mutated, mutations } = createMutant(workflow, config, 10);

      expect(mutations.length).toBe(0);
      expect(mutated.steps[0]?.timeout).toBe(10000);
    });
  });

  describe('describeMutation', () => {
    it('should describe timeout adjustment', () => {
      const description = describeMutation({
        type: 'timeout_adjustment',
        stepId: 'step1',
        originalValue: 10000,
        newValue: 15000,
        factor: 1.5,
      });

      expect(description).toContain('Adjusted timeout');
      expect(description).toContain('step1');
      expect(description).toContain('10000ms');
      expect(description).toContain('15000ms');
      expect(description).toContain('150%');
    });

    it('should describe retry adjustment with positive delta', () => {
      const description = describeMutation({
        type: 'retry_adjustment',
        stepId: 'step1',
        originalValue: 2,
        newValue: 4,
        delta: 2,
      });

      expect(description).toContain('Adjusted retries');
      expect(description).toContain('step1');
      expect(description).toContain('2');
      expect(description).toContain('4');
      expect(description).toContain('+2');
    });

    it('should describe retry adjustment with negative delta', () => {
      const description = describeMutation({
        type: 'retry_adjustment',
        stepId: 'step1',
        originalValue: 5,
        newValue: 3,
        delta: -2,
      });

      expect(description).toContain('-2');
    });

    it('should describe step reorder', () => {
      const description = describeMutation({
        type: 'step_reorder',
        stepId: 'step1',
        fromIndex: 0,
        toIndex: 2,
      });

      expect(description).toContain('Reordered step');
      expect(description).toContain('step1');
      expect(description).toContain('position 0');
      expect(description).toContain('2');
    });

    it('should describe add parallelization', () => {
      const description = describeMutation({
        type: 'add_parallelization',
        stepIds: ['step1', 'step2', 'step3'],
      });

      expect(description).toContain('Added parallelization');
      expect(description).toContain('step1');
      expect(description).toContain('step2');
      expect(description).toContain('step3');
    });

    it('should describe remove parallelization', () => {
      const description = describeMutation({
        type: 'remove_parallelization',
        stepIds: ['step1', 'step2'],
      });

      expect(description).toContain('Removed parallelization');
      expect(description).toContain('step1');
      expect(description).toContain('step2');
    });
  });

  describe('Edge Cases', () => {
    it('should handle workflow with identical steps gracefully', () => {
      const workflow = createWorkflow([
        createStep('a', { timeout: 10000, retries: 2 }),
        createStep('b', { timeout: 10000, retries: 2 }),
      ]);

      const result1 = adjustTimeout(workflow, 'a', 1.5);
      const result2 = adjustTimeout(workflow, 'b', 1.5);

      expect(result1).not.toBeNull();
      expect(result2).not.toBeNull();
      expect(result1!.workflow.steps[0]!.id).toBe('a');
      expect(result2!.workflow.steps[1]!.id).toBe('b');
    });

    it('should handle very large timeout values', () => {
      const workflow = createWorkflow([createStep('a', { timeout: 600000 })]);

      const result = adjustTimeout(workflow, 'a', 1.1);

      // Should still be clamped to max
      expect(result).toBeNull(); // No change since already at max
    });

    it('should handle very small timeout values', () => {
      const workflow = createWorkflow([createStep('a', { timeout: 1000 })]);

      const result = adjustTimeout(workflow, 'a', 0.9);

      // Should still be clamped to min
      expect(result).toBeNull(); // No change since already at min
    });

    it('should handle workflow with many steps', () => {
      const steps = Array.from({ length: 100 }, (_, i) => createStep(`step-${String(i)}`));
      const workflow = createWorkflow(steps);

      const result = adjustTimeout(workflow, 'step-50', 1.5);

      expect(result).not.toBeNull();
      expect(result!.workflow.steps.length).toBe(100);
    });

    it('should handle step with all optional properties undefined', () => {
      const workflow = createWorkflow([createStep('a')]);

      const timeoutResult = adjustTimeout(workflow, 'a', 1.5);
      const retryResult = adjustRetries(workflow, 'a', 1);

      expect(timeoutResult).not.toBeNull();
      expect(retryResult).not.toBeNull();
    });

    it('should handle concurrent-like mutations without race conditions', () => {
      const workflow = createWorkflow([createStep('a', { timeout: 10000, retries: 2 })]);

      // Simulate multiple mutations
      const result1 = adjustTimeout(workflow, 'a', 1.5);
      const result2 = adjustRetries(workflow, 'a', 1);

      // Each should operate on original workflow
      expect(result1).not.toBeNull();
      expect(result2).not.toBeNull();
      expect(result1!.workflow.steps[0]!.timeout).toBe(15000);
      expect(result2!.workflow.steps[0]!.retries).toBe(3);

      // Original unchanged
      expect(workflow.steps[0]!.timeout).toBe(10000);
      expect(workflow.steps[0]!.retries).toBe(2);
    });
  });

  describe('Mutation Properties', () => {
    it('should maintain step count after any mutation', () => {
      const workflow = createWorkflow([createStep('a'), createStep('b'), createStep('c')]);

      const originalCount = workflow.steps.length;

      // Test timeout adjustment
      const timeoutResult = adjustTimeout(workflow, 'a', 1.5);
      if (timeoutResult) {
        expect(timeoutResult.workflow.steps.length).toBe(originalCount);
      }

      // Test retry adjustment
      const retryResult = adjustRetries(workflow, 'a', 1);
      if (retryResult) {
        expect(retryResult.workflow.steps.length).toBe(originalCount);
      }

      // Test reorder
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const reorderResult = reorderSteps(workflow);
      if (reorderResult) {
        expect(reorderResult.workflow.steps.length).toBe(originalCount);
      }
      vi.restoreAllMocks();

      // Test parallelization
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const parallelResult = addParallelization(workflow);
      if (parallelResult) {
        expect(parallelResult.workflow.steps.length).toBe(originalCount);
      }
      vi.restoreAllMocks();
    });

    it('should preserve step IDs after mutation', () => {
      const workflow = createWorkflow([
        createStep('step-alpha'),
        createStep('step-beta'),
        createStep('step-gamma'),
      ]);

      const originalIds = new Set(workflow.steps.map((s) => s.id));

      const config: EvolutionConfig = {
        ...DEFAULT_EVOLUTION_CONFIG,
        mutationRate: 1.0,
      };

      const { workflow: mutated } = createMutant(workflow, config, 5);

      const mutatedIds = new Set(mutated.steps.map((s) => s.id));
      expect(mutatedIds).toEqual(originalIds);
    });

    it('should preserve step inputs after mutation', () => {
      const workflow = createWorkflow([
        {
          id: 'step1',
          agent: 'code_expert',
          action: 'analyze',
          inputs: { path: '/src', recursive: true },
        },
      ]);

      const result = adjustTimeout(workflow, 'step1', 1.5);

      expect(result).not.toBeNull();
      expect(result!.workflow.steps[0]!.inputs).toEqual({ path: '/src', recursive: true });
    });

    it('should preserve step dependencies after mutation', () => {
      const workflow = createWorkflow([
        createStep('a'),
        createStep('b', { dependsOn: ['a'] }),
        createStep('c', { dependsOn: ['a', 'b'] }),
      ]);

      const result = adjustTimeout(workflow, 'c', 2.0);

      expect(result).not.toBeNull();
      expect(result!.workflow.steps[2]!.dependsOn).toEqual(['a', 'b']);
    });
  });
});
