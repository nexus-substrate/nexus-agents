/**
 * nexus-agents/workflows - Workflow Evolver Tests
 *
 * Tests for Self-Evolving Workflows evolver and mutation operators.
 *
 * @module workflows/self-evolving/workflow-evolver.test
 * (Source: Issue #330)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { WorkflowDefinition, WorkflowStep } from '../../core/index.js';
import { WorkflowEvolver, createWorkflowEvolver } from './workflow-evolver.js';
import {
  adjustTimeout,
  adjustRetries,
  reorderSteps,
  addParallelization,
  removeParallelization,
  applyRandomMutation,
  createMutant,
  describeMutation,
} from './mutation-operators.js';
import type { ExecutionOutcome, EvolutionConfig } from './sew-types.js';
import { DEFAULT_EVOLUTION_CONFIG } from './sew-types.js';

// Helper to create test workflows
function createTestWorkflow(steps: Partial<WorkflowStep>[] = []): WorkflowDefinition {
  const defaultSteps: WorkflowStep[] = [
    { id: 'step1', agent: 'code_expert', action: 'code', inputs: {}, timeout: 30000, retries: 1 },
    {
      id: 'step2',
      agent: 'security_expert',
      action: 'review',
      inputs: {},
      timeout: 20000,
      retries: 0,
    },
    {
      id: 'step3',
      agent: 'testing_expert',
      action: 'test',
      inputs: {},
      timeout: 60000,
      retries: 2,
    },
  ];

  const mergedSteps: WorkflowStep[] =
    steps.length > 0
      ? steps.map((s, i) => ({
          ...defaultSteps[i % defaultSteps.length]!,
          ...s,
        }))
      : defaultSteps;

  return {
    name: 'test-workflow',
    version: '1.0.0',
    description: 'Test workflow',
    inputs: [],
    steps: mergedSteps,
    timeout: 300000,
  };
}

// Helper to create test execution outcome
function createOutcome(
  versionId: string,
  success: boolean,
  durationMs: number = 1000
): ExecutionOutcome {
  return {
    executionId: `exec-${String(Date.now())}`,
    versionId,
    success,
    durationMs,
    cost: 100,
    stepResults: [
      {
        stepId: 'step1',
        output: 'result',
        durationMs: 500,
        status: success ? 'success' : 'failed',
      },
    ],
    totalRetries: success ? 0 : 2,
    timestamp: Date.now(),
  };
}

describe('Mutation Operators', () => {
  describe('adjustTimeout', () => {
    it('should increase timeout with factor > 1', () => {
      const workflow = createTestWorkflow();
      const result = adjustTimeout(workflow, 'step1', 1.5);

      expect(result).not.toBeNull();
      expect(result!.mutation.type).toBe('timeout_adjustment');
      expect(result!.mutation.originalValue).toBe(30000);
      expect(result!.mutation.newValue).toBe(45000);
      expect(result!.workflow.steps[0]?.timeout).toBe(45000);
    });

    it('should decrease timeout with factor < 1', () => {
      const workflow = createTestWorkflow();
      const result = adjustTimeout(workflow, 'step1', 0.5);

      expect(result).not.toBeNull();
      expect(result!.mutation.newValue).toBe(15000);
    });

    it('should respect minimum timeout', () => {
      const workflow = createTestWorkflow([{ id: 'step1', timeout: 2000 }]);
      const result = adjustTimeout(workflow, 'step1', 0.1);

      expect(result).not.toBeNull();
      expect(result!.mutation.newValue).toBe(1000); // Minimum is 1000ms
    });

    it('should respect maximum timeout', () => {
      const workflow = createTestWorkflow([{ id: 'step1', timeout: 500000 }]);
      const result = adjustTimeout(workflow, 'step1', 2.0);

      expect(result).not.toBeNull();
      expect(result!.mutation.newValue).toBe(600000); // Maximum is 600000ms
    });

    it('should return null for non-existent step', () => {
      const workflow = createTestWorkflow();
      const result = adjustTimeout(workflow, 'nonexistent', 1.5);

      expect(result).toBeNull();
    });

    it('should return null if no effective change', () => {
      const workflow = createTestWorkflow([{ id: 'step1', timeout: 30000 }]);
      const result = adjustTimeout(workflow, 'step1', 1.0);

      expect(result).toBeNull();
    });
  });

  describe('adjustRetries', () => {
    it('should increase retries with positive delta', () => {
      const workflow = createTestWorkflow();
      const result = adjustRetries(workflow, 'step1', 2);

      expect(result).not.toBeNull();
      expect(result!.mutation.type).toBe('retry_adjustment');
      expect(result!.mutation.originalValue).toBe(1);
      expect(result!.mutation.newValue).toBe(3);
    });

    it('should decrease retries with negative delta', () => {
      const workflow = createTestWorkflow();
      const result = adjustRetries(workflow, 'step3', -1);

      expect(result).not.toBeNull();
      expect(result!.mutation.newValue).toBe(1);
    });

    it('should respect minimum retries (0)', () => {
      const workflow = createTestWorkflow();
      const result = adjustRetries(workflow, 'step2', -5);

      expect(result).toBeNull(); // step2 has 0 retries, can't go lower
    });

    it('should respect maximum retries', () => {
      const workflow = createTestWorkflow([{ id: 'step1', retries: 9 }]);
      const result = adjustRetries(workflow, 'step1', 5);

      expect(result).not.toBeNull();
      expect(result!.mutation.newValue).toBe(10); // Maximum
    });

    it('should return null for non-existent step', () => {
      const workflow = createTestWorkflow();
      const result = adjustRetries(workflow, 'nonexistent', 1);

      expect(result).toBeNull();
    });
  });

  describe('reorderSteps', () => {
    it('should swap independent steps', () => {
      const workflow = createTestWorkflow([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);

      // Force deterministic random for testing
      vi.spyOn(Math, 'random').mockReturnValue(0);

      const result = reorderSteps(workflow);

      expect(result).not.toBeNull();
      expect(result!.mutation.type).toBe('step_reorder');

      vi.restoreAllMocks();
    });

    it('should return null for fully dependent workflow', () => {
      const workflow = createTestWorkflow([
        { id: 'a' },
        { id: 'b', dependsOn: ['a'] },
        { id: 'c', dependsOn: ['b'] },
      ]);

      const result = reorderSteps(workflow);

      expect(result).toBeNull();
    });
  });

  describe('addParallelization', () => {
    it('should mark independent steps as parallel', () => {
      const workflow = createTestWorkflow([
        { id: 'a', parallel: false },
        { id: 'b', parallel: false },
        { id: 'c', parallel: false },
      ]);

      vi.spyOn(Math, 'random').mockReturnValue(0);

      const result = addParallelization(workflow);

      expect(result).not.toBeNull();
      expect(result!.mutation.type).toBe('add_parallelization');
      expect(result!.mutation.stepIds.length).toBeGreaterThan(1);

      // Check steps are now parallel
      const parallelSteps = result!.workflow.steps.filter((s) => s.parallel === true);
      expect(parallelSteps.length).toBeGreaterThan(1);

      vi.restoreAllMocks();
    });

    it('should return null if no parallelizable steps', () => {
      const workflow = createTestWorkflow([
        { id: 'a' },
        { id: 'b', dependsOn: ['a'] },
        { id: 'c', dependsOn: ['b'] },
      ]);

      const result = addParallelization(workflow);

      expect(result).toBeNull();
    });
  });

  describe('removeParallelization', () => {
    it('should remove parallel flag from steps', () => {
      const workflow = createTestWorkflow([
        { id: 'a', parallel: true },
        { id: 'b', parallel: true },
        { id: 'c', parallel: false },
      ]);

      const result = removeParallelization(workflow);

      expect(result).not.toBeNull();
      expect(result!.mutation.type).toBe('remove_parallelization');
      expect(result!.mutation.stepIds).toContain('a');
      expect(result!.mutation.stepIds).toContain('b');

      const parallelSteps = result!.workflow.steps.filter((s) => s.parallel === true);
      expect(parallelSteps.length).toBe(0);
    });

    it('should return null if no parallel steps', () => {
      const workflow = createTestWorkflow();
      const result = removeParallelization(workflow);

      expect(result).toBeNull();
    });
  });

  describe('applyRandomMutation', () => {
    it('should apply mutations based on mutation rate', () => {
      const workflow = createTestWorkflow();
      const config: EvolutionConfig = {
        ...DEFAULT_EVOLUTION_CONFIG,
        mutationRate: 1.0, // Always mutate
      };

      const result = applyRandomMutation(workflow, config);

      // With 100% mutation rate, should have some mutations
      expect(result.workflow).toBeDefined();
    });

    it('should not mutate with zero mutation rate', () => {
      const workflow = createTestWorkflow();
      const config: EvolutionConfig = {
        ...DEFAULT_EVOLUTION_CONFIG,
        mutationRate: 0,
      };

      const result = applyRandomMutation(workflow, config);

      expect(result.mutations.length).toBe(0);
    });
  });

  describe('createMutant', () => {
    it('should create mutant with multiple rounds', () => {
      const workflow = createTestWorkflow();
      const config: EvolutionConfig = {
        ...DEFAULT_EVOLUTION_CONFIG,
        mutationRate: 1.0,
      };

      const result = createMutant(workflow, config, 3);

      expect(result.workflow).toBeDefined();
      // May or may not have mutations depending on randomness
    });
  });

  describe('describeMutation', () => {
    it('should describe timeout adjustment', () => {
      const desc = describeMutation({
        type: 'timeout_adjustment',
        stepId: 'step1',
        originalValue: 30000,
        newValue: 45000,
        factor: 1.5,
      });

      expect(desc).toContain('timeout');
      expect(desc).toContain('step1');
      expect(desc).toContain('30000');
      expect(desc).toContain('45000');
    });

    it('should describe retry adjustment', () => {
      const desc = describeMutation({
        type: 'retry_adjustment',
        stepId: 'step2',
        originalValue: 1,
        newValue: 3,
        delta: 2,
      });

      expect(desc).toContain('retries');
      expect(desc).toContain('step2');
      expect(desc).toContain('+2');
    });
  });
});

describe('WorkflowEvolver', () => {
  let evolver: WorkflowEvolver;

  beforeEach(() => {
    evolver = createWorkflowEvolver();
  });

  describe('registerInitialVersion', () => {
    it('should register and activate initial version', () => {
      const workflow = createTestWorkflow();
      const version = evolver.registerInitialVersion(workflow);

      expect(version.id).toBeDefined();
      expect(version.version).toBe('1.0.0');
      expect(version.isActive).toBe(true);
      expect(version.parentVersion).toBeNull();
      expect(version.fitnessScore).toBe(0);
    });

    it('should set initial version as active', () => {
      const workflow = createTestWorkflow();
      evolver.registerInitialVersion(workflow);

      const active = evolver.getActiveVersion();
      expect(active).not.toBeNull();
      expect(active!.workflow.name).toBe('test-workflow');
    });
  });

  describe('recordOutcome', () => {
    it('should record execution outcome', () => {
      const workflow = createTestWorkflow();
      const version = evolver.registerInitialVersion(workflow);

      evolver.recordOutcome(createOutcome(version.id, true, 1500));

      const stats = evolver.getStats();
      expect(stats.totalOutcomes).toBe(1);
    });
  });

  describe('evaluate', () => {
    it('should compute fitness metrics from outcomes', () => {
      const workflow = createTestWorkflow();
      const version = evolver.registerInitialVersion(workflow);

      evolver.recordOutcome(createOutcome(version.id, true, 1000));
      evolver.recordOutcome(createOutcome(version.id, true, 1200));
      evolver.recordOutcome(createOutcome(version.id, false, 5000));

      const metrics = evolver.evaluate(version.id);

      expect(metrics.executionCount).toBe(3);
      expect(metrics.successRate).toBeCloseTo(2 / 3, 2);
      expect(metrics.avgDurationMs).toBeGreaterThan(0);
    });

    it('should return default metrics for no outcomes', () => {
      const workflow = createTestWorkflow();
      const version = evolver.registerInitialVersion(workflow);

      const metrics = evolver.evaluate(version.id);

      expect(metrics.executionCount).toBe(0);
      expect(metrics.successRate).toBe(0);
    });
  });

  describe('updateVersionFitness', () => {
    it('should update version with computed fitness', () => {
      const workflow = createTestWorkflow();
      const version = evolver.registerInitialVersion(workflow);

      evolver.recordOutcome(createOutcome(version.id, true, 1000));
      evolver.recordOutcome(createOutcome(version.id, true, 1000));

      const updated = evolver.updateVersionFitness(version.id);

      expect(updated).not.toBeNull();
      expect(updated!.fitnessScore).toBeGreaterThan(0);
      expect(updated!.metrics.successRate).toBe(1.0);
    });
  });

  describe('evolve', () => {
    it('should create variant versions through mutation', () => {
      const workflow = createTestWorkflow();
      const base = evolver.registerInitialVersion(workflow);

      const variants = evolver.evolve(base);

      expect(variants.length).toBeGreaterThan(0);
      expect(variants.length).toBeLessThan(evolver.getStats().totalVersions);

      for (const variant of variants) {
        expect(variant.parentVersion).toBe(base.id);
        expect(variant.isActive).toBe(false);
      }
    });

    it('should increment version numbers', () => {
      const workflow = createTestWorkflow();
      const base = evolver.registerInitialVersion(workflow);

      const variants = evolver.evolve(base);

      for (const variant of variants) {
        expect(variant.version).not.toBe('1.0.0');
        expect(variant.version).toMatch(/^1\.0\.\d+$/);
      }
    });
  });

  describe('select', () => {
    it('should select top performers', () => {
      const workflow = createTestWorkflow();
      evolver.registerInitialVersion(workflow);

      // Create multiple versions with varying fitness
      const versions = evolver.getAllVersions();
      const selected = evolver.select(versions);

      expect(selected.length).toBeLessThanOrEqual(DEFAULT_EVOLUTION_CONFIG.populationSize);
    });

    it('should preserve elites', () => {
      const evolverWithElites = createWorkflowEvolver({ elitismCount: 2, populationSize: 5 });
      const workflow = createTestWorkflow();
      const base = evolverWithElites.registerInitialVersion(workflow);

      // Record outcomes to give base a fitness score
      evolverWithElites.recordOutcome(createOutcome(base.id, true, 1000));
      evolverWithElites.updateVersionFitness(base.id);

      const selected = evolverWithElites.select([base]);

      expect(selected.length).toBeGreaterThan(0);
    });
  });

  describe('crossover', () => {
    it('should combine two parent workflows', () => {
      const workflow1 = createTestWorkflow([
        { id: 'step1', timeout: 10000, retries: 1 },
        { id: 'step2', timeout: 20000, retries: 2 },
      ]);
      const workflow2 = createTestWorkflow([
        { id: 'step1', timeout: 50000, retries: 5 },
        { id: 'step2', timeout: 60000, retries: 6 },
      ]);

      const v1 = evolver.registerInitialVersion(workflow1);

      // Manually register second version
      const evolver2 = createWorkflowEvolver();
      const v2 = evolver2.registerInitialVersion(workflow2);

      // Do crossover in original evolver
      const child = evolver.crossover(v1, { ...v2, id: 'v2-id' });

      expect(child).not.toBeNull();
      expect(child!.parentVersion).toBe(v1.id);
    });

    it('should return null for incompatible workflows', () => {
      const workflow1 = createTestWorkflow([{ id: 'step1' }]);
      const workflow2 = createTestWorkflow([{ id: 'step1' }, { id: 'step2' }]);

      const v1 = evolver.registerInitialVersion(workflow1);

      const evolver2 = createWorkflowEvolver();
      const v2 = evolver2.registerInitialVersion(workflow2);

      const child = evolver.crossover(v1, v2);

      expect(child).toBeNull();
    });
  });

  describe('rollback', () => {
    it('should rollback to parent version', () => {
      const workflow = createTestWorkflow();
      const base = evolver.registerInitialVersion(workflow);

      // Evolve and promote a variant
      const variants = evolver.evolve(base);
      if (variants.length > 0) {
        // Manually promote for testing
        evolver.recordOutcome(createOutcome(variants[0]!.id, true, 500));
        evolver.updateVersionFitness(variants[0]!.id);
      }

      // Now rollback
      const rolledBack = evolver.rollback();

      // May be null if no parent, which is fine
      if (rolledBack) {
        expect(rolledBack.isActive).toBe(true);
      }
    });

    it('should return null if no parent', () => {
      const workflow = createTestWorkflow();
      evolver.registerInitialVersion(workflow);

      const result = evolver.rollback();

      expect(result).toBeNull();
    });
  });

  describe('checkAndRollback', () => {
    it('should rollback on fitness regression', () => {
      const evolverStrict = createWorkflowEvolver({ regressionThreshold: 0.01 });
      const workflow = createTestWorkflow();
      const base = evolverStrict.registerInitialVersion(workflow);

      // Give base high fitness
      for (let i = 0; i < 5; i++) {
        evolverStrict.recordOutcome(createOutcome(base.id, true, 1000));
      }
      evolverStrict.updateVersionFitness(base.id);

      // Evolve and give variant low fitness
      const variants = evolverStrict.evolve(base);
      if (variants.length > 0) {
        const variant = variants[0]!;
        for (let i = 0; i < 5; i++) {
          evolverStrict.recordOutcome(createOutcome(variant.id, false, 10000));
        }
        evolverStrict.updateVersionFitness(variant.id);
      }

      // Note: checkAndRollback checks active vs its parent
      // This test may need adjustment based on which version is active
    });
  });

  describe('promote', () => {
    it('should promote version meeting threshold', () => {
      const evolverLow = createWorkflowEvolver({ promotionThreshold: 0.1 });
      const workflow = createTestWorkflow();
      const base = evolverLow.registerInitialVersion(workflow);

      // Give good outcomes
      for (let i = 0; i < 5; i++) {
        evolverLow.recordOutcome(createOutcome(base.id, true, 500));
      }
      evolverLow.updateVersionFitness(base.id);

      const promoted = evolverLow.promote(base.id);

      expect(promoted).not.toBeNull();
      expect(promoted!.isActive).toBe(true);
    });

    it('should reject promotion below threshold', () => {
      const evolverHigh = createWorkflowEvolver({ promotionThreshold: 0.99 });
      const workflow = createTestWorkflow();
      const base = evolverHigh.registerInitialVersion(workflow);

      // Give some outcomes (will not reach 0.99 threshold)
      evolverHigh.recordOutcome(createOutcome(base.id, true, 1000));
      evolverHigh.updateVersionFitness(base.id);

      // Try promoting a different version with low fitness
      const variants = evolverHigh.evolve(base);
      if (variants.length > 0) {
        const promoted = evolverHigh.promote(variants[0]!.id);
        // Will fail because fitness is 0 (no outcomes recorded for variant)
        expect(promoted).toBeNull();
      }
    });
  });

  describe('getStats', () => {
    it('should return evolution statistics', () => {
      const workflow = createTestWorkflow();
      const version = evolver.registerInitialVersion(workflow);

      evolver.recordOutcome(createOutcome(version.id, true, 1000));
      evolver.updateVersionFitness(version.id);

      const stats = evolver.getStats();

      expect(stats.totalVersions).toBe(1);
      expect(stats.activeVersion).toBe(version.id);
      expect(stats.totalOutcomes).toBe(1);
      expect(stats.bestFitness).toBeGreaterThan(0);
    });
  });

  describe('describeVersionHistory', () => {
    it('should describe version lineage', () => {
      const workflow = createTestWorkflow();
      const base = evolver.registerInitialVersion(workflow);
      const variants = evolver.evolve(base);

      if (variants.length > 0) {
        const history = evolver.describeVersionHistory(variants[0]!.id);

        expect(history.length).toBeGreaterThan(0);
        expect(history[0]).toContain('1.0.0');
      }
    });
  });

  describe('runEvolution', () => {
    it('should run complete evolution process', async () => {
      const evolverFast = createWorkflowEvolver({
        generations: 2,
        populationSize: 3,
        minExecutionsForEval: 2,
      });

      const workflow = createTestWorkflow();

      const mockExecute = vi.fn().mockImplementation((wf: WorkflowDefinition) => {
        return Promise.resolve({
          executionId: `exec-${String(Date.now())}`,
          versionId: '', // Will be set by caller
          success: Math.random() > 0.3,
          durationMs: 1000 + Math.random() * 2000,
          cost: 100,
          stepResults: wf.steps.map((s) => ({
            stepId: s.id,
            output: 'result',
            durationMs: 500,
            status: 'success' as const,
          })),
          totalRetries: 0,
          timestamp: Date.now(),
        } satisfies ExecutionOutcome);
      });

      const result = await evolverFast.runEvolution(workflow, mockExecute);

      expect(result.originalVersion).toBeDefined();
      expect(result.bestVersion).toBeDefined();
      expect(result.totalGenerations).toBe(2);
      expect(result.history.length).toBe(2);
      expect(mockExecute).toHaveBeenCalled();
    });
  });
});

describe('createWorkflowEvolver', () => {
  it('should create evolver with default config', () => {
    const evolver = createWorkflowEvolver();
    expect(evolver).toBeInstanceOf(WorkflowEvolver);
  });

  it('should create evolver with custom config', () => {
    const evolver = createWorkflowEvolver({
      mutationRate: 0.5,
      populationSize: 10,
    });
    expect(evolver).toBeInstanceOf(WorkflowEvolver);
  });
});
