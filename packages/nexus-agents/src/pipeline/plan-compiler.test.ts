/**
 * Plan-to-graph compiler tests (Issue #910, E2-1)
 *
 * TDD: Tests define the contract for PlanContract → CompiledGraph conversion.
 */
import { describe, it, expect } from 'vitest';

import { compilePlan } from './plan-compiler.js';
import type { PlanContract, StageSpec } from './task-contract.js';

// ============================================================================
// Fixtures
// ============================================================================

function makeStage(overrides: Partial<StageSpec> = {}): StageSpec {
  return {
    id: 'stage-1',
    type: 'analyze',
    pluginId: 'nexus:task-analyzer',
    inputArtifacts: [],
    outputArtifacts: ['result'],
    dependencies: [],
    config: {},
    ...overrides,
  };
}

function makePlan(overrides: Partial<PlanContract> = {}): PlanContract {
  return {
    taskId: 'task-001',
    stages: [makeStage()],
    policyGates: [],
    estimatedCost: {
      totalTokensIn: 1000,
      totalTokensOut: 500,
      estimatedCostUsd: 0.05,
      modelCalls: 1,
    },
    approvalRequired: false,
    maxIterations: 10,
    timeoutMs: 120_000,
    ...overrides,
  };
}

// ============================================================================
// compilePlan Tests
// ============================================================================

describe('compilePlan', () => {
  it('compiles a single-stage plan', () => {
    const plan = makePlan();
    const result = compilePlan(plan);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.nodes.has('stage-1')).toBe(true);
    }
  });

  it('compiles a linear plan with dependencies', () => {
    const plan = makePlan({
      stages: [
        makeStage({ id: 'analyze' }),
        makeStage({
          id: 'execute',
          type: 'execute',
          dependencies: ['analyze'],
        }),
        makeStage({
          id: 'validate',
          type: 'validate',
          dependencies: ['execute'],
        }),
      ],
    });

    const result = compilePlan(plan);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.nodes.has('analyze')).toBe(true);
      expect(result.value.nodes.has('execute')).toBe(true);
      expect(result.value.nodes.has('validate')).toBe(true);
    }
  });

  it('handles independent stages (parallel-capable)', () => {
    const plan = makePlan({
      stages: [makeStage({ id: 'code-review' }), makeStage({ id: 'security-scan' })],
    });

    const result = compilePlan(plan);
    expect(result.ok).toBe(true);
  });

  it('inserts policy gates as nodes', () => {
    const plan = makePlan({
      stages: [
        makeStage({ id: 'analyze' }),
        makeStage({
          id: 'execute',
          type: 'execute',
          dependencies: ['analyze'],
        }),
      ],
      policyGates: [
        {
          id: 'gate-trust',
          afterStage: 'analyze',
          beforeStage: 'execute',
          rules: ['trust-tier'],
          onFail: 'block',
        },
      ],
    });

    const result = compilePlan(plan);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.nodes.has('gate-trust')).toBe(true);
    }
  });

  it('returns error on cycle', () => {
    const plan = makePlan({
      stages: [
        makeStage({ id: 'a', dependencies: ['b'] }),
        makeStage({ id: 'b', dependencies: ['a'] }),
      ],
    });

    const result = compilePlan(plan);
    expect(result.ok).toBe(false);
  });

  it('returns error on invalid dependency reference', () => {
    const plan = makePlan({
      stages: [makeStage({ id: 'a', dependencies: ['nonexistent'] })],
    });

    const result = compilePlan(plan);
    expect(result.ok).toBe(false);
  });

  it('returns error on empty stages', () => {
    const plan = makePlan({ stages: [] });
    const result = compilePlan(plan);
    expect(result.ok).toBe(false);
  });
});
