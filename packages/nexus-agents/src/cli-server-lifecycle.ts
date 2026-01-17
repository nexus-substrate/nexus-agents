/**
 * nexus-agents CLI Server - Lifecycle Helpers
 *
 * Helper functions for server lifecycle events and SwarmObserver management.
 * Extracted from cli-server.ts to maintain file size limits.
 *
 * @module cli-server-lifecycle
 * (Source: Issue #339)
 */

import type { ILogger } from './core/index.js';
import { getSwarmObserver, SwarmObserver } from './observability/index.js';
import type { EventBusConfig } from './config/index.js';
import {
  initializeEventBusBridge,
  getEventBusStats,
  type EventBusBridgeResult,
} from './mcp/index.js';

/**
 * Initializes the global SwarmObserver for interaction tracing.
 *
 * @param logger - Logger instance
 * @returns The initialized SwarmObserver instance
 */
export function initializeSwarmObserver(logger: ILogger): SwarmObserver {
  const observer = getSwarmObserver({
    maxEvents: 10000,
  });

  logger.info('SwarmObserver initialized for interaction tracing', {
    maxEvents: 10000,
  });

  return observer;
}

/**
 * Initializes the EventBus bridge for agent-to-agent communication visibility.
 * Bridges EventBus events to SwarmObserver for observability in Claude Desktop.
 *
 * @param observer - SwarmObserver instance
 * @param logger - Logger instance
 * @param config - Optional EventBus configuration
 * @returns EventBus bridge result with cleanup function
 *
 * (Source: Issue #307 - EventBus MCP integration)
 */
export function initializeEventBus(
  observer: SwarmObserver,
  logger: ILogger,
  config?: EventBusConfig
): EventBusBridgeResult {
  // Check environment variable for enable/disable override
  const envEnabled = process.env['NEXUS_EVENTBUS_ENABLED'];
  const enabled = envEnabled !== undefined ? envEnabled === 'true' : (config?.enabled ?? true);

  const effectiveConfig: Partial<EventBusConfig> = {
    ...config,
    enabled,
  };

  const result = initializeEventBusBridge(observer, logger, effectiveConfig);

  if (result.initialized) {
    logger.info('EventBus bridge initialized for A2A visibility', {
      subscriptionCount: result.subscriptionCount,
      eventBusEnabled: enabled,
    });
  }

  return result;
}

/**
 * Context for server lifecycle events.
 */
export interface ServerEventContext {
  readonly traceId: string;
  readonly startupSpanId: string;
}

/**
 * Records a server startup event to the SwarmObserver.
 */
export function recordServerStartup(observer: SwarmObserver): ServerEventContext {
  const traceId = SwarmObserver.generateTraceId();
  const startupSpanId = SwarmObserver.generateSpanId();

  observer.recordEvent({
    eventId: `startup-${startupSpanId}`,
    timestamp: new Date().toISOString(),
    agentId: 'mcp-server',
    eventType: 'task_started',
    traceId,
    spanId: startupSpanId,
    payload: {
      type: 'task',
      phase: 'started',
      taskId: traceId,
      taskDescription: 'MCP server startup',
    },
  });

  return { traceId, startupSpanId };
}

/**
 * Records a server shutdown event to the SwarmObserver.
 */
export function recordServerShutdown(observer: SwarmObserver, context: ServerEventContext): void {
  const shutdownSpanId = SwarmObserver.generateSpanId();

  observer.recordEvent({
    eventId: `shutdown-${shutdownSpanId}`,
    timestamp: new Date().toISOString(),
    agentId: 'mcp-server',
    eventType: 'task_completed',
    traceId: context.traceId,
    spanId: shutdownSpanId,
    parentSpanId: context.startupSpanId,
    payload: {
      type: 'task',
      phase: 'completed',
      taskId: context.traceId,
      taskDescription: 'MCP server shutdown',
      success: true,
    },
  });
}

/**
 * Logs the final health metrics from the SwarmObserver.
 */
export function logFinalHealthMetrics(observer: SwarmObserver, logger: ILogger): void {
  const healthMetrics = observer.getHealthMetrics();
  logger.info('Final swarm health metrics', {
    activeAgents: healthMetrics.activeAgents,
    totalAgents: healthMetrics.totalAgents,
    totalInteractions: healthMetrics.totalInteractions,
  });
}

/**
 * Logs final EventBus statistics before shutdown.
 */
export function logFinalEventBusStats(logger: ILogger): void {
  const finalStats = getEventBusStats();
  logger.info('Final EventBus statistics', {
    eventsEmitted: finalStats.eventsEmitted,
    activeSubscriptions: finalStats.activeSubscriptions,
    historySize: finalStats.historySize,
    errorCount: finalStats.errorCount,
  });
}
