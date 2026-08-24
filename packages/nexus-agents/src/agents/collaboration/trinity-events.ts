/**
 * Trinity Protocol EventBus Integration Helpers
 * (Source: Issues #222, #216, Sprint #219)
 *
 * Provides helper functions for emitting protocol lifecycle and phase events
 * for the TRINITY (Thinker/Worker/Verifier) protocol.
 */

import type {
  IEventBus,
  ProtocolStartedEvent,
  ProtocolIterationEvent,
  ProtocolCompletedEvent,
  TrinityPhaseStartedEvent,
  TrinityPhaseCompletedEvent,
} from './event-bus-types.js';
import { createEvent } from './event-bus.js';
import { getTimeProvider } from '../../core/index.js';
import type { TrinityConfig, TrinityResult } from './trinity-types.js';

/** Configuration for emitting protocol started event. */
export interface TrinityStartedParams {
  readonly sessionId: string;
  readonly trinityConfig: TrinityConfig;
}

/** Emits protocol.started event for Trinity protocol. */
export function emitTrinityStarted(eventBus: IEventBus, params: TrinityStartedParams): void {
  const event = createEvent<ProtocolStartedEvent>(
    'protocol.started',
    {
      protocolType: 'trinity',
      config: {
        maxRounds: params.trinityConfig.maxIterations,
        confidenceThreshold: 0.8, // Trinity uses pass/fail, not threshold
        byzantineTolerance: 0, // Trinity doesn't use Byzantine tolerance
        agentCount: 3, // Thinker, Worker, Verifier
      },
    },
    {
      sessionId: params.sessionId,
    }
  );
  eventBus.emit(event);
}

/** Configuration for emitting protocol iteration event. */
export interface TrinityIterationParams {
  readonly round: number;
  readonly maxRounds: number;
  readonly status: 'in_progress' | 'converged' | 'max_reached';
  readonly sessionId: string;
  readonly phase?: 'thinking' | 'working' | 'verifying';
}

/** Emits protocol.iteration event for each Trinity iteration. */
export function emitTrinityIteration(eventBus: IEventBus, params: TrinityIterationParams): void {
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
export interface TrinityCompletedParams {
  readonly result: TrinityResult;
  readonly startTime: number;
  readonly sessionId?: string;
}

/** Emits protocol.completed event for Trinity protocol. */
export function emitTrinityCompleted(eventBus: IEventBus, params: TrinityCompletedParams): void {
  const event = createEvent<ProtocolCompletedEvent>(
    'protocol.completed',
    {
      success: params.result.success,
      iterations: params.result.iterations,
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

/** Trinity phase type. */
export type TrinityPhase = 'thinker' | 'worker' | 'verifier';

/** Parameters for phase started event. */
export interface TrinityPhaseStartedParams {
  readonly iteration: number;
  readonly phase: TrinityPhase;
  readonly sessionId: string;
}

/** Emits protocol.trinity.phase_started event. */
export function emitPhaseStarted(eventBus: IEventBus, params: TrinityPhaseStartedParams): void {
  const event = createEvent<TrinityPhaseStartedEvent>(
    'protocol.trinity.phase_started',
    {
      iteration: params.iteration,
      phase: params.phase,
    },
    { sessionId: params.sessionId }
  );
  eventBus.emit(event);
}

/** Parameters for phase completed event. */
export interface TrinityPhaseCompletedParams {
  readonly iteration: number;
  readonly phase: TrinityPhase;
  readonly durationMs: number;
  readonly tokensUsed: number;
  /**
   * Whether `tokensUsed` is a measurement (#4743). This event DOES fire for a
   * failed phase — unlike the history record, which the phase returns before
   * writing — so it is the one place a failed phase's `0` is observable, and
   * the one place the distinction has to be carried.
   */
  readonly tokensMeasured?: boolean | undefined;
  readonly sessionId: string;
}

/** Emits protocol.trinity.phase_completed event. */
export function emitPhaseCompleted(eventBus: IEventBus, params: TrinityPhaseCompletedParams): void {
  const event = createEvent<TrinityPhaseCompletedEvent>(
    'protocol.trinity.phase_completed',
    {
      iteration: params.iteration,
      phase: params.phase,
      durationMs: params.durationMs,
      tokensUsed: params.tokensUsed,
      ...(params.tokensMeasured !== undefined ? { tokensMeasured: params.tokensMeasured } : {}),
    },
    { sessionId: params.sessionId }
  );
  eventBus.emit(event);
}
