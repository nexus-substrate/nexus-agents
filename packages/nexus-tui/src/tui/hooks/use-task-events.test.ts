/**
 * useTaskEvents — Unit tests for task event processing.
 *
 * @module tui/hooks/use-task-events.test
 */

import { describe, it, expect } from 'vitest';

// Test the processEvent logic directly
// (Same logic as in the hook, extracted for testability)

interface StageInfo {
  readonly stageId: string;
  readonly status: 'pending' | 'running' | 'completed' | 'failed';
}

interface ActiveTaskState {
  readonly taskId: string;
  readonly executionId: string;
  readonly stages: readonly StageInfo[];
  readonly startedAt: number;
}

interface EventLike {
  readonly type: string;
  readonly timestamp: number;
  readonly [key: string]: unknown;
}

/** Safely extract a string field from an event record. */
function getString(rec: Record<string, unknown>, key: string, fallback: string): string {
  const val = rec[key];
  return typeof val === 'string' ? val : fallback;
}

/** Update a stage's status within the current task. */
function updateStage(
  current: ActiveTaskState,
  stageId: string,
  status: 'running' | 'completed' | 'failed'
): ActiveTaskState {
  const exists = current.stages.some((s) => s.stageId === stageId);
  if (!exists && status === 'running') {
    return { ...current, stages: [...current.stages, { stageId, status }] };
  }
  const stages = current.stages.map((s) => (s.stageId === stageId ? { ...s, status } : s));
  return { ...current, stages };
}

/** Process a single event and return updated task state. */
function processEvent(current: ActiveTaskState | null, event: EventLike): ActiveTaskState | null {
  const rec = event as Record<string, unknown>;

  if (event.type === 'pipeline.started') {
    return {
      taskId: getString(rec, 'taskId', 'unknown'),
      executionId: getString(rec, 'executionId', ''),
      stages: [],
      startedAt: event.timestamp,
    };
  }

  if (current === null || event.type === 'pipeline.completed') return null;

  const stageId = getString(rec, 'stageId', 'unknown');
  const statusMap: Record<string, 'running' | 'completed' | 'failed'> = {
    'stage.started': 'running',
    'stage.completed': 'completed',
    'stage.failed': 'failed',
  };
  const status = statusMap[event.type];
  if (status !== undefined) return updateStage(current, stageId, status);

  return current;
}

describe('processEvent', () => {
  it('creates task on pipeline.started', () => {
    const result = processEvent(null, {
      type: 'pipeline.started',
      timestamp: 1000,
      taskId: 'task-1',
      executionId: 'exec-1',
    });
    expect(result).toEqual({
      taskId: 'task-1',
      executionId: 'exec-1',
      stages: [],
      startedAt: 1000,
    });
  });

  it('adds stage on stage.started', () => {
    const task: ActiveTaskState = {
      taskId: 'task-1',
      executionId: 'exec-1',
      stages: [],
      startedAt: 1000,
    };
    const result = processEvent(task, {
      type: 'stage.started',
      timestamp: 2000,
      stageId: 'analyze',
    });
    expect(result?.stages).toHaveLength(1);
    expect(result?.stages[0]).toEqual({ stageId: 'analyze', status: 'running' });
  });

  it('completes stage on stage.completed', () => {
    const task: ActiveTaskState = {
      taskId: 'task-1',
      executionId: 'exec-1',
      stages: [{ stageId: 'analyze', status: 'running' }],
      startedAt: 1000,
    };
    const result = processEvent(task, {
      type: 'stage.completed',
      timestamp: 3000,
      stageId: 'analyze',
    });
    expect(result?.stages[0]?.status).toBe('completed');
  });

  it('clears task on pipeline.completed', () => {
    const task: ActiveTaskState = {
      taskId: 'task-1',
      executionId: 'exec-1',
      stages: [],
      startedAt: 1000,
    };
    const result = processEvent(task, {
      type: 'pipeline.completed',
      timestamp: 4000,
    });
    expect(result).toBeNull();
  });

  it('marks stage as failed', () => {
    const task: ActiveTaskState = {
      taskId: 'task-1',
      executionId: 'exec-1',
      stages: [{ stageId: 's1', status: 'running' }],
      startedAt: 1000,
    };
    const result = processEvent(task, {
      type: 'stage.failed',
      timestamp: 3000,
      stageId: 's1',
    });
    expect(result?.stages[0]?.status).toBe('failed');
  });

  it('returns null for events when no active task', () => {
    const result = processEvent(null, {
      type: 'stage.started',
      timestamp: 2000,
      stageId: 'x',
    });
    expect(result).toBeNull();
  });
});
