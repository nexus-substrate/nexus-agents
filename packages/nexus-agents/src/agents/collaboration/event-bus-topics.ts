/**
 * Event Bus Topic Constants
 *
 * Type-safe topic constants for event subscription.
 *
 * @module agents/collaboration/event-bus-topics
 * (Source: Issue #182, ARCHITECTURE.md Hybrid Architecture)
 */

/**
 * Topic constants for type-safe subscription.
 */
export const EventTopics = {
  // Session events
  SESSION_CREATED: 'session.created',
  SESSION_STATUS_CHANGED: 'session.status_changed',
  SESSION_PARTICIPANT_JOINED: 'session.participant_joined',
  SESSION_RESULT_SUBMITTED: 'session.result_submitted',
  SESSION_FINALIZED: 'session.finalized',
  SESSION_ALL: 'session.*',

  // Message events
  MESSAGE_SENT: 'message.sent',
  MESSAGE_RECEIVED: 'message.received',
  MESSAGE_ALL: 'message.*',

  // Agent events
  AGENT_TASK_DELEGATED: 'agent.task_delegated',
  AGENT_RESULT_BROADCAST: 'agent.result_broadcast',
  AGENT_ALL: 'agent.*',

  // Consensus events
  CONSENSUS_VOTE_REQUESTED: 'consensus.vote_requested',
  CONSENSUS_VOTE_CAST: 'consensus.vote_cast',
  CONSENSUS_REACHED: 'consensus.reached',
  CONSENSUS_ALL: 'consensus.*',

  // Protocol events
  PROTOCOL_STARTED: 'protocol.started',
  PROTOCOL_ITERATION: 'protocol.iteration',
  PROTOCOL_COMPLETED: 'protocol.completed',
  PROTOCOL_ALL: 'protocol.*',

  // Aegean phase events (Issue #216)
  AEGEAN_ROUND_STARTED: 'protocol.aegean.round_started',
  AEGEAN_VOTE_COLLECTED: 'protocol.aegean.vote_collected',
  AEGEAN_QUORUM_DETECTED: 'protocol.aegean.quorum_detected',
  AEGEAN_ALL: 'protocol.aegean.*',

  // Reflexion phase events (Issue #216)
  REFLEXION_CRITIQUE_STARTED: 'protocol.reflexion.critique_started',
  REFLEXION_CRITIQUE_COMPLETED: 'protocol.reflexion.critique_completed',
  REFLEXION_SYNTHESIS: 'protocol.reflexion.synthesis',
  REFLEXION_ALL: 'protocol.reflexion.*',

  // Trinity phase events (Issue #216)
  TRINITY_PHASE_STARTED: 'protocol.trinity.phase_started',
  TRINITY_PHASE_COMPLETED: 'protocol.trinity.phase_completed',
  TRINITY_ALL: 'protocol.trinity.*',

  // Byzantine detection events (Issue #218)
  BYZANTINE_WEIGHT_UPDATED: 'byzantine.weight_updated',
  BYZANTINE_PATTERN_DETECTED: 'byzantine.pattern_detected',
  BYZANTINE_AGENT_FLAGGED: 'byzantine.agent_flagged',
  BYZANTINE_COLLUSION_SUSPECTED: 'byzantine.collusion_suspected',
  BYZANTINE_ALL: 'byzantine.*',

  // Wildcard
  ALL: '*',
} as const;
