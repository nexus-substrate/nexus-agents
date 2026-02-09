/**
 * V2 delegate pipeline tests (Issue #914, Phase 6-1)
 *
 * Tests the V2 pipeline path for delegate_to_model.
 * Phase A (Issue #920): Tests DelegateInput→TaskContract conversion and pipeline metrics.
 */
import { describe, it, expect } from 'vitest';

import {
  createDelegatePipeline,
  delegateInputToTaskContract,
  executeDelegatePipeline,
} from './v2-delegate.js';
import type { DelegateInputLike } from './v2-delegate.js';
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

// ============================================================================
// Phase A: DelegateInput → TaskContract (Issue #920)
// ============================================================================

describe('delegateInputToTaskContract', () => {
  it('converts minimal input to TaskContract', () => {
    const input: DelegateInputLike = { task: 'Analyze code' };
    const contract = delegateInputToTaskContract(input);
    expect(contract.description).toBe('Analyze code');
    expect(contract.status).toBe('approved');
    expect(contract.analysis.taskType).toBe('routing');
    expect(contract.id).toMatch(/^delegate-/);
  });

  it('preserves preferred_capability in metadata', () => {
    const input: DelegateInputLike = {
      task: 'Review auth module',
      preferred_capability: 'reasoning',
    };
    const contract = delegateInputToTaskContract(input);
    expect(contract.metadata['preferredCapability']).toBe('reasoning');
  });

  it('preserves model_hint in metadata', () => {
    const input: DelegateInputLike = {
      task: 'Write tests',
      model_hint: 'claude-opus',
    };
    const contract = delegateInputToTaskContract(input);
    expect(contract.metadata['modelHint']).toBe('claude-opus');
  });

  it('preserves billing_mode in metadata', () => {
    const input: DelegateInputLike = {
      task: 'Quick query',
      billing_mode: 'plan',
    };
    const contract = delegateInputToTaskContract(input);
    expect(contract.metadata['billingMode']).toBe('plan');
  });

  it('preserves estimate_tokens flag in metadata', () => {
    const input: DelegateInputLike = {
      task: 'Count tokens',
      estimate_tokens: true,
    };
    const contract = delegateInputToTaskContract(input);
    expect(contract.metadata['estimateTokens']).toBe(true);
  });

  it('omits undefined optional fields from metadata', () => {
    const input: DelegateInputLike = { task: 'Simple task' };
    const contract = delegateInputToTaskContract(input);
    expect(contract.metadata).toEqual({ source: 'delegate_to_model' });
  });

  it('generates unique IDs', () => {
    const a = delegateInputToTaskContract({ task: 'Task A' });
    const b = delegateInputToTaskContract({ task: 'Task B' });
    expect(a.id).not.toBe(b.id);
  });
});

describe('executeDelegatePipeline', () => {
  it('returns success metrics for valid task', async () => {
    const contract = delegateInputToTaskContract({ task: 'Route this task' });
    const metrics = await executeDelegatePipeline(contract);
    expect(metrics.compiled).toBe(true);
    expect(metrics.executed).toBe(true);
    expect(metrics.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('reports non-negative duration', async () => {
    const contract = delegateInputToTaskContract({ task: 'Measure timing' });
    const metrics = await executeDelegatePipeline(contract);
    expect(metrics.compiled).toBe(true);
    expect(metrics.stepsExecuted).toBeGreaterThanOrEqual(0);
  });
});
