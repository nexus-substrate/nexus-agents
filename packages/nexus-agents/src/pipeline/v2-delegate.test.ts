/**
 * V2 delegate pipeline tests (Issue #914, Phase 6-1)
 *
 * Tests the V2 pipeline path for delegate_to_model.
 * Phase A (Issue #920): Tests DelegateInput→TaskContract conversion and pipeline metrics.
 * Phase 1 (#927): Tests PolicyEvaluator enforcement in pipeline execution.
 */
import { describe, it, expect, afterEach } from 'vitest';

import {
  createDelegatePipeline,
  delegateInputToTaskContract,
  executeDelegatePipeline,
  checkPipelinePolicy,
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

  // estimate_tokens flag removed (#2723) — was never read downstream;
  // the test that pinned its propagation is no longer applicable.

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

// ============================================================================
// Phase 1: Policy Enforcement (#927)
// ============================================================================

describe('checkPipelinePolicy', () => {
  const savedPolicy = process.env['NEXUS_V2_POLICY_MODE'];
  const savedMode = process.env['NEXUS_V2_MODE'];

  afterEach(() => {
    if (savedPolicy !== undefined) process.env['NEXUS_V2_POLICY_MODE'] = savedPolicy;
    else delete process.env['NEXUS_V2_POLICY_MODE'];
    if (savedMode !== undefined) process.env['NEXUS_V2_MODE'] = savedMode;
    else delete process.env['NEXUS_V2_MODE'];
  });

  it('allows execution when policy mode is off', () => {
    process.env['NEXUS_V2_POLICY_MODE'] = 'off';
    const result = checkPipelinePolicy(makeTask(), 'route');
    expect(result.allowed).toBe(true);
    expect(result.mode).toBe('off');
  });

  it('allows execution when no violations in block mode', () => {
    process.env['NEXUS_V2_POLICY_MODE'] = 'block';
    const result = checkPipelinePolicy(makeTask(), 'route');
    expect(result.allowed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  // Trust tiers are written as strings per `security/trust-types.ts`
  // (TrustTier = '1' | '2' | '3' | '4'); the typed PipelineStateSnapshot
  // (#2932) enforces this shape via `toPipelineStateSnapshot` which drops
  // non-string producer values.
  it("blocks when trustTier is the string '3' on an execute stage", () => {
    process.env['NEXUS_V2_POLICY_MODE'] = 'block';
    const task = makeTask({ metadata: { trustTier: '3' } });
    const result = checkPipelinePolicy(task, 'execute');
    expect(result.allowed).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations[0]!.ruleId).toBe('trust-tier');
  });

  it('warns but allows in warn mode with violations', () => {
    process.env['NEXUS_V2_POLICY_MODE'] = 'warn';
    const task = makeTask({ metadata: { trustTier: '3' } });
    const result = checkPipelinePolicy(task, 'execute');
    expect(result.allowed).toBe(true);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.mode).toBe('warn');
  });

  // #2932: the `high-risk-approval` rule was deleted (no producer ever
  // wrote `highRisk` to task metadata, so the gate was inert). The
  // pre-#2932 "blocks high-risk unapproved" and "allows when approved"
  // tests pinned that inert behavior — both removed.
});

describe('executeDelegatePipeline — policy enforcement', () => {
  const savedPolicy = process.env['NEXUS_V2_POLICY_MODE'];
  const savedMode = process.env['NEXUS_V2_MODE'];

  afterEach(() => {
    if (savedPolicy !== undefined) process.env['NEXUS_V2_POLICY_MODE'] = savedPolicy;
    else delete process.env['NEXUS_V2_POLICY_MODE'];
    if (savedMode !== undefined) process.env['NEXUS_V2_MODE'] = savedMode;
    else delete process.env['NEXUS_V2_MODE'];
  });

  // #2932: pre-#2932 this test exercised the `high-risk-approval` rule,
  // which has been deleted (no producer ever wrote `highRisk`). The
  // remaining `trust-tier` rule gates on `stageType === 'execute'` only,
  // but `executeDelegatePipeline` calls `checkPipelinePolicy(task, 'route')`
  // — different stage. There is no rule today that gates 'route', so
  // there's no integration path through executeDelegatePipeline that
  // would block. The block-mode coverage lives in the unit tests above
  // (`checkPipelinePolicy` with stageType='execute' + trustTier:'3').

  it('proceeds normally when policy allows', async () => {
    process.env['NEXUS_V2_POLICY_MODE'] = 'off';
    const contract = delegateInputToTaskContract({ task: 'Safe task' });
    const metrics = await executeDelegatePipeline(contract);
    expect(metrics.policyBlocked).toBeUndefined();
    expect(metrics.compiled).toBe(true);
  });
});
