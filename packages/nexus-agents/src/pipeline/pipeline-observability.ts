/**
 * Pipeline Observability — Shared stage event emission (#1734, Phase 1.1)
 *
 * Extracts the duplicated emitStageEvent pattern from agent-executor.ts
 * and pipeline-runner.ts into a single shared helper.
 *
 * @module pipeline/pipeline-observability
 */

import { getPipelineEventBus } from './event-bus.js';
import type { IEventBus } from './event-types.js';

// ============================================================================
// Types
// ============================================================================

/** Options for emitting a stage started event. */
export interface StageStartedOptions {
  readonly bus?: IEventBus | undefined;
  readonly executionId: string;
  readonly stageId: string;
  readonly pluginId?: string | undefined;
}

/** Options for emitting a stage completed event. */
export interface StageCompletedOptions {
  readonly bus?: IEventBus | undefined;
  readonly executionId: string;
  readonly stageId: string;
  readonly durationMs: number;
  readonly success?: boolean | undefined;
}

/** Options for emitting a stage failed event. */
export interface StageFailedOptions {
  readonly bus?: IEventBus | undefined;
  readonly executionId: string;
  readonly stageId: string;
  readonly error: string;
}

// ============================================================================
// Helpers
// ============================================================================

/** Resolve the event bus — use provided or fall back to global singleton. */
function resolveBus(bus: IEventBus | undefined): IEventBus | undefined {
  return bus ?? getPipelineEventBus();
}

// ============================================================================
// Stage Event Emission
// ============================================================================

/** Emit a stage.started event. */
export function emitStageStarted(options: StageStartedOptions): void {
  const bus = resolveBus(options.bus);
  if (bus === undefined) return;
  bus.emit({
    type: 'stage.started',
    timestamp: Date.now(),
    executionId: options.executionId,
    stageId: options.stageId,
    pluginId: options.pluginId ?? options.stageId,
  });
}

/** Emit a stage.completed event. */
export function emitStageCompleted(options: StageCompletedOptions): void {
  const bus = resolveBus(options.bus);
  if (bus === undefined) return;
  bus.emit({
    type: 'stage.completed',
    timestamp: Date.now(),
    executionId: options.executionId,
    stageId: options.stageId,
    durationMs: options.durationMs,
    success: options.success ?? true,
  });
}

/** Emit a stage.failed event. */
export function emitStageFailed(options: StageFailedOptions): void {
  const bus = resolveBus(options.bus);
  if (bus === undefined) return;
  bus.emit({
    type: 'stage.failed',
    timestamp: Date.now(),
    executionId: options.executionId,
    stageId: options.stageId,
    error: options.error,
  });
}

/**
 * Convenience wrapper matching agent-executor's original signature.
 * Emits stage events using the global event bus with a prefixed executionId.
 */
export function emitPipelineStageEvent(
  prefix: string,
  stage: string,
  status: 'started' | 'completed' | 'failed',
  details?: Record<string, unknown>
): void {
  const executionId = `${prefix}-${stage}`;
  if (status === 'started') {
    emitStageStarted({ executionId, stageId: stage });
  } else if (status === 'completed') {
    emitStageCompleted({
      executionId,
      stageId: stage,
      durationMs: (details?.['durationMs'] as number) || 0,
    });
  } else {
    emitStageFailed({
      executionId,
      stageId: stage,
      error: (details?.['error'] as string) || 'Unknown',
    });
  }
}
