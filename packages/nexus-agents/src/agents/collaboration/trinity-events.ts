/**
 * Trinity Protocol EventBus Integration Helpers
 * (Source: Issue #222, Sprint #219)
 *
 * Provides helper functions for emitting protocol lifecycle events
 * for the TRINITY (Thinker/Worker/Verifier) protocol.
 */

import type {
  IEventBus,
  ProtocolStartedEvent,
  ProtocolIterationEvent,
  ProtocolCompletedEvent,
} from './event-bus-types.js';
import { createEvent } from './event-bus.js';
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
      durationMs: Date.now() - params.startTime,
    },
    {
      ...(params.sessionId !== undefined && { sessionId: params.sessionId }),
    }
  );
  eventBus.emit(event);
}
