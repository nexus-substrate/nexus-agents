/**
 * V2 Orchestrate Pipeline tests (Issue #924, Phase E)
 *
 * Tests TaskContract conversion and pipeline execution for orchestrate.
 * Phase 1 (#927): Tests PolicyEvaluator enforcement in orchestrate pipeline.
 */
import { describe, it, expect, afterEach } from 'vitest';

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
    expect(tc.analysis.taskType).toBe('orchestration');
    expect(tc.analysis.complexity).toBe('high');
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
