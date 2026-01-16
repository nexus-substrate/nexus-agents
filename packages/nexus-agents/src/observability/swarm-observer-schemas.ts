/**
 * nexus-agents/observability - SwarmObserver Zod Schemas
 *
 * Zod validation schemas for swarm observer types.
 * Extracted from swarm-observer-types.ts for file size compliance.
 *
 * @module observability/swarm-observer-schemas
 * (Source: Alignment Roadmap Phase 1, Issue #158)
 */

import { z } from 'zod';
import type { SwarmObserverConfig } from './swarm-observer-types.js';

/**
 * Default configuration for SwarmObserver.
 */
export const DEFAULT_SWARM_OBSERVER_CONFIG: SwarmObserverConfig = {
  maxEvents: 10000,
  metricsWindowMs: 300000, // 5 minutes
  logPayloads: false,
  bottleneckThreshold: 10,
  minClusterSize: 2,
  cohesionThreshold: 0.5,
};

/**
 * Zod schema for SwarmObserverConfig validation.
 */
export const SwarmObserverConfigSchema = z.object({
  maxEvents: z.number().int().positive().default(10000),
  metricsWindowMs: z.number().positive().default(300000),
  logPayloads: z.boolean().default(false),
  bottleneckThreshold: z.number().int().positive().default(10),
  minClusterSize: z.number().int().min(2).default(2),
  cohesionThreshold: z.number().min(0).max(1).default(0.5),
});

/**
 * Zod schema for AgentEvent validation.
 */
export const AgentEventSchema = z.object({
  eventId: z.string().min(1),
  timestamp: z.string().datetime(),
  agentId: z.string().min(1),
  eventType: z.enum([
    'state_change',
    'message_sent',
    'message_received',
    'tool_invoked',
    'tool_completed',
    'memory_read',
    'memory_write',
    'task_started',
    'task_completed',
    'error',
  ]),
  traceId: z.string().length(32),
  spanId: z.string().length(16),
  parentSpanId: z.string().length(16).optional(),
  payload: z.record(z.unknown()),
  durationMs: z.number().nonnegative().optional(),
});
