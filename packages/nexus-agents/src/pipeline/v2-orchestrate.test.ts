/**
 * V2 Orchestrate Pipeline tests (Issue #924, Phase E)
 *
 * Tests TaskContract conversion and pipeline execution for orchestrate.
 */
import { describe, it, expect } from 'vitest';

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
