/**
 * nexus-agents/config - Observability Configuration Schemas
 *
 * Schemas for EventBus and observability configuration.
 */

import { z } from 'zod';

/**
 * EventBus observability configuration schema.
 *
 * Controls EventBus integration with MCP server for agent-to-agent
 * communication visibility in Claude Desktop context.
 *
 * (Source: Issue #307 - EventBus MCP integration)
 */
export const EventBusConfigSchema = z.object({
  /** Enable EventBus integration (default: true) */
  enabled: z.boolean().default(true),
  /** Maximum events to retain in history (default: 1000) */
  maxHistorySize: z.number().positive().default(1000),
  /** Event patterns to subscribe to (default: all major patterns) */
  subscriptions: z
    .object({
      /** Subscribe to consensus events (consensus.*) */
      consensus: z.boolean().default(true),
      /** Subscribe to agent events (agent.*) */
      agent: z.boolean().default(true),
      /** Subscribe to protocol events (protocol.*) */
      protocol: z.boolean().default(true),
      /** Subscribe to session events (session.*) */
      session: z.boolean().default(true),
      /** Subscribe to message events (message.*) */
      message: z.boolean().default(false), // Off by default (high volume)
      /** Subscribe to byzantine detection events (byzantine.*) */
      byzantine: z.boolean().default(true),
    })
    .default(() => ({
      consensus: true,
      agent: true,
      protocol: true,
      session: true,
      message: false,
      byzantine: true,
    })),
  /** Logging configuration for events */
  logging: z
    .object({
      /** Log level for frequent events (default: debug) */
      frequentEventLevel: z.enum(['debug', 'info']).default('debug'),
      /** Log level for important events (default: info) */
      importantEventLevel: z.enum(['debug', 'info']).default('info'),
    })
    .default(() => ({
      frequentEventLevel: 'debug' as const,
      importantEventLevel: 'info' as const,
    })),
});

export type EventBusConfig = z.infer<typeof EventBusConfigSchema>;

/**
 * Observability configuration schema.
 *
 * Controls swarm-level observability features including EventBus integration.
 *
 * (Source: Issue #307 - EventBus MCP integration)
 */
export const ObservabilityConfigSchema = z.object({
  /** EventBus configuration */
  eventBus: EventBusConfigSchema.optional(),
  /** SwarmObserver maximum events (default: 10000) */
  swarmObserverMaxEvents: z.number().positive().default(10000),
});

export type ObservabilityConfig = z.infer<typeof ObservabilityConfigSchema>;
