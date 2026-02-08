/**
 * V2 delegate pipeline tests (Issue #914, Phase 6-1)
 *
 * Tests the V2 pipeline path for delegate_to_model.
 */
import { describe, it, expect } from 'vitest';

import { createDelegatePipeline } from './v2-delegate.js';
import type { TaskContract } from './task-contract.js';

// ============================================================================
// Fixtures
// ============================================================================

function makeTask(overrides: Partial<TaskContract> = {}): TaskContract {
  return {
    id: 'task-001',
    description: 'Implement a REST API endpoint',
    status: 'approved',
    analysis: {
      complexity: 'moderate',
      taskType: 'code_generation',
      ambiguityScore: 0.2,
    },
    constraints: { scope: ['src/api/'] },
    requiredCapabilities: { tools: [], experts: [] },
    capabilityGaps: {
      available: { tools: [], experts: [] },
      gaps: [],
      allSatisfied: true,
    },
    artifacts: [],
    metadata: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('createDelegatePipeline', () => {
  it('creates a valid pipeline from a task', () => {
    const result = createDelegatePipeline(makeTask());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.plan.stages).toHaveLength(1);
    expect(result.value.plan.stages[0]?.type).toBe('route');
  });

  it('includes task metadata in plan', () => {
    const task = makeTask({ description: 'Security audit' });
    const result = createDelegatePipeline(task);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.plan.taskId).toBe('task-001');
  });

  it('sets reasonable defaults for cost estimate', () => {
    const result = createDelegatePipeline(makeTask());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.plan.estimatedCost.modelCalls).toBe(1);
  });

  it('compiles to a valid graph', () => {
    const result = createDelegatePipeline(makeTask());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.graph).toBeDefined();
    expect(result.value.graph.nodes.size).toBeGreaterThan(0);
  });

  it('executes the pipeline end-to-end', async () => {
    const pipeline = createDelegatePipeline(makeTask());
    expect(pipeline.ok).toBe(true);
    if (!pipeline.ok) return;

    const { PipelineRunner } = await import('./pipeline-runner.js');
    const runner = new PipelineRunner();
    const result = await runner.execute(pipeline.value, makeTask());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.success).toBe(true);
    }
  });
});
