/**
 * TaskContract + PlanContract Zod schema tests (Issue #909, E1-1/E1-2)
 *
 * TDD: These tests define the contract before the implementation.
 */
import { describe, it, expect } from 'vitest';

import {
  TaskContractSchema,
  PlanContractSchema,
  StageSpecSchema,
  PolicyGateSpecSchema,
  CostEstimateSchema,
  ArtifactRefSchema,
  TASK_STATUSES,
  STAGE_TYPES,
  type TaskContract,
  type TaskStatus,
  type PlanContract,
  type StageSpec,
  type PolicyGateSpec,
  type CostEstimate,
  type ArtifactRef,
  type ArtifactType,
} from './task-contract.js';

// ============================================================================
// Fixtures
// ============================================================================

function validTaskContract(): TaskContract {
  return {
    id: 'task-001',
    description: 'Implement user auth',
    status: 'intake',
    analysis: {
      complexity: 'medium',
      taskType: 'code_generation',
      ambiguityScore: 0.3,
    },
    constraints: { scope: [] },
    requiredCapabilities: { tools: [], experts: [] },
    capabilityGaps: { available: { tools: [], experts: [] }, gaps: [], allSatisfied: true },
    artifacts: [],
    metadata: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function validArtifactRef(): ArtifactRef {
  return { id: 'art-001', type: 'code' };
}

function validStageSpec(): StageSpec {
  return {
    id: 'stage-analyze',
    type: 'analyze',
    pluginId: 'nexus:task-analyzer',
    inputArtifacts: [],
    outputArtifacts: ['analysis-result'],
    dependencies: [],
    config: {},
  };
}

function validPlanContract(): PlanContract {
  return {
    taskId: 'task-001',
    stages: [validStageSpec()],
    policyGates: [],
    estimatedCost: {
      totalTokensIn: 1000,
      totalTokensOut: 500,
      estimatedCostUsd: 0.05,
      modelCalls: 2,
    },
    approvalRequired: false,
    maxIterations: 10,
    timeoutMs: 120_000,
  };
}

// ============================================================================
// TaskContract Schema Tests
// ============================================================================

describe('TaskContractSchema', () => {
  it('validates a minimal valid TaskContract', () => {
    const result = TaskContractSchema.safeParse(validTaskContract());
    expect(result.success).toBe(true);
  });

  it('validates all task statuses', () => {
    for (const status of TASK_STATUSES) {
      const task = { ...validTaskContract(), status };
      const result = TaskContractSchema.safeParse(task);
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid status', () => {
    const task = { ...validTaskContract(), status: 'running' };
    const result = TaskContractSchema.safeParse(task);
    expect(result.success).toBe(false);
  });

  it('rejects empty id', () => {
    const task = { ...validTaskContract(), id: '' };
    const result = TaskContractSchema.safeParse(task);
    expect(result.success).toBe(false);
  });

  it('rejects empty description', () => {
    const task = { ...validTaskContract(), description: '' };
    const result = TaskContractSchema.safeParse(task);
    expect(result.success).toBe(false);
  });

  it('accepts optional parentId', () => {
    const task = { ...validTaskContract(), parentId: 'parent-001' };
    const result = TaskContractSchema.safeParse(task);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.parentId).toBe('parent-001');
    }
  });

  it('accepts optional completedAt and error', () => {
    const task = {
      ...validTaskContract(),
      status: 'failed' as TaskStatus,
      completedAt: Date.now(),
      error: 'Timeout exceeded',
    };
    const result = TaskContractSchema.safeParse(task);
    expect(result.success).toBe(true);
  });

  it('accepts artifacts array', () => {
    const task = {
      ...validTaskContract(),
      artifacts: [validArtifactRef()],
    };
    const result = TaskContractSchema.safeParse(task);
    expect(result.success).toBe(true);
  });

  it('accepts arbitrary metadata', () => {
    const task = {
      ...validTaskContract(),
      metadata: { source: 'mcp', priority: 'high' },
    };
    const result = TaskContractSchema.safeParse(task);
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// ArtifactRef Schema Tests
// ============================================================================

describe('ArtifactRefSchema', () => {
  it('validates a valid ArtifactRef', () => {
    const result = ArtifactRefSchema.safeParse(validArtifactRef());
    expect(result.success).toBe(true);
  });

  it('validates all artifact types', () => {
    const types: ArtifactType[] = [
      'code',
      'review',
      'plan',
      'test',
      'report',
      'vote',
      'spec',
      'analysis',
    ];
    for (const type of types) {
      const ref = { id: `art-${type}`, type };
      expect(ArtifactRefSchema.safeParse(ref).success).toBe(true);
    }
  });

  it('rejects invalid artifact type', () => {
    const ref = { id: 'art-1', type: 'invalid' };
    expect(ArtifactRefSchema.safeParse(ref).success).toBe(false);
  });
});

// ============================================================================
// StageSpec Schema Tests
// ============================================================================

describe('StageSpecSchema', () => {
  it('validates a minimal StageSpec', () => {
    const result = StageSpecSchema.safeParse(validStageSpec());
    expect(result.success).toBe(true);
  });

  it('validates all stage types', () => {
    for (const type of STAGE_TYPES) {
      const stage = { ...validStageSpec(), type };
      expect(StageSpecSchema.safeParse(stage).success).toBe(true);
    }
  });

  it('accepts optional preferredCli', () => {
    const stage = { ...validStageSpec(), preferredCli: 'claude' };
    const result = StageSpecSchema.safeParse(stage);
    expect(result.success).toBe(true);
  });

  it('accepts optional maxRetries and timeoutMs', () => {
    const stage = {
      ...validStageSpec(),
      maxRetries: 3,
      timeoutMs: 30_000,
    };
    const result = StageSpecSchema.safeParse(stage);
    expect(result.success).toBe(true);
  });

  it('rejects invalid stage type', () => {
    const stage = { ...validStageSpec(), type: 'nope' };
    expect(StageSpecSchema.safeParse(stage).success).toBe(false);
  });
});

// ============================================================================
// PolicyGateSpec Schema Tests
// ============================================================================

describe('PolicyGateSpecSchema', () => {
  it('validates a valid PolicyGateSpec', () => {
    const gate: PolicyGateSpec = {
      id: 'gate-security',
      afterStage: 'stage-analyze',
      beforeStage: 'stage-execute',
      rules: ['trust-tier', 'security-review'],
    };
    const result = PolicyGateSpecSchema.safeParse(gate);
    expect(result.success).toBe(true);
  });

  // #4019: the inert `onFail` field was removed (enforcement is resolved by the
  // runtime mode, not a per-gate field). A non-strict schema ignores a stray
  // `onFail` key on an external plan, so back-compat holds.
  it('ignores a legacy onFail key (back-compat, non-strict schema)', () => {
    const legacyGate = {
      id: 'gate-1',
      afterStage: 'a',
      beforeStage: 'b',
      rules: ['rule-1'],
    };
    const result = PolicyGateSpecSchema.safeParse(legacyGate);
    expect(result.success).toBe(true);
    if (result.success) expect('onFail' in result.data).toBe(false);
  });

  it('rejects empty rules array', () => {
    const gate = {
      id: 'gate-1',
      afterStage: 'a',
      beforeStage: 'b',
      rules: [],
    };
    expect(PolicyGateSpecSchema.safeParse(gate).success).toBe(false);
  });
});

// ============================================================================
// CostEstimate Schema Tests
// ============================================================================

describe('CostEstimateSchema', () => {
  it('validates a valid CostEstimate', () => {
    const cost: CostEstimate = {
      totalTokensIn: 5000,
      totalTokensOut: 2000,
      estimatedCostUsd: 0.25,
      modelCalls: 3,
    };
    expect(CostEstimateSchema.safeParse(cost).success).toBe(true);
  });

  it('rejects negative values', () => {
    const cost = {
      totalTokensIn: -1,
      totalTokensOut: 2000,
      estimatedCostUsd: 0.25,
      modelCalls: 3,
    };
    expect(CostEstimateSchema.safeParse(cost).success).toBe(false);
  });
});

// ============================================================================
// PlanContract Schema Tests
// ============================================================================

describe('PlanContractSchema', () => {
  it('validates a minimal PlanContract', () => {
    const result = PlanContractSchema.safeParse(validPlanContract());
    expect(result.success).toBe(true);
  });

  it('validates plan with policy gates', () => {
    const plan = {
      ...validPlanContract(),
      policyGates: [
        {
          id: 'gate-1',
          afterStage: 'stage-analyze',
          beforeStage: 'stage-execute',
          rules: ['trust-tier'],
        },
      ],
    };
    const result = PlanContractSchema.safeParse(plan);
    expect(result.success).toBe(true);
  });

  it('validates plan with multiple stages', () => {
    const plan = {
      ...validPlanContract(),
      stages: [
        validStageSpec(),
        {
          ...validStageSpec(),
          id: 'stage-execute',
          type: 'execute' as const,
          dependencies: ['stage-analyze'],
        },
      ],
    };
    const result = PlanContractSchema.safeParse(plan);
    expect(result.success).toBe(true);
  });

  it('rejects empty taskId', () => {
    const plan = { ...validPlanContract(), taskId: '' };
    expect(PlanContractSchema.safeParse(plan).success).toBe(false);
  });

  it('rejects negative maxIterations', () => {
    const plan = { ...validPlanContract(), maxIterations: -1 };
    expect(PlanContractSchema.safeParse(plan).success).toBe(false);
  });

  it('rejects negative timeoutMs', () => {
    const plan = { ...validPlanContract(), timeoutMs: -1 };
    expect(PlanContractSchema.safeParse(plan).success).toBe(false);
  });
});
