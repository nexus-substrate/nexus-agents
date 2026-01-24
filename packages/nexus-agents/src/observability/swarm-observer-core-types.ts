/**
 * nexus-agents/observability - SwarmObserver Core Types
 *
 * Primitive type definitions for swarm observer.
 * Extracted to break circular dependency between swarm-observer-types,
 * swarm-observer-payloads, and swarm-observer-schemas.
 *
 * @module observability/swarm-observer-core-types
 * (Source: Issue #392 - Circular dependency resolution)
 */

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
