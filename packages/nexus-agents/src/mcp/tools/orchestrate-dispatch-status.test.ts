/**
 * Tests for `assembleOrchestrateOutput` worker-dispatch status (#2619 bug 1).
 *
 * The orchestrate tool used to return `isError: false` with an empty
 * `output` when every dispatched worker timed out. Callers that only
 * checked the outer status silently got nothing back. These tests pin
 * the four cases the fix has to cover: no dispatch ran; all workers
 * succeeded; some succeeded; none succeeded.
 *
 * @module mcp/tools/orchestrate-dispatch-status.test
 */

import { describe, expect, it } from 'vitest';

import type { WorkerDispatchResult } from './orchestrate-dispatch.js';
import { assembleOrchestrateOutput } from './orchestrate.js';

// Minimal valid orchestration result; the assembler just spreads it.
const ORCHESTRATION_RESULT = {
  taskId: 'orch-test',
  analysis: {
    taskId: 'orch-test',
    complexity: 5,
    taskType: 'implementation',
    requirements: [],
    risks: [],
    needsDecomposition: true,
    approach: 'multi-worker',
    estimatedEffort: 5,
  },
  result: { stub: true },
  stepsCompleted: 3,
  metadata: { durationMs: 1000, tokensUsed: 500, expertsUsed: [] },
};

function makeDispatch(successCount: number, errorCount: number): WorkerDispatchResult {
  const total = successCount + errorCount;
  const results: WorkerDispatchResult['results'] = Array.from({ length: total }, (_, i) =>
    i < successCount
      ? {
          role: 'code',
          subTask: `sub-${String(i)}`,
          output: 'ok',
          status: 'success' as const,
          durationMs: 10,
        }
      : {
          role: 'code',
          subTask: `sub-${String(i)}`,
          output: '',
          status: 'error' as const,
          durationMs: 60010,
          error: 'MCP error -32001: Request timed out',
          errorType: 'timeout' as const,
        }
  );
  return {
    results,
    totalWorkers: total,
    successCount,
    errorCount,
    durationMs: 60010,
    conflicts: [],
    totalModelCalls: total,
  };
}

function parseBody(text: string): Record<string, unknown> {
  return JSON.parse(text) as Record<string, unknown>;
}

describe('assembleOrchestrateOutput worker-dispatch status (#2619 bug 1)', () => {
  it('omits workerDispatchStatus when no workers were dispatched', () => {
    const result = assembleOrchestrateOutput(ORCHESTRATION_RESULT, undefined, undefined);
    expect(result.isError).toBeFalsy();
    const body = parseBody((result.content[0] as { text: string }).text);
    expect(body['workerDispatchStatus']).toBeUndefined();
  });

  it('omits workerDispatchStatus when totalWorkers is 0 (dispatch ran but no plan)', () => {
    const dispatch = makeDispatch(0, 0);
    const result = assembleOrchestrateOutput(ORCHESTRATION_RESULT, undefined, dispatch);
    const body = parseBody((result.content[0] as { text: string }).text);
    expect(body['workerDispatchStatus']).toBeUndefined();
    expect(result.isError).toBeFalsy();
  });

  it('reports workerDispatchStatus=success and isError=false when all workers succeed', () => {
    const dispatch = makeDispatch(3, 0);
    const result = assembleOrchestrateOutput(ORCHESTRATION_RESULT, undefined, dispatch);
    const body = parseBody((result.content[0] as { text: string }).text);
    expect(body['workerDispatchStatus']).toBe('success');
    expect(result.isError).toBeFalsy();
  });

  it('reports workerDispatchStatus=partial and isError=false when some workers fail', () => {
    const dispatch = makeDispatch(1, 2);
    const result = assembleOrchestrateOutput(ORCHESTRATION_RESULT, undefined, dispatch);
    const body = parseBody((result.content[0] as { text: string }).text);
    expect(body['workerDispatchStatus']).toBe('partial');
    expect(result.isError).toBeFalsy();
  });

  it('reports workerDispatchStatus=failed and isError=true when all workers fail', () => {
    // This is the #2619 reporter's exact scenario: two workers both time
    // out at ~60010ms with MCP error -32001. Before the fix the tool
    // returned isError:false with an empty output; after the fix it
    // flips to isError:true with the structured worker errors still in
    // the body for the caller to inspect.
    const dispatch = makeDispatch(0, 2);
    const result = assembleOrchestrateOutput(ORCHESTRATION_RESULT, undefined, dispatch);
    const body = parseBody((result.content[0] as { text: string }).text);
    expect(body['workerDispatchStatus']).toBe('failed');
    expect(result.isError).toBe(true);
    // The structured worker results are still there for inspection.
    const dispatchInBody = body['workerDispatch'] as { results: unknown[]; successCount: number };
    expect(dispatchInBody.successCount).toBe(0);
    expect(dispatchInBody.results).toHaveLength(2);
  });
});
