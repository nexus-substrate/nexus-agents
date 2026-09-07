/**
 * Plan-to-graph compiler tests (Issue #910, E2-1)
 *
 * TDD: Tests define the contract for PlanContract → CompiledGraph conversion.
 */
import { describe, it, expect } from 'vitest';

import { compilePlan } from './plan-compiler.js';
import { createCorePluginRegistry } from './core-plugins.js';
import { PluginRegistry } from './plugin-registry.js';
import { createDefaultPolicyEngine } from './policy-engine.js';
import {
  PolicyBlockedError,
  enforceGatePolicy,
  type GatePolicyEnforcement,
} from './policy-evaluator.js';
import { EventBus } from './event-bus.js';
import { executeGraph } from '../orchestration/graph/graph-executor.js';
import { START } from '../orchestration/graph/graph-types.js';
import type { GraphExecutionResult } from '../orchestration/graph/graph-types.js';
import type { Result } from '../core/index.js';
import { ok } from '../core/index.js';
import type { PlanContract, StageSpec, PolicyGateSpec } from './task-contract.js';
import type { PipelineStateSnapshot } from './policy-engine.js';

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

  it('resolves plugins from registry when provided (#1179)', () => {
    const registry = createCorePluginRegistry();
    const plan = makePlan({
      stages: [makeStage({ id: 'route', type: 'route', pluginId: 'nexus:model-router' })],
    });
    const result = compilePlan(plan, { pluginRegistry: registry });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.nodes.has('route')).toBe(true);
    }
  });

  it('falls back to placeholder when plugin not found (#1179)', () => {
    const registry = createCorePluginRegistry();
    const plan = makePlan({
      stages: [makeStage({ id: 'custom', pluginId: 'unknown:plugin' })],
    });
    const result = compilePlan(plan, { pluginRegistry: registry });
    expect(result.ok).toBe(true);
  });

  it('marks a missing-plugin stage as a placeholder so its no-op is not a silent success (#3178)', async () => {
    // A stage referencing an unregistered plugin still compiles (#1179) but runs as
    // a NO-OP. It used to report status 'completed' indistinguishably from a real
    // execution — a silent failure. The result now carries `placeholder: true` so an
    // inspector can tell the difference (and the compiler logs a warning).
    const registry = createCorePluginRegistry();
    const plan = makePlan({
      stages: [makeStage({ id: 'custom', pluginId: 'unknown:plugin' })],
    });
    const compiled = compilePlan(plan, { pluginRegistry: registry });
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const result = await executeGraph(compiled.value, {}, { timeout: 5000 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const stageResults = result.value.finalState['stageResults'] as
      | ReadonlyArray<Record<string, unknown>>
      | undefined;
    const placeholderResult = stageResults?.find((s) => s['stageId'] === 'custom');
    expect(placeholderResult).toBeDefined();
    expect(placeholderResult?.['placeholder']).toBe(true);
  });

  // #5863: a REGISTERED skeleton got no marker at all, so it recorded a bare
  // 'completed' — more confidently than the absent plugin above. Every core
  // plugin is `noopStageResult()`, and the default registry is the only
  // registration for the analyze/route/execute stages, so this is the ordinary
  // path for `buildDelegatePlan`, not an edge.
  it('marks a registered skeleton plugin so its no-op is not a silent success', async () => {
    const registry = createCorePluginRegistry();
    const plan = makePlan({
      stages: [makeStage({ id: 'analyze', pluginId: 'nexus:task-analyzer' })],
    });
    const compiled = compilePlan(plan, { pluginRegistry: registry });
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;

    const result = await executeGraph(compiled.value, {}, { timeout: 5000 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const entry = findStageResult(result.value.finalState, 'analyze');
    expect(entry?.['status']).toBe('completed');
    expect(entry?.['stub']).toBe(true);
  });

  it('leaves a real plugin unmarked', async () => {
    // The pair. Without it `stub: true` could be stamped unconditionally and
    // the assertion above would still pass.
    // NOT createCorePluginRegistry(): that one is frozen, so `register` fails
    // silently and the stage falls through to the PLACEHOLDER path — where
    // `stub` is absent for a different reason and the assertion below passes
    // whatever the production code does. Caught by mutating `stub` to a
    // literal `true` and watching this test still pass.
    const registry = new PluginRegistry();
    const registered = registry.register({
      manifest: {
        id: 'test:real',
        version: '1.0.0',
        description: 'Does actual work',
        stages: ['analyze'],
        requiredCapabilities: [],
        trustLevel: 'core',
        experimental: false,
      },
      execute: () =>
        Promise.resolve({ success: true, outputArtifacts: [], metadata: { stub: false } }),
      validateConfig: () => ok(undefined),
    });
    expect(registered.ok).toBe(true);

    const plan = makePlan({
      stages: [makeStage({ id: 'analyze', pluginId: 'test:real' })],
    });
    const compiled = compilePlan(plan, { pluginRegistry: registry });
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;

    const result = await executeGraph(compiled.value, {}, { timeout: 5000 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const entry = findStageResult(result.value.finalState, 'analyze');
    expect(entry?.['status']).toBe('completed');
    expect(entry?.['stub']).toBeUndefined();
  });
});

// ============================================================================
// Policy Gate Enforcement Tests (#3177)
// ============================================================================

const TRUST_GATE: PolicyGateSpec = {
  id: 'gate-trust',
  afterStage: 'analyze',
  beforeStage: 'execute',
  rules: ['trust-tier'],
};

/** Plan with an analyze→[gate]→execute(execute-type) shape. */
function makeGatedPlan(): PlanContract {
  return makePlan({
    stages: [
      makeStage({ id: 'analyze', type: 'analyze' }),
      makeStage({ id: 'execute', type: 'execute', dependencies: ['analyze'] }),
    ],
    policyGates: [TRUST_GATE],
  });
}

function enforcement(
  overrides: Partial<GatePolicyEnforcement> & { pipelineState?: PipelineStateSnapshot }
): GatePolicyEnforcement {
  return {
    engine: createDefaultPolicyEngine(),
    pipelineState: {},
    ...overrides,
  };
}

/** Pull one stage's recorded entry out of the accumulated stageResults. */
function findStageResult(
  finalState: Readonly<Record<string, unknown>>,
  stageId: string
): Record<string, unknown> | undefined {
  const results = finalState['stageResults'];
  if (!Array.isArray(results)) return undefined;
  return (results as Record<string, unknown>[]).find((r) => r['stageId'] === stageId);
}

/** Pull one gate's recorded entry out of the accumulated stageResults. */
function findGateResult(
  finalState: Readonly<Record<string, unknown>>,
  gateId: string
): Record<string, unknown> | undefined {
  const results = finalState['stageResults'];
  if (!Array.isArray(results)) return undefined;
  return (results as Record<string, unknown>[]).find((r) => r['gateId'] === gateId);
}

async function runGatedPlan(opts: {
  mode?: 'off' | 'warn' | 'block';
  pipelineState: PipelineStateSnapshot;
}): Promise<Result<GraphExecutionResult, Error>> {
  const plan = makeGatedPlan();
  const compiled = compilePlan(plan, {
    policyEnforcement: enforcement({
      ...(opts.mode !== undefined ? { mode: opts.mode } : {}),
      pipelineState: opts.pipelineState,
    }),
  });
  if (!compiled.ok) throw new Error(`compile failed: ${compiled.error}`);
  return executeGraph(compiled.value, {}, { timeout: 5000 });
}

describe('policy gate enforcement (#3177)', () => {
  it('(a) throw-to-halt: a gate handler that throws → node marked failed', async () => {
    // Pins the executor contract: a thrown error inside a node handler must
    // surface as a failed NodeResult, so a future refactor cannot silently
    // disable gate enforcement.
    const plan = makeGatedPlan();
    const compiled = compilePlan(plan, {
      policyEnforcement: enforcement({
        mode: 'block',
        pipelineState: {}, // missing trust → untrusted → blocked
      }),
    });
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const result = await executeGraph(compiled.value, {}, { timeout: 5000 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const gateNode = result.value.nodeResults.find((r) => r.nodeId === 'gate-trust');
    expect(gateNode?.status).toBe('failed');
  });

  it('(b) block mode + untrusted → throws PolicyBlockedError → halts', async () => {
    const result = await runGatedPlan({ mode: 'block', pipelineState: {} });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const gateNode = result.value.nodeResults.find((r) => r.nodeId === 'gate-trust');
    expect(gateNode?.status).toBe('failed');
    // execute stage downstream of the gate must NOT have run.
    const executeNode = result.value.nodeResults.find((r) => r.nodeId === 'execute');
    expect(executeNode).toBeUndefined();
  });

  it('(b) PolicyBlockedError carries gate id + violations', () => {
    const engine = createDefaultPolicyEngine();
    let thrown: unknown;
    try {
      // Direct unit: evaluate then enforce.
      enforceGatePolicy(
        { engine, mode: 'block', pipelineState: {} },
        { gateId: 'gate-trust', taskId: 't', stageType: 'execute' }
      );
    } catch (e: unknown) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(PolicyBlockedError);
    if (thrown instanceof PolicyBlockedError) {
      expect(thrown.gateId).toBe('gate-trust');
      expect(thrown.violations.length).toBeGreaterThan(0);
    }
  });

  it('(c) block mode + trusted (tier 1) → gate passes, execute runs', async () => {
    const result = await runGatedPlan({ mode: 'block', pipelineState: { trustTier: '1' } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const gateNode = result.value.nodeResults.find((r) => r.nodeId === 'gate-trust');
    expect(gateNode?.status).toBe('success');
    const executeNode = result.value.nodeResults.find((r) => r.nodeId === 'execute');
    expect(executeNode?.status).toBe('success');
  });

  it('(d) warn mode → continues, gate marked warned, violation event emitted', async () => {
    const bus = new EventBus();
    const plan = makeGatedPlan();
    const compiled = compilePlan(plan, {
      policyEnforcement: enforcement({
        mode: 'warn',
        pipelineState: {}, // untrusted, but warn mode → no halt
        eventBus: bus,
      }),
    });
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const result = await executeGraph(compiled.value, {}, { timeout: 5000 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const gateNode = result.value.nodeResults.find((r) => r.nodeId === 'gate-trust');
    expect(gateNode?.status).toBe('success'); // continues
    const executeNode = result.value.nodeResults.find((r) => r.nodeId === 'execute');
    expect(executeNode?.status).toBe('success');
    const events = bus.query({}).map((e) => e.type);
    expect(events).toContain('policy.evaluated');

    // #5862: this test's own title promised "gate marked warned" and never
    // asserted the marking. `verdict.allowed` is true on every returning path,
    // so the status was the constant 'passed' and the record was byte-identical
    // to a clean run — see the pair test below.
    const gate = findGateResult(result.value.finalState, 'gate-trust');
    expect(gate?.['status']).toBe('warned');
    expect(gate?.['policyEvaluated']).toBe(true);
    expect(gate?.['policyMode']).toBe('warn');
    expect(gate?.['violations']).toEqual([expect.stringContaining('trust-tier')]);
  });

  it('(d2) warn mode with nothing to report is distinguishable from (d)', async () => {
    // The pair. Without it the status could be hard-coded 'warned' and the
    // assertions above would still pass. `listRules: () => []` is a clean
    // engine: the same mode, the same plan, no violations.
    const engine = createDefaultPolicyEngine();
    const clean = {
      registerRule: engine.registerRule.bind(engine),
      evaluate: engine.evaluate.bind(engine),
      listRules: () => [],
    };
    const compiled = compilePlan(makeGatedPlan(), {
      policyEnforcement: enforcement({ mode: 'warn', pipelineState: {}, engine: clean }),
    });
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const result = await executeGraph(compiled.value, {}, { timeout: 5000 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const gate = findGateResult(result.value.finalState, 'gate-trust');
    expect(gate?.['status']).toBe('passed');
    expect(gate?.['policyEvaluated']).toBe(true);
    expect(gate?.['violations']).toBeUndefined();
  });

  it('(e) off mode → evaluator not called (gate passes regardless of trust)', async () => {
    let evaluated = false;
    const engine = createDefaultPolicyEngine();
    const wrapped = {
      registerRule: engine.registerRule.bind(engine),
      evaluate: engine.evaluate.bind(engine),
      listRules: () => {
        evaluated = true;
        return engine.listRules();
      },
    };
    const plan = makeGatedPlan();
    const compiled = compilePlan(plan, {
      policyEnforcement: { engine: wrapped, mode: 'off', pipelineState: {} },
    });
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const result = await executeGraph(compiled.value, {}, { timeout: 5000 });
    expect(result.ok).toBe(true);
    expect(evaluated).toBe(false);
  });

  it('(f) default mode (no explicit setting) + missing trust → does NOT throw', async () => {
    // Condition 1: warn-by-default. A stage with no trust metadata must not
    // halt out of the box.
    const plan = makeGatedPlan();
    const compiled = compilePlan(plan, {
      policyEnforcement: { engine: createDefaultPolicyEngine(), pipelineState: {} }, // no `mode`
    });
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const result = await executeGraph(compiled.value, {}, { timeout: 5000 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const gateNode = result.value.nodeResults.find((r) => r.nodeId === 'gate-trust');
    expect(gateNode?.status).toBe('success'); // did NOT throw / halt
    const executeNode = result.value.nodeResults.find((r) => r.nodeId === 'execute');
    expect(executeNode?.status).toBe('success');
  });
});

// ============================================================================
// START-boundary gate interposition (#3703)
// ============================================================================

/** Gate guarding a single no-dependency entry stage at the START boundary. */
const ENTRY_GATE: PolicyGateSpec = {
  id: 'gate-entry',
  afterStage: START,
  beforeStage: 'route-model',
  rules: ['trust-tier'],
};

/** Single-stage plan with an entry gate at START → route-model (#3703). */
function makeEntryGatedPlan(): PlanContract {
  return makePlan({
    taskId: 'task-entry',
    stages: [makeStage({ id: 'route-model', type: 'route', dependencies: [] })],
    policyGates: [ENTRY_GATE],
  });
}

describe('START-boundary gate interposition (#3703)', () => {
  it('interposes an entry gate on the START edge of a no-dependency stage', async () => {
    const plan = makeEntryGatedPlan();
    const compiled = compilePlan(plan, {
      policyEnforcement: enforcement({ mode: 'warn', pipelineState: {} }),
    });
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    // The gate node exists and is reachable (START → gate → route-model).
    expect(compiled.value.nodes.has('gate-entry')).toBe(true);
    const result = await executeGraph(compiled.value, {}, { timeout: 5000 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const gateNode = result.value.nodeResults.find((r) => r.nodeId === 'gate-entry');
    expect(gateNode?.status).toBe('success');
    const stageNode = result.value.nodeResults.find((r) => r.nodeId === 'route-model');
    expect(stageNode?.status).toBe('success');
  });

  it('entry gate runs BEFORE the stage it guards', async () => {
    const plan = makeEntryGatedPlan();
    const compiled = compilePlan(plan, {
      policyEnforcement: enforcement({ mode: 'warn', pipelineState: {} }),
    });
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const result = await executeGraph(compiled.value, {}, { timeout: 5000 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const order = result.value.nodeResults.map((r) => r.nodeId);
    expect(order.indexOf('gate-entry')).toBeLessThan(order.indexOf('route-model'));
  });
});
