/**
 * Agent Message Router
 * (Source: Issue #217, Sprint #219)
 *
 * Routes messages between agents using their handleMessage() methods
 * and emits message.sent/message.received events through the CollaborationEventBus.
 *
 * @module agents/collaboration/agent-message-router
 */

import type { Result } from '../../core/result.js';
import { ok, err } from '../../core/result.js';
import { AgentError } from '../../core/errors.js';
import { createLogger } from '../../core/logger.js';
import type { IAgent, AgentMessage, AgentResponse } from '../../core/types/index.js';
import type { ICollaborationEventBus } from './event-bus-types.js';
import { getGlobalEventBus } from './event-bus.js';
import type {
  IAgentMessageRouter,
  AgentMessageRouterConfig,
  AgentMessageRouterOptions,
  SendOptions,
  BroadcastOptions,
  BroadcastResult,
  RouterStats,
} from './agent-message-router-types.js';
import { DEFAULT_ROUTER_CONFIG } from './agent-message-router-types.js';
import {
  emitMessageSent,
  emitMessageReceived,
  emitResultBroadcast,
  emitTaskDelegated,
} from './message-events.js';

// =============================================================================
// Internal Types
// =============================================================================

/** Mutable stats for internal tracking. */
interface MutableStats {
  messagesSent: number;
  broadcastsPerformed: number;
  successfulDeliveries: number;
  failedDeliveries: number;
  retriesAttempted: number;
}

/** Tracks broadcast delivery progress. */
interface BroadcastState {
  results: Map<string, AgentResponse | AgentError>;
  successCount: number;
  failureCount: number;
}

// =============================================================================
// AgentMessageRouter Implementation
// =============================================================================

/**
 * Routes messages between registered agents with retry logic and event emission.
 */
export class AgentMessageRouter implements IAgentMessageRouter {
  private readonly agents: Map<string, IAgent> = new Map();
  private readonly config: Required<AgentMessageRouterConfig>;
  private readonly eventBus: ICollaborationEventBus;
  private readonly logger = createLogger({ component: 'AgentMessageRouter' });
  private readonly stats: MutableStats = {
    messagesSent: 0,
    broadcastsPerformed: 0,
    successfulDeliveries: 0,
    failedDeliveries: 0,
    retriesAttempted: 0,
  };

  constructor(options: AgentMessageRouterOptions = {}) {
    this.config = { ...DEFAULT_ROUTER_CONFIG, ...options.config };
    this.eventBus = options.eventBus ?? getGlobalEventBus();
  }

  register(agent: IAgent): void {
    if (this.agents.has(agent.id)) {
      this.logger.warn('Agent already registered, replacing', { agentId: agent.id });
    }
    this.agents.set(agent.id, agent);
    this.logger.debug('Agent registered', { agentId: agent.id, role: agent.role });
  }

  unregister(agentId: string): void {
    const removed = this.agents.delete(agentId);
    if (removed) {
      this.logger.debug('Agent unregistered', { agentId });
    }
  }

  isRegistered(agentId: string): boolean {
    return this.agents.has(agentId);
  }

  getRegisteredAgents(): readonly string[] {
    return [...this.agents.keys()];
  }

  async send(
    message: AgentMessage,
    options: SendOptions = {}
  ): Promise<Result<AgentResponse, AgentError>> {
    const targetAgent = this.agents.get(message.to);
    if (targetAgent === undefined) {
      return err(new AgentError(`Target agent not found: ${message.to}`));
    }

    this.stats.messagesSent++;

    // Emit message.sent event
    if (this.config.emitEvents) {
      emitMessageSent(this.eventBus, {
        message,
        from: message.from,
        to: message.to,
        correlationId: options.correlationId,
      });

      // Emit task delegation event for task messages (Issue #557)
      if (message.type === 'task') {
        this.emitTaskDelegation(message, options.correlationId);
      }
    }

    const timeout = options.timeoutMs ?? this.config.timeoutMs;
    const maxRetries = options.skipRetry === true ? 0 : this.config.maxRetries;

    return this.deliverWithRetry(targetAgent, message, timeout, maxRetries, options.correlationId);
  }

  async broadcast(
    message: AgentMessage,
    options: BroadcastOptions = {}
  ): Promise<Result<BroadcastResult, AgentError>> {
    const recipients = [...this.agents.keys()].filter((id) => id !== message.from);

    if (recipients.length === 0) {
      return ok({ recipientCount: 0, successCount: 0, failureCount: 0, results: new Map() });
    }

    this.stats.broadcastsPerformed++;
    const state: BroadcastState = { results: new Map(), successCount: 0, failureCount: 0 };

    const deliveries = recipients.map((id) => this.deliverBroadcast(message, id, options, state));
    await this.handleBroadcastCompletion(deliveries, options);
    this.emitBroadcastResult(message, recipients, options.correlationId);

    return ok({
      recipientCount: recipients.length,
      successCount: state.successCount,
      failureCount: state.failureCount,
      results: state.results,
    });
  }

  getStats(): RouterStats {
    return {
      messagesSent: this.stats.messagesSent,
      broadcastsPerformed: this.stats.broadcastsPerformed,
      successfulDeliveries: this.stats.successfulDeliveries,
      failedDeliveries: this.stats.failedDeliveries,
      retriesAttempted: this.stats.retriesAttempted,
      registeredAgents: this.agents.size,
    };
  }

  clear(): void {
    this.agents.clear();
    this.stats.messagesSent = 0;
    this.stats.broadcastsPerformed = 0;
    this.stats.successfulDeliveries = 0;
    this.stats.failedDeliveries = 0;
    this.stats.retriesAttempted = 0;
    this.logger.debug('Router cleared');
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private async deliverBroadcast(
    message: AgentMessage,
    recipientId: string,
    options: BroadcastOptions,
    state: BroadcastState
  ): Promise<void> {
    const recipientMessage: AgentMessage = { ...message, to: recipientId };

    if (this.config.emitEvents) {
      emitMessageSent(this.eventBus, {
        message: recipientMessage,
        from: message.from,
        to: recipientId,
        correlationId: options.correlationId,
      });
    }

    const agent = this.agents.get(recipientId);
    if (agent === undefined) {
      state.results.set(recipientId, new AgentError(`Agent not found: ${recipientId}`));
      state.failureCount++;
      this.stats.failedDeliveries++;
      return;
    }

    const result = await this.deliverWithRetry(
      agent,
      recipientMessage,
      this.config.timeoutMs,
      this.config.maxRetries,
      options.correlationId
    );

    if (result.ok) {
      state.results.set(recipientId, result.value);
      state.successCount++;
    } else {
      state.results.set(recipientId, result.error);
      state.failureCount++;
    }
  }

  private async handleBroadcastCompletion(
    deliveries: Promise<void>[],
    options: BroadcastOptions
  ): Promise<void> {
    if (options.waitForCompletion === true) {
      await Promise.all(deliveries);
    } else {
      Promise.all(deliveries).catch((e: unknown) => {
        this.logger.error('Broadcast delivery error', e instanceof Error ? e : undefined);
      });
    }
  }

  private emitBroadcastResult(
    message: AgentMessage,
    recipients: readonly string[],
    correlationId?: string
  ): void {
    if (this.config.emitEvents && message.type === 'result') {
      emitResultBroadcast(this.eventBus, {
        agentId: message.from,
        result: { taskId: message.id, output: message.payload, metadata: createDefaultMetadata() },
        recipients,
        correlationId,
      });
    }
  }

  /**
   * Emits task delegation event for task messages.
   * (Source: Issue #557 - Wire up dead emitTaskDelegated function)
   */
  private emitTaskDelegation(message: AgentMessage, correlationId?: string): void {
    const taskDescription =
      typeof message.payload === 'string'
        ? message.payload
        : JSON.stringify(message.payload).slice(0, 200);

    emitTaskDelegated(this.eventBus, {
      fromAgent: message.from,
      toAgent: message.to,
      taskDescription,
      priority: 'medium', // Default priority for routed tasks
      correlationId,
    });
  }

  private async deliverWithRetry(
    agent: IAgent,
    message: AgentMessage,
    timeout: number,
    maxRetries: number,
    correlationId?: string
  ): Promise<Result<AgentResponse, AgentError>> {
    let lastError: AgentError | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        this.stats.retriesAttempted++;
        await this.delay(this.config.retryDelayMs);
        this.logger.debug('Retrying message delivery', {
          attempt,
          maxRetries,
          to: message.to,
        });
      }

      const result = await this.deliverWithTimeout(agent, message, timeout);

      if (result.ok) {
        // Emit message.received event
        if (this.config.emitEvents) {
          emitMessageReceived(this.eventBus, { message, by: message.to, correlationId });
        }
        this.stats.successfulDeliveries++;
        return result;
      }

      lastError = result.error;
      this.logger.debug('Message delivery failed', {
        attempt,
        to: message.to,
        error: lastError.message,
      });
    }

    this.stats.failedDeliveries++;
    return err(lastError ?? new AgentError('Message delivery failed'));
  }

  private async deliverWithTimeout(
    agent: IAgent,
    message: AgentMessage,
    timeout: number
  ): Promise<Result<AgentResponse, AgentError>> {
    return Promise.race([
      agent.handleMessage(message),
      this.createTimeoutPromise(timeout, message.to),
    ]);
  }

  private createTimeoutPromise(
    timeout: number,
    targetId: string
  ): Promise<Result<AgentResponse, AgentError>> {
    return new Promise((resolve) => {
      // .unref() so a winning fast-path doesn't keep the event loop alive waiting
      // on this ghost timer. Closes #2976.
      setTimeout(() => {
        resolve(err(new AgentError(`Message delivery timeout to agent: ${targetId}`)));
      }, timeout).unref();
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/** Creates default result metadata for broadcast events. */
function createDefaultMetadata(): {
  durationMs: number;
  tokensUsed: number;
  toolsUsed: string[];
  model: string;
} {
  return { durationMs: 0, tokensUsed: 0, toolsUsed: [], model: 'message-router' };
}

// =============================================================================
// Factory Functions
// =============================================================================

/** Creates an agent message router with the given options. */
export function createAgentMessageRouter(options?: AgentMessageRouterOptions): AgentMessageRouter {
  return new AgentMessageRouter(options);
}
