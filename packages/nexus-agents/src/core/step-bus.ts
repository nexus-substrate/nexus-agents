/**
 * nexus-agents/core - Step Event Bus
 *
 * Process-local EventEmitter that carries `StepEvent`s. Multiple peer
 * subscribers (the JSON logger bridge, the stderr ConsoleRenderer, the
 * MCP notifier) observe the same events.
 *
 * Keep this module tiny and free of side effects so importing it doesn't
 * force a subscription.
 *
 * @module core/step-bus
 */

import { EventEmitter } from 'node:events';
import type { StepEvent } from './step-events.js';

/**
 * Singleton emitter. Subscribers call `stepBus.on('step', handler)`.
 * Publishers call `stepBus.emit('step', event)`.
 */
class StepBus extends EventEmitter {
  override emit(eventName: 'step', event: StepEvent): boolean {
    return super.emit(eventName, event);
  }

  override on(eventName: 'step', listener: (event: StepEvent) => void): this {
    return super.on(eventName, listener);
  }

  override off(eventName: 'step', listener: (event: StepEvent) => void): this {
    return super.off(eventName, listener);
  }
}

/** Process-local step event bus. */
export const stepBus = new StepBus();

// Node default is 10 listeners; we expect ≤5 (JSON logger, renderer, MCP notifier, tests).
// Still, raise the cap slightly so test fixtures that attach/detach don't warn.
stepBus.setMaxListeners(20);
