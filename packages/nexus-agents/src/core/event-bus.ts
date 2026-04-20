/**
 * Event-bus public API (core re-export barrel).
 *
 * The actual implementation currently lives under
 * `agents/collaboration/event-bus*` for historical reasons (it was
 * introduced alongside the collaboration module). This barrel makes
 * the event-bus available under the stable `core/event-bus` import
 * path so any subsystem can wire into it without cross-layer
 * violations in the fitness-audit.
 *
 * New code should import from here; existing code at the old path
 * continues to work (no breaking change). A physical move of the
 * implementation to this module is v3.0-gated — the internal
 * `event-bus-events.ts` module has a soft dependency on
 * `collaboration-types.ts` (SessionStatus, VoteDecision) that must be
 * decoupled before a clean move.
 *
 * @module core/event-bus
 */

export {
  EventBus,
  createEvent,
  getGlobalEventBus,
  resetGlobalEventBus,
  generateCorrelationId,
  createChildCorrelationId,
} from '../agents/collaboration/event-bus.js';

export type {
  IEventBus,
  EventBusOptions,
  EventBusStats,
  EventListener,
  EventFilter,
  Subscription,
  SubscriptionId,
  TopicPattern,
  DomainEvent,
} from '../agents/collaboration/event-bus-types.js';

export { EventTopics } from '../agents/collaboration/event-bus-topics.js';
