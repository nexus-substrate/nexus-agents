/**
 * nexus-agents/agents - SwarmObserver Implementation
 *
 * Real-time observability for multi-agent orchestration.
 * Subscribes to EventBus for agent states, routing decisions, and metrics.
 *
 * (Source: Issue #187 - SwarmObserver for orchestration visibility)
 *
 * @module agents/observability/swarm-observer
 */

import type { ILogger } from '../../core/logger.js';
import { createLogger } from '../../core/logger.js';
import type { CliName } from '../../cli-adapters/types.js';
import type { IEventBus, DomainEvent, Subscription } from '../collaboration/event-bus-types.js';
import {
  SwarmObserverConfigSchema,
  type ISwarmObserver,
  type SwarmObserverConfig,
  type SwarmObserverOptions,
  type TrackedAgent,
  type AgentState,
  type RoutingDecision,
  type SessionMetrics,
  type TokenUsage,
  type SwarmStats,
  type SwarmObserverListener,
  type SwarmObserverEvent,
  ObserverTopics,
} from './swarm-observer-types.js';

// ============================================================================
// SwarmObserver Implementation
// ============================================================================

/**
 * SwarmObserver provides real-time visibility into multi-agent orchestration.
 *
 * Features:
 * - Tracks agent states (idle, thinking, executing)
 * - Records routing decisions for audit
 * - Aggregates session metrics and costs
 * - Emits events for external visualization
 *
 * @example
 * ```typescript
 * const observer = new SwarmObserver(eventBus);
 * observer.start();
 *
 * observer.addEventListener((event) => {
 *   if (event.type === 'routing_decision') {
 *     console.log('Routed to:', event.decision.selectedCli);
 *   }
 * });
 *
 * const stats = observer.getStats();
 * ```
 */
export class SwarmObserver implements ISwarmObserver {
  private readonly eventBus: IEventBus;
  private readonly config: SwarmObserverConfig;
  private readonly logger: ILogger;

  // State tracking
  private readonly agents: Map<string, TrackedAgent> = new Map();
  private readonly routingHistory: RoutingDecision[] = [];
  private readonly sessionMetrics: Map<string, SessionMetrics> = new Map();
  private readonly listeners: Set<SwarmObserverListener> = new Set();

  // Subscriptions
  private readonly subscriptions: Subscription[] = [];
  private active = false;
  private readonly startTime: number;

  // Aggregate stats
  private totalTasks = 0;
  private successfulTasks = 0;
  private totalTaskDurationMs = 0;
  private eventsProcessed = 0;

  constructor(eventBus: IEventBus, options?: SwarmObserverOptions) {
    this.eventBus = eventBus;
    this.config = SwarmObserverConfigSchema.parse(options?.config ?? {});
    this.logger = options?.logger ?? createLogger({ component: 'SwarmObserver' });
    this.startTime = Date.now();
  }

  start(): void {
    if (this.active) {
      this.logger.warn('SwarmObserver already active');
      return;
    }

    this.logger.info('Starting SwarmObserver');
    this.subscribeToEvents();
    this.active = true;
  }

  stop(): void {
    if (!this.active) return;

    this.logger.info('Stopping SwarmObserver');
    for (const sub of this.subscriptions) {
      sub.unsubscribe();
    }
    this.subscriptions.length = 0;
    this.active = false;
  }

  private subscribeToEvents(): void {
    // Subscribe to all relevant event patterns
    this.subscriptions.push(
      this.eventBus.subscribe(ObserverTopics.SESSIONS, (e) => {
        this.handleSessionEvent(e);
      }),
      this.eventBus.subscribe(ObserverTopics.AGENTS, (e) => {
        this.handleAgentEvent(e);
      }),
      this.eventBus.subscribe(ObserverTopics.CONSENSUS, (e) => {
        this.handleConsensusEvent(e);
      }),
      this.eventBus.subscribe(ObserverTopics.PROTOCOLS, (e) => {
        this.handleProtocolEvent(e);
      })
    );
    this.logger.debug('Subscribed to event topics', { topicCount: this.subscriptions.length });
  }

  // ========== Event Handlers ==========

  private handleSessionEvent(event: DomainEvent): void {
    this.eventsProcessed++;
    const payload = event.payload as Record<string, unknown>;
    // sessionId may be on event object OR in payload (for session.created)
    const sessionId = this.extractSessionId(event, payload);

    switch (event.topic) {
      case 'session.created':
        this.onSessionCreated(sessionId, payload);
        break;
      case 'session.status_changed':
        this.onSessionStatusChanged(sessionId, payload);
        break;
      case 'session.result_submitted':
        this.onResultSubmitted(sessionId, payload);
        break;
      case 'session.finalized':
        this.onSessionFinalized(sessionId, payload);
        break;
    }
  }

  private extractSessionId(event: DomainEvent, payload: Record<string, unknown>): string {
    // Check event.sessionId first, then payload.sessionId
    if (event.sessionId !== undefined && event.sessionId !== '') {
      return event.sessionId;
    }
    const payloadSessionId = payload['sessionId'];
    if (typeof payloadSessionId === 'string' && payloadSessionId !== '') {
      return payloadSessionId;
    }
    return '';
  }

  private handleAgentEvent(event: DomainEvent): void {
    this.eventsProcessed++;
    const payload = event.payload as Record<string, unknown>;

    switch (event.topic) {
      case 'agent.task_delegated':
        this.onTaskDelegated(payload);
        break;
      case 'agent.result_broadcast':
        this.onResultBroadcast(payload);
        break;
    }
  }

  private handleConsensusEvent(event: DomainEvent): void {
    this.eventsProcessed++;
    if (this.config.verboseLogging) {
      this.logger.debug('Consensus event', { topic: event.topic });
    }
  }

  private handleProtocolEvent(event: DomainEvent): void {
    this.eventsProcessed++;
    const payload = event.payload as Record<string, unknown>;

    if (event.topic === 'protocol.completed') {
      const success = payload['success'] === true;
      const durationMs = typeof payload['durationMs'] === 'number' ? payload['durationMs'] : 0;
      this.totalTasks++;
      this.totalTaskDurationMs += durationMs;
      if (success) this.successfulTasks++;
    }
  }

  // ========== Session Event Processors ==========

  private onSessionCreated(sessionId: string, payload: Record<string, unknown>): void {
    if (sessionId === '') return;

    const pattern = typeof payload['pattern'] === 'string' ? payload['pattern'] : 'unknown';
    const experts = Array.isArray(payload['experts']) ? (payload['experts'] as string[]) : [];

    // Initialize session metrics
    const metrics: SessionMetrics = {
      sessionId,
      startedAt: new Date().toISOString(),
      durationMs: 0,
      taskCount: 0,
      successCount: 0,
      failureCount: 0,
      tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      costMetrics: { totalCostUsd: 0, costPerModel: new Map() },
      routingDecisions: 0,
      eventsProcessed: 0,
    };
    this.sessionMetrics.set(sessionId, metrics);

    // Track agents from experts list
    for (const expertId of experts) {
      this.updateAgentState(expertId, 'idle', 'expert');
    }

    this.emitObserverEvent({ type: 'session_started', sessionId, pattern });
    this.pruneOldMetrics();
  }

  private onSessionStatusChanged(sessionId: string, payload: Record<string, unknown>): void {
    const newStatus = typeof payload['newStatus'] === 'string' ? payload['newStatus'] : '';
    const metrics = this.sessionMetrics.get(sessionId);
    if (metrics !== undefined) {
      metrics.eventsProcessed++;
    }

    if (this.config.verboseLogging) {
      this.logger.debug('Session status changed', { sessionId, newStatus });
    }
  }

  private onResultSubmitted(sessionId: string, payload: Record<string, unknown>): void {
    const expertId = typeof payload['expertId'] === 'string' ? payload['expertId'] : '';
    if (expertId !== '') {
      this.updateAgentState(expertId, 'idle');
    }

    const metrics = this.sessionMetrics.get(sessionId);
    if (metrics !== undefined) {
      metrics.taskCount++;
      metrics.successCount++;
    }
  }

  private onSessionFinalized(sessionId: string, payload: Record<string, unknown>): void {
    const success = payload['success'] === true;
    const durationMs = typeof payload['durationMs'] === 'number' ? payload['durationMs'] : 0;

    const metrics = this.sessionMetrics.get(sessionId);
    if (metrics !== undefined) {
      metrics.completedAt = new Date().toISOString();
      metrics.durationMs = durationMs;
    }

    this.emitObserverEvent({ type: 'session_completed', sessionId, success, durationMs });
  }

  // ========== Agent Event Processors ==========

  private onTaskDelegated(payload: Record<string, unknown>): void {
    const toAgent = typeof payload['toAgent'] === 'string' ? payload['toAgent'] : '';
    const taskDescription =
      typeof payload['taskDescription'] === 'string' ? payload['taskDescription'] : '';

    if (toAgent !== '') {
      this.updateAgentState(toAgent, 'executing', undefined, taskDescription);
    }
  }

  private onResultBroadcast(payload: Record<string, unknown>): void {
    const agentId = typeof payload['agentId'] === 'string' ? payload['agentId'] : '';
    if (agentId !== '') {
      this.updateAgentState(agentId, 'idle');
      const agent = this.agents.get(agentId);
      if (agent !== undefined) {
        agent.taskCount++;
      }
    }
  }

  // ========== State Management ==========

  private updateAgentState(
    agentId: string,
    state: AgentState,
    role?: string,
    currentTask?: string
  ): void {
    let agent = this.agents.get(agentId);
    const previousState = agent?.state ?? 'idle';

    if (agent === undefined) {
      agent = {
        id: agentId,
        role: role ?? 'unknown',
        state,
        currentTask,
        lastUpdated: new Date().toISOString(),
        taskCount: 0,
        errorCount: 0,
      };
      this.agents.set(agentId, agent);
    } else {
      agent.state = state;
      agent.currentTask = currentTask;
      agent.lastUpdated = new Date().toISOString();
      if (role !== undefined) {
        (agent as { role: string }).role = role;
      }
    }

    if (previousState !== state) {
      this.emitObserverEvent({
        type: 'agent_state_changed',
        agentId,
        state,
        previousState,
      });
    }
  }

  private pruneOldMetrics(): void {
    // Prune old session metrics to stay within limit
    const maxSessions = this.config.maxSessionHistory;
    if (this.sessionMetrics.size > maxSessions) {
      const sessions = Array.from(this.sessionMetrics.entries());
      const sorted = sessions.sort((a, b) => a[1].startedAt.localeCompare(b[1].startedAt));
      const toRemove = sorted.slice(0, sessions.length - maxSessions);
      for (const [sessionId] of toRemove) {
        this.sessionMetrics.delete(sessionId);
      }
    }
  }

  // ========== Public Query Methods ==========

  getAgentStates(): readonly TrackedAgent[] {
    return Array.from(this.agents.values());
  }

  getRoutingHistory(limit?: number): readonly RoutingDecision[] {
    const maxLimit = limit ?? this.config.maxRoutingHistory;
    return this.routingHistory.slice(-maxLimit);
  }

  getSessionMetrics(sessionId?: string): readonly SessionMetrics[] {
    if (sessionId !== undefined) {
      const metrics = this.sessionMetrics.get(sessionId);
      return metrics !== undefined ? [metrics] : [];
    }
    return Array.from(this.sessionMetrics.values());
  }

  getStats(): SwarmStats {
    const routingDist: Record<CliName, number> = { claude: 0, gemini: 0, codex: 0 };
    for (const decision of this.routingHistory) {
      routingDist[decision.selectedCli]++;
    }

    let totalTokens = 0;
    let totalCost = 0;
    for (const metrics of this.sessionMetrics.values()) {
      totalTokens += metrics.tokenUsage.totalTokens;
      totalCost += metrics.costMetrics.totalCostUsd;
    }

    const activeSessions = Array.from(this.sessionMetrics.values()).filter(
      (m) => m.completedAt === undefined
    ).length;

    return {
      totalSessions: this.sessionMetrics.size,
      activeSessions,
      totalTasks: this.totalTasks,
      successRate: this.totalTasks > 0 ? this.successfulTasks / this.totalTasks : 0,
      avgTaskDurationMs: this.totalTasks > 0 ? this.totalTaskDurationMs / this.totalTasks : 0,
      routingDistribution: routingDist,
      totalTokens,
      totalCostUsd: totalCost,
      eventsProcessed: this.eventsProcessed,
      uptimeMs: Date.now() - this.startTime,
    };
  }

  // ========== Manual Recording Methods ==========

  recordRoutingDecision(decision: RoutingDecision): void {
    this.routingHistory.push(decision);

    // Prune if over limit
    if (this.routingHistory.length > this.config.maxRoutingHistory) {
      this.routingHistory.shift();
    }

    // Update session metrics if session exists
    const sessionMetrics = Array.from(this.sessionMetrics.values()).find(
      (m) => m.completedAt === undefined
    );
    if (sessionMetrics !== undefined) {
      sessionMetrics.routingDecisions++;
    }

    this.emitObserverEvent({ type: 'routing_decision', decision });
  }

  recordTokenUsage(sessionId: string, model: CliName, tokens: TokenUsage): void {
    const metrics = this.sessionMetrics.get(sessionId);
    if (metrics === undefined) return;

    metrics.tokenUsage.inputTokens += tokens.inputTokens;
    metrics.tokenUsage.outputTokens += tokens.outputTokens;
    metrics.tokenUsage.totalTokens += tokens.totalTokens;

    // Calculate cost
    const rate = this.config.tokenCostRates[model] ?? 0.01;
    const cost = (tokens.totalTokens / 1000) * rate;
    metrics.costMetrics.totalCostUsd += cost;

    const currentModelCost = metrics.costMetrics.costPerModel.get(model) ?? 0;
    metrics.costMetrics.costPerModel.set(model, currentModelCost + cost);
  }

  // ========== Event Listener Management ==========

  addEventListener(listener: SwarmObserverListener): void {
    this.listeners.add(listener);
  }

  removeEventListener(listener: SwarmObserverListener): void {
    this.listeners.delete(listener);
  }

  private emitObserverEvent(event: SwarmObserverEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (e) {
        const errorObj = e instanceof Error ? e : new Error(String(e));
        this.logger.error('Observer listener error', errorObj, { eventType: event.type });
      }
    }
  }

  isActive(): boolean {
    return this.active;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a SwarmObserver instance.
 *
 * @param eventBus - The event bus to observe
 * @param options - Optional configuration
 * @returns A new SwarmObserver instance
 */
export function createSwarmObserver(
  eventBus: IEventBus,
  options?: SwarmObserverOptions
): ISwarmObserver {
  return new SwarmObserver(eventBus, options);
}
