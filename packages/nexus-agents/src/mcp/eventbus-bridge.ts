/**
 * EventBus to MCP Server Bridge
 *
 * Bridges EventBus events to SwarmObserver for observability in
 * Claude Desktop context. Provides visibility into agent-to-agent
 * communication that would otherwise be opaque.
 *
 * @module mcp/eventbus-bridge
 * (Source: Issue #307 - EventBus MCP integration)
 */

import type { ILogger } from '../core/index.js';
import type { EventBusConfig } from '../config/index.js';
import {
  getGlobalEventBus,
  EventTopics,
  type Subscription,
  type DomainEvent,
  type EventBus,
} from '../agents/collaboration/index.js';
import { SwarmObserver } from '../observability/index.js';
import {
  extractAgentId,
  extractTargetAgentId,
  mapEventType,
  mapInteractionType,
  createObserverPayload,
} from './eventbus-bridge-helpers.js';

/**
 * Default EventBus configuration.
 */
const DEFAULT_CONFIG: Required<EventBusConfig> = {
  enabled: true,
  maxHistorySize: 1000,
  subscriptions: {
    consensus: true,
    agent: true,
    protocol: true,
    session: true,
    message: false,
    byzantine: true,
  },
  logging: {
    frequentEventLevel: 'debug',
    importantEventLevel: 'info',
  },
};

/**
 * Important event topics that should be logged at info level.
 */
const IMPORTANT_TOPICS = new Set<string>([
  EventTopics.CONSENSUS_REACHED,
  EventTopics.SESSION_CREATED,
  EventTopics.SESSION_FINALIZED,
  EventTopics.PROTOCOL_COMPLETED,
  EventTopics.BYZANTINE_PATTERN_DETECTED,
  EventTopics.BYZANTINE_AGENT_FLAGGED,
]);

/**
 * Result of bridge initialization.
 */
export interface EventBusBridgeResult {
  /** Whether the bridge was initialized */
  readonly initialized: boolean;
  /** Number of active subscriptions */
  readonly subscriptionCount: number;
  /** Cleanup function to call on shutdown */
  readonly cleanup: () => void;
}

/**
 * Merges user config with defaults.
 */
function mergeConfig(config?: Partial<EventBusConfig>): Required<EventBusConfig> {
  if (config === undefined) {
    return DEFAULT_CONFIG;
  }

  return {
    enabled: config.enabled ?? DEFAULT_CONFIG.enabled,
    maxHistorySize: config.maxHistorySize ?? DEFAULT_CONFIG.maxHistorySize,
    subscriptions: {
      ...DEFAULT_CONFIG.subscriptions,
      ...config.subscriptions,
    },
    logging: {
      ...DEFAULT_CONFIG.logging,
      ...config.logging,
    },
  };
}

/**
 * Creates subscriptions for enabled event patterns.
 */
function createSubscriptions(
  eventBus: EventBus,
  subs: Required<EventBusConfig>['subscriptions'],
  handler: (event: DomainEvent) => void
): Subscription[] {
  const subscriptions: Subscription[] = [];

  if (subs.consensus) {
    subscriptions.push(eventBus.subscribe(EventTopics.CONSENSUS_ALL, handler));
  }
  if (subs.agent) {
    subscriptions.push(eventBus.subscribe(EventTopics.AGENT_ALL, handler));
  }
  if (subs.protocol) {
    subscriptions.push(eventBus.subscribe(EventTopics.PROTOCOL_ALL, handler));
  }
  if (subs.session) {
    subscriptions.push(eventBus.subscribe(EventTopics.SESSION_ALL, handler));
  }
  if (subs.message) {
    subscriptions.push(eventBus.subscribe(EventTopics.MESSAGE_ALL, handler));
  }
  if (subs.byzantine) {
    subscriptions.push(eventBus.subscribe(EventTopics.BYZANTINE_ALL, handler));
  }

  return subscriptions;
}

/**
 * Creates cleanup function for graceful shutdown.
 */
function createCleanupFunction(
  subscriptions: Subscription[],
  eventBus: EventBus,
  logger: ILogger
): () => void {
  return (): void => {
    logger.debug('Cleaning up EventBus bridge subscriptions');
    for (const sub of subscriptions) {
      sub.unsubscribe();
    }
    logger.info('EventBus bridge cleanup complete', {
      unsubscribedCount: subscriptions.length,
      finalStats: eventBus.getStats(),
    });
  };
}

/**
 * Initializes the EventBus bridge with SwarmObserver integration.
 *
 * Subscribes to configured event patterns and:
 * 1. Logs events at appropriate levels (debug for frequent, info for important)
 * 2. Records interactions to SwarmObserver for graph-based analysis
 * 3. Tracks event statistics for observability
 *
 * @param observer - SwarmObserver instance for interaction tracking
 * @param logger - Logger instance for event logging
 * @param config - Optional EventBus configuration
 * @returns Bridge result with cleanup function
 */
export function initializeEventBusBridge(
  observer: SwarmObserver,
  logger: ILogger,
  config?: Partial<EventBusConfig>
): EventBusBridgeResult {
  const mergedConfig = mergeConfig(config);

  if (!mergedConfig.enabled) {
    logger.debug('EventBus bridge disabled by configuration');
    return { initialized: false, subscriptionCount: 0, cleanup: () => {} };
  }

  const eventBus = getGlobalEventBus({ maxHistorySize: mergedConfig.maxHistorySize });
  const logConfig = mergedConfig.logging;

  logger.info('Initializing EventBus bridge for MCP server', {
    maxHistorySize: mergedConfig.maxHistorySize,
    subscriptions: mergedConfig.subscriptions,
  });

  const handler = (event: DomainEvent): void => {
    handleEvent(event, observer, logger, logConfig);
  };

  const subscriptions = createSubscriptions(eventBus, mergedConfig.subscriptions, handler);

  logger.info('EventBus bridge initialized', {
    subscriptionCount: subscriptions.length,
    eventBusStats: eventBus.getStats(),
  });

  const cleanup = createCleanupFunction(subscriptions, eventBus, logger);

  return {
    initialized: true,
    subscriptionCount: subscriptions.length,
    cleanup,
  };
}

/**
 * Handles an event by logging and recording to SwarmObserver.
 */
function handleEvent(
  event: DomainEvent,
  observer: SwarmObserver,
  logger: ILogger,
  logConfig: Required<EventBusConfig>['logging']
): void {
  const isImportant = IMPORTANT_TOPICS.has(event.topic);
  const logLevel = isImportant ? logConfig.importantEventLevel : logConfig.frequentEventLevel;

  const logContext = {
    eventId: event.eventId,
    topic: event.topic,
    sessionId: event.sessionId,
    correlationId: event.correlationId,
    timestamp: event.timestamp,
  };

  if (logLevel === 'info') {
    logger.info(`EventBus: ${event.topic}`, logContext);
  } else {
    logger.debug(`EventBus: ${event.topic}`, logContext);
  }

  recordEventToObserver(event, observer);
}

/**
 * Records an EventBus event to SwarmObserver.
 * Maps EventBus events to SwarmObserver's interaction model.
 */
function recordEventToObserver(event: DomainEvent, observer: SwarmObserver): void {
  const payload = event.payload as Record<string, unknown>;
  const agentId = extractAgentId(payload);

  if (agentId === undefined) {
    return; // Cannot track without agent ID
  }

  const eventType = mapEventType(event.topic);
  const observerPayload = createObserverPayload(event, payload);
  const traceId = event.correlationId ?? SwarmObserver.generateTraceId();

  observer.recordEvent({
    eventId: event.eventId,
    timestamp: event.timestamp,
    agentId,
    eventType,
    traceId,
    spanId: SwarmObserver.generateSpanId(),
    payload: observerPayload,
  });

  recordInteractionIfApplicable(event, payload, agentId, observer, traceId);
}

/**
 * Records interaction for message/agent events if applicable.
 */
function recordInteractionIfApplicable(
  event: DomainEvent,
  payload: Record<string, unknown>,
  agentId: string,
  observer: SwarmObserver,
  traceId: string
): void {
  const isMessageOrAgentEvent =
    event.topic.startsWith('message.') || event.topic.startsWith('agent.');

  if (!isMessageOrAgentEvent) {
    return;
  }

  const targetId = extractTargetAgentId(payload);
  if (targetId !== undefined && targetId !== agentId) {
    observer.recordInteraction({
      from: agentId,
      to: targetId,
      interactionType: mapInteractionType(event.topic),
      outcome: 'success',
      traceId,
    });
  }
}

/**
 * Gets EventBus statistics for observability reporting.
 */
export function getEventBusStats(): {
  eventsEmitted: number;
  activeSubscriptions: number;
  historySize: number;
  errorCount: number;
} {
  const eventBus = getGlobalEventBus();
  return eventBus.getStats();
}
