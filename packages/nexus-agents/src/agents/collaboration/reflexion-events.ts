/**
 * Reflexion Protocol EventBus Integration Helpers
 * (Source: Issues #221, #216, Sprint #219)
 *
 * Provides helper functions for emitting protocol lifecycle and phase events
 * for the Multi-Agent Reflexion (MAR) protocol.
 */

import type {
  IEventBus,
  ProtocolStartedEvent,
  ProtocolIterationEvent,
  ProtocolCompletedEvent,
  ReflexionCritiqueStartedEvent,
  ReflexionCritiqueCompletedEvent,
  ReflexionSynthesisEvent,
} from './event-bus-types.js';
import { createEvent } from './event-bus.js';
import { getTimeProvider } from '../../core/index.js';
import type { ReflexionConfig, ReflexionResult } from './reflexion-types.js';

/** Configuration for emitting protocol started event. */
export interface ReflexionStartedParams {
  readonly sessionId: string;
  readonly personaCount: number;
  readonly reflexionConfig: ReflexionConfig;
}

/** Emits protocol.started event for Reflexion protocol. */
export function emitReflexionStarted(eventBus: IEventBus, params: ReflexionStartedParams): void {
  const event = createEvent<ProtocolStartedEvent>(
    'protocol.started',
    {
      protocolType: 'reflexion',
      config: {
        maxRounds: params.reflexionConfig.maxIterations,
        confidenceThreshold: params.reflexionConfig.severityThreshold,
        byzantineTolerance: 0, // Reflexion doesn't use Byzantine tolerance
        agentCount: params.personaCount,
      },
    },
    {
      sessionId: params.sessionId,
    }
  );
  eventBus.emit(event);
}

/** Configuration for emitting protocol iteration event. */
export interface ReflexionIterationParams {
  readonly round: number;
  readonly maxRounds: number;
  readonly status: 'in_progress' | 'converged' | 'max_reached';
  readonly sessionId: string;
  readonly critiqueCount?: number;
  readonly totalSeverity?: number;
}

/** Emits protocol.iteration event for each Reflexion round. */
export function emitReflexionIteration(
  eventBus: IEventBus,
  params: ReflexionIterationParams
): void {
  const event = createEvent<ProtocolIterationEvent>(
    'protocol.iteration',
    {
      round: params.round + 1, // 1-indexed for display
      maxRounds: params.maxRounds,
      status: params.status,
    },
    {
      sessionId: params.sessionId,
    }
  );
  eventBus.emit(event);
}

/** Configuration for emitting protocol completed event. */
export interface ReflexionCompletedParams {
  readonly result: ReflexionResult;
  readonly startTime: number;
  readonly sessionId?: string;
}

/** Emits protocol.completed event for Reflexion protocol. */
export function emitReflexionCompleted(
  eventBus: IEventBus,
  params: ReflexionCompletedParams
): void {
  const event = createEvent<ProtocolCompletedEvent>(
    'protocol.completed',
    {
      success: params.result.converged,
      iterations: params.result.totalIterations,
      durationMs: getTimeProvider().now() - params.startTime,
    },
    {
      ...(params.sessionId !== undefined && { sessionId: params.sessionId }),
    }
  );
  eventBus.emit(event);
}

// =============================================================================
// Phase Events (Issue #216)
// =============================================================================

/** Parameters for critique started event. */
export interface ReflexionCritiqueStartedParams {
  readonly iteration: number;
  readonly personaId: string;
  readonly personaRole: string;
  readonly sessionId: string;
}

/** Emits protocol.reflexion.critique_started event. */
export function emitCritiqueStarted(
  eventBus: IEventBus,
  params: ReflexionCritiqueStartedParams
): void {
  const event = createEvent<ReflexionCritiqueStartedEvent>(
    'protocol.reflexion.critique_started',
    {
      iteration: params.iteration,
      personaId: params.personaId,
      personaRole: params.personaRole,
    },
    { sessionId: params.sessionId }
  );
  eventBus.emit(event);
}

/** Parameters for critique completed event. */
export interface ReflexionCritiqueCompletedParams {
  readonly iteration: number;
  readonly personaId: string;
  readonly severity: number;
  readonly issueCount: number;
  readonly sessionId: string;
}

/** Emits protocol.reflexion.critique_completed event. */
export function emitCritiqueCompleted(
  eventBus: IEventBus,
  params: ReflexionCritiqueCompletedParams
): void {
  const event = createEvent<ReflexionCritiqueCompletedEvent>(
    'protocol.reflexion.critique_completed',
    {
      iteration: params.iteration,
      personaId: params.personaId,
      severity: params.severity,
      issueCount: params.issueCount,
    },
    { sessionId: params.sessionId }
  );
  eventBus.emit(event);
}

/** Parameters for synthesis event. */
export interface ReflexionSynthesisParams {
  readonly iteration: number;
  readonly consensusSeverity: number;
  readonly actionItemCount: number;
  readonly sessionId: string;
}

/** Emits protocol.reflexion.synthesis event. */
export function emitSynthesis(eventBus: IEventBus, params: ReflexionSynthesisParams): void {
  const event = createEvent<ReflexionSynthesisEvent>(
    'protocol.reflexion.synthesis',
    {
      iteration: params.iteration,
      consensusSeverity: params.consensusSeverity,
      actionItemCount: params.actionItemCount,
    },
    { sessionId: params.sessionId }
  );
  eventBus.emit(event);
}
