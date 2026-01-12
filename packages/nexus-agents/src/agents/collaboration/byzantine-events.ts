/**
 * Byzantine Detection EventBus Integration Helpers
 * (Source: Issue #218, Sprint #228)
 *
 * Provides helper functions for emitting Byzantine fault detection events.
 * Used by CP-WBFT weighted voting to report Byzantine behavior patterns.
 *
 * @module agents/collaboration/byzantine-events
 */

import type {
  IEventBus,
  ByzantineWeightUpdatedEvent,
  ByzantinePatternDetectedEvent,
  ByzantineAgentFlaggedEvent,
  ByzantineCollusionSuspectedEvent,
} from './event-bus-types.js';
import { createEvent } from './event-bus.js';

// =============================================================================
// Weight Update Events
// =============================================================================

/** Parameters for emitting byzantine.weight_updated event. */
export interface WeightUpdatedParams {
  readonly agentId: string;
  readonly previousWeight: number;
  readonly newWeight: number;
  readonly reason: 'performance_update' | 'flag_penalty' | 'recalibration';
  readonly sessionId?: string | undefined;
  readonly correlationId?: string | undefined;
}

/** Emits byzantine.weight_updated event when an agent's weight changes. */
export function emitWeightUpdated(eventBus: IEventBus, params: WeightUpdatedParams): void {
  const event = createEvent<ByzantineWeightUpdatedEvent>(
    'byzantine.weight_updated',
    {
      agentId: params.agentId,
      previousWeight: params.previousWeight,
      newWeight: params.newWeight,
      reason: params.reason,
    },
    {
      ...(params.sessionId !== undefined && { sessionId: params.sessionId }),
      ...(params.correlationId !== undefined && { correlationId: params.correlationId }),
    }
  );
  eventBus.emit(event);
}

// =============================================================================
// Pattern Detection Events
// =============================================================================

/** Parameters for emitting byzantine.pattern_detected event. */
export interface PatternDetectedParams {
  readonly patternType: 'contrarian' | 'collusion';
  readonly agentIds: readonly string[];
  readonly confidence: number;
  readonly details: string;
  readonly sessionId?: string | undefined;
  readonly correlationId?: string | undefined;
}

/** Emits byzantine.pattern_detected event when Byzantine pattern is detected. */
export function emitPatternDetected(eventBus: IEventBus, params: PatternDetectedParams): void {
  const event = createEvent<ByzantinePatternDetectedEvent>(
    'byzantine.pattern_detected',
    {
      patternType: params.patternType,
      agentIds: params.agentIds,
      confidence: params.confidence,
      details: params.details,
    },
    {
      ...(params.sessionId !== undefined && { sessionId: params.sessionId }),
      ...(params.correlationId !== undefined && { correlationId: params.correlationId }),
    }
  );
  eventBus.emit(event);
}

// =============================================================================
// Agent Flagged Events
// =============================================================================

/** Parameters for emitting byzantine.agent_flagged event. */
export interface AgentFlaggedParams {
  readonly agentId: string;
  readonly reason: string;
  readonly previousWeight: number;
  readonly canVote: boolean;
  readonly sessionId?: string | undefined;
  readonly correlationId?: string | undefined;
}

/** Emits byzantine.agent_flagged event when an agent is flagged as Byzantine. */
export function emitAgentFlagged(eventBus: IEventBus, params: AgentFlaggedParams): void {
  const event = createEvent<ByzantineAgentFlaggedEvent>(
    'byzantine.agent_flagged',
    {
      agentId: params.agentId,
      reason: params.reason,
      previousWeight: params.previousWeight,
      canVote: params.canVote,
    },
    {
      ...(params.sessionId !== undefined && { sessionId: params.sessionId }),
      ...(params.correlationId !== undefined && { correlationId: params.correlationId }),
    }
  );
  eventBus.emit(event);
}

// =============================================================================
// Collusion Suspected Events
// =============================================================================

/** Parameters for emitting byzantine.collusion_suspected event. */
export interface CollusionSuspectedParams {
  readonly groupAgentIds: readonly string[];
  readonly groupSize: number;
  readonly votingBlock: number;
  readonly threshold: number;
  readonly sessionId?: string | undefined;
  readonly correlationId?: string | undefined;
}

/** Emits byzantine.collusion_suspected event when collusion pattern is suspected. */
export function emitCollusionSuspected(
  eventBus: IEventBus,
  params: CollusionSuspectedParams
): void {
  const event = createEvent<ByzantineCollusionSuspectedEvent>(
    'byzantine.collusion_suspected',
    {
      groupAgentIds: params.groupAgentIds,
      groupSize: params.groupSize,
      votingBlock: params.votingBlock,
      threshold: params.threshold,
    },
    {
      ...(params.sessionId !== undefined && { sessionId: params.sessionId }),
      ...(params.correlationId !== undefined && { correlationId: params.correlationId }),
    }
  );
  eventBus.emit(event);
}
