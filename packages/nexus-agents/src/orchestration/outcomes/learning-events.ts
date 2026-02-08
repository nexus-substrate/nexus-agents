/**
 * Learning Events — Event emission helpers for the learning loop (Issue #901, Phase 4)
 *
 * Thin wrappers over the V2 EventBus to emit typed learning events
 * when adaptive thresholds change or trends are detected.
 *
 * @module orchestration/outcomes/learning-events
 */

import type { IEventBus, PipelineEvent } from '../../pipeline/event-types.js';
import type { Trend } from './adaptive-thresholds.js';

// ============================================================================
// Types
// ============================================================================

/** Detail payload for threshold update events. */
export interface ThresholdUpdateDetail {
  readonly cli: string;
  readonly category: string;
  readonly oldBaseline: number;
  readonly newBaseline: number;
  readonly trend: Trend;
}

/** Detail payload for trend detection events. */
export interface TrendDetectedDetail {
  readonly cli: string;
  readonly category: string;
  readonly trend: Trend;
  readonly confidence: number;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Emits a learning.threshold_updated event on the bus.
 * Fires when the adaptive baseline changes for a CLI+category pair.
 */
export function emitThresholdUpdate(bus: IEventBus, detail: ThresholdUpdateDetail): void {
  const event: PipelineEvent = {
    type: 'learning.threshold_updated',
    timestamp: Date.now(),
    cli: detail.cli,
    category: detail.category,
    oldBaseline: detail.oldBaseline,
    newBaseline: detail.newBaseline,
    trend: detail.trend,
  };
  bus.emit(event);
}

/**
 * Emits a learning.trend_detected event on the bus.
 * Fires when a meaningful performance trend is identified.
 */
export function emitTrendDetected(bus: IEventBus, detail: TrendDetectedDetail): void {
  const event: PipelineEvent = {
    type: 'learning.trend_detected',
    timestamp: Date.now(),
    cli: detail.cli,
    category: detail.category,
    trend: detail.trend,
    confidence: detail.confidence,
  };
  bus.emit(event);
}
