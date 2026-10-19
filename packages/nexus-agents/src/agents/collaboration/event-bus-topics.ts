/**
 * Event Bus Topic Constants (agents/collaboration backwards compatibility re-export).
 *
 * The canonical topic constants have moved to `core/event-bus-topics.ts` to enforce clean
 * layer separation (Issue #5129 Item 1).
 *
 * @module agents/collaboration/event-bus-topics
 * @deprecated Prefer importing from `core/event-bus.js` or `core/event-bus-topics.js`
 */

export { EventTopics } from '../../core/event-bus-topics.js';
