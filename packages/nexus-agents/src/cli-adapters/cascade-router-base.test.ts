/**
 * Cascade Router Base Tests
 *
 * Tests for the abstract CascadeRouterBase class.
 *
 * @module cli-adapters/cascade-router-base.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ok, err } from '../core/index.js';
import type { CliTask, CliResponse, CliName, ICliAdapter } from './types.js';
import { CascadeRouterBase, type CascadeStageResult } from './cascade-router-base.js';
import type { RoutingStrategy } from './unified-routing-types.js';

// ============================================================================
// Test Implementation
// ============================================================================

/**
 * Simple test implementation of CascadeRouterBase.
 * Uses a fixed threshold to decide when to stop cascade.
 */
class TestCascadeRouter extends CascadeRouterBase {
  private readonly stages: CliName[][];
  private readonly stageThreshold: number;

  constructor(adapters: Map<CliName, ICliAdapter>, stages: CliName[][], stageThreshold = 0.8) {
    super(adapters);
    this.stages = stages;
    this.stageThreshold = stageThreshold;
  }

  getStrategy(): RoutingStrategy {
    return 'confidence_cascade';
  }

  protected getStageModels(stageIndex: number): readonly CliName[] {
    return this.stages[stageIndex] ?? [];
  }

  protected override getStageName(stageIndex: number): string {
    return `test-stage-${String(stageIndex)}`;
  }

  protected async executeStage(
    task: CliTask,
    stageIndex: number,
    models: readonly CliName[]
  ): Promise<CascadeStageResult> {
    const results = await this.executeModelsParallel(models, task);

    // Calculate simple "score" based on success rate
    const successCount = results.filter((r) => r.success).length;
    const score = successCount / results.length;

    // Find first successful response
    const successfulResult = results.find((r) => r.success);

    return {
      stageName: this.getStageName(stageIndex),
      modelsExecuted: models,
      modelResults: results,
      shouldStop: score >= this.stageThreshold && successfulResult !== undefined,
      selectedResponse: successfulResult?.response,
      selectedCli: successfulResult?.cli,
      score,
      durationMs: results.reduce((sum, r) => sum + r.durationMs, 0),
    };
  }
}

// ============================================================================
// Test Helpers
// ============================================================================

function createMockAdapter(
  name: CliName,
  response?: CliResponse,
  shouldFail = false,
  delay = 0
): ICliAdapter {
  return {
    name,
    execute: vi.fn().mockImplementation(async () => {
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      if (shouldFail) {
        return err({
          code: 'EXECUTION_ERROR' as const,
          message: 'Mock failure',
          cli: name,
          retryable: true,
        });
      }
      return ok(response ?? { text: `Response from ${name}`, model: name });
    }),
    getCapabilities: vi.fn().mockReturnValue({
      contextWindow: 100000,
      maxOutputTokens: 4096,
      supportedTasks: [],
      costPerInputToken: 0.001,
      costPerOutputToken: 0.002,
    }),
    healthCheck: vi.fn().mockResolvedValue({ status: 'healthy' }),
  } as unknown as ICliAdapter;
}

function createTask(content = 'Test task'): CliTask {
  return {
    content,
    maxTokens: 1000,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('CascadeRouterBase', () => {
  let adapters: Map<CliName, ICliAdapter>;

  beforeEach(() => {
    adapters = new Map();
    adapters.set('claude', createMockAdapter('claude'));
    adapters.set('gemini', createMockAdapter('gemini'));
    adapters.set('codex', createMockAdapter('codex'));
  });

  describe('execute', () => {
    it('should stop at first stage when threshold is met', async () => {
      const stages: CliName[][] = [['claude'], ['gemini']];
      const router = new TestCascadeRouter(adapters, stages, 0.5);
      const task = createTask();

      const result = await router.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.stoppedAtStage).toBe(0);
        expect(result.value.stagesExecuted).toBe(1);
        expect(result.value.selectedCli).toBe('claude');
        expect(result.value.estimatedCostSavings).toBeGreaterThan(0);
      }
    });

    it('should cascade to next stage when threshold is not met', async () => {
      // First stage fails, second stage succeeds
      adapters.set('claude', createMockAdapter('claude', undefined, true));

      const stages: CliName[][] = [['claude'], ['gemini']];
      const router = new TestCascadeRouter(adapters, stages, 0.5);
      const task = createTask();

      const result = await router.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.stoppedAtStage).toBe(1);
        expect(result.value.stagesExecuted).toBe(2);
        expect(result.value.selectedCli).toBe('gemini');
      }
    });

    it('should execute multiple models in parallel within a stage', async () => {
      const stages: CliName[][] = [['claude', 'gemini', 'codex']];
      const router = new TestCascadeRouter(adapters, stages, 0.5);
      const task = createTask();

      const result = await router.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.stageHistory[0]?.modelsExecuted).toEqual(['claude', 'gemini', 'codex']);
        expect(result.value.contributingModels.length).toBeGreaterThan(0);
      }
    });

    it('should respect maxStages configuration', async () => {
      const stages: CliName[][] = [['claude'], ['gemini'], ['codex']];

      // All stages fail
      adapters.set('claude', createMockAdapter('claude', undefined, true));
      adapters.set('gemini', createMockAdapter('gemini', undefined, true));
      adapters.set('codex', createMockAdapter('codex', undefined, true));

      const router = new TestCascadeRouter(adapters, stages, 1.0);
      const task = createTask();

      const result = await router.execute(task);

      // All stages fail, so we get an error
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('All models failed');
      }
    });

    it('should track stage history correctly', async () => {
      const stages: CliName[][] = [['claude'], ['gemini']];

      // First stage fails, second succeeds
      adapters.set('claude', createMockAdapter('claude', undefined, true));

      const router = new TestCascadeRouter(adapters, stages, 0.5);
      const task = createTask();

      const result = await router.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.stageHistory.length).toBe(2);
        expect(result.value.stageHistory[0]?.stageName).toBe('test-stage-0');
        expect(result.value.stageHistory[1]?.stageName).toBe('test-stage-1');
        expect(result.value.stageHistory[0]?.shouldStop).toBe(false);
        expect(result.value.stageHistory[1]?.shouldStop).toBe(true);
      }
    });

    it('should handle missing adapters gracefully', async () => {
      const stages: CliName[][] = [['unknown' as CliName]];
      const router = new TestCascadeRouter(adapters, stages, 0.5);
      const task = createTask();

      const result = await router.execute(task);

      // With no adapters available, execution should fail
      expect(result.ok).toBe(false);
    });

    it('should use fallback when cascade exhausts without meeting threshold', async () => {
      const stages: CliName[][] = [['claude'], ['gemini']];

      // Both succeed, but with a threshold of 2.0 (impossible), it will exhaust
      const router = new TestCascadeRouter(adapters, stages, 2.0);
      const task = createTask();

      const result = await router.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Fallback should select from the last stage
        expect(result.value.estimatedCostSavings).toBe(0);
        expect(result.value.stagesExecuted).toBe(2);
      }
    });
  });

  describe('toUnifiedDecision', () => {
    it('should convert cascade result to unified decision format', async () => {
      // Use multiple stages so stopping early produces cost savings
      const stages: CliName[][] = [['claude'], ['gemini'], ['codex']];
      const router = new TestCascadeRouter(adapters, stages, 0.5);
      const task = createTask();

      const result = await router.execute(task);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const decision = router.toUnifiedDecision(result.value, 100);

      expect(decision.selectedCli).toBe('claude');
      expect(decision.strategy).toBe('confidence_cascade');
      expect(decision.decisionTimeMs).toBe(100);
      expect(decision.stagesExecuted).toContain('test-stage-0');
      expect(decision.resolvedAtStage).toBe(0);
      // consensusReached is true when there are cost savings (stopped early)
      expect(decision.consensusReached).toBe(true);
      expect(decision.metadata).toBeDefined();
    });
  });

  describe('executeModel', () => {
    it('should handle adapter not found', async () => {
      const stages: CliName[][] = [['nonexistent' as CliName]];
      const router = new TestCascadeRouter(adapters, stages, 0.0);
      const task = createTask();

      const result = await router.execute(task);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('All models failed');
      }
    });
  });

  describe('cost savings calculation', () => {
    it('should calculate cost savings when stopping early', async () => {
      const stages: CliName[][] = [['claude'], ['gemini'], ['codex']];
      const router = new TestCascadeRouter(adapters, stages, 0.5);
      const task = createTask();

      const result = await router.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Stopped at stage 0, so savings = (3 - 1) / 3 = 0.67
        expect(result.value.estimatedCostSavings).toBeCloseTo(0.67, 1);
      }
    });

    it('should report zero savings when cascade exhausts', async () => {
      const stages: CliName[][] = [['claude']];
      const router = new TestCascadeRouter(adapters, stages, 2.0); // Impossible threshold
      const task = createTask();

      const result = await router.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.estimatedCostSavings).toBe(0);
      }
    });
  });

  describe('contributing models', () => {
    it('should track all successful models', async () => {
      const stages: CliName[][] = [['claude', 'gemini'], ['codex']];

      // Make first stage not meet threshold
      adapters.set('claude', createMockAdapter('claude', undefined, true));

      const router = new TestCascadeRouter(adapters, stages, 0.6);
      const task = createTask();

      const result = await router.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // gemini succeeded in first stage, codex in second
        expect(result.value.contributingModels).toContain('gemini');
        expect(result.value.contributingModels).toContain('codex');
      }
    });
  });
});
