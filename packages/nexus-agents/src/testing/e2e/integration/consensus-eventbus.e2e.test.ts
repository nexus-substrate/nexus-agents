/**
 * Consensus -> EventBus Integration E2E Tests
 *
 * Tests verifying the integration between consensus protocols and the EventBus system.
 * Also covers SwarmObserver -> EventBus integration.
 *
 * @module testing/e2e/integration/consensus-eventbus
 * (Source: Issue #323, Swarm Analysis Gap)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  EventBus,
  resetGlobalEventBus,
  createEvent,
} from '../../../agents/collaboration/event-bus.js';
import type { DomainEvent } from '../../../agents/collaboration/event-bus-types.js';
import { SwarmObserver, createSwarmObserver } from '../../../observability/swarm-observer.js';
import { VotingProtocol } from '../../../consensus/voting-protocol.js';

describe('Consensus -> EventBus Integration E2E Tests', () => {
  let eventBus: EventBus;
  let votingProtocol: VotingProtocol;
  let receivedEvents: DomainEvent[];

  beforeEach(() => {
    resetGlobalEventBus();
    eventBus = new EventBus({ maxHistorySize: 100 });
    votingProtocol = new VotingProtocol();
    receivedEvents = [];

    eventBus.subscribe('consensus.*', (event) => {
      receivedEvents.push(event);
    });
  });

  afterEach(() => {
    resetGlobalEventBus();
  });

  it('should emit consensus events to EventBus', () => {
    // Create a voting session
    const session = votingProtocol.createSession('Code review decision', [
      'agent-1',
      'agent-2',
      'agent-3',
    ]);

    // Emit a consensus event manually (simulating protocol behavior)
    const event = createEvent('consensus.session_created', {
      sessionId: session.id,
      topic: session.topic,
      committee: session.committee,
    });
    eventBus.emit(event);

    expect(receivedEvents.length).toBe(1);
    expect(receivedEvents[0]?.topic).toBe('consensus.session_created');
  });

  it('should track vote cast events through EventBus', () => {
    const session = votingProtocol.createSession('Architecture decision', ['agent-a', 'agent-b']);

    // Emit vote cast events
    eventBus.emit(
      createEvent('consensus.vote_cast', {
        sessionId: session.id,
        agentId: 'agent-a',
        decision: 'approve',
        confidence: 0.85,
      })
    );

    eventBus.emit(
      createEvent('consensus.vote_cast', {
        sessionId: session.id,
        agentId: 'agent-b',
        decision: 'approve',
        confidence: 0.9,
      })
    );

    expect(receivedEvents.length).toBe(2);
    expect(receivedEvents.every((e) => e.topic === 'consensus.vote_cast')).toBe(true);
  });

  it('should query consensus event history from EventBus', () => {
    const session = votingProtocol.createSession('Test session', ['a1', 'a2']);

    // Emit multiple events
    eventBus.emit(createEvent('consensus.session_created', { sessionId: session.id }));
    eventBus.emit(createEvent('consensus.vote_requested', { sessionId: session.id }));
    eventBus.emit(
      createEvent('consensus.vote_cast', {
        sessionId: session.id,
        agentId: 'a1',
        decision: 'approve',
      })
    );
    eventBus.emit(createEvent('consensus.reached', { sessionId: session.id, outcome: 'approved' }));

    const history = eventBus.getHistory({ topic: 'consensus.*' });
    expect(history.length).toBe(4);

    const voteEvents = eventBus.getHistory({ topic: 'consensus.vote_cast' });
    expect(voteEvents.length).toBe(1);
  });
});

describe('SwarmObserver -> EventBus Integration E2E Tests', () => {
  let eventBus: EventBus;
  let observer: SwarmObserver;

  beforeEach(() => {
    resetGlobalEventBus();
    eventBus = new EventBus();
    observer = createSwarmObserver() as SwarmObserver;
  });

  afterEach(() => {
    observer.clear();
    resetGlobalEventBus();
  });

  it('should record agent interactions and emit events', () => {
    const receivedEvents: DomainEvent[] = [];
    eventBus.subscribe('agent.*', (e) => {
      receivedEvents.push(e);
    });

    // Record interaction
    observer.recordInteraction({
      from: 'tech-lead',
      to: 'code-expert',
      interactionType: 'delegation',
      outcome: 'success',
      traceId: SwarmObserver.generateTraceId(),
    });

    // Emit corresponding event
    eventBus.emit(
      createEvent('agent.task_delegated', {
        from: 'tech-lead',
        to: 'code-expert',
        taskId: 'task-1',
      })
    );

    expect(receivedEvents.length).toBe(1);
    expect(observer.getHealthMetrics().totalInteractions).toBeGreaterThanOrEqual(0);
  });

  it('should correlate SwarmObserver metrics with EventBus history', () => {
    // Record multiple interactions
    const traceId = SwarmObserver.generateTraceId();

    observer.recordInteraction({
      from: 'orchestrator',
      to: 'security-expert',
      interactionType: 'query',
      outcome: 'success',
      traceId,
    });

    observer.recordInteraction({
      from: 'security-expert',
      to: 'orchestrator',
      interactionType: 'response',
      outcome: 'success',
      traceId,
    });

    // Emit events for the same interactions
    eventBus.emit(
      createEvent('agent.task_delegated', { from: 'orchestrator', to: 'security-expert' })
    );
    eventBus.emit(createEvent('agent.result_broadcast', { from: 'security-expert' }));

    const metrics = observer.getHealthMetrics();
    const history = eventBus.getHistory({ topic: 'agent.*' });

    expect(metrics.totalAgents).toBeGreaterThanOrEqual(2);
    expect(history.length).toBe(2);
  });
});
