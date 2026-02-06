/**
 * Tests for Event Bus Event Definitions
 *
 * Tests event factory creation via createEvent, EventTopics constants,
 * and TypedEvent union type discrimination.
 *
 * @module agents/collaboration/event-bus-events.test
 */

import { describe, it, expect } from 'vitest';
import { createEvent } from './event-bus.js';
import { EventTopics } from './event-bus-topics.js';
import type {
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
import type { TaskResult } from '../../core/types/index.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeTaskResult(): TaskResult {
  return {
    output: 'test output',
    confidence: 0.9,
    tokenUsage: { input: 100, output: 50 },
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function assertEventBase(event: { eventId: string; timestamp: string; topic: string }) {
  expect(event.eventId).toMatch(/^evt-/);
  expect(event.timestamp).toBeTruthy();
  expect(event.topic).toBeTruthy();
}

// ============================================================================
// EventTopics Constants
// ============================================================================

describe('EventTopics constants', () => {
  it('has correct session topic values', () => {
    expect(EventTopics.SESSION_CREATED).toBe('session.created');
    expect(EventTopics.SESSION_STATUS_CHANGED).toBe('session.status_changed');
    expect(EventTopics.SESSION_PARTICIPANT_JOINED).toBe('session.participant_joined');
    expect(EventTopics.SESSION_RESULT_SUBMITTED).toBe('session.result_submitted');
    expect(EventTopics.SESSION_FINALIZED).toBe('session.finalized');
    expect(EventTopics.SESSION_ALL).toBe('session.*');
  });

  it('has correct message topic values', () => {
    expect(EventTopics.MESSAGE_SENT).toBe('message.sent');
    expect(EventTopics.MESSAGE_RECEIVED).toBe('message.received');
    expect(EventTopics.MESSAGE_ALL).toBe('message.*');
  });

  it('has correct agent topic values', () => {
    expect(EventTopics.AGENT_TASK_DELEGATED).toBe('agent.task_delegated');
    expect(EventTopics.AGENT_RESULT_BROADCAST).toBe('agent.result_broadcast');
    expect(EventTopics.AGENT_ALL).toBe('agent.*');
  });

  it('has correct consensus topic values', () => {
    expect(EventTopics.CONSENSUS_VOTE_REQUESTED).toBe('consensus.vote_requested');
    expect(EventTopics.CONSENSUS_VOTE_CAST).toBe('consensus.vote_cast');
    expect(EventTopics.CONSENSUS_REACHED).toBe('consensus.reached');
    expect(EventTopics.CONSENSUS_ALL).toBe('consensus.*');
  });

  it('has correct protocol topic values', () => {
    expect(EventTopics.PROTOCOL_STARTED).toBe('protocol.started');
    expect(EventTopics.PROTOCOL_ITERATION).toBe('protocol.iteration');
    expect(EventTopics.PROTOCOL_COMPLETED).toBe('protocol.completed');
    expect(EventTopics.PROTOCOL_ALL).toBe('protocol.*');
  });

  it('has correct aegean topic values', () => {
    expect(EventTopics.AEGEAN_ROUND_STARTED).toBe('protocol.aegean.round_started');
    expect(EventTopics.AEGEAN_VOTE_COLLECTED).toBe('protocol.aegean.vote_collected');
    expect(EventTopics.AEGEAN_QUORUM_DETECTED).toBe('protocol.aegean.quorum_detected');
    expect(EventTopics.AEGEAN_ALL).toBe('protocol.aegean.*');
  });

  it('has correct reflexion topic values', () => {
    expect(EventTopics.REFLEXION_CRITIQUE_STARTED).toBe('protocol.reflexion.critique_started');
    expect(EventTopics.REFLEXION_CRITIQUE_COMPLETED).toBe('protocol.reflexion.critique_completed');
    expect(EventTopics.REFLEXION_SYNTHESIS).toBe('protocol.reflexion.synthesis');
    expect(EventTopics.REFLEXION_ALL).toBe('protocol.reflexion.*');
  });

  it('has correct trinity topic values', () => {
    expect(EventTopics.TRINITY_PHASE_STARTED).toBe('protocol.trinity.phase_started');
    expect(EventTopics.TRINITY_PHASE_COMPLETED).toBe('protocol.trinity.phase_completed');
    expect(EventTopics.TRINITY_ALL).toBe('protocol.trinity.*');
  });

  it('has correct byzantine topic values', () => {
    expect(EventTopics.BYZANTINE_WEIGHT_UPDATED).toBe('byzantine.weight_updated');
    expect(EventTopics.BYZANTINE_PATTERN_DETECTED).toBe('byzantine.pattern_detected');
    expect(EventTopics.BYZANTINE_AGENT_FLAGGED).toBe('byzantine.agent_flagged');
    expect(EventTopics.BYZANTINE_COLLUSION_SUSPECTED).toBe('byzantine.collusion_suspected');
    expect(EventTopics.BYZANTINE_ALL).toBe('byzantine.*');
  });

  it('has global wildcard', () => {
    expect(EventTopics.ALL).toBe('*');
  });
});

// ============================================================================
// Session Lifecycle Events via createEvent
// ============================================================================

describe('session lifecycle events', () => {
  it('creates SessionCreatedEvent with correct shape', () => {
    const event = createEvent<SessionCreatedEvent>('session.created', {
      sessionId: 'sess-1',
      pattern: 'parallel',
      experts: ['a', 'b'],
    });
    assertEventBase(event);
    expect(event.topic).toBe('session.created');
    expect(event.payload.sessionId).toBe('sess-1');
    expect(event.payload.pattern).toBe('parallel');
    expect(event.payload.experts).toEqual(['a', 'b']);
  });

  it('creates SessionStatusChangedEvent', () => {
    const event = createEvent<SessionStatusChangedEvent>('session.status_changed', {
      previousStatus: 'pending',
      newStatus: 'in_progress',
    });
    assertEventBase(event);
    expect(event.topic).toBe('session.status_changed');
    expect(event.payload.previousStatus).toBe('pending');
    expect(event.payload.newStatus).toBe('in_progress');
  });

  it('creates SessionParticipantJoinedEvent', () => {
    const event = createEvent<SessionParticipantJoinedEvent>('session.participant_joined', {
      expertId: 'exp-1',
      role: 'code_expert',
    });
    assertEventBase(event);
    expect(event.payload.expertId).toBe('exp-1');
    expect(event.payload.role).toBe('code_expert');
  });

  it('creates SessionResultSubmittedEvent', () => {
    const result = makeTaskResult();
    const event = createEvent<SessionResultSubmittedEvent>('session.result_submitted', {
      expertId: 'exp-2',
      result,
    });
    assertEventBase(event);
    expect(event.payload.expertId).toBe('exp-2');
    expect(event.payload.result).toEqual(result);
  });

  it('creates SessionFinalizedEvent', () => {
    const event = createEvent<SessionFinalizedEvent>('session.finalized', {
      success: true,
      resultCount: 3,
      durationMs: 1500,
    });
    assertEventBase(event);
    expect(event.payload.success).toBe(true);
    expect(event.payload.resultCount).toBe(3);
    expect(event.payload.durationMs).toBe(1500);
  });
});

// ============================================================================
// Message Routing Events via createEvent
// ============================================================================

describe('message routing events', () => {
  it('creates MessageSentEvent with optional "to" field', () => {
    const msg = {
      type: 'task_assignment' as const,
      expertId: 'e1',
      task: { id: 't1', description: 'test' },
    };
    const event = createEvent<MessageSentEvent>('message.sent', {
      message: msg as never,
      from: 'agent-1',
      to: 'agent-2',
    });
    assertEventBase(event);
    expect(event.payload.from).toBe('agent-1');
    expect(event.payload.to).toBe('agent-2');
  });

  it('creates MessageSentEvent without "to" field', () => {
    const msg = {
      type: 'task_assignment' as const,
      expertId: 'e1',
      task: { id: 't1', description: 'test' },
    };
    const event = createEvent<MessageSentEvent>('message.sent', {
      message: msg as never,
      from: 'agent-1',
    });
    expect(event.payload.to).toBeUndefined();
  });

  it('creates MessageReceivedEvent', () => {
    const msg = { type: 'feedback' as const, expertId: 'e2', content: 'good' };
    const event = createEvent<MessageReceivedEvent>('message.received', {
      message: msg as never,
      by: 'agent-3',
    });
    assertEventBase(event);
    expect(event.payload.by).toBe('agent-3');
  });
});

// ============================================================================
// Agent Coordination Events via createEvent
// ============================================================================

describe('agent coordination events', () => {
  it('creates AgentTaskDelegatedEvent with priority levels', () => {
    const priorities = ['critical', 'high', 'medium', 'low'] as const;
    for (const priority of priorities) {
      const event = createEvent<AgentTaskDelegatedEvent>('agent.task_delegated', {
        fromAgent: 'a1',
        toAgent: 'a2',
        taskDescription: 'do X',
        priority,
      });
      expect(event.payload.priority).toBe(priority);
    }
  });

  it('creates AgentResultBroadcastEvent', () => {
    const event = createEvent<AgentResultBroadcastEvent>('agent.result_broadcast', {
      agentId: 'a1',
      result: makeTaskResult(),
      recipients: ['a2', 'a3'],
    });
    assertEventBase(event);
    expect(event.payload.recipients).toEqual(['a2', 'a3']);
  });
});

// ============================================================================
// Consensus Voting Events via createEvent
// ============================================================================

describe('consensus voting events', () => {
  it('creates ConsensusVoteRequestedEvent with optional deadline', () => {
    const event = createEvent<ConsensusVoteRequestedEvent>('consensus.vote_requested', {
      proposalId: 'prop-1',
      proposal: 'Use X?',
      voters: ['v1', 'v2'],
      deadline: '2025-01-01T00:00:00Z',
    });
    assertEventBase(event);
    expect(event.payload.deadline).toBe('2025-01-01T00:00:00Z');
  });

  it('creates ConsensusVoteRequestedEvent without deadline', () => {
    const event = createEvent<ConsensusVoteRequestedEvent>('consensus.vote_requested', {
      proposalId: 'prop-2',
      proposal: 'Use Y?',
      voters: ['v1'],
    });
    expect(event.payload.deadline).toBeUndefined();
  });

  it('creates ConsensusVoteCastEvent', () => {
    const event = createEvent<ConsensusVoteCastEvent>('consensus.vote_cast', {
      proposalId: 'prop-1',
      voterId: 'v1',
      decision: 'approve',
      reasoning: 'good idea',
    });
    expect(event.payload.decision).toBe('approve');
    expect(event.payload.reasoning).toBe('good idea');
  });

  it('creates ConsensusReachedEvent', () => {
    const event = createEvent<ConsensusReachedEvent>('consensus.reached', {
      proposalId: 'prop-1',
      decision: 'approve',
      voteCount: 5,
      unanimity: true,
    });
    expect(event.payload.unanimity).toBe(true);
    expect(event.payload.voteCount).toBe(5);
  });
});

// ============================================================================
// Protocol Lifecycle Events via createEvent
// ============================================================================

describe('protocol lifecycle events', () => {
  it('creates ProtocolStartedEvent', () => {
    const event = createEvent<ProtocolStartedEvent>('protocol.started', {
      protocolType: 'aegean',
      config: { rounds: 3 },
    });
    assertEventBase(event);
    expect(event.payload.protocolType).toBe('aegean');
    expect(event.payload.config).toEqual({ rounds: 3 });
  });

  it('creates ProtocolIterationEvent with all statuses', () => {
    const statuses = ['in_progress', 'converged', 'max_reached'] as const;
    for (const status of statuses) {
      const event = createEvent<ProtocolIterationEvent>('protocol.iteration', {
        round: 2,
        maxRounds: 5,
        status,
      });
      expect(event.payload.status).toBe(status);
    }
  });

  it('creates ProtocolCompletedEvent', () => {
    const event = createEvent<ProtocolCompletedEvent>('protocol.completed', {
      success: false,
      iterations: 10,
      durationMs: 5000,
    });
    expect(event.payload.success).toBe(false);
    expect(event.payload.iterations).toBe(10);
  });
});

// ============================================================================
// Aegean Protocol Phase Events via createEvent
// ============================================================================

describe('aegean protocol phase events', () => {
  it('creates AegeanRoundStartedEvent', () => {
    const event = createEvent<AegeanRoundStartedEvent>('protocol.aegean.round_started', {
      round: 1,
      maxRounds: 5,
      leaderId: 'leader-1',
    });
    assertEventBase(event);
    expect(event.payload.leaderId).toBe('leader-1');
  });

  it('creates AegeanVoteCollectedEvent', () => {
    const event = createEvent<AegeanVoteCollectedEvent>('protocol.aegean.vote_collected', {
      round: 2,
      voterId: 'v1',
      voteCount: 3,
      requiredQuorum: 5,
    });
    expect(event.payload.voteCount).toBe(3);
    expect(event.payload.requiredQuorum).toBe(5);
  });

  it('creates AegeanQuorumDetectedEvent', () => {
    const event = createEvent<AegeanQuorumDetectedEvent>('protocol.aegean.quorum_detected', {
      round: 3,
      quorumSize: 4,
      earlyTermination: true,
    });
    expect(event.payload.earlyTermination).toBe(true);
  });
});

// ============================================================================
// Reflexion Protocol Phase Events via createEvent
// ============================================================================

describe('reflexion protocol phase events', () => {
  it('creates ReflexionCritiqueStartedEvent', () => {
    const event = createEvent<ReflexionCritiqueStartedEvent>(
      'protocol.reflexion.critique_started',
      { iteration: 1, personaId: 'p1', personaRole: 'security_reviewer' }
    );
    assertEventBase(event);
    expect(event.payload.personaRole).toBe('security_reviewer');
  });

  it('creates ReflexionCritiqueCompletedEvent', () => {
    const event = createEvent<ReflexionCritiqueCompletedEvent>(
      'protocol.reflexion.critique_completed',
      { iteration: 1, personaId: 'p1', severity: 7, issueCount: 3 }
    );
    expect(event.payload.severity).toBe(7);
    expect(event.payload.issueCount).toBe(3);
  });

  it('creates ReflexionSynthesisEvent', () => {
    const event = createEvent<ReflexionSynthesisEvent>('protocol.reflexion.synthesis', {
      iteration: 2,
      consensusSeverity: 5,
      actionItemCount: 8,
    });
    expect(event.payload.consensusSeverity).toBe(5);
    expect(event.payload.actionItemCount).toBe(8);
  });
});

// ============================================================================
// Trinity Protocol Phase Events via createEvent
// ============================================================================

describe('trinity protocol phase events', () => {
  it('creates TrinityPhaseStartedEvent for each phase', () => {
    const phases = ['thinker', 'worker', 'verifier'] as const;
    for (const phase of phases) {
      const event = createEvent<TrinityPhaseStartedEvent>('protocol.trinity.phase_started', {
        iteration: 1,
        phase,
      });
      expect(event.payload.phase).toBe(phase);
    }
  });

  it('creates TrinityPhaseCompletedEvent', () => {
    const event = createEvent<TrinityPhaseCompletedEvent>('protocol.trinity.phase_completed', {
      iteration: 2,
      phase: 'verifier',
      durationMs: 300,
      tokensUsed: 1500,
    });
    expect(event.payload.durationMs).toBe(300);
    expect(event.payload.tokensUsed).toBe(1500);
  });
});

// ============================================================================
// Byzantine Fault Tolerance Events via createEvent
// ============================================================================

describe('byzantine fault tolerance events', () => {
  it('creates ByzantineWeightUpdatedEvent with reason variants', () => {
    const reasons = ['performance_update', 'flag_penalty', 'recalibration'] as const;
    for (const reason of reasons) {
      const event = createEvent<ByzantineWeightUpdatedEvent>('byzantine.weight_updated', {
        agentId: 'a1',
        previousWeight: 1.0,
        newWeight: 0.8,
        reason,
      });
      expect(event.payload.reason).toBe(reason);
    }
  });

  it('creates ByzantinePatternDetectedEvent', () => {
    const event = createEvent<ByzantinePatternDetectedEvent>('byzantine.pattern_detected', {
      patternType: 'contrarian',
      agentIds: ['a1', 'a2'],
      confidence: 0.85,
      details: 'correlated dissent',
    });
    expect(event.payload.patternType).toBe('contrarian');
    expect(event.payload.confidence).toBe(0.85);
  });

  it('creates ByzantineAgentFlaggedEvent', () => {
    const event = createEvent<ByzantineAgentFlaggedEvent>('byzantine.agent_flagged', {
      agentId: 'a1',
      reason: 'repeated contrarian votes',
      previousWeight: 1.0,
      canVote: false,
    });
    expect(event.payload.canVote).toBe(false);
    expect(event.payload.previousWeight).toBe(1.0);
  });

  it('creates ByzantineCollusionSuspectedEvent', () => {
    const event = createEvent<ByzantineCollusionSuspectedEvent>('byzantine.collusion_suspected', {
      groupAgentIds: ['a1', 'a2', 'a3'],
      groupSize: 3,
      votingBlock: 0.6,
      threshold: 0.5,
    });
    expect(event.payload.groupSize).toBe(3);
    expect(event.payload.votingBlock).toBe(0.6);
    expect(event.payload.threshold).toBe(0.5);
  });
});

// ============================================================================
// createEvent Optional Fields
// ============================================================================

describe('createEvent optional fields', () => {
  it('includes sessionId when provided', () => {
    const event = createEvent<SessionCreatedEvent>(
      'session.created',
      { sessionId: 's1', pattern: 'sequential', experts: [] },
      { sessionId: 'scope-sess-1' }
    );
    expect(event.sessionId).toBe('scope-sess-1');
  });

  it('includes correlationId when provided', () => {
    const event = createEvent<SessionCreatedEvent>(
      'session.created',
      { sessionId: 's1', pattern: 'sequential', experts: [] },
      { correlationId: 'corr-123' }
    );
    expect(event.correlationId).toBe('corr-123');
  });

  it('leaves sessionId undefined when not provided', () => {
    const event = createEvent<SessionCreatedEvent>('session.created', {
      sessionId: 's1',
      pattern: 'sequential',
      experts: [],
    });
    expect(event.sessionId).toBeUndefined();
  });

  it('generates unique eventIds', () => {
    const event1 = createEvent<SessionFinalizedEvent>('session.finalized', {
      success: true,
      resultCount: 1,
      durationMs: 100,
    });
    const event2 = createEvent<SessionFinalizedEvent>('session.finalized', {
      success: true,
      resultCount: 1,
      durationMs: 100,
    });
    expect(event1.eventId).not.toBe(event2.eventId);
  });
});

// ============================================================================
// TypedEvent Union Discrimination
// ============================================================================

describe('TypedEvent union discrimination', () => {
  it('discriminates session event by topic', () => {
    const event: TypedEvent = createEvent<SessionCreatedEvent>('session.created', {
      sessionId: 's1',
      pattern: 'parallel',
      experts: ['a'],
    });
    if (event.topic === 'session.created') {
      expect(event.payload.sessionId).toBe('s1');
    }
  });

  it('discriminates byzantine event by topic', () => {
    const event: TypedEvent = createEvent<ByzantinePatternDetectedEvent>(
      'byzantine.pattern_detected',
      { patternType: 'collusion', agentIds: ['x'], confidence: 0.9, details: '' }
    );
    if (event.topic === 'byzantine.pattern_detected') {
      expect(event.payload.patternType).toBe('collusion');
    }
  });

  it('discriminates consensus event by topic', () => {
    const event: TypedEvent = createEvent<ConsensusReachedEvent>('consensus.reached', {
      proposalId: 'p1',
      decision: 'reject',
      voteCount: 3,
      unanimity: false,
    });
    if (event.topic === 'consensus.reached') {
      expect(event.payload.decision).toBe('reject');
    }
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('edge cases', () => {
  it('handles empty experts array in SessionCreatedEvent', () => {
    const event = createEvent<SessionCreatedEvent>('session.created', {
      sessionId: 's1',
      pattern: 'parallel',
      experts: [],
    });
    expect(event.payload.experts).toEqual([]);
  });

  it('handles empty recipients in AgentResultBroadcastEvent', () => {
    const event = createEvent<AgentResultBroadcastEvent>('agent.result_broadcast', {
      agentId: 'a1',
      result: makeTaskResult(),
      recipients: [],
    });
    expect(event.payload.recipients).toEqual([]);
  });

  it('handles empty config in ProtocolStartedEvent', () => {
    const event = createEvent<ProtocolStartedEvent>('protocol.started', {
      protocolType: 'custom',
      config: {},
    });
    expect(event.payload.config).toEqual({});
  });

  it('handles zero-value numeric fields', () => {
    const event = createEvent<SessionFinalizedEvent>('session.finalized', {
      success: false,
      resultCount: 0,
      durationMs: 0,
    });
    expect(event.payload.resultCount).toBe(0);
    expect(event.payload.durationMs).toBe(0);
  });

  it('handles empty voters array in ConsensusVoteRequestedEvent', () => {
    const event = createEvent<ConsensusVoteRequestedEvent>('consensus.vote_requested', {
      proposalId: 'p1',
      proposal: '',
      voters: [],
    });
    expect(event.payload.voters).toEqual([]);
    expect(event.payload.proposal).toBe('');
  });
});
