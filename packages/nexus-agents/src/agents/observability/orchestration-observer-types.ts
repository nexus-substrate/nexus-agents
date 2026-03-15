/**
 * nexus-agents/agents - OrchestrationObserver Types
 *
 * Type definitions for real-time orchestration visibility.
 * Provides structured types for agent states, metrics, and routing decisions.
 *
 * (Source: Issue #187 - OrchestrationObserver for orchestration visibility)
 * (Renamed from SwarmObserver in Issue #251 to avoid collision with observability/swarm-observer.ts)
 *
 * @module agents/observability/orchestration-observer-types
 */

import { z } from 'zod';
import type { CliName } from '../../cli-adapters/types.js';
import type { ILogger } from '../../core/logger.js';

// ============================================================================
// Agent State Tracking
// ============================================================================

/**
 * Agent execution states.
 */
export const AgentStateSchema = z.enum(['idle', 'thinking', 'executing', 'waiting', 'error']);
export type AgentState = z.infer<typeof AgentStateSchema>;

/**
 * Tracked agent information.
 */
export interface TrackedAgent {
  readonly id: string;
  readonly role: string;
  state: AgentState;
  currentTask?: string | undefined;
  lastUpdated: string;
  taskCount: number;
  errorCount: number;
}

// ============================================================================
// Routing Decision Tracking
// ============================================================================

/**
 * Captured routing decision for audit and analysis.
 */
export interface RoutingDecision {
  readonly timestamp: string;
  readonly taskId: string;
  readonly taskDescription: string;
  readonly selectedCli: CliName;
  readonly confidence: number;
  readonly reason: string;
  readonly alternatives: readonly CliName[];
  readonly stagesExecuted: readonly string[];
  readonly decisionTimeMs: number;
  readonly withinBudget?: boolean | undefined;
  readonly topsisScore?: number | undefined;
  readonly ucbScore?: number | undefined;
}

// ============================================================================
// Session Metrics
// ============================================================================

/**
 * Token usage tracking per model.
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/**
 * Cost tracking per session.
 */
export interface CostMetrics {
  totalCostUsd: number;
  costPerModel: Map<CliName, number>;
}

/**
 * Session-level metrics.
 */
export interface SessionMetrics {
  readonly sessionId: string;
  startedAt: string;
  completedAt?: string | undefined;
  durationMs: number;
  taskCount: number;
  successCount: number;
  failureCount: number;
  tokenUsage: TokenUsage;
  costMetrics: CostMetrics;
  routingDecisions: number;
  eventsProcessed: number;
}

// ============================================================================
// Orchestration Statistics
// ============================================================================

/**
 * Aggregate orchestration statistics.
 */
export interface OrchestrationStats {
  /** Total sessions observed */
  totalSessions: number;
  /** Currently active sessions */
  activeSessions: number;
  /** Total tasks processed */
  totalTasks: number;
  /** Success rate (0-1) */
  successRate: number;
  /** Average task duration in ms */
  avgTaskDurationMs: number;
  /** Routing decisions per CLI */
  routingDistribution: Record<CliName, number>;
  /** Total tokens used */
  totalTokens: number;
  /** Total cost (estimated) */
  totalCostUsd: number;
  /** Events processed */
  eventsProcessed: number;
  /** Observer uptime in ms */
  uptimeMs: number;
  /** Consensus voting statistics (Issue #552) */
  consensus: ConsensusStats;
}

/**
 * Consensus voting statistics tracked by observer.
 * (Source: Issue #552 - Wire up consensus event handlers)
 */
export interface ConsensusStats {
  /** Total votes requested */
  votesRequested: number;
  /** Total votes cast */
  votesCast: number;
  /** Consensus decisions reached */
  consensusReached: number;
  /** Approvals vs rejections */
  decisions: {
    approved: number;
    rejected: number;
    abstained: number;
  };
  /** Unanimity rate (0-1) */
  unanimityRate: number;
}

// ============================================================================
// Observer Events (for external consumers)
// ============================================================================

/**
 * OrchestrationObserver event types for visualization hooks.
 */
export type OrchestrationObserverEvent =
  | { type: 'agent_state_changed'; agentId: string; state: AgentState; previousState: AgentState }
  | { type: 'routing_decision'; decision: RoutingDecision }
  | { type: 'session_started'; sessionId: string; pattern: string }
  | { type: 'session_completed'; sessionId: string; success: boolean; durationMs: number }
  | { type: 'metrics_updated'; metrics: OrchestrationStats }
  | { type: 'error'; source: string; error: string };

/**
 * Observer event listener function.
 */
export type OrchestrationObserverListener = (event: OrchestrationObserverEvent) => void;

// ============================================================================
// Observer Configuration
// ============================================================================

/**
 * OrchestrationObserver configuration schema.
 */
export const OrchestrationObserverConfigSchema = z.object({
  /** Maximum routing decisions to retain in history */
  maxRoutingHistory: z.number().positive().optional().default(100),
  /** Maximum session metrics to retain */
  maxSessionHistory: z.number().positive().optional().default(50),
  /** Metrics update interval in ms */
  metricsUpdateIntervalMs: z.number().positive().optional().default(5000),
  /** Enable detailed event logging */
  verboseLogging: z.boolean().optional().default(false),
  /** Token cost rates per model (USD per 1K tokens) */
  tokenCostRates: z.record(z.string(), z.number().nonnegative()).optional().default({
    claude: 0.015,
    gemini: 0.001,
    codex: 0.01,
  }),
});
export type OrchestrationObserverConfig = z.infer<typeof OrchestrationObserverConfigSchema>;

// ============================================================================
// Observer Interface
// ============================================================================

/**
 * OrchestrationObserver interface for dependency injection.
 */
export interface IOrchestrationObserver {
  /** Start observing the event bus */
  start(): void;

  /** Stop observing and cleanup */
  stop(): void;

  /** Get current agent states */
  getAgentStates(): readonly TrackedAgent[];

  /** Get routing decision history */
  getRoutingHistory(limit?: number): readonly RoutingDecision[];

  /** Get session metrics */
  getSessionMetrics(sessionId?: string): readonly SessionMetrics[];

  /** Get aggregate orchestration statistics */
  getStats(): OrchestrationStats;

  /** Add event listener for visualization */
  addEventListener(listener: OrchestrationObserverListener): void;

  /** Remove event listener */
  removeEventListener(listener: OrchestrationObserverListener): void;

  /** Record a routing decision manually (for non-event-bus integrations) */
  recordRoutingDecision(decision: RoutingDecision): void;

  /** Record token usage for a session */
  recordTokenUsage(sessionId: string, model: CliName, tokens: TokenUsage): void;

  /** Check if observer is active */
  isActive(): boolean;
}

// ============================================================================
// Event Topic Patterns for Observer
// ============================================================================

/**
 * Event topics the SwarmObserver subscribes to.
 */
export const ObserverTopics = {
  /** All session events */
  SESSIONS: 'session.*',
  /** All agent events */
  AGENTS: 'agent.*',
  /** All consensus events */
  CONSENSUS: 'consensus.*',
  /** All protocol events */
  PROTOCOLS: 'protocol.*',
  /** Catch-all for any missed events */
  ALL: '*',
} as const;

// ============================================================================
// Factory Configuration
// ============================================================================

/**
 * Options for creating an OrchestrationObserver.
 */
export interface OrchestrationObserverOptions {
  config?: Partial<OrchestrationObserverConfig> | undefined;
  logger?: ILogger | undefined;
}

// ============================================================================
// Backward Compatibility Aliases (deprecated, will be removed in v3.0)
// ============================================================================

/** @deprecated Use OrchestrationStats instead */
export type SwarmStats = OrchestrationStats;
/** @deprecated Use OrchestrationObserverEvent instead */
export type SwarmObserverEvent = OrchestrationObserverEvent;
/** @deprecated Use OrchestrationObserverListener instead */
export type SwarmObserverListener = OrchestrationObserverListener;
/** @deprecated Use OrchestrationObserverConfig instead */
export type SwarmObserverConfig = OrchestrationObserverConfig;
// Backward compat alias — will be removed in v3.0
export const SwarmObserverConfigSchema = OrchestrationObserverConfigSchema;
/** @deprecated Use IOrchestrationObserver instead */
export type ISwarmObserver = IOrchestrationObserver;
/** @deprecated Use OrchestrationObserverOptions instead */
export type SwarmObserverOptions = OrchestrationObserverOptions;
