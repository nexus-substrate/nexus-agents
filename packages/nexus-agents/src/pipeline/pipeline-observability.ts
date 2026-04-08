/**
 * Pipeline Observability — Wires dev pipeline into nexus-agents telemetry (#1684)
 *
 * Integrates TraceWriter, OutcomeStore, and EventBus into the
 * development pipeline for full observability.
 *
 * DRY: reuses existing infrastructure instead of building new.
 *
 * @module pipeline/pipeline-observability
 */

import { createLogger, getTimeProvider } from '../core/index.js';
import { getPipelineEventBus } from './event-bus.js';
import type { PipelineEvent } from './event-types.js';

const logger = createLogger({ component: 'pipeline-observability' });

/** Emit a pipeline event for a dev pipeline stage. */
export function emitStageEvent(
  stage: string,
  status: 'started' | 'completed' | 'failed',
  details?: Record<string, unknown>
): void {
  const bus = getPipelineEventBus();
  const timestamp = getTimeProvider().now();

  if (status === 'started') {
    bus.emit({
      type: 'stage.started',
      timestamp,
      executionId: `dev-pipeline-${stage}`,
      stageId: stage,
    } as PipelineEvent);
  } else if (status === 'completed') {
    bus.emit({
      type: 'stage.completed',
      timestamp,
      executionId: `dev-pipeline-${stage}`,
      stageId: stage,
      durationMs: typeof details?.['durationMs'] === 'number' ? details['durationMs'] : 0,
    } as PipelineEvent);
  } else {
    bus.emit({
      type: 'stage.failed',
      timestamp,
      executionId: `dev-pipeline-${stage}`,
      stageId: stage,
      error: typeof details?.['error'] === 'string' ? details['error'] : 'Unknown error',
    } as PipelineEvent);
  }
}

/** Record a pipeline task outcome to the OutcomeStore. */
export async function recordPipelineOutcome(
  taskId: string,
  category: string,
  success: boolean,
  durationMs: number,
  errorMessage?: string
): Promise<void> {
  try {
    const { getOutcomeStore } = await import('../orchestration/outcomes/outcome-store.js');
    const store = getOutcomeStore();
    store.append({
      cli: 'claude' as const,
      category: category as 'code_generation',
      success,
      durationMs,
      timestamp: new Date().toISOString(),
      source: 'delegate',
      errorMessage: errorMessage?.slice(0, 500),
    });
    logger.debug('Recorded pipeline outcome', { taskId, success });
  } catch (error) {
    logger.debug('Failed to record outcome', { error: String(error) });
  }
}
