/**
 * Pipeline Event Types — V2 Observability (Issue #912, Phase 4-1)
 *
 * Typed event definitions for the pipeline event bus.
 * Every event carries a timestamp and relevant correlation IDs.
 *
 * @see docs/v2/08-observability-eventing.md
 * @module pipeline/event-types
 */

// ============================================================================
// Event Type Literals
// ============================================================================

/** All valid pipeline event types. */
export const PIPELINE_EVENT_TYPES = [
  'task.created',
  'task.status_changed',
  'task.completed',
  'task.failed',
  'pipeline.started',
  'pipeline.completed',
  'pipeline.checkpoint',
  'stage.started',
  'stage.completed',
  'stage.failed',
  'stage.retrying',
  'policy.evaluated',
  'artifact.created',
  'model.called',
  'routing.decision',
  // 'learning.threshold_updated' + 'learning.trend_detected' removed in
  // #3022 — the emit helpers and event-bus subscribers both never landed.
  'tool.invoked',
  'tool.completed',
  'wave.started',
  'wave.completed',
  // Signal events (#3147 P2 — close the loop). Push-only producers (fitness
  // audit, swarm health, consensus) emit these; the TuneStage consumes them.
  // Unlike the #3022 learning.* types, these ship WITH their consumer.
  'signal.fitness_declined',
  'signal.swarm_unhealthy',
  'signal.vote_rejected',
] as const;

export type PipelineEventType = (typeof PIPELINE_EVENT_TYPES)[number];

// ============================================================================
// Event Definitions
// ============================================================================

/** Base fields present on every event. */
interface BaseEvent {
  readonly timestamp: number;
}

/** Task lifecycle events. */
interface TaskCreatedEvent extends BaseEvent {
  readonly type: 'task.created';
  readonly taskId: string;
}

interface TaskStatusChangedEvent extends BaseEvent {
  readonly type: 'task.status_changed';
  readonly taskId: string;
  readonly from: string;
  readonly to: string;
}

interface TaskCompletedEvent extends BaseEvent {
  readonly type: 'task.completed';
  readonly taskId: string;
  readonly success: boolean;
}

interface TaskFailedEvent extends BaseEvent {
  readonly type: 'task.failed';
  readonly taskId: string;
  readonly error: string;
}

/** Pipeline lifecycle events. */
interface PipelineStartedEvent extends BaseEvent {
  readonly type: 'pipeline.started';
  readonly taskId: string;
  readonly executionId: string;
}

interface PipelineCompletedEvent extends BaseEvent {
  readonly type: 'pipeline.completed';
  readonly executionId: string;
  readonly success: boolean;
  readonly durationMs: number;
}

interface PipelineCheckpointEvent extends BaseEvent {
  readonly type: 'pipeline.checkpoint';
  readonly executionId: string;
  readonly stepNumber: number;
}

/** Stage lifecycle events. */
interface StageStartedEvent extends BaseEvent {
  readonly type: 'stage.started';
  readonly executionId: string;
  readonly stageId: string;
  readonly pluginId: string;
}

interface StageCompletedEvent extends BaseEvent {
  readonly type: 'stage.completed';
  readonly executionId: string;
  readonly stageId: string;
  readonly durationMs: number;
  readonly success: boolean;
}

interface StageFailedEvent extends BaseEvent {
  readonly type: 'stage.failed';
  readonly executionId: string;
  readonly stageId: string;
  readonly error: string;
  /** Error classification: retriable (transient) or fatal (permanent) (Epic #952). */
  readonly errorTaxonomy?: 'retriable' | 'fatal';
}

interface StageRetryingEvent extends BaseEvent {
  readonly type: 'stage.retrying';
  readonly executionId: string;
  readonly stageId: string;
  readonly attempt: number;
}

/** Policy gate events. */
interface PolicyEvaluatedEvent extends BaseEvent {
  readonly type: 'policy.evaluated';
  readonly executionId: string;
  readonly gateId: string;
  readonly decision: string;
}

/** Artifact events. */
interface ArtifactCreatedEvent extends BaseEvent {
  readonly type: 'artifact.created';
  readonly executionId: string;
  readonly artifactId: string;
  readonly artifactType: string;
}

/** Model call events. */
interface ModelCalledEvent extends BaseEvent {
  readonly type: 'model.called';
  readonly executionId: string;
  readonly cli: string;
  readonly model: string;
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly durationMs: number;
  /** Agent that initiated this model call (Epic #952). */
  readonly agentId?: string;
  /** Agent role (e.g., code_expert, security_expert) (Epic #952). */
  readonly role?: string;
}

/** Routing decision events. */
interface RoutingDecisionEvent extends BaseEvent {
  readonly type: 'routing.decision';
  readonly taskId: string;
  readonly selectedModel: string;
  /** Human-readable reasoning for model selection (Epic #952). */
  readonly reasoning?: string;
  /** Routing decision path (stage:result pairs) (Epic #952). */
  readonly decisionPath?: readonly string[];
}

/** Signal events (#3147 P2 — close the loop). Consumed by the TuneStage. */
interface FitnessDeclinedSignalEvent extends BaseEvent {
  readonly type: 'signal.fitness_declined';
  /** Current fitness score (0-100). */
  readonly score: number;
  /** Governance floor the score fell below. */
  readonly floor: number;
  /** Fitness dimension that declined, when attributable. */
  readonly dimension?: string;
}

interface SwarmUnhealthySignalEvent extends BaseEvent {
  readonly type: 'signal.swarm_unhealthy';
  /** Agent/CLI whose health degraded. */
  readonly agentId: string;
  /** Human-readable degradation reason. */
  readonly reason: string;
}

export interface VoteRejectedSignalEvent extends BaseEvent {
  readonly type: 'signal.vote_rejected';
  readonly proposalId: string;
  /** Approval percentage of the rejected vote (0-100). */
  readonly approvalPercentage: number;
  /** Rejection rule categories surfaced by voters. */
  readonly rejectionRules?: readonly string[];
}

// `LearningThresholdUpdatedEvent` and `LearningTrendDetectedEvent`
// (Issue #901 Phase 4) were removed in #3022 — the emit helpers
// (`emitThresholdUpdate`, `emitTrendDetected`) never had a producer and
// nothing in the codebase subscribed for these event types either.

/** MCP tool lifecycle events (Issue #1186). */
export interface ToolInvokedEvent extends BaseEvent {
  readonly type: 'tool.invoked';
  readonly toolName: string;
  readonly invocationId: string;
}

export interface ToolCompletedEvent extends BaseEvent {
  readonly type: 'tool.completed';
  readonly toolName: string;
  readonly invocationId: string;
  readonly durationMs: number;
  readonly success: boolean;
  readonly errorMessage?: string;
}

/** Wave dispatch events for multi-wave worker execution (Issue #1401, Phase 6.2). */
export interface WaveStartedEvent extends BaseEvent {
  readonly type: 'wave.started';
  readonly executionId: string;
  readonly waveNumber: number;
  readonly totalWaves: number;
  readonly workerCount: number;
  readonly roles: readonly string[];
}

export interface WaveCompletedEvent extends BaseEvent {
  readonly type: 'wave.completed';
  readonly executionId: string;
  readonly waveNumber: number;
  readonly totalWaves: number;
  readonly durationMs: number;
  readonly successes: number;
  readonly errors: number;
}

// ============================================================================
// Union Type
// ============================================================================

/** Discriminated union of all pipeline events. */
export type PipelineEvent =
  | TaskCreatedEvent
  | TaskStatusChangedEvent
  | TaskCompletedEvent
  | TaskFailedEvent
  | PipelineStartedEvent
  | PipelineCompletedEvent
  | PipelineCheckpointEvent
  | StageStartedEvent
  | StageCompletedEvent
  | StageFailedEvent
  | StageRetryingEvent
  | PolicyEvaluatedEvent
  | ArtifactCreatedEvent
  | ModelCalledEvent
  | RoutingDecisionEvent
  | ToolInvokedEvent
  | ToolCompletedEvent
  | WaveStartedEvent
  | WaveCompletedEvent
  | FitnessDeclinedSignalEvent
  | SwarmUnhealthySignalEvent
  | VoteRejectedSignalEvent;

// ============================================================================
// Event Bus Interface
// ============================================================================

/** Filter for subscribing to or querying events. */
export interface EventFilter {
  readonly type?: PipelineEventType | readonly PipelineEventType[];
  readonly taskId?: string;
  readonly executionId?: string;
  readonly since?: number;
}

/** Event handler callback. */
export type EventHandler = (event: PipelineEvent) => void;

/** Unsubscribe function returned by subscribe. */
export type Unsubscribe = () => void;

/**
 * Event bus interface — fire-and-forget event emission
 * with typed subscriptions and bounded query.
 */
export interface IEventBus {
  /** Emit an event. Handlers must not throw. */
  emit(event: PipelineEvent): void;

  /** Subscribe to events matching filter. Returns unsubscribe function. */
  subscribe(filter: EventFilter, handler: EventHandler): Unsubscribe;

  /** Query recent events (bounded buffer). */
  query(filter: EventFilter, limit?: number): readonly PipelineEvent[];

  /** Total events emitted (including evicted). */
  readonly totalEmitted: number;

  /** Current buffer size. */
  readonly bufferSize: number;
}
