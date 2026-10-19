/**
 * Event Bus Helper Functions (agents/collaboration backwards compatibility re-export).
 *
 * The canonical helper functions have moved to `core/event-bus-helpers.ts` to enforce clean
 * layer separation (Issue #5129 Item 1).
 *
 * @module agents/collaboration/event-bus-helpers
 * @deprecated Prefer importing from `core/event-bus.js` or `core/event-bus-helpers.js`
 */

export {
  DEFAULT_MAX_HISTORY_SIZE,
  MAX_SUBSCRIPTIONS,
  type SubscriptionRecord,
  patternToRegex,
  topicMatchesPattern,
  generateEventId,
  generateSubscriptionId,
  generateCorrelationId,
  createChildCorrelationId,
  applyHistoryFilters,
  applyTimestampFilters,
  applyHistoryLimit,
  enrichEvent,
  countMatchingSubscribers,
} from '../../core/event-bus-helpers.js';
