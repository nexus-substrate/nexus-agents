/**
 * Event Bus Implementation (agents/collaboration backwards compatibility re-export).
 *
 * The canonical implementation has moved to `core/event-bus.ts` to enforce clean
 * layer separation (Issue #5129 Item 1). This module re-exports the implementation
 * and helpers so existing imports continue to function without breaking changes.
 *
 * @module agents/collaboration/event-bus
 * @deprecated Prefer importing from `core/event-bus.js`
 */

export {
  CollaborationEventBus,
  createEvent,
  getGlobalEventBus,
  resetGlobalEventBus,
  generateCorrelationId,
  createChildCorrelationId,
} from '../../core/event-bus.js';
