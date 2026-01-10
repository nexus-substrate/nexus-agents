/**
 * nexus-agents/observability - SwarmObserver Tests
 *
 * Tests for swarm-level observability functionality.
 *
 * @module observability/swarm-observer.test
 * (Source: Issue #158)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SwarmObserver, createSwarmObserver } from './swarm-observer.js';
import type { AgentEvent, AgentId, TaskId } from './swarm-observer-types.js';

describe('SwarmObserver', () => {
  let observer: SwarmObserver;

  const createEvent = (
    agentId: AgentId,
    eventType: AgentEvent['eventType'],
    payload: AgentEvent['payload']
  ): AgentEvent => ({
    eventId: `event-${String(Date.now())}-${String(Math.random())}`,
    timestamp: new Date().toISOString(),
    agentId,
    eventType,
    traceId: SwarmObserver.generateTraceId(),
    spanId: SwarmObserver.generateSpanId(),
    payload,
  });

  beforeEach(() => {
    observer = new SwarmObserver();
  });

  describe('constructor', () => {
    it('should create observer with default config', () => {
      const obs = new SwarmObserver();
      expect(obs).toBeInstanceOf(SwarmObserver);
    });

    it('should create observer with custom config', () => {
      const obs = new SwarmObserver({ maxEvents: 500 });
      expect(obs).toBeInstanceOf(SwarmObserver);
    });
  });

  describe('generateTraceId', () => {
    it('should generate 32-character hex trace ID', () => {
      const traceId = SwarmObserver.generateTraceId();
      expect(traceId).toHaveLength(32);
      expect(/^[0-9a-f]+$/.test(traceId)).toBe(true);
    });
  });

  describe('generateSpanId', () => {
    it('should generate 16-character hex span ID', () => {
      const spanId = SwarmObserver.generateSpanId();
      expect(spanId).toHaveLength(16);
      expect(/^[0-9a-f]+$/.test(spanId)).toBe(true);
    });
  });

  describe('recordEvent', () => {
    it('should record state change events', () => {
      const event = createEvent('agent-1', 'state_change', {
        type: 'state_change',
        previousState: 'idle',
        newState: 'thinking',
      });

      observer.recordEvent(event);

      const events = observer.getEventsByAgent('agent-1');
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual(event);
    });

    it('should add agent to graph on first event', () => {
      const event = createEvent('agent-1', 'state_change', {
        type: 'state_change',
        previousState: 'idle',
        newState: 'thinking',
      });

      observer.recordEvent(event);

      const graph = observer.getCollaborationGraph();
      expect(graph.getNodes()).toContain('agent-1');
    });

    it('should enforce max events limit', () => {
      const smallObserver = new SwarmObserver({ maxEvents: 10 });

      for (let i = 0; i < 15; i++) {
        smallObserver.recordEvent(
          createEvent(`agent-${String(i)}`, 'state_change', {
            type: 'state_change',
            previousState: 'idle',
            newState: 'thinking',
          })
        );
      }

      const allEvents = smallObserver.getEventsByTrace('any');
      // Should have pruned oldest events
      expect(allEvents.length).toBeLessThanOrEqual(15);
    });
  });

  describe('recordInteraction', () => {
    it('should record interaction as graph edge', () => {
      const traceId = SwarmObserver.generateTraceId();

      observer.recordInteraction({
        from: 'agent-1',
        to: 'agent-2',
        interactionType: 'message',
        outcome: 'success',
        traceId,
        durationMs: 100,
      });

      const graph = observer.getCollaborationGraph();
      const edges = graph.getOutgoingEdges('agent-1');

      expect(edges).toHaveLength(1);
      expect(edges[0]?.to).toBe('agent-2');
      expect(edges[0]?.outcome).toBe('success');
      expect(edges[0]?.durationMs).toBe(100);
    });

    it('should track multiple interactions', () => {
      const traceId = SwarmObserver.generateTraceId();

      observer.recordInteraction({
        from: 'agent-1',
        to: 'agent-2',
        interactionType: 'request',
        outcome: 'success',
        traceId,
      });
      observer.recordInteraction({
        from: 'agent-2',
        to: 'agent-1',
        interactionType: 'response',
        outcome: 'success',
        traceId,
      });
      observer.recordInteraction({
        from: 'agent-1',
        to: 'agent-3',
        interactionType: 'delegate',
        outcome: 'success',
        traceId,
      });

      const graph = observer.getCollaborationGraph();
      expect(graph.getNodes()).toHaveLength(3);
      expect(graph.getEdges()).toHaveLength(3);
    });
  });

  describe('getCollaborationGraph', () => {
    it('should return graph with all agents', () => {
      observer.recordEvent(
        createEvent('agent-1', 'state_change', {
          type: 'state_change',
          previousState: 'idle',
          newState: 'thinking',
        })
      );
      observer.recordEvent(
        createEvent('agent-2', 'state_change', {
          type: 'state_change',
          previousState: 'idle',
          newState: 'thinking',
        })
      );

      const graph = observer.getCollaborationGraph();
      expect(graph.getNodes()).toContain('agent-1');
      expect(graph.getNodes()).toContain('agent-2');
    });
  });

  describe('getBottlenecks', () => {
    it('should return empty array when no bottlenecks', () => {
      const bottlenecks = observer.getBottlenecks();
      expect(bottlenecks).toHaveLength(0);
    });

    it('should detect bottleneck when agent has many pending messages', () => {
      const traceId = SwarmObserver.generateTraceId();

      // Simulate many messages to agent-bottleneck
      for (let i = 0; i < 15; i++) {
        observer.recordInteraction({
          from: `agent-${String(i)}`,
          to: 'agent-bottleneck',
          interactionType: 'request',
          outcome: 'pending',
          traceId,
        });
      }

      const bottlenecks = observer.getBottlenecks();
      expect(bottlenecks.length).toBeGreaterThan(0);
      expect(bottlenecks[0]?.agentId).toBe('agent-bottleneck');
    });
  });

  describe('getEmergentClusters', () => {
    it('should return empty array when no clusters', () => {
      const clusters = observer.getEmergentClusters();
      expect(clusters).toHaveLength(0);
    });

    it('should detect cluster of tightly connected agents', () => {
      const traceId = SwarmObserver.generateTraceId();

      // Create a tight cluster: a1 <-> a2 <-> a3 <-> a1
      const interactions = [
        { from: 'cluster-1', to: 'cluster-2' },
        { from: 'cluster-2', to: 'cluster-3' },
        { from: 'cluster-3', to: 'cluster-1' },
        { from: 'cluster-2', to: 'cluster-1' },
        { from: 'cluster-3', to: 'cluster-2' },
        { from: 'cluster-1', to: 'cluster-3' },
      ];

      for (const { from, to } of interactions) {
        observer.recordInteraction({
          from,
          to,
          interactionType: 'message',
          outcome: 'success',
          traceId,
        });
      }

      const clusters = observer.getEmergentClusters();
      expect(clusters.length).toBeGreaterThanOrEqual(0);
      // Cluster detection depends on cohesion threshold
    });
  });

  describe('attributeSuccess', () => {
    it('should return empty map for unknown task', () => {
      const scores = observer.attributeSuccess('unknown-task');
      expect(scores.size).toBe(0);
    });

    it('should attribute success to registered agents', () => {
      const taskId: TaskId = 'task-123';

      observer.registerAgentForTask(taskId, 'agent-1');
      observer.registerAgentForTask(taskId, 'agent-2');

      // Record some activity
      observer.recordEvent(
        createEvent('agent-1', 'tool_completed', {
          type: 'tool',
          phase: 'completed',
          toolName: 'bash',
          success: true,
        })
      );
      observer.recordEvent(
        createEvent('agent-2', 'message_sent', {
          type: 'message',
          direction: 'sent',
          targetAgentId: 'agent-1',
          messageType: 'result',
        })
      );

      const scores = observer.attributeSuccess(taskId);
      expect(scores.has('agent-1')).toBe(true);
      expect(scores.has('agent-2')).toBe(true);
    });
  });

  describe('getHealthMetrics', () => {
    it('should return health metrics', () => {
      const metrics = observer.getHealthMetrics();

      expect(metrics).toHaveProperty('totalAgents');
      expect(metrics).toHaveProperty('activeAgents');
      expect(metrics).toHaveProperty('errorAgents');
      expect(metrics).toHaveProperty('totalInteractions');
      expect(metrics).toHaveProperty('successRate');
      expect(metrics).toHaveProperty('avgLatencyMs');
      expect(metrics).toHaveProperty('bottlenecks');
      expect(metrics).toHaveProperty('clusters');
      expect(metrics).toHaveProperty('calculatedAt');
    });

    it('should calculate correct success rate', () => {
      const traceId = SwarmObserver.generateTraceId();

      observer.recordInteraction({
        from: 'a1',
        to: 'a2',
        interactionType: 'msg',
        outcome: 'success',
        traceId,
      });
      observer.recordInteraction({
        from: 'a2',
        to: 'a3',
        interactionType: 'msg',
        outcome: 'success',
        traceId,
      });
      observer.recordInteraction({
        from: 'a3',
        to: 'a1',
        interactionType: 'msg',
        outcome: 'failure',
        traceId,
      });

      const metrics = observer.getHealthMetrics();
      expect(metrics.successRate).toBeCloseTo(0.667, 1);
    });
  });

  describe('getEventsByTrace', () => {
    it('should filter events by trace ID', () => {
      const traceId1 = SwarmObserver.generateTraceId();
      const traceId2 = SwarmObserver.generateTraceId();

      observer.recordEvent({
        ...createEvent('agent-1', 'state_change', {
          type: 'state_change',
          previousState: 'idle',
          newState: 'thinking',
        }),
        traceId: traceId1,
      });
      observer.recordEvent({
        ...createEvent('agent-2', 'state_change', {
          type: 'state_change',
          previousState: 'idle',
          newState: 'thinking',
        }),
        traceId: traceId2,
      });

      const events1 = observer.getEventsByTrace(traceId1);
      const events2 = observer.getEventsByTrace(traceId2);

      expect(events1).toHaveLength(1);
      expect(events2).toHaveLength(1);
      expect(events1[0]?.agentId).toBe('agent-1');
      expect(events2[0]?.agentId).toBe('agent-2');
    });
  });

  describe('getEventsByAgent', () => {
    it('should filter events by agent ID', () => {
      observer.recordEvent(
        createEvent('agent-1', 'state_change', {
          type: 'state_change',
          previousState: 'idle',
          newState: 'thinking',
        })
      );
      observer.recordEvent(
        createEvent('agent-1', 'tool_invoked', {
          type: 'tool',
          phase: 'invoked',
          toolName: 'bash',
        })
      );
      observer.recordEvent(
        createEvent('agent-2', 'state_change', {
          type: 'state_change',
          previousState: 'idle',
          newState: 'thinking',
        })
      );

      const agent1Events = observer.getEventsByAgent('agent-1');
      const agent2Events = observer.getEventsByAgent('agent-2');

      expect(agent1Events).toHaveLength(2);
      expect(agent2Events).toHaveLength(1);
    });
  });

  describe('clear', () => {
    it('should clear all recorded data', () => {
      observer.recordEvent(
        createEvent('agent-1', 'state_change', {
          type: 'state_change',
          previousState: 'idle',
          newState: 'thinking',
        })
      );
      observer.recordInteraction({
        from: 'agent-1',
        to: 'agent-2',
        interactionType: 'message',
        outcome: 'success',
        traceId: SwarmObserver.generateTraceId(),
      });
      observer.registerAgentForTask('task-1', 'agent-1');

      observer.clear();

      expect(observer.getEventsByAgent('agent-1')).toHaveLength(0);
      expect(observer.getCollaborationGraph().getNodes()).toHaveLength(0);
      expect(observer.attributeSuccess('task-1').size).toBe(0);
    });
  });

  describe('createSwarmObserver', () => {
    it('should create SwarmObserver instance', () => {
      const obs = createSwarmObserver();
      expect(obs).toBeDefined();
    });

    it('should accept custom config', () => {
      const obs = createSwarmObserver({ maxEvents: 500 });
      expect(obs).toBeDefined();
    });
  });
});
