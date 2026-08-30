/**
 * OrchestrationObserver - Real-time multi-agent orchestration visibility.
 * (Source: Issue #187, renamed from SwarmObserver in Issue #251)
 * @module agents/observability/orchestration-observer
 */

import type { ILogger } from '../../core/logger.js';
import { createLogger } from '../../core/logger.js';
import { getTimeProvider } from '../../core/index.js';
import type { CliName } from '../../cli-adapters/types.js';
import type { IEventBus, DomainEvent, Subscription } from '../collaboration/event-bus-types.js';
import {
  OrchestrationObserverConfigSchema,
  ObserverTopics,
  type IOrchestrationObserver,
  type OrchestrationObserverConfig,
  type OrchestrationObserverOptions,
  type TrackedAgent,
  type AgentState,
  type RoutingDecision,
  type SessionMetrics,
  type SessionTokenTotals,
  type OrchestrationStats,
  type OrchestrationObserverListener,
  type OrchestrationObserverEvent,
} from './orchestration-observer-types.js';
import {
  extractStringField,
  extractNumberField,
  extractBooleanField,
  extractStringArrayField,
  extractSessionId,
  createInitialSessionMetrics,
  createTrackedAgent,
  calculateRoutingDistribution,
  calculateMetricsTotals,
  countActiveSessions,
  findActiveSession,
  identifySessionsToRemove,
  resolveModelCost,
  registryCostForModel,
} from './orchestration-observer-helpers.js';

/**
 * Provides real-time visibility into multi-agent orchestration.
 * Tracks agent states, routing decisions, session metrics, and costs.
 */
export class OrchestrationObserver implements IOrchestrationObserver {
  private readonly eventBus: IEventBus;
  private readonly config: OrchestrationObserverConfig;
  private readonly logger: ILogger;

  // State tracking
  private readonly agents: Map<string, TrackedAgent> = new Map();
  private readonly routingHistory: RoutingDecision[] = [];
  private readonly sessionMetrics: Map<string, SessionMetrics> = new Map();
  private readonly listeners: Set<OrchestrationObserverListener> = new Set();

  // Subscriptions
  private readonly subscriptions: Subscription[] = [];
  private active = false;
  private readonly startTime: number;

  // Aggregate stats
  private totalTasks = 0;
  private successfulTasks = 0;
  private totalTaskDurationMs = 0;
  private eventsProcessed = 0;

  // Consensus stats (Issue #552)
  private consensusVotesRequested = 0;
  private consensusVotesCast = 0;
  private consensusReachedCount = 0;
  private consensusApproved = 0;
  private consensusRejected = 0;
  private consensusAbstained = 0;
  private consensusUnanimous = 0;

  constructor(eventBus: IEventBus, options?: OrchestrationObserverOptions) {
    this.eventBus = eventBus;
    this.config = OrchestrationObserverConfigSchema.parse(options?.config ?? {});
    this.logger = options?.logger ?? createLogger({ component: 'OrchestrationObserver' });
    this.startTime = getTimeProvider().now();
  }

  start(): void {
    if (this.active) {
      this.logger.warn('OrchestrationObserver already active');
      return;
    }

    this.logger.info('Starting OrchestrationObserver');
    this.subscribeToEvents();
    this.active = true;
  }

  stop(): void {
    if (!this.active) return;

    this.logger.info('Stopping OrchestrationObserver');
    for (const sub of this.subscriptions) {
      sub.unsubscribe();
    }
    this.subscriptions.length = 0;
    this.active = false;
  }

  private subscribeToEvents(): void {
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

  private handleSessionEvent(event: DomainEvent): void {
    this.eventsProcessed++;
    const payload = event.payload as Record<string, unknown>;
    const sessionId = extractSessionId(event, payload);

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

  /**
   * Handles consensus events and tracks voting statistics.
   * (Source: Issue #552 - Wire up consensus event handlers)
   */
  private handleConsensusEvent(event: DomainEvent): void {
    this.eventsProcessed++;
    const payload = event.payload as Record<string, unknown>;

    switch (event.topic) {
      case 'consensus.vote_requested':
        this.onVoteRequested(payload);
        break;
      case 'consensus.vote_cast':
        this.onVoteCast(payload);
        break;
      case 'consensus.reached':
        this.onConsensusReached(payload);
        break;
      default:
        this.logVerbose('Unknown consensus event', { topic: event.topic });
    }
  }

  private onVoteRequested(payload: Record<string, unknown>): void {
    this.consensusVotesRequested++;
    this.logVerbose('Vote requested', { proposalId: extractStringField(payload, 'proposalId') });
  }

  private onVoteCast(payload: Record<string, unknown>): void {
    this.consensusVotesCast++;
    const decision = extractStringField(payload, 'decision');
    if (decision === 'approve') this.consensusApproved++;
    else if (decision === 'reject') this.consensusRejected++;
    else if (decision === 'abstain') this.consensusAbstained++;
    this.logVerbose('Vote cast', { voterId: extractStringField(payload, 'voterId'), decision });
  }

  private onConsensusReached(payload: Record<string, unknown>): void {
    this.consensusReachedCount++;
    const unanimity = extractBooleanField(payload, 'unanimity');
    if (unanimity) this.consensusUnanimous++;
    this.logVerbose('Consensus reached', {
      proposalId: extractStringField(payload, 'proposalId'),
      decision: extractStringField(payload, 'decision'),
      unanimity,
    });
  }

  private logVerbose(message: string, context: Record<string, unknown>): void {
    if (this.config.verboseLogging) {
      this.logger.debug(message, context);
    }
  }

  private handleProtocolEvent(event: DomainEvent): void {
    this.eventsProcessed++;
    const payload = event.payload as Record<string, unknown>;

    if (event.topic === 'protocol.completed') {
      const success = extractBooleanField(payload, 'success');
      const durationMs = extractNumberField(payload, 'durationMs');
      this.totalTasks++;
      this.totalTaskDurationMs += durationMs;
      if (success) this.successfulTasks++;
    }
  }

  private onSessionCreated(sessionId: string, payload: Record<string, unknown>): void {
    if (sessionId === '') return;

    const pattern = extractStringField(payload, 'pattern') || 'unknown';
    const experts = extractStringArrayField(payload, 'experts');

    this.sessionMetrics.set(sessionId, createInitialSessionMetrics(sessionId));

    for (const expertId of experts) {
      this.updateAgentState(expertId, 'idle', 'expert');
    }

    this.emitObserverEvent({ type: 'session_started', sessionId, pattern });
    this.pruneOldMetrics();
  }

  private onSessionStatusChanged(sessionId: string, payload: Record<string, unknown>): void {
    const newStatus = extractStringField(payload, 'newStatus');
    const metrics = this.sessionMetrics.get(sessionId);
    if (metrics !== undefined) {
      metrics.eventsProcessed++;
    }

    if (this.config.verboseLogging) {
      this.logger.debug('Session status changed', { sessionId, newStatus });
    }
  }

  private onResultSubmitted(sessionId: string, payload: Record<string, unknown>): void {
    const expertId = extractStringField(payload, 'expertId');
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
    const success = extractBooleanField(payload, 'success');
    const durationMs = extractNumberField(payload, 'durationMs');

    const metrics = this.sessionMetrics.get(sessionId);
    if (metrics !== undefined) {
      metrics.completedAt = getTimeProvider().nowIso();
      metrics.durationMs = durationMs;
    }

    this.emitObserverEvent({ type: 'session_completed', sessionId, success, durationMs });
  }

  private onTaskDelegated(payload: Record<string, unknown>): void {
    const toAgent = extractStringField(payload, 'toAgent');
    const taskDescription = extractStringField(payload, 'taskDescription');

    if (toAgent !== '') {
      this.updateAgentState(toAgent, 'executing', undefined, taskDescription);
    }
  }

  private onResultBroadcast(payload: Record<string, unknown>): void {
    const agentId = extractStringField(payload, 'agentId');
    if (agentId !== '') {
      this.updateAgentState(agentId, 'idle');
      const agent = this.agents.get(agentId);
      if (agent !== undefined) {
        agent.taskCount++;
      }
    }
  }

  private updateAgentState(
    agentId: string,
    state: AgentState,
    role?: string,
    currentTask?: string
  ): void {
    let agent = this.agents.get(agentId);
    const previousState = agent?.state ?? 'idle';

    if (agent === undefined) {
      agent = createTrackedAgent(agentId, state, role ?? 'unknown', currentTask);
      this.agents.set(agentId, agent);
    } else {
      agent.state = state;
      agent.currentTask = currentTask;
      agent.lastUpdated = getTimeProvider().nowIso();
      if (role !== undefined) {
        (agent as { role: string }).role = role;
      }
    }

    if (previousState !== state) {
      this.emitObserverEvent({ type: 'agent_state_changed', agentId, state, previousState });
    }
  }

  private pruneOldMetrics(): void {
    const maxSessions = this.config.maxSessionHistory;
    const sessionsToRemove = identifySessionsToRemove(
      Array.from(this.sessionMetrics.entries()),
      maxSessions
    );
    for (const sessionId of sessionsToRemove) {
      this.sessionMetrics.delete(sessionId);
    }
  }

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

  getStats(): OrchestrationStats {
    const routingDist = calculateRoutingDistribution(this.routingHistory);
    const { totalTokens, totalCost } = calculateMetricsTotals(this.sessionMetrics.values());
    const activeSessions = countActiveSessions(this.sessionMetrics.values());

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
      uptimeMs: getTimeProvider().now() - this.startTime,
      // Consensus stats (Issue #552)
      consensus: {
        votesRequested: this.consensusVotesRequested,
        votesCast: this.consensusVotesCast,
        consensusReached: this.consensusReachedCount,
        decisions: {
          approved: this.consensusApproved,
          rejected: this.consensusRejected,
          abstained: this.consensusAbstained,
        },
        unanimityRate:
          this.consensusReachedCount > 0 ? this.consensusUnanimous / this.consensusReachedCount : 0,
      },
    };
  }

  recordRoutingDecision(decision: RoutingDecision): void {
    this.routingHistory.push(decision);

    if (this.routingHistory.length > this.config.maxRoutingHistory) {
      this.routingHistory.shift();
    }

    const activeSession = findActiveSession(this.sessionMetrics.values());
    if (activeSession !== undefined) {
      activeSession.routingDecisions++;
    }

    this.emitObserverEvent({ type: 'routing_decision', decision });
  }

  recordTokenUsage(sessionId: string, model: CliName, tokens: SessionTokenTotals): void {
    const metrics = this.sessionMetrics.get(sessionId);
    if (metrics === undefined) return;

    metrics.tokenUsage.inputTokens += tokens.inputTokens;
    metrics.tokenUsage.outputTokens += tokens.outputTokens;
    metrics.tokenUsage.totalTokens += tokens.totalTokens;

    // #5180: an override wins; otherwise the canonical registry supplies SPLIT
    // rates. The previous `?? 0.01` blended fallback understated output-heavy
    // runs ~3x while this method held the split two lines above.
    const cost =
      resolveModelCost(tokens, this.config.tokenCostRates[model]) ??
      registryCostForModel(tokens, model);
    metrics.costMetrics.totalCostUsd += cost;

    const currentModelCost = metrics.costMetrics.costPerModel.get(model) ?? 0;
    metrics.costMetrics.costPerModel.set(model, currentModelCost + cost);
  }

  addEventListener(listener: OrchestrationObserverListener): void {
    this.listeners.add(listener);
  }

  removeEventListener(listener: OrchestrationObserverListener): void {
    this.listeners.delete(listener);
  }

  private emitObserverEvent(event: OrchestrationObserverEvent): void {
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

/** Creates an OrchestrationObserver instance. */
export function createOrchestrationObserver(
  eventBus: IEventBus,
  options?: OrchestrationObserverOptions
): IOrchestrationObserver {
  return new OrchestrationObserver(eventBus, options);
}

// Backward compat aliases — will be removed in v3.0
export const SwarmObserver = OrchestrationObserver;
export const createSwarmObserver = createOrchestrationObserver;
