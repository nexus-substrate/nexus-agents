/**
 * Aegean Protocol EventBus Integration Helpers
 * (Source: Issues #220, #216)
 *
 * Provides helper functions for emitting protocol lifecycle and phase events.
 */

import type {
  IEventBus,
  ProtocolStartedEvent,
  ProtocolIterationEvent,
  ProtocolCompletedEvent,
  AegeanRoundStartedEvent,
  AegeanVoteCollectedEvent,
  AegeanQuorumDetectedEvent,
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

// =============================================================================
// Phase Events (Issue #216)
// =============================================================================

/** Parameters for round started event. */
export interface AegeanRoundStartedParams {
  readonly round: number;
  readonly maxRounds: number;
  readonly leaderId: string;
  readonly sessionId: string;
}

/** Emits protocol.aegean.round_started event. */
export function emitAegeanRoundStarted(
  eventBus: IEventBus,
  params: AegeanRoundStartedParams
): void {
  const event = createEvent<AegeanRoundStartedEvent>(
    'protocol.aegean.round_started',
    {
      round: params.round,
      maxRounds: params.maxRounds,
      leaderId: params.leaderId,
    },
    { sessionId: params.sessionId }
  );
  eventBus.emit(event);
}

/** Parameters for vote collected event. */
export interface AegeanVoteCollectedParams {
  readonly round: number;
  readonly voterId: string;
  readonly voteCount: number;
  readonly requiredQuorum: number;
  readonly sessionId: string;
}

/** Emits protocol.aegean.vote_collected event. */
export function emitAegeanVoteCollected(
  eventBus: IEventBus,
  params: AegeanVoteCollectedParams
): void {
  const event = createEvent<AegeanVoteCollectedEvent>(
    'protocol.aegean.vote_collected',
    {
      round: params.round,
      voterId: params.voterId,
      voteCount: params.voteCount,
      requiredQuorum: params.requiredQuorum,
    },
    { sessionId: params.sessionId }
  );
  eventBus.emit(event);
}

/** Parameters for quorum detected event. */
export interface AegeanQuorumDetectedParams {
  readonly round: number;
  readonly quorumSize: number;
  readonly earlyTermination: boolean;
  readonly sessionId: string;
}

/** Emits protocol.aegean.quorum_detected event. */
export function emitAegeanQuorumDetected(
  eventBus: IEventBus,
  params: AegeanQuorumDetectedParams
): void {
  const event = createEvent<AegeanQuorumDetectedEvent>(
    'protocol.aegean.quorum_detected',
    {
      round: params.round,
      quorumSize: params.quorumSize,
      earlyTermination: params.earlyTermination,
    },
    { sessionId: params.sessionId }
  );
  eventBus.emit(event);
}
