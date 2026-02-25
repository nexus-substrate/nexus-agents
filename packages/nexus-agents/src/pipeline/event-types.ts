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
  'learning.threshold_updated',
  'learning.trend_detected',
  'tool.invoked',
  'tool.completed',
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

/** Learning loop events (Issue #901, Phase 4). */
interface LearningThresholdUpdatedEvent extends BaseEvent {
  readonly type: 'learning.threshold_updated';
  readonly cli: string;
  readonly category: string;
  readonly oldBaseline: number;
  readonly newBaseline: number;
  readonly trend: string;
}

interface LearningTrendDetectedEvent extends BaseEvent {
  readonly type: 'learning.trend_detected';
  readonly cli: string;
  readonly category: string;
  readonly trend: string;
  readonly confidence: number;
}

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
  | LearningThresholdUpdatedEvent
  | LearningTrendDetectedEvent
  | ToolInvokedEvent
  | ToolCompletedEvent;

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
