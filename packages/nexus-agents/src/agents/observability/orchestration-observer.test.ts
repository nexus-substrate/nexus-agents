/**
 * OrchestrationObserver Tests
 *
 * Tests for real-time orchestration observability.
 * (Renamed from SwarmObserver in Issue #251)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CollaborationEventBus } from '../collaboration/event-bus.js';
import { createEvent } from '../collaboration/event-bus.js';
import { OrchestrationObserver, createOrchestrationObserver } from './orchestration-observer.js';
import type {
  OrchestrationObserverEvent,
  RoutingDecision,
  SessionTokenTotals,
} from './orchestration-observer-types.js';

describe('OrchestrationObserver', () => {
  let eventBus: CollaborationEventBus;
  let observer: OrchestrationObserver;

  beforeEach(() => {
    eventBus = new CollaborationEventBus();
    observer = new OrchestrationObserver(eventBus);
  });

  afterEach(() => {
    observer.stop();
  });

  describe('lifecycle', () => {
    it('should start and stop observing', () => {
      expect(observer.isActive()).toBe(false);
      observer.start();
      expect(observer.isActive()).toBe(true);
      observer.stop();
      expect(observer.isActive()).toBe(false);
    });

    it('should not start twice', () => {
      observer.start();
      observer.start(); // Should not throw
      expect(observer.isActive()).toBe(true);
    });

    it('should handle stop when not started', () => {
      observer.stop(); // Should not throw
      expect(observer.isActive()).toBe(false);
    });
  });

  describe('session tracking', () => {
    beforeEach(() => {
      observer.start();
    });

    it('should track session creation', () => {
      const event = createEvent('session.created', {
        sessionId: 'sess-1',
        pattern: 'parallel',
        experts: ['expert-a', 'expert-b'],
      });

      eventBus.emit(event);

      const metrics = observer.getSessionMetrics('sess-1');
      expect(metrics).toHaveLength(1);
      expect(metrics[0]?.sessionId).toBe('sess-1');
      expect(metrics[0]?.taskCount).toBe(0);
    });

    it('should track session finalization', () => {
      // Create session first
      eventBus.emit(
        createEvent('session.created', {
          sessionId: 'sess-2',
          pattern: 'sequential',
          experts: ['expert-x'],
        })
      );

      // Finalize session
      eventBus.emit(
        createEvent(
          'session.finalized',
          { success: true, resultCount: 3, durationMs: 1500 },
          { sessionId: 'sess-2' }
        )
      );

      const metrics = observer.getSessionMetrics('sess-2');
      expect(metrics).toHaveLength(1);
      expect(metrics[0]?.durationMs).toBe(1500);
      expect(metrics[0]?.completedAt).toBeDefined();
    });

    it('should emit session events to listeners', () => {
      const events: OrchestrationObserverEvent[] = [];
      observer.addEventListener((e) => events.push(e));

      eventBus.emit(
        createEvent('session.created', {
          sessionId: 'sess-3',
          pattern: 'consensus',
          experts: [],
        })
      );

      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe('session_started');
    });
  });

  describe('agent state tracking', () => {
    beforeEach(() => {
      observer.start();
    });

    it('should track agents from session creation', () => {
      eventBus.emit(
        createEvent('session.created', {
          sessionId: 'sess-agents',
          pattern: 'parallel',
          experts: ['agent-1', 'agent-2', 'agent-3'],
        })
      );

      const agents = observer.getAgentStates();
      expect(agents).toHaveLength(3);
      expect(agents.map((a) => a.id)).toEqual(['agent-1', 'agent-2', 'agent-3']);
      expect(agents.every((a) => a.state === 'idle')).toBe(true);
    });

    it('should update agent state on task delegation', () => {
      // Create session with agents
      eventBus.emit(
        createEvent('session.created', {
          sessionId: 'sess-delegate',
          pattern: 'sequential',
          experts: ['worker-1'],
        })
      );

      // Delegate task
      eventBus.emit(
        createEvent('agent.task_delegated', {
          fromAgent: 'lead',
          toAgent: 'worker-1',
          taskDescription: 'Process data',
          priority: 'high',
        })
      );

      const agents = observer.getAgentStates();
      const worker = agents.find((a) => a.id === 'worker-1');
      expect(worker?.state).toBe('executing');
      expect(worker?.currentTask).toBe('Process data');
    });

    it('should emit state change events', () => {
      const events: OrchestrationObserverEvent[] = [];
      observer.addEventListener((e) => events.push(e));

      eventBus.emit(
        createEvent('session.created', {
          sessionId: 'sess-state',
          pattern: 'parallel',
          experts: ['observer-agent'],
        })
      );

      eventBus.emit(
        createEvent('agent.task_delegated', {
          fromAgent: 'lead',
          toAgent: 'observer-agent',
          taskDescription: 'Test task',
          priority: 'medium',
        })
      );

      const stateChanges = events.filter((e) => e.type === 'agent_state_changed');
      expect(stateChanges).toHaveLength(1);
      const change = stateChanges[0];
      if (change?.type === 'agent_state_changed') {
        expect(change.agentId).toBe('observer-agent');
        expect(change.state).toBe('executing');
        expect(change.previousState).toBe('idle');
      }
    });
  });

  describe('routing decision tracking', () => {
    beforeEach(() => {
      observer.start();
    });

    it('should record routing decisions', () => {
      const decision: RoutingDecision = {
        timestamp: new Date().toISOString(),
        taskId: 'task-123',
        taskDescription: 'Analyze code',
        selectedCli: 'claude',
        confidence: 0.85,
        reason: 'Best for reasoning tasks',
        alternatives: ['gemini', 'codex'],
        stagesExecuted: ['budget-filter', 'topsis-ranking'],
        decisionTimeMs: 25,
        withinBudget: true,
        topsisScore: 0.78,
      };

      observer.recordRoutingDecision(decision);

      const history = observer.getRoutingHistory();
      expect(history).toHaveLength(1);
      expect(history[0]?.selectedCli).toBe('claude');
    });

    it('should emit routing decision events', () => {
      const events: OrchestrationObserverEvent[] = [];
      observer.addEventListener((e) => events.push(e));

      const decision: RoutingDecision = {
        timestamp: new Date().toISOString(),
        taskId: 'task-456',
        taskDescription: 'Generate tests',
        selectedCli: 'codex',
        confidence: 0.9,
        reason: 'Fast for test generation',
        alternatives: ['claude'],
        stagesExecuted: ['linucb-selection'],
        decisionTimeMs: 15,
      };

      observer.recordRoutingDecision(decision);

      const routingEvents = events.filter((e) => e.type === 'routing_decision');
      expect(routingEvents).toHaveLength(1);
    });

    it('should prune old routing decisions when limit exceeded', () => {
      const observerWithLimit = new OrchestrationObserver(eventBus, {
        config: { maxRoutingHistory: 3 },
      });
      observerWithLimit.start();

      for (let i = 0; i < 5; i++) {
        observerWithLimit.recordRoutingDecision({
          timestamp: new Date().toISOString(),
          taskId: 'task-' + String(i),
          taskDescription: 'Task ' + String(i),
          selectedCli: 'claude',
          confidence: 0.8,
          reason: 'Test',
          alternatives: [],
          stagesExecuted: [],
          decisionTimeMs: 10,
        });
      }

      const history = observerWithLimit.getRoutingHistory();
      expect(history).toHaveLength(3);
      expect(history[0]?.taskId).toBe('task-2'); // Oldest kept
      expect(history[2]?.taskId).toBe('task-4'); // Most recent

      observerWithLimit.stop();
    });
  });

  describe('token and cost tracking', () => {
    beforeEach(() => {
      observer.start();
    });

    it('should record token usage for sessions', () => {
      // Create session
      eventBus.emit(
        createEvent('session.created', {
          sessionId: 'sess-tokens',
          pattern: 'parallel',
          experts: [],
        })
      );

      const tokens: SessionTokenTotals = {
        inputTokens: 500,
        outputTokens: 200,
        totalTokens: 700,
      };

      observer.recordTokenUsage('sess-tokens', 'claude', tokens);

      const metrics = observer.getSessionMetrics('sess-tokens');
      expect(metrics).toHaveLength(1);
      expect(metrics[0]?.tokenUsage.totalTokens).toBe(700);
      expect(metrics[0]?.costMetrics.totalCostUsd).toBeGreaterThan(0);
    });

    it('should accumulate token usage across multiple calls', () => {
      eventBus.emit(
        createEvent('session.created', {
          sessionId: 'sess-accum',
          pattern: 'sequential',
          experts: [],
        })
      );

      observer.recordTokenUsage('sess-accum', 'claude', {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      });

      observer.recordTokenUsage('sess-accum', 'gemini', {
        inputTokens: 200,
        outputTokens: 100,
        totalTokens: 300,
      });

      const metrics = observer.getSessionMetrics('sess-accum');
      expect(metrics[0]?.tokenUsage.totalTokens).toBe(450);
    });

    it('should track cost per model', () => {
      eventBus.emit(
        createEvent('session.created', {
          sessionId: 'sess-cost',
          pattern: 'parallel',
          experts: [],
        })
      );

      observer.recordTokenUsage('sess-cost', 'claude', {
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
      });

      observer.recordTokenUsage('sess-cost', 'gemini', {
        inputTokens: 2000,
        outputTokens: 1000,
        totalTokens: 3000,
      });

      const metrics = observer.getSessionMetrics('sess-cost');
      const claudeCost = metrics[0]?.costMetrics.costPerModel.get('claude') ?? 0;
      const geminiCost = metrics[0]?.costMetrics.costPerModel.get('gemini') ?? 0;

      // Claude is more expensive per token
      expect(claudeCost).toBeGreaterThan(geminiCost);
    });
  });

  describe('aggregate statistics', () => {
    beforeEach(() => {
      observer.start();
    });

    it('should calculate aggregate stats', () => {
      // Create multiple sessions
      eventBus.emit(
        createEvent('session.created', {
          sessionId: 'sess-stat-1',
          pattern: 'parallel',
          experts: [],
        })
      );

      eventBus.emit(
        createEvent('session.created', {
          sessionId: 'sess-stat-2',
          pattern: 'sequential',
          experts: [],
        })
      );

      // Record some routing decisions
      observer.recordRoutingDecision({
        timestamp: new Date().toISOString(),
        taskId: 'task-stat-1',
        taskDescription: 'Test',
        selectedCli: 'claude',
        confidence: 0.9,
        reason: 'Test',
        alternatives: [],
        stagesExecuted: [],
        decisionTimeMs: 20,
      });

      observer.recordRoutingDecision({
        timestamp: new Date().toISOString(),
        taskId: 'task-stat-2',
        taskDescription: 'Test',
        selectedCli: 'gemini',
        confidence: 0.8,
        reason: 'Test',
        alternatives: [],
        stagesExecuted: [],
        decisionTimeMs: 15,
      });

      const stats = observer.getStats();
      expect(stats.totalSessions).toBe(2);
      expect(stats.activeSessions).toBe(2); // Neither finalized
      expect(stats.routingDistribution.claude).toBe(1);
      expect(stats.routingDistribution.gemini).toBe(1);
      expect(stats.eventsProcessed).toBeGreaterThan(0);
      // uptimeMs may be 0 in fast test environments due to timing precision
      expect(stats.uptimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should track active vs completed sessions', () => {
      eventBus.emit(
        createEvent('session.created', {
          sessionId: 'sess-active',
          pattern: 'parallel',
          experts: [],
        })
      );

      eventBus.emit(
        createEvent('session.created', {
          sessionId: 'sess-done',
          pattern: 'parallel',
          experts: [],
        })
      );

      // Finalize one session
      eventBus.emit(
        createEvent(
          'session.finalized',
          { success: true, resultCount: 1, durationMs: 500 },
          { sessionId: 'sess-done' }
        )
      );

      const stats = observer.getStats();
      expect(stats.totalSessions).toBe(2);
      expect(stats.activeSessions).toBe(1);
    });
  });

  describe('event listener management', () => {
    it('should add and remove event listeners', () => {
      observer.start();
      const events: OrchestrationObserverEvent[] = [];
      const listener = (e: OrchestrationObserverEvent): void => {
        events.push(e);
      };

      observer.addEventListener(listener);

      eventBus.emit(
        createEvent('session.created', {
          sessionId: 'sess-listen',
          pattern: 'parallel',
          experts: [],
        })
      );

      expect(events.length).toBeGreaterThan(0);

      // Remove listener
      observer.removeEventListener(listener);
      const prevLength = events.length;

      eventBus.emit(
        createEvent('session.created', {
          sessionId: 'sess-listen-2',
          pattern: 'parallel',
          experts: [],
        })
      );

      expect(events.length).toBe(prevLength); // No new events
    });

    it('should handle listener errors gracefully', () => {
      observer.start();
      const errorListener = (): void => {
        throw new Error('Listener error');
      };

      observer.addEventListener(errorListener);

      // Should not throw
      expect(() => {
        eventBus.emit(
          createEvent('session.created', {
            sessionId: 'sess-err',
            pattern: 'parallel',
            experts: [],
          })
        );
      }).not.toThrow();
    });
  });

  describe('factory function', () => {
    it('should create observer via factory', () => {
      const factoryObserver = createOrchestrationObserver(eventBus, {
        config: { verboseLogging: true },
      });

      expect(factoryObserver).toBeDefined();
      expect(factoryObserver.isActive()).toBe(false);

      factoryObserver.start();
      expect(factoryObserver.isActive()).toBe(true);
      factoryObserver.stop();
    });
  });

  describe('protocol event handling', () => {
    beforeEach(() => {
      observer.start();
    });

    it('should track protocol completion for success rate', () => {
      eventBus.emit(
        createEvent('protocol.completed', {
          success: true,
          iterations: 3,
          durationMs: 1000,
        })
      );

      eventBus.emit(
        createEvent('protocol.completed', {
          success: true,
          iterations: 2,
          durationMs: 800,
        })
      );

      eventBus.emit(
        createEvent('protocol.completed', {
          success: false,
          iterations: 5,
          durationMs: 2000,
        })
      );

      const stats = observer.getStats();
      expect(stats.totalTasks).toBe(3);
      expect(stats.successRate).toBeCloseTo(2 / 3, 2);
      expect(stats.avgTaskDurationMs).toBeCloseTo(1266.67, 0);
    });
  });

  describe('consensus event handling', () => {
    beforeEach(() => {
      observer.start();
    });

    it('should track consensus events (Issue #552)', () => {
      // Emit vote requested
      eventBus.emit(
        createEvent('consensus.vote_requested', {
          proposalId: 'prop-1',
          proposal: 'Should we refactor?',
          voters: ['agent-1', 'agent-2', 'agent-3'],
        })
      );

      // Emit votes cast
      eventBus.emit(
        createEvent('consensus.vote_cast', {
          proposalId: 'prop-1',
          voterId: 'agent-1',
          decision: 'approve',
          reasoning: 'Good idea',
        })
      );

      eventBus.emit(
        createEvent('consensus.vote_cast', {
          proposalId: 'prop-1',
          voterId: 'agent-2',
          decision: 'approve',
          reasoning: 'Agree',
        })
      );

      eventBus.emit(
        createEvent('consensus.vote_cast', {
          proposalId: 'prop-1',
          voterId: 'agent-3',
          decision: 'reject',
          reasoning: 'Too risky',
        })
      );

      // Emit consensus reached
      eventBus.emit(
        createEvent('consensus.reached', {
          proposalId: 'prop-1',
          decision: 'approve',
          voteCount: 3,
          unanimity: false,
        })
      );

      const stats = observer.getStats();
      expect(stats.consensus.votesRequested).toBe(1);
      expect(stats.consensus.votesCast).toBe(3);
      expect(stats.consensus.consensusReached).toBe(1);
      expect(stats.consensus.decisions.approved).toBe(2);
      expect(stats.consensus.decisions.rejected).toBe(1);
      expect(stats.consensus.decisions.abstained).toBe(0);
      expect(stats.consensus.unanimityRate).toBe(0);
    });

    it('should track unanimity rate correctly', () => {
      // First consensus - unanimous
      eventBus.emit(
        createEvent('consensus.reached', {
          proposalId: 'prop-1',
          decision: 'approve',
          voteCount: 3,
          unanimity: true,
        })
      );

      // Second consensus - not unanimous
      eventBus.emit(
        createEvent('consensus.reached', {
          proposalId: 'prop-2',
          decision: 'approve',
          voteCount: 3,
          unanimity: false,
        })
      );

      const stats = observer.getStats();
      expect(stats.consensus.consensusReached).toBe(2);
      expect(stats.consensus.unanimityRate).toBe(0.5);
    });
  });
});
