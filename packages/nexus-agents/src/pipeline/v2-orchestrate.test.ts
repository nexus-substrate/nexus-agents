/**
 * V2 Orchestrate Pipeline tests (Issue #924, Phase E)
 *
 * Tests TaskContract conversion and pipeline execution for orchestrate.
 * Phase 1 (#927): Tests PolicyEvaluator enforcement in orchestrate pipeline.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';

import { analyzeForContract } from './task-contract-builders.js';
import { createSharedTaskAnalyzer } from '../core/task-analysis/shared-task-analyzer.js';
import { detectCapabilityGaps } from '../core/task-analysis/capability-gap-detector.js';
import { TaskContractSchema } from './task-contract.js';
import { orchestrateInputToTaskContract, executeOrchestratePipeline } from './v2-orchestrate.js';

// ============================================================================
// orchestrateInputToTaskContract
// ============================================================================

describe('orchestrateInputToTaskContract', () => {
  it('converts minimal input', () => {
    const tc = orchestrateInputToTaskContract({ task: 'Build a REST API' });
    expect(tc.description).toBe('Build a REST API');
    expect(tc.id).toMatch(/^orchestrate-/);
    expect(tc.status).toBe('approved');
    // Was `'orchestration'` / `'high'` until #5924 — the entry point's own name
    // and a fixed complexity, asserted for every task. `analysis` is now
    // derived from the task text by SharedTaskAnalyzer, so it describes the
    // TASK rather than the door it came through. 'Build a REST API' analyses
    // as code implementation, which is the point.
    expect(tc.analysis.taskType).toBe(analyzeForContract('Build a REST API').taskType);
    expect(tc.analysis.taskType).not.toBe('orchestration');
    expect(tc.analysis.complexity.length).toBeGreaterThan(0);
  });

  it('includes context in metadata', () => {
    const ctx = { repo: 'nexus-agents', branch: 'main' };
    const tc = orchestrateInputToTaskContract({ task: 'test', context: ctx });
    expect(tc.metadata['context']).toEqual(ctx);
  });

  it('includes maxIterations in metadata', () => {
    const tc = orchestrateInputToTaskContract({ task: 'test', maxIterations: 5 });
    expect(tc.metadata['maxIterations']).toBe(5);
  });

  it('omits undefined optional fields from metadata', () => {
    const tc = orchestrateInputToTaskContract({ task: 'test' });
    expect(tc.metadata['context']).toBeUndefined();
    expect(tc.metadata['maxIterations']).toBeUndefined();
    expect(tc.metadata['source']).toBe('orchestrate');
  });

  it('generates unique IDs', () => {
    const tc1 = orchestrateInputToTaskContract({ task: 'a' });
    const tc2 = orchestrateInputToTaskContract({ task: 'b' });
    expect(tc1.id).not.toBe(tc2.id);
  });

  it('sets timestamps', () => {
    const before = Date.now();
    const tc = orchestrateInputToTaskContract({ task: 'test' });
    expect(tc.createdAt).toBeGreaterThanOrEqual(before);
    expect(tc.updatedAt).toBe(tc.createdAt);
  });
});

// ============================================================================
// executeOrchestratePipeline
// ============================================================================

describe('executeOrchestratePipeline', () => {
  it('returns metrics with non-negative duration', async () => {
    const tc = orchestrateInputToTaskContract({ task: 'test task' });
    const metrics = await executeOrchestratePipeline(tc);
    expect(metrics.durationMs).toBeGreaterThanOrEqual(0);
    expect(typeof metrics.compiled).toBe('boolean');
    expect(typeof metrics.executed).toBe('boolean');
    expect(typeof metrics.stepsExecuted).toBe('number');
  });
});

// ============================================================================
// Phase 1: Policy Enforcement (#927)
// ============================================================================

describe('executeOrchestratePipeline — policy enforcement', () => {
  const savedPolicy = process.env['NEXUS_V2_POLICY_MODE'];
  const savedMode = process.env['NEXUS_V2_MODE'];

  afterEach(() => {
    if (savedPolicy !== undefined) process.env['NEXUS_V2_POLICY_MODE'] = savedPolicy;
    else delete process.env['NEXUS_V2_POLICY_MODE'];
    if (savedMode !== undefined) process.env['NEXUS_V2_MODE'] = savedMode;
    else delete process.env['NEXUS_V2_MODE'];
  });

  it('blocks when trust tier 3+ with execute stage type', async () => {
    process.env['NEXUS_V2_POLICY_MODE'] = 'block';
    const tc = orchestrateInputToTaskContract({ task: 'test' });
    const blocked = { ...tc, metadata: { ...tc.metadata, trustTier: '4' } };
    const metrics = await executeOrchestratePipeline(blocked);
    expect(metrics.policyBlocked).toBe(true);
    expect(metrics.compiled).toBe(false);
    expect(metrics.executed).toBe(false);
    expect(metrics.policyViolations).toBeDefined();
  });

  it('proceeds when policy mode is off', async () => {
    process.env['NEXUS_V2_POLICY_MODE'] = 'off';
    const tc = orchestrateInputToTaskContract({ task: 'safe task' });
    const metrics = await executeOrchestratePipeline(tc);
    expect(metrics.policyBlocked).toBeUndefined();
  });

  it('proceeds in warn mode even with violations', async () => {
    process.env['NEXUS_V2_POLICY_MODE'] = 'warn';
    const tc = orchestrateInputToTaskContract({ task: 'test' });
    const warned = { ...tc, metadata: { ...tc.metadata, trustTier: '3' } };
    const metrics = await executeOrchestratePipeline(warned);
    expect(metrics.policyBlocked).toBeUndefined();
  });

  // #5862: under warn mode `policyResult.allowed` is true regardless of
  // violations, so the branch that mapped them was unreachable and the
  // violations were dropped. The metrics object is the whole observable
  // output of this path, so a denied run logged identically to a clean one.
  it('records the violations it found in warn mode, without blocking', async () => {
    process.env['NEXUS_V2_POLICY_MODE'] = 'warn';
    const tc = orchestrateInputToTaskContract({ task: 'test' });
    const warned = { ...tc, metadata: { ...tc.metadata, trustTier: '4' } };

    const metrics = await executeOrchestratePipeline(warned);

    expect(metrics.policyBlocked).toBeUndefined();
    expect(metrics.policyMode).toBe('warn');
    expect(metrics.policyViolations).toEqual([expect.stringContaining('trust-tier')]);
  });

  it('records no violations for a trusted task in the same mode', async () => {
    // The pair. Without it `policyViolations` could be populated
    // unconditionally and the assertion above would still pass.
    process.env['NEXUS_V2_POLICY_MODE'] = 'warn';
    const tc = orchestrateInputToTaskContract({ task: 'test' });
    const trusted = { ...tc, metadata: { ...tc.metadata, trustTier: '1' } };

    const metrics = await executeOrchestratePipeline(trusted);

    expect(metrics.policyViolations).toBeUndefined();
    expect(metrics.policyMode).toBeUndefined();
  });
});

describe('measured task contract (#5923)', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([undefined, '0', '1'])(
    'reports an inferred extraction gap with ledger recording flag %s',
    (flag) => {
      vi.stubEnv('NEXUS_CAPABILITY_GAP_INFERRED', flag);
      const task = 'Extract class and function symbols from src/parser.py';
      const contract = orchestrateInputToTaskContract({ task });

      expect(contract.capabilityGaps.allSatisfied).toBe(false);
      expect(contract.capabilityGaps.gapsMeasured).toBe(true);
      expect(contract.requiredCapabilities.tools).toContain('extract_symbols:.py');
      expect(contract.capabilityGaps.gaps).toEqual([
        expect.objectContaining({ type: 'tool', name: 'extract_symbols:.py', origin: 'inferred' }),
      ]);
      expect(TaskContractSchema.safeParse(contract).success).toBe(true);
    }
  );

  it('reports measured requirements, availability and scope for an ordinary task', () => {
    const task = 'Implement a production-ready API in src/api.ts by Friday';
    const analysis = createSharedTaskAnalyzer().analyze(task);
    const report = detectCapabilityGaps(analysis.requiredCapabilities);
    const contract = orchestrateInputToTaskContract({ task });

    expect(contract.requiredCapabilities).toEqual(analysis.requiredCapabilities);
    expect(contract.requiredCapabilities.tools.length).toBeGreaterThan(0);
    expect(contract.capabilityGaps).toEqual({ ...report, gapsMeasured: true });
    expect(contract.capabilityGaps.available.tools.length).toBeGreaterThan(0);
    expect(contract.constraints).toEqual(analysis.constraints);
    expect(contract.constraints.scope).toContain('api.ts');
    expect(contract.analysis).toEqual({
      complexity: analysis.complexity,
      taskType: analysis.taskType,
      ambiguityScore: analysis.ambiguityScore,
    });
    expect(TaskContractSchema.safeParse(contract).success).toBe(true);
  });

  it('emits empty scope and absent time/quality when no constraints are recognized', () => {
    const contract = orchestrateInputToTaskContract({ task: 'Hello' });
    expect(contract.constraints).toEqual({ scope: [] });
    expect(contract.constraints).not.toHaveProperty('time');
    expect(contract.constraints).not.toHaveProperty('quality');
    expect(contract.capabilityGaps.gapsMeasured).toBe(true);
  });
});
