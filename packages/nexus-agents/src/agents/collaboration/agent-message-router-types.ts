/**
 * Agent Message Router Types
 * (Source: Issue #217, Sprint #219)
 *
 * Type definitions for agent-to-agent message routing through the event bus.
 * Enables peer-to-peer messaging without MCP client roundtrips.
 *
 * @module agents/collaboration/agent-message-router-types
 */

import type { Result } from '../../core/result.js';
import type { AgentError } from '../../core/errors.js';
import type { IAgent, AgentMessage, AgentResponse } from '../../core/types/index.js';
import type { ICollaborationEventBus } from './event-bus-types.js';
import { AGENT_ROUTER_TIMEOUTS } from '../../config/timeouts.js';

// =============================================================================
// Configuration Types
// =============================================================================

/** Configuration options for the agent message router. */
export interface AgentMessageRouterConfig {
  /** Timeout for message delivery in milliseconds. Default: 30000 */
  readonly timeoutMs?: number;
  /** Maximum retry attempts for failed deliveries. Default: 3 */
  readonly maxRetries?: number;
  /** Retry delay in milliseconds. Default: 1000 */
  readonly retryDelayMs?: number;
  /** Whether to emit events for message routing. Default: true */
  readonly emitEvents?: boolean;
}

/** Default configuration values. Derived from config/timeouts.ts (#1220). */
export const DEFAULT_ROUTER_CONFIG: Required<AgentMessageRouterConfig> = {
  timeoutMs: AGENT_ROUTER_TIMEOUTS.defaultMs,
  maxRetries: AGENT_ROUTER_TIMEOUTS.maxRetries,
  retryDelayMs: AGENT_ROUTER_TIMEOUTS.retryDelayMs,
  emitEvents: true,
};

// =============================================================================
// Router Options
// =============================================================================

/** Options for creating an agent message router. */
export interface AgentMessageRouterOptions {
  /** Configuration settings */
  readonly config?: AgentMessageRouterConfig;
  /** Event bus for message routing events. Uses global bus if not provided. */
  readonly eventBus?: ICollaborationEventBus;
}

/** Options for the send method. */
export interface SendOptions {
  /** Skip retry attempts on failure */
  readonly skipRetry?: boolean;
  /** Custom timeout for this message */
  readonly timeoutMs?: number;
  /** Correlation ID for tracing */
  readonly correlationId?: string;
}

/** Options for the broadcast method. */
export interface BroadcastOptions {
  /** Correlation ID for tracing */
  readonly correlationId?: string;
  /** Wait for all handlers to complete before returning */
  readonly waitForCompletion?: boolean;
}

// =============================================================================
// Result Types
// =============================================================================

/** Result of a broadcast operation. */
export interface BroadcastResult {
  /** Total number of recipients */
  readonly recipientCount: number;
  /** Number of successful deliveries */
  readonly successCount: number;
  /** Number of failed deliveries */
  readonly failureCount: number;
  /** Individual results by agent ID */
  readonly results: ReadonlyMap<string, AgentResponse | AgentError>;
}

/** Statistics about router operations. */
export interface RouterStats {
  /** Total messages sent */
  readonly messagesSent: number;
  /** Total broadcasts performed */
  readonly broadcastsPerformed: number;
  /** Total successful deliveries */
  readonly successfulDeliveries: number;
  /** Total failed deliveries */
  readonly failedDeliveries: number;
  /** Total retries attempted */
  readonly retriesAttempted: number;
  /** Number of registered agents */
  readonly registeredAgents: number;
}

// =============================================================================
// Router Interface
// =============================================================================

/**
 * Agent message router for peer-to-peer communication.
 *
 * Routes messages between agents using their handleMessage() methods
 * and emits message.sent/message.received events through the CollaborationEventBus.
 */
export interface IAgentMessageRouter {
  /**
   * Register an agent with the router.
   * @param agent - Agent to register
   */
  register(agent: IAgent): void;

  /**
   * Unregister an agent from the router.
   * @param agentId - ID of agent to unregister
   */
  unregister(agentId: string): void;

  /**
   * Check if an agent is registered.
   * @param agentId - ID of agent to check
   * @returns True if agent is registered
   */
  isRegistered(agentId: string): boolean;

  /**
   * Get all registered agent IDs.
   * @returns Array of registered agent IDs
   */
  getRegisteredAgents(): readonly string[];

  /**
   * Send a message from one agent to another.
   *
   * @param message - Message to send (must have from and to fields populated)
   * @param options - Optional send configuration
   * @returns Result with AgentResponse or AgentError
   */
  send(message: AgentMessage, options?: SendOptions): Promise<Result<AgentResponse, AgentError>>;

  /**
   * Broadcast a message from one agent to all other registered agents.
   *
   * @param message - Message to broadcast (must have from field populated)
   * @param options - Optional broadcast configuration
   * @returns Result with BroadcastResult or AgentError
   */
  broadcast(
    message: AgentMessage,
    options?: BroadcastOptions
  ): Promise<Result<BroadcastResult, AgentError>>;

  /**
   * Get router statistics.
   * @returns Current router statistics
   */
  getStats(): RouterStats;

  /**
   * Clear all registered agents and reset statistics.
   */
  clear(): void;
}
