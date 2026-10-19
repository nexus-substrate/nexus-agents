/**
 * Event Bus Core Type Definitions (agents/collaboration backwards compatibility re-export).
 *
 * The canonical types have moved to `core/event-bus-types.ts` to enforce clean
 * layer separation (Issue #5129 Item 1).
 *
 * @module agents/collaboration/event-bus-core-types
 * @deprecated Prefer importing from `core/event-bus.js` or `core/event-bus-types.js`
 */

export type {
  SubscriptionId,
  TopicPattern,
  DomainEvent,
  TypedEvent,
  EventListener,
  Subscription,
  EventFilter,
  EventBusOptions,
  EventBusStats,
  ICollaborationEventBus,
} from '../../core/event-bus-types.js';
