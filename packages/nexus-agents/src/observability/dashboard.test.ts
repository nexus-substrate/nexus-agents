/**
 * nexus-agents/observability - Dashboard Tests
 *
 * Tests for the execution dashboard.
 *
 * @module observability/dashboard.test
 * (Source: Issue #159)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Dashboard, createDashboard } from './dashboard.js';
import { SwarmObserver } from './swarm-observer.js';
import type { DashboardSnapshot } from './dashboard-types.js';
import type { AgentEvent, RecordInteractionOptions, TraceId } from './swarm-observer-types.js';

describe('Dashboard', () => {
  let observer: SwarmObserver;
  let dashboard: Dashboard;

  const generateTraceId = (): TraceId => {
    return SwarmObserver.generateTraceId();
  };

  const createEvent = (
    agentId: string,
    eventType: AgentEvent['eventType'],
    payload: AgentEvent['payload']
  ): AgentEvent => ({
    eventId: `event-${String(Date.now())}-${String(Math.random())}`,
    timestamp: new Date().toISOString(),
    agentId,
    eventType,
    traceId: generateTraceId(),
    spanId: SwarmObserver.generateSpanId(),
    payload,
  });

  const createInteraction = (
    from: string,
    to: string,
    outcome: 'success' | 'failure' = 'success'
  ): RecordInteractionOptions => ({
    from,
    to,
    interactionType: 'message',
    outcome,
    traceId: generateTraceId(),
    durationMs: 50,
  });

  beforeEach(() => {
    observer = new SwarmObserver();
    dashboard = new Dashboard(observer);
  });

  describe('getSnapshot', () => {
    it('should return snapshot with empty swarm', () => {
      const snapshot = dashboard.getSnapshot();

      expect(snapshot.timestamp).toBeDefined();
      expect(snapshot.health.totalAgents).toBe(0);
      expect(snapshot.agents).toHaveLength(0);
      expect(snapshot.activity).toHaveLength(0);
    });

    it('should return snapshot with populated swarm', () => {
      // Record some activity
      observer.recordInteraction(createInteraction('agent-1', 'agent-2'));
      observer.recordInteraction(createInteraction('agent-2', 'agent-3'));

      const snapshot = dashboard.getSnapshot();

      expect(snapshot.health.totalAgents).toBe(3);
      expect(snapshot.agents).toHaveLength(3);
      expect(snapshot.graph.nodeCount).toBe(3);
      expect(snapshot.graph.edgeCount).toBe(2);
    });

    it('should respect update options', () => {
      observer.recordInteraction(createInteraction('a', 'b'));

      const snapshot = dashboard.getSnapshot({
        includeGraph: false,
        includeClusters: false,
      });

      expect(snapshot.graph.nodeCount).toBe(0);
      expect(snapshot.clusters).toHaveLength(0);
    });
  });

  describe('render', () => {
    it('should render empty dashboard in text format', () => {
      dashboard.updateConfig({ format: 'text' });
      const output = dashboard.render();

      expect(output).toContain('NEXUS AGENTS');
      expect(output).toContain('SWARM HEALTH');
      expect(output).toContain('Agents:');
    });

    it('should render dashboard with data in text format', () => {
      observer.recordInteraction(createInteraction('agent-1', 'agent-2'));
      observer.recordInteraction(createInteraction('agent-1', 'agent-3'));

      dashboard.updateConfig({ format: 'text' });
      const output = dashboard.render();

      expect(output).toContain('Agents:');
      expect(output).toContain('INTERACTION GRAPH');
    });

    it('should render in JSON format', () => {
      observer.recordInteraction(createInteraction('a', 'b'));

      dashboard.updateConfig({ format: 'json' });
      const output = dashboard.render();

      const parsed = JSON.parse(output) as DashboardSnapshot;
      expect(parsed.timestamp).toBeDefined();
      expect(parsed.health).toBeDefined();
      expect(parsed.agents).toBeDefined();
    });

    it('should render in compact format', () => {
      observer.recordInteraction(createInteraction('a', 'b'));

      dashboard.updateConfig({ format: 'compact' });
      const output = dashboard.render();

      expect(output).toMatch(/agents=\d+\/\d+/);
      expect(output).toMatch(/success=\d+%/);
    });
  });

  describe('getConfig and updateConfig', () => {
    it('should return default config', () => {
      const config = dashboard.getConfig();

      expect(config.format).toBe('text');
      expect(config.maxAgentsShown).toBe(10);
      expect(config.showGraph).toBe(true);
    });

    it('should update config', () => {
      dashboard.updateConfig({ format: 'json', maxAgentsShown: 5 });
      const config = dashboard.getConfig();

      expect(config.format).toBe('json');
      expect(config.maxAgentsShown).toBe(5);
    });

    it('should preserve unmodified config values', () => {
      const originalConfig = dashboard.getConfig();
      dashboard.updateConfig({ format: 'json' });
      const newConfig = dashboard.getConfig();

      expect(newConfig.maxEventsShown).toBe(originalConfig.maxEventsShown);
      expect(newConfig.showGraph).toBe(originalConfig.showGraph);
    });
  });

  describe('subscribe', () => {
    it('should add subscriber', () => {
      const callback = vi.fn();
      const unsubscribe = dashboard.subscribe(callback);

      expect(typeof unsubscribe).toBe('function');
    });

    it('should remove subscriber on unsubscribe', () => {
      const callback = vi.fn();
      const unsubscribe = dashboard.subscribe(callback);

      unsubscribe();
      dashboard.notifySubscribers();

      expect(callback).not.toHaveBeenCalled();
    });

    it('should notify subscribers', () => {
      const callback = vi.fn();
      dashboard.subscribe(callback);

      dashboard.notifySubscribers();

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ timestamp: expect.any(String) })
      );
    });

    it('should handle subscriber errors gracefully', () => {
      const errorCallback = vi.fn(() => {
        throw new Error('Subscriber error');
      });
      const successCallback = vi.fn();

      dashboard.subscribe(errorCallback);
      dashboard.subscribe(successCallback);

      // Should not throw
      expect(() => {
        dashboard.notifySubscribers();
      }).not.toThrow();
      expect(successCallback).toHaveBeenCalled();
    });
  });

  describe('agent status', () => {
    it('should show agent as bottleneck when detected', () => {
      // Create a bottleneck situation
      for (let i = 0; i < 15; i++) {
        observer.recordInteraction(createInteraction(`sender-${String(i)}`, 'bottleneck'));
      }

      const snapshot = dashboard.getSnapshot();
      const bottleneckAgent = snapshot.agents.find((a) => a.agentId === 'bottleneck');

      expect(bottleneckAgent?.isBottleneck).toBe(true);
    });

    it('should track agent message counts', () => {
      observer.recordInteraction(createInteraction('sender', 'receiver'));
      observer.recordInteraction(createInteraction('sender', 'receiver'));
      observer.recordInteraction(createInteraction('other', 'sender'));

      const snapshot = dashboard.getSnapshot();
      const sender = snapshot.agents.find((a) => a.agentId === 'sender');
      const receiver = snapshot.agents.find((a) => a.agentId === 'receiver');

      expect(sender?.messagesSent).toBe(2);
      expect(sender?.messagesReceived).toBe(1);
      expect(receiver?.messagesReceived).toBe(2);
    });
  });

  describe('graph summary', () => {
    it('should calculate graph density', () => {
      // Create a complete graph with 3 nodes
      observer.recordInteraction(createInteraction('a', 'b'));
      observer.recordInteraction(createInteraction('b', 'c'));
      observer.recordInteraction(createInteraction('c', 'a'));
      observer.recordInteraction(createInteraction('a', 'c'));
      observer.recordInteraction(createInteraction('b', 'a'));
      observer.recordInteraction(createInteraction('c', 'b'));

      const snapshot = dashboard.getSnapshot();

      // 3 nodes = 6 possible directed edges, we have 6 edges
      expect(snapshot.graph.density).toBe(1);
    });

    it('should identify central agents', () => {
      // Make 'hub' the most connected
      observer.recordInteraction(createInteraction('hub', 'a'));
      observer.recordInteraction(createInteraction('hub', 'b'));
      observer.recordInteraction(createInteraction('hub', 'c'));
      observer.recordInteraction(createInteraction('a', 'hub'));
      observer.recordInteraction(createInteraction('b', 'hub'));

      const snapshot = dashboard.getSnapshot();

      expect(snapshot.graph.centralAgents.length).toBeGreaterThan(0);
      expect(snapshot.graph.centralAgents[0]?.agentId).toBe('hub');
    });

    it('should identify top edges by count', () => {
      // Create many interactions between a->b
      for (let i = 0; i < 5; i++) {
        observer.recordInteraction(createInteraction('a', 'b'));
      }
      observer.recordInteraction(createInteraction('c', 'd'));

      const snapshot = dashboard.getSnapshot();

      expect(snapshot.graph.topEdges.length).toBeGreaterThan(0);
      expect(snapshot.graph.topEdges[0]?.from).toBe('a');
      expect(snapshot.graph.topEdges[0]?.to).toBe('b');
      expect(snapshot.graph.topEdges[0]?.count).toBe(5);
    });
  });

  describe('activity feed', () => {
    it('should include recent events', () => {
      observer.recordEvent(
        createEvent('agent-1', 'task_started', {
          type: 'task',
          phase: 'started',
          taskId: 'task-123',
          taskDescription: 'Test task',
        })
      );

      const snapshot = dashboard.getSnapshot();

      expect(snapshot.activity.length).toBeGreaterThan(0);
      expect(snapshot.activity[0]?.agentId).toBe('agent-1');
    });

    it('should filter events by time window', () => {
      // Create old event (manually set observer with old event)
      const oldEvent = createEvent('old-agent', 'task_completed', {
        type: 'task',
        phase: 'completed',
        taskId: 'old-task',
        success: true,
      });

      // Mutate timestamp to be old
      const mutatedEvent = {
        ...oldEvent,
        timestamp: new Date(Date.now() - 120000).toISOString(),
      };

      observer.recordEvent(mutatedEvent);

      const snapshot = dashboard.getSnapshot();

      // With default 60s window, old event should be excluded
      const oldAgentActivity = snapshot.activity.filter((a) => a.agentId === 'old-agent');
      expect(oldAgentActivity).toHaveLength(0);
    });

    it('should summarize events correctly', () => {
      observer.recordEvent(
        createEvent('agent-1', 'tool_completed', {
          type: 'tool',
          phase: 'completed',
          toolName: 'test_tool',
          success: true,
        })
      );

      observer.recordEvent(
        createEvent('agent-2', 'error', {
          type: 'error',
          errorCode: 'E001',
          errorMessage: 'Test error message',
          recoverable: true,
        })
      );

      const snapshot = dashboard.getSnapshot();

      const toolActivity = snapshot.activity.find((a) => a.agentId === 'agent-1');
      expect(toolActivity?.summary).toContain('test_tool');
      expect(toolActivity?.severity).toBe('info');

      const errorActivity = snapshot.activity.find((a) => a.agentId === 'agent-2');
      expect(errorActivity?.summary).toContain('error');
      expect(errorActivity?.severity).toBe('error');
    });
  });

  describe('createDashboard', () => {
    it('should create dashboard with default config', () => {
      const d = createDashboard(observer);
      expect(d).toBeInstanceOf(Dashboard);
    });

    it('should create dashboard with custom config', () => {
      const d = createDashboard(observer, { format: 'json' });
      expect(d.getConfig().format).toBe('json');
    });
  });
});
