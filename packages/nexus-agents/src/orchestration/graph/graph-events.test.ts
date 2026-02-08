/**
 * Tests for graph event emission helpers.
 * @module orchestration/graph/graph-events.test
 */

import { describe, it, expect, vi } from 'vitest';
import {
  emitNodeStarted,
  emitNodeResults,
  emitStateUpdated,
  emitStepCompleted,
  emitExecutionComplete,
} from './graph-events.js';
import type { GraphExecuteOptions, NodeResult } from './graph-types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeOptions(onEvent = vi.fn()) {
  return { onEvent } satisfies GraphExecuteOptions;
}

function makeCtx(
  stepsExecuted = 1,
  runnableIds: string[] = ['a']
): {
  stepsExecuted: number;
  runnableIds: string[];
} {
  return { stepsExecuted, runnableIds };
}

function successResult(nodeId: string, keys: Record<string, unknown> = {}): NodeResult {
  return { nodeId, status: 'success' as const, stateUpdates: keys, durationMs: 42 };
}

function failedResult(nodeId: string, error = 'boom'): NodeResult {
  return { nodeId, status: 'failed' as const, stateUpdates: {}, durationMs: 0, error };
}

// ---------------------------------------------------------------------------
// emitNodeStarted
// ---------------------------------------------------------------------------

describe('emitNodeStarted', () => {
  it('emits node_started for each runnable node', () => {
    const opts = makeOptions();
    emitNodeStarted(makeCtx(2, ['x', 'y']), opts);
    expect(opts.onEvent).toHaveBeenCalledTimes(2);
    const first = opts.onEvent.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(first).toMatchObject({ type: 'node_started', nodeId: 'x', stepNumber: 2 });
    const second = opts.onEvent.mock.calls[1]?.[0] as Record<string, unknown>;
    expect(second).toMatchObject({ type: 'node_started', nodeId: 'y', stepNumber: 2 });
  });

  it('does nothing when onEvent is undefined', () => {
    // Should not throw
    emitNodeStarted(makeCtx(1, ['a']), undefined);
    emitNodeStarted(makeCtx(1, ['a']), {});
  });
});

// ---------------------------------------------------------------------------
// emitNodeResults
// ---------------------------------------------------------------------------

describe('emitNodeResults', () => {
  it('emits node_completed for successful results', () => {
    const opts = makeOptions();
    const results = [successResult('n1', { foo: 1 })];
    emitNodeResults(makeCtx(3), results, opts);
    expect(opts.onEvent).toHaveBeenCalledTimes(1);
    const event = opts.onEvent.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(event).toMatchObject({
      type: 'node_completed',
      nodeId: 'n1',
      stepNumber: 3,
      durationMs: 42,
      resultKeys: ['foo'],
    });
  });

  it('emits node_error for failed results', () => {
    const opts = makeOptions();
    const results = [failedResult('n2', 'timeout')];
    emitNodeResults(makeCtx(1), results, opts);
    const event = opts.onEvent.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(event).toMatchObject({
      type: 'node_error',
      nodeId: 'n2',
      error: 'timeout',
    });
  });

  it('uses "unknown" when failed result has no error string', () => {
    const opts = makeOptions();
    const result: NodeResult = { nodeId: 'n3', status: 'failed', stateUpdates: {}, durationMs: 0 };
    emitNodeResults(makeCtx(), [result], opts);
    const event = opts.onEvent.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(event).toMatchObject({ type: 'node_error', error: 'unknown' });
  });

  it('does nothing when onEvent is undefined', () => {
    emitNodeResults(makeCtx(), [successResult('n1')], undefined);
  });
});

// ---------------------------------------------------------------------------
// emitStateUpdated
// ---------------------------------------------------------------------------

describe('emitStateUpdated', () => {
  it('emits state_updated with deduplicated keys', () => {
    const opts = makeOptions();
    const results = [successResult('a', { x: 1, y: 2 }), successResult('b', { y: 3, z: 4 })];
    emitStateUpdated(makeCtx(5), results, opts);
    expect(opts.onEvent).toHaveBeenCalledTimes(1);
    const event = opts.onEvent.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(event).toMatchObject({ type: 'state_updated', stepNumber: 5 });
    expect((event['updatedKeys'] as string[]).sort()).toEqual(['x', 'y', 'z']);
  });

  it('does not emit when all results are failed', () => {
    const opts = makeOptions();
    emitStateUpdated(makeCtx(), [failedResult('a')], opts);
    expect(opts.onEvent).not.toHaveBeenCalled();
  });

  it('does not emit when successful results have no state updates', () => {
    const opts = makeOptions();
    emitStateUpdated(makeCtx(), [successResult('a', {})], opts);
    expect(opts.onEvent).not.toHaveBeenCalled();
  });

  it('does nothing when onEvent is undefined', () => {
    emitStateUpdated(makeCtx(), [successResult('a', { k: 1 })], undefined);
  });
});

// ---------------------------------------------------------------------------
// emitStepCompleted
// ---------------------------------------------------------------------------

describe('emitStepCompleted', () => {
  it('emits step_completed with correct data', () => {
    const opts = makeOptions();
    emitStepCompleted(makeCtx(7), 3, opts);
    const event = opts.onEvent.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(event).toMatchObject({ type: 'step_completed', stepNumber: 7, nodesExecuted: 3 });
  });

  it('does nothing when onEvent is undefined', () => {
    emitStepCompleted(makeCtx(), 1, undefined);
  });
});

// ---------------------------------------------------------------------------
// emitExecutionComplete
// ---------------------------------------------------------------------------

describe('emitExecutionComplete', () => {
  it('emits execution_complete with totals', () => {
    const opts = makeOptions();
    emitExecutionComplete(4, 12, 500, opts);
    const event = opts.onEvent.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(event).toMatchObject({
      type: 'execution_complete',
      totalSteps: 4,
      totalNodes: 12,
      durationMs: 500,
    });
    expect(event['timestamp']).toBeDefined();
  });

  it('does nothing when onEvent is undefined', () => {
    emitExecutionComplete(1, 1, 100, undefined);
  });
});
