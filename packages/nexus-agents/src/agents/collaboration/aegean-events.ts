/**
 * Aegean Protocol EventBus Integration Helpers
 * (Source: Issue #220)
 *
 * Provides helper functions for emitting protocol lifecycle events.
 */

import type {
  IEventBus,
  ProtocolStartedEvent,
  ProtocolIterationEvent,
  ProtocolCompletedEvent,
} from './event-bus-types.js';
import { createEvent } from './event-bus.js';
import type { AegeanConfig, AegeanResult } from './aegean-types.js';

/** Configuration for emitting protocol started event. */
export interface ProtocolStartedParams {
  readonly sessionId: string;
  readonly agentCount: number;
  readonly aegeanConfig: AegeanConfig;
}

/** Emits protocol.started event. */
export function emitProtocolStarted(eventBus: IEventBus, params: ProtocolStartedParams): void {
  const event = createEvent<ProtocolStartedEvent>(
    'protocol.started',
    {
      protocolType: 'aegean',
      config: {
        maxRounds: params.aegeanConfig.maxRounds,
        confidenceThreshold: params.aegeanConfig.confidenceThreshold,
        byzantineTolerance: params.aegeanConfig.byzantineTolerance,
        agentCount: params.agentCount,
      },
    },
    {
      sessionId: params.sessionId,
    }
  );
  eventBus.emit(event);
}

/** Configuration for emitting protocol iteration event. */
export interface ProtocolIterationParams {
  readonly round: number;
  readonly maxRounds: number;
  readonly status: 'in_progress' | 'converged' | 'max_reached';
  readonly sessionId: string;
}

/** Emits protocol.iteration event for each round. */
export function emitProtocolIteration(eventBus: IEventBus, params: ProtocolIterationParams): void {
  const event = createEvent<ProtocolIterationEvent>(
    'protocol.iteration',
    {
      round: params.round + 1,
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
export interface ProtocolCompletedParams {
  readonly result: AegeanResult;
  readonly startTime: number;
  readonly sessionId?: string;
}

/** Emits protocol.completed event. */
export function emitProtocolCompleted(eventBus: IEventBus, params: ProtocolCompletedParams): void {
  const event = createEvent<ProtocolCompletedEvent>(
    'protocol.completed',
    {
      success: params.result.consensusReached,
      iterations: params.result.totalRounds,
      durationMs: Date.now() - params.startTime,
    },
    {
      ...(params.sessionId !== undefined && { sessionId: params.sessionId }),
    }
  );
  eventBus.emit(event);
}
