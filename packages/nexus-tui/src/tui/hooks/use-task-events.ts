/**
 * useTaskEvents — Hook for building active task state from EventBus events.
 *
 * Subscribes to pipeline and stage events to construct real-time
 * task progress state for the TaskPanel.
 *
 * @module tui/hooks/use-task-events
 */

import { useEffect } from 'react';
import { useDispatch } from '../state.js';
import type { ActiveTaskState } from '../state.js';

/** Minimal event shape for pipeline events. */
interface PipelineEventLike {
  readonly type: string;
  readonly timestamp: number;
  readonly [key: string]: unknown;
}

/** Minimal EventBus-like interface. */
interface BusLike {
  subscribe(
    filter: { type?: string | readonly string[] },
    handler: (event: PipelineEventLike) => void
  ): () => void;
}

/** Subscribe to pipeline events and dispatch active task updates. */
export function useTaskEvents(bus: BusLike | null): void {
  const dispatch = useDispatch();

  useEffect(() => {
    if (bus === null) return;

    let currentTask: ActiveTaskState | null = null;

    const unsub = bus.subscribe(
      {
        type: [
          'pipeline.started',
          'stage.started',
          'stage.completed',
          'stage.failed',
          'pipeline.completed',
        ],
      },
      (event: PipelineEventLike) => {
        currentTask = processEvent(currentTask, event);
        dispatch({ type: 'SET_ACTIVE_TASK', task: currentTask });
      }
    );

    return unsub;
  }, [bus, dispatch]);
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
function processEvent(
  current: ActiveTaskState | null,
  event: PipelineEventLike
): ActiveTaskState | null {
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
