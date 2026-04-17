/**
 * nexus-agents/core - Step Logger Bridge
 *
 * Subscribes to the step-bus and emits a structured JSON log entry for
 * every StepEvent. This preserves the existing "JSON stream is the source
 * of truth" invariant while enabling the stderr ConsoleRenderer to be a
 * purely additive, optional overlay.
 *
 * @module core/step-logger-bridge
 */

import { createLogger } from './logger.js';
import { stepBus } from './step-bus.js';
import type { StepEvent } from './step-events.js';

const logger = createLogger({ component: 'step-events' });

interface ActiveBridge {
  dispose(): void;
}

/**
 * Start publishing step events as info-level JSON log entries.
 * Returns a disposer. Safe to call multiple times.
 */
export function startStepLoggerBridge(): ActiveBridge {
  const handler = (event: StepEvent): void => {
    // Use logger.info for started/completed, logger.warn for failed.
    // Flat payload — consumers read discriminator off `event`.
    const payload = { ...event };
    if (event.event === 'step.failed') {
      logger.warn('step.failed', payload);
    } else {
      logger.info(event.event, payload);
    }
  };
  stepBus.on('step', handler);
  return {
    dispose(): void {
      stepBus.off('step', handler);
    },
  };
}
