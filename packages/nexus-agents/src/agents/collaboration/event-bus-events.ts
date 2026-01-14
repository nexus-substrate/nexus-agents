/**
 * Event Bus Event Definitions
 *
 * All domain event interfaces for agent-to-agent communication.
 *
 * @module agents/collaboration/event-bus-events
 * (Source: Issue #182, ARCHITECTURE.md Hybrid Architecture)
 */

import type { AgentRole, TaskResult } from '../../core/types/index.js';
import type { SessionStatus, CollaborationMessage, VoteDecision } from './collaboration-types.js';
import type { DomainEvent } from './event-bus-core-types.js';

// ============================================================================
// Session Lifecycle Events
// ============================================================================

export interface SessionCreatedEvent extends DomainEvent {
  readonly topic: 'session.created';
  readonly payload: {
    readonly sessionId: string;
    readonly pattern: string;
    readonly experts: readonly string[];
  };
}

export interface SessionStatusChangedEvent extends DomainEvent {
  readonly topic: 'session.status_changed';
  readonly payload: {
    readonly previousStatus: SessionStatus;
    readonly newStatus: SessionStatus;
  };
}

export interface SessionParticipantJoinedEvent extends DomainEvent {
  readonly topic: 'session.participant_joined';
  readonly payload: {
    readonly expertId: string;
    readonly role: AgentRole;
  };
}

export interface SessionResultSubmittedEvent extends DomainEvent {
  readonly topic: 'session.result_submitted';
  readonly payload: {
    readonly expertId: string;
    readonly result: TaskResult;
  };
}

export interface SessionFinalizedEvent extends DomainEvent {
  readonly topic: 'session.finalized';
  readonly payload: {
    readonly success: boolean;
    readonly resultCount: number;
    readonly durationMs: number;
  };
}

// ============================================================================
// Message Routing Events
// ============================================================================

export interface MessageSentEvent extends DomainEvent {
  readonly topic: 'message.sent';
  readonly payload: {
    readonly message: CollaborationMessage;
    readonly from: string;
    readonly to?: string;
  };
}

export interface MessageReceivedEvent extends DomainEvent {
  readonly topic: 'message.received';
  readonly payload: {
    readonly message: CollaborationMessage;
    readonly by: string;
  };
}

// ============================================================================
// Agent Coordination Events
// ============================================================================

export interface AgentTaskDelegatedEvent extends DomainEvent {
  readonly topic: 'agent.task_delegated';
  readonly payload: {
    readonly fromAgent: string;
    readonly toAgent: string;
    readonly taskDescription: string;
    readonly priority: 'critical' | 'high' | 'medium' | 'low';
  };
}

export interface AgentResultBroadcastEvent extends DomainEvent {
  readonly topic: 'agent.result_broadcast';
  readonly payload: {
    readonly agentId: string;
    readonly result: TaskResult;
    readonly recipients: readonly string[];
  };
}

// ============================================================================
// Consensus Voting Events
// ============================================================================

export interface ConsensusVoteRequestedEvent extends DomainEvent {
  readonly topic: 'consensus.vote_requested';
  readonly payload: {
    readonly proposalId: string;
    readonly proposal: string;
    readonly voters: readonly string[];
    readonly deadline?: string;
  };
}

export interface ConsensusVoteCastEvent extends DomainEvent {
  readonly topic: 'consensus.vote_cast';
  readonly payload: {
    readonly proposalId: string;
    readonly voterId: string;
    readonly decision: VoteDecision;
    readonly reasoning: string;
  };
}

export interface ConsensusReachedEvent extends DomainEvent {
  readonly topic: 'consensus.reached';
  readonly payload: {
    readonly proposalId: string;
    readonly decision: VoteDecision;
    readonly voteCount: number;
    readonly unanimity: boolean;
  };
}

// ============================================================================
// Protocol Lifecycle Events
// ============================================================================

export interface ProtocolStartedEvent extends DomainEvent {
  readonly topic: 'protocol.started';
  readonly payload: {
    readonly protocolType: string;
    readonly config: Record<string, unknown>;
  };
}

export interface ProtocolIterationEvent extends DomainEvent {
  readonly topic: 'protocol.iteration';
  readonly payload: {
    readonly round: number;
    readonly maxRounds: number;
    readonly status: 'in_progress' | 'converged' | 'max_reached';
  };
}

export interface ProtocolCompletedEvent extends DomainEvent {
  readonly topic: 'protocol.completed';
  readonly payload: {
    readonly success: boolean;
    readonly iterations: number;
    readonly durationMs: number;
  };
}

// ============================================================================
// Aegean Protocol Phase Events (Issue #216)
// ============================================================================

export interface AegeanRoundStartedEvent extends DomainEvent {
  readonly topic: 'protocol.aegean.round_started';
  readonly payload: {
    readonly round: number;
    readonly maxRounds: number;
    readonly leaderId: string;
  };
}

export interface AegeanVoteCollectedEvent extends DomainEvent {
  readonly topic: 'protocol.aegean.vote_collected';
  readonly payload: {
    readonly round: number;
    readonly voterId: string;
    readonly voteCount: number;
    readonly requiredQuorum: number;
  };
}

export interface AegeanQuorumDetectedEvent extends DomainEvent {
  readonly topic: 'protocol.aegean.quorum_detected';
  readonly payload: {
    readonly round: number;
    readonly quorumSize: number;
    readonly earlyTermination: boolean;
  };
}

// ============================================================================
// Reflexion Protocol Phase Events (Issue #216)
// ============================================================================

export interface ReflexionCritiqueStartedEvent extends DomainEvent {
  readonly topic: 'protocol.reflexion.critique_started';
  readonly payload: {
    readonly iteration: number;
    readonly personaId: string;
    readonly personaRole: string;
  };
}

export interface ReflexionCritiqueCompletedEvent extends DomainEvent {
  readonly topic: 'protocol.reflexion.critique_completed';
  readonly payload: {
    readonly iteration: number;
    readonly personaId: string;
    readonly severity: number;
    readonly issueCount: number;
  };
}

export interface ReflexionSynthesisEvent extends DomainEvent {
  readonly topic: 'protocol.reflexion.synthesis';
  readonly payload: {
    readonly iteration: number;
    readonly consensusSeverity: number;
    readonly actionItemCount: number;
  };
}

// ============================================================================
// Trinity Protocol Phase Events (Issue #216)
// ============================================================================

export interface TrinityPhaseStartedEvent extends DomainEvent {
  readonly topic: 'protocol.trinity.phase_started';
  readonly payload: {
    readonly iteration: number;
    readonly phase: 'thinker' | 'worker' | 'verifier';
  };
}

export interface TrinityPhaseCompletedEvent extends DomainEvent {
  readonly topic: 'protocol.trinity.phase_completed';
  readonly payload: {
    readonly iteration: number;
    readonly phase: 'thinker' | 'worker' | 'verifier';
    readonly durationMs: number;
    readonly tokensUsed: number;
  };
}

// ============================================================================
// Byzantine Fault Tolerance Events (Issue #218)
// CP-WBFT weighted voting with Byzantine detection.
// ============================================================================

export interface ByzantineWeightUpdatedEvent extends DomainEvent {
  readonly topic: 'byzantine.weight_updated';
  readonly payload: {
    readonly agentId: string;
    readonly previousWeight: number;
    readonly newWeight: number;
    readonly reason: 'performance_update' | 'flag_penalty' | 'recalibration';
  };
}

export interface ByzantinePatternDetectedEvent extends DomainEvent {
  readonly topic: 'byzantine.pattern_detected';
  readonly payload: {
    readonly patternType: 'contrarian' | 'collusion';
    readonly agentIds: readonly string[];
    readonly confidence: number;
    readonly details: string;
  };
}

export interface ByzantineAgentFlaggedEvent extends DomainEvent {
  readonly topic: 'byzantine.agent_flagged';
  readonly payload: {
    readonly agentId: string;
    readonly reason: string;
    readonly previousWeight: number;
    readonly canVote: boolean;
  };
}

export interface ByzantineCollusionSuspectedEvent extends DomainEvent {
  readonly topic: 'byzantine.collusion_suspected';
  readonly payload: {
    readonly groupAgentIds: readonly string[];
    readonly groupSize: number;
    readonly votingBlock: number;
    readonly threshold: number;
  };
}

// ============================================================================
// Union Type for All Events
// ============================================================================

/**
 * Union type for all typed events.
 */
export type TypedEvent =
  | SessionCreatedEvent
  | SessionStatusChangedEvent
  | SessionParticipantJoinedEvent
  | SessionResultSubmittedEvent
  | SessionFinalizedEvent
  | MessageSentEvent
  | MessageReceivedEvent
  | AgentTaskDelegatedEvent
  | AgentResultBroadcastEvent
  | ConsensusVoteRequestedEvent
  | ConsensusVoteCastEvent
  | ConsensusReachedEvent
  | ProtocolStartedEvent
  | ProtocolIterationEvent
  | ProtocolCompletedEvent
  | AegeanRoundStartedEvent
  | AegeanVoteCollectedEvent
  | AegeanQuorumDetectedEvent
  | ReflexionCritiqueStartedEvent
  | ReflexionCritiqueCompletedEvent
  | ReflexionSynthesisEvent
  | TrinityPhaseStartedEvent
  | TrinityPhaseCompletedEvent
  | ByzantineWeightUpdatedEvent
  | ByzantinePatternDetectedEvent
  | ByzantineAgentFlaggedEvent
  | ByzantineCollusionSuspectedEvent;
