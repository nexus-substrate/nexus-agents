/**
 * Event Bus Type Definitions
 *
 * Type-safe event bus for agent-to-agent communication.
 * Enables peer-to-peer messaging without MCP client roundtrips.
 *
 * @module agents/collaboration/event-bus-types
 * (Source: Issue #182, ARCHITECTURE.md Hybrid Architecture)
 */

// Re-export core types
export type {
  SubscriptionId,
  TopicPattern,
  DomainEvent,
  EventListener,
  Subscription,
  EventFilter,
  EventBusOptions,
  EventBusStats,
  ICollaborationEventBus,
} from './event-bus-core-types.js';

// Re-export all event types
export type {
  SessionCreatedEvent,
  SessionStatusChangedEvent,
  SessionParticipantJoinedEvent,
  SessionResultSubmittedEvent,
  SessionFinalizedEvent,
  MessageSentEvent,
  MessageReceivedEvent,
  AgentTaskDelegatedEvent,
  AgentResultBroadcastEvent,
  ConsensusVoteRequestedEvent,
  ConsensusVoteCastEvent,
  ConsensusReachedEvent,
  ProtocolStartedEvent,
  ProtocolIterationEvent,
  ProtocolCompletedEvent,
  AegeanRoundStartedEvent,
  AegeanVoteCollectedEvent,
  AegeanQuorumDetectedEvent,
  ReflexionCritiqueStartedEvent,
  ReflexionCritiqueCompletedEvent,
  ReflexionSynthesisEvent,
  TrinityPhaseStartedEvent,
  TrinityPhaseCompletedEvent,
  ByzantineWeightUpdatedEvent,
  ByzantinePatternDetectedEvent,
  ByzantineAgentFlaggedEvent,
  ByzantineCollusionSuspectedEvent,
  TypedEvent,
} from './event-bus-events.js';

// Re-export topic constants
export { EventTopics } from './event-bus-topics.js';
