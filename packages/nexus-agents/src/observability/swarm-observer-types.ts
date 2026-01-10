/**
 * nexus-agents/observability - SwarmObserver Types
 *
 * Type definitions for swarm-level observability and interaction tracking.
 * Enables measurement of emergent behavior, bottleneck detection, and
 * agent collaboration patterns.
 *
 * @module observability/swarm-observer-types
 * (Source: Alignment Roadmap Phase 1, Issue #158)
 */

import { z } from 'zod';

/**
 * Unique identifier for agents in the swarm.
 */
export type AgentId = string;

/**
 * Unique identifier for tasks.
 */
export type TaskId = string;

/**
 * OpenTelemetry-compatible trace identifier.
 * Format: 32-character hex string (128-bit).
 */
export type TraceId = string;

/**
 * OpenTelemetry-compatible span identifier.
 * Format: 16-character hex string (64-bit).
 */
export type SpanId = string;

/**
 * Types of events the observer can track.
 */
export type EventType =
  | 'state_change'
  | 'message_sent'
  | 'message_received'
  | 'tool_invoked'
  | 'tool_completed'
  | 'memory_read'
  | 'memory_write'
  | 'task_started'
  | 'task_completed'
  | 'error';

/**
 * Agent state for tracking state transitions.
 */
export type AgentState = 'idle' | 'thinking' | 'executing' | 'waiting' | 'error';

/**
 * Outcome of an interaction.
 */
export type InteractionOutcome = 'success' | 'failure' | 'timeout' | 'pending';

/**
 * Core event emitted by agents for observation.
 */
export interface AgentEvent {
  /** Event ID for deduplication */
  readonly eventId: string;
  /** ISO timestamp when event occurred */
  readonly timestamp: string;
  /** Agent that emitted the event */
  readonly agentId: AgentId;
  /** Type of event */
  readonly eventType: EventType;
  /** OpenTelemetry trace ID for correlation */
  readonly traceId: TraceId;
  /** OpenTelemetry span ID */
  readonly spanId: SpanId;
  /** Parent span ID for hierarchical tracing */
  readonly parentSpanId?: SpanId;
  /** Event-specific payload */
  readonly payload: EventPayload;
  /** Duration in milliseconds (for completed events) */
  readonly durationMs?: number;
}

/**
 * Discriminated union of event payloads.
 */
export type EventPayload =
  | StateChangePayload
  | MessagePayload
  | ToolPayload
  | MemoryPayload
  | TaskPayload
  | ErrorPayload;

/**
 * Payload for state change events.
 */
export interface StateChangePayload {
  readonly type: 'state_change';
  readonly previousState: AgentState;
  readonly newState: AgentState;
  readonly reason?: string;
}

/**
 * Payload for message events.
 */
export interface MessagePayload {
  readonly type: 'message';
  readonly direction: 'sent' | 'received';
  readonly targetAgentId?: AgentId;
  readonly sourceAgentId?: AgentId;
  readonly messageType: string;
  /** Truncated preview of message content */
  readonly contentPreview?: string;
}

/**
 * Payload for tool invocation events.
 */
export interface ToolPayload {
  readonly type: 'tool';
  readonly phase: 'invoked' | 'completed';
  readonly toolName: string;
  readonly success?: boolean;
  readonly errorMessage?: string;
}

/**
 * Payload for memory operation events.
 */
export interface MemoryPayload {
  readonly type: 'memory';
  readonly operation: 'read' | 'write';
  readonly memoryType: string;
  readonly key?: string;
  readonly sizeBytes?: number;
}

/**
 * Payload for task lifecycle events.
 */
export interface TaskPayload {
  readonly type: 'task';
  readonly phase: 'started' | 'completed';
  readonly taskId: TaskId;
  readonly taskDescription?: string;
  readonly success?: boolean;
}

/**
 * Payload for error events.
 */
export interface ErrorPayload {
  readonly type: 'error';
  readonly errorCode: string;
  readonly errorMessage: string;
  readonly stack?: string;
  readonly recoverable: boolean;
}

/**
 * Edge in the interaction graph representing a message/interaction.
 */
export interface InteractionEdge {
  /** Source agent */
  readonly from: AgentId;
  /** Target agent */
  readonly to: AgentId;
  /** Type of interaction */
  readonly interactionType: string;
  /** When interaction occurred */
  readonly timestamp: string;
  /** Outcome of interaction */
  readonly outcome: InteractionOutcome;
  /** Duration if applicable */
  readonly durationMs?: number | undefined;
  /** Trace ID for correlation */
  readonly traceId: TraceId;
  /** Weight for graph algorithms (default 1) */
  readonly weight: number;
}

/**
 * Options for recording an interaction.
 */
export interface RecordInteractionOptions {
  /** Source agent */
  readonly from: AgentId;
  /** Target agent */
  readonly to: AgentId;
  /** Type of interaction */
  readonly interactionType: string;
  /** Outcome of interaction */
  readonly outcome: InteractionOutcome;
  /** Trace ID for correlation */
  readonly traceId: TraceId;
  /** Duration in milliseconds */
  readonly durationMs?: number | undefined;
}

/**
 * Contribution score for a single agent to a task.
 */
export interface ContributionScore {
  readonly agentId: AgentId;
  /** Overall contribution score (0-1) */
  readonly score: number;
  /** Number of messages sent */
  readonly messagesSent: number;
  /** Number of messages received */
  readonly messagesReceived: number;
  /** Time spent actively working (ms) */
  readonly activeTimeMs: number;
  /** Number of successful tool invocations */
  readonly successfulTools: number;
  /** Number of errors encountered */
  readonly errorCount: number;
}

/**
 * Bottleneck information for an agent.
 */
export interface BottleneckInfo {
  readonly agentId: AgentId;
  /** Messages waiting to be processed */
  readonly queuedMessages: number;
  /** Average time messages wait */
  readonly avgWaitTimeMs: number;
  /** Number of agents blocked waiting */
  readonly blockedAgents: number;
  /** Severity level */
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Cluster of agents that work together frequently.
 */
export interface AgentCluster {
  /** Cluster identifier */
  readonly clusterId: string;
  /** Agents in this cluster */
  readonly agents: AgentId[];
  /** Cohesion score (0-1, higher = tighter cluster) */
  readonly cohesion: number;
  /** Number of interactions within cluster */
  readonly internalInteractions: number;
  /** Number of interactions with external agents */
  readonly externalInteractions: number;
  /** Dominant interaction pattern */
  readonly dominantPattern?: string | undefined;
}

/**
 * Swarm-level health metrics.
 */
export interface SwarmHealthMetrics {
  /** Total agents in swarm */
  readonly totalAgents: number;
  /** Currently active agents */
  readonly activeAgents: number;
  /** Agents in error state */
  readonly errorAgents: number;
  /** Total interactions in time window */
  readonly totalInteractions: number;
  /** Successful interaction rate (0-1) */
  readonly successRate: number;
  /** Average interaction latency (ms) */
  readonly avgLatencyMs: number;
  /** Current bottlenecks */
  readonly bottlenecks: BottleneckInfo[];
  /** Detected clusters */
  readonly clusters: AgentCluster[];
  /** Timestamp of metrics calculation */
  readonly calculatedAt: string;
}

/**
 * Configuration for the SwarmObserver.
 */
export interface SwarmObserverConfig {
  /** Maximum events to keep in memory */
  readonly maxEvents: number;
  /** Time window for metrics calculation (ms) */
  readonly metricsWindowMs: number;
  /** Enable detailed payload logging */
  readonly logPayloads: boolean;
  /** Bottleneck threshold (queued messages) */
  readonly bottleneckThreshold: number;
  /** Minimum cluster size to detect */
  readonly minClusterSize: number;
  /** Cohesion threshold for cluster detection */
  readonly cohesionThreshold: number;
}

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

/**
 * Interface for the SwarmObserver.
 */
export interface ISwarmObserver {
  /**
   * Record an agent event.
   */
  recordEvent(event: AgentEvent): void;

  /**
   * Record an interaction between two agents.
   */
  recordInteraction(options: RecordInteractionOptions): void;

  /**
   * Get the collaboration graph.
   */
  getCollaborationGraph(): InteractionGraph;

  /**
   * Identify bottleneck agents.
   */
  getBottlenecks(): BottleneckInfo[];

  /**
   * Detect emergent clusters of collaborating agents.
   */
  getEmergentClusters(): AgentCluster[];

  /**
   * Attribute success of a task to contributing agents.
   */
  attributeSuccess(taskId: TaskId): Map<AgentId, ContributionScore>;

  /**
   * Get swarm health metrics.
   */
  getHealthMetrics(): SwarmHealthMetrics;

  /**
   * Get events for a specific trace.
   */
  getEventsByTrace(traceId: TraceId): AgentEvent[];

  /**
   * Get events for a specific agent.
   */
  getEventsByAgent(agentId: AgentId): AgentEvent[];

  /**
   * Clear all recorded data.
   */
  clear(): void;
}

/**
 * Interface for the interaction graph.
 */
export interface InteractionGraph {
  /**
   * Add a node (agent) to the graph.
   */
  addNode(agentId: AgentId): void;

  /**
   * Add an edge (interaction) to the graph.
   */
  addEdge(edge: InteractionEdge): void;

  /**
   * Get all nodes in the graph.
   */
  getNodes(): AgentId[];

  /**
   * Get all edges in the graph.
   */
  getEdges(): InteractionEdge[];

  /**
   * Get edges from a specific agent.
   */
  getOutgoingEdges(agentId: AgentId): InteractionEdge[];

  /**
   * Get edges to a specific agent.
   */
  getIncomingEdges(agentId: AgentId): InteractionEdge[];

  /**
   * Calculate degree centrality for all nodes.
   */
  getDegreeCentrality(): Map<AgentId, number>;

  /**
   * Find strongly connected components.
   */
  getStronglyConnectedComponents(): AgentId[][];

  /**
   * Get edge count between two agents.
   */
  getEdgeCount(from: AgentId, to: AgentId): number;

  /**
   * Clear the graph.
   */
  clear(): void;
}
