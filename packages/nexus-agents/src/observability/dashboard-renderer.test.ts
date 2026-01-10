/**
 * nexus-agents/observability - Dashboard Renderer Tests
 *
 * Tests for dashboard rendering in various formats.
 *
 * @module observability/dashboard-renderer.test
 * (Source: Issue #159)
 */

import { describe, it, expect } from 'vitest';
import {
  TextDashboardRenderer,
  JsonDashboardRenderer,
  CompactDashboardRenderer,
  createDashboardRenderer,
} from './dashboard-renderer.js';
import type {
  DashboardSnapshot,
  DashboardConfig,
  AgentStatus,
  GraphSummary,
  ActivityItem,
} from './dashboard-types.js';
import { DEFAULT_DASHBOARD_CONFIG } from './dashboard-types.js';
import type { SwarmHealthMetrics, BottleneckInfo, AgentCluster } from './swarm-observer-types.js';

describe('Dashboard Renderers', () => {
  const createHealth = (overrides?: Partial<SwarmHealthMetrics>): SwarmHealthMetrics => ({
    totalAgents: 5,
    activeAgents: 4,
    errorAgents: 1,
    totalInteractions: 100,
    successRate: 0.95,
    avgLatencyMs: 45.5,
    bottlenecks: [],
    clusters: [],
    calculatedAt: new Date().toISOString(),
    ...overrides,
  });

  const createAgent = (id: string, overrides?: Partial<AgentStatus>): AgentStatus => ({
    agentId: id,
    state: 'idle',
    lastActivity: new Date().toISOString(),
    messagesSent: 10,
    messagesReceived: 8,
    toolsInvoked: 5,
    errorCount: 0,
    isBottleneck: false,
    ...overrides,
  });

  const createGraph = (overrides?: Partial<GraphSummary>): GraphSummary => ({
    nodeCount: 5,
    edgeCount: 12,
    density: 0.6,
    stronglyConnectedComponents: 2,
    topEdges: [
      { from: 'a', to: 'b', count: 5, successRate: 1.0, avgLatencyMs: 30 },
      { from: 'b', to: 'c', count: 3, successRate: 0.8, avgLatencyMs: 50 },
    ],
    centralAgents: [
      { agentId: 'hub', centrality: 0.8 },
      { agentId: 'secondary', centrality: 0.5 },
    ],
    ...overrides,
  });

  const createActivity = (
    agentId: string,
    eventType: ActivityItem['eventType'],
    severity: ActivityItem['severity'] = 'info'
  ): ActivityItem => ({
    timestamp: new Date().toISOString(),
    agentId,
    eventType,
    summary: `${eventType} event occurred`,
    severity,
    traceId: 'a'.repeat(32),
  });

  const createBottleneck = (agentId: string): BottleneckInfo => ({
    agentId,
    queuedMessages: 15,
    avgWaitTimeMs: 500,
    blockedAgents: 3,
    severity: 'high',
  });

  const createCluster = (id: string, agents: string[]): AgentCluster => ({
    clusterId: id,
    agents,
    cohesion: 0.85,
    internalInteractions: 50,
    externalInteractions: 10,
    dominantPattern: 'review',
  });

  const createSnapshot = (overrides?: Partial<DashboardSnapshot>): DashboardSnapshot => ({
    timestamp: new Date().toISOString(),
    health: createHealth(),
    agents: [createAgent('agent-1'), createAgent('agent-2')],
    graph: createGraph(),
    activity: [createActivity('agent-1', 'task_started')],
    bottlenecks: [],
    clusters: [],
    contributions: [],
    activeTraces: [],
    ...overrides,
  });

  describe('TextDashboardRenderer', () => {
    const renderer = new TextDashboardRenderer(DEFAULT_DASHBOARD_CONFIG);

    describe('render', () => {
      it('should render complete dashboard', () => {
        const snapshot = createSnapshot();
        const output = renderer.render(snapshot);

        expect(output).toContain('NEXUS AGENTS EXECUTION DASHBOARD');
        expect(output).toContain('SWARM HEALTH');
        expect(output).toContain('AGENTS');
        expect(output).toContain('INTERACTION GRAPH');
        expect(output).toContain('RECENT ACTIVITY');
      });

      it('should render bottlenecks section when present', () => {
        const snapshot = createSnapshot({
          bottlenecks: [createBottleneck('slow-agent')],
        });
        const output = renderer.render(snapshot);

        expect(output).toContain('BOTTLENECKS');
        expect(output).toContain('slow-agent');
      });

      it('should render clusters section when present', () => {
        const snapshot = createSnapshot({
          clusters: [createCluster('cluster-1', ['a', 'b', 'c'])],
        });
        const output = renderer.render(snapshot);

        expect(output).toContain('AGENT CLUSTERS');
        expect(output).toContain('cluster-1');
      });
    });

    describe('renderHealth', () => {
      it('should render health metrics', () => {
        const health = createHealth();
        const output = renderer.renderHealth(health);

        expect(output).toContain('SWARM HEALTH');
        expect(output).toContain('Agents:');
        expect(output).toContain('Success Rate:');
      });

      it('should render success rate bar', () => {
        const health = createHealth({ successRate: 0.5 });
        const output = renderer.renderHealth(health);

        expect(output).toContain('█');
        expect(output).toContain('░');
      });
    });

    describe('renderAgents', () => {
      it('should render agent table', () => {
        const agents = [createAgent('agent-1'), createAgent('agent-2')];
        const output = renderer.renderAgents(agents);

        expect(output).toContain('AGENTS');
        expect(output).toContain('agent-1');
        expect(output).toContain('agent-2');
      });

      it('should handle empty agent list', () => {
        const output = renderer.renderAgents([]);

        expect(output).toContain('No agents registered');
      });

      it('should show bottleneck indicator', () => {
        const agents = [createAgent('bottleneck-agent', { isBottleneck: true })];
        const output = renderer.renderAgents(agents);

        expect(output).toContain('⚠');
      });

      it('should truncate long agent lists', () => {
        const config: DashboardConfig = { ...DEFAULT_DASHBOARD_CONFIG, maxAgentsShown: 2 };
        const limitedRenderer = new TextDashboardRenderer(config);
        const agents = [
          createAgent('agent-1'),
          createAgent('agent-2'),
          createAgent('agent-3'),
          createAgent('agent-4'),
        ];
        const output = limitedRenderer.renderAgents(agents);

        expect(output).toContain('... and 2 more agents');
      });
    });

    describe('renderGraph', () => {
      it('should render graph summary', () => {
        const graph = createGraph();
        const output = renderer.renderGraph(graph);

        expect(output).toContain('INTERACTION GRAPH');
        expect(output).toContain('Nodes:');
        expect(output).toContain('Edges:');
        expect(output).toContain('Density:');
      });

      it('should render central agents', () => {
        const graph = createGraph();
        const output = renderer.renderGraph(graph);

        expect(output).toContain('Most Central Agents');
        expect(output).toContain('hub');
      });

      it('should render busiest connections', () => {
        const graph = createGraph();
        const output = renderer.renderGraph(graph);

        expect(output).toContain('Busiest Connections');
        expect(output).toContain('→');
      });
    });

    describe('renderActivity', () => {
      it('should render activity feed', () => {
        const activity = [
          createActivity('agent-1', 'task_started'),
          createActivity('agent-2', 'error', 'error'),
        ];
        const output = renderer.renderActivity(activity);

        expect(output).toContain('RECENT ACTIVITY');
        expect(output).toContain('agent-1');
        expect(output).toContain('agent-2');
      });

      it('should handle empty activity', () => {
        const output = renderer.renderActivity([]);

        expect(output).toContain('No recent activity');
      });

      it('should show severity icons', () => {
        const activity = [
          createActivity('a', 'task_started', 'info'),
          createActivity('b', 'tool_completed', 'warning'),
          createActivity('c', 'error', 'error'),
        ];
        const output = renderer.renderActivity(activity);

        expect(output).toContain('○'); // info
        expect(output).toContain('⚠'); // warning
        expect(output).toContain('✖'); // error
      });
    });

    describe('renderBottlenecks', () => {
      it('should render bottleneck warnings', () => {
        const bottlenecks = [createBottleneck('slow-agent')];
        const output = renderer.renderBottlenecks(bottlenecks);

        expect(output).toContain('BOTTLENECKS');
        expect(output).toContain('slow-agent');
        expect(output).toContain('queued:');
        expect(output).toContain('wait:');
      });
    });

    describe('renderClusters', () => {
      it('should render cluster information', () => {
        const clusters = [createCluster('cluster-1', ['a', 'b', 'c'])];
        const output = renderer.renderClusters(clusters);

        expect(output).toContain('AGENT CLUSTERS');
        expect(output).toContain('cluster-1');
        expect(output).toContain('internal:');
        expect(output).toContain('external:');
        expect(output).toContain('pattern:');
      });
    });
  });

  describe('JsonDashboardRenderer', () => {
    const renderer = new JsonDashboardRenderer();

    it('should render valid JSON', () => {
      const snapshot = createSnapshot();
      const output = renderer.render(snapshot);

      expect(() => {
        JSON.parse(output) as unknown;
      }).not.toThrow();
    });

    it('should include all snapshot fields', () => {
      const snapshot = createSnapshot();
      const output = renderer.render(snapshot);
      const parsed = JSON.parse(output) as DashboardSnapshot;

      expect(parsed.timestamp).toBeDefined();
      expect(parsed.health).toBeDefined();
      expect(parsed.agents).toBeDefined();
      expect(parsed.graph).toBeDefined();
      expect(parsed.activity).toBeDefined();
    });

    it('should render health as JSON', () => {
      const health = createHealth();
      const output = renderer.renderHealth(health);
      const parsed = JSON.parse(output) as SwarmHealthMetrics;

      expect(parsed.totalAgents).toBe(health.totalAgents);
      expect(parsed.successRate).toBe(health.successRate);
    });

    it('should render agents as JSON array', () => {
      const agents = [createAgent('a'), createAgent('b')];
      const output = renderer.renderAgents(agents);
      const parsed = JSON.parse(output) as AgentStatus[];

      expect(parsed).toHaveLength(2);
    });
  });

  describe('CompactDashboardRenderer', () => {
    const renderer = new CompactDashboardRenderer();

    it('should render single-line output', () => {
      const snapshot = createSnapshot();
      const output = renderer.render(snapshot);

      expect(output.split('\n')).toHaveLength(1);
    });

    it('should include key metrics', () => {
      const snapshot = createSnapshot();
      const output = renderer.render(snapshot);

      expect(output).toMatch(/agents=\d+\/\d+/);
      expect(output).toMatch(/interactions=\d+/);
      expect(output).toMatch(/success=\d+%/);
      expect(output).toMatch(/latency=\d+ms/);
    });

    it('should render compact health', () => {
      const health = createHealth();
      const output = renderer.renderHealth(health);

      expect(output).toContain('health:');
      expect(output).toMatch(/active=\d+\/\d+/);
    });

    it('should render compact agents', () => {
      const agents = [createAgent('a'), createAgent('b')];
      const output = renderer.renderAgents(agents);

      expect(output).toContain('agents:');
      expect(output).toContain(':idle');
    });

    it('should render compact graph', () => {
      const graph = createGraph();
      const output = renderer.renderGraph(graph);

      expect(output).toContain('graph:');
      expect(output).toMatch(/nodes=\d+/);
      expect(output).toMatch(/edges=\d+/);
    });
  });

  describe('createDashboardRenderer', () => {
    it('should create text renderer for text format', () => {
      const config: DashboardConfig = { ...DEFAULT_DASHBOARD_CONFIG, format: 'text' };
      const renderer = createDashboardRenderer(config);

      expect(renderer).toBeInstanceOf(TextDashboardRenderer);
    });

    it('should create JSON renderer for json format', () => {
      const config: DashboardConfig = { ...DEFAULT_DASHBOARD_CONFIG, format: 'json' };
      const renderer = createDashboardRenderer(config);

      expect(renderer).toBeInstanceOf(JsonDashboardRenderer);
    });

    it('should create compact renderer for compact format', () => {
      const config: DashboardConfig = { ...DEFAULT_DASHBOARD_CONFIG, format: 'compact' };
      const renderer = createDashboardRenderer(config);

      expect(renderer).toBeInstanceOf(CompactDashboardRenderer);
    });

    it('should create text renderer for markdown format', () => {
      const config: DashboardConfig = { ...DEFAULT_DASHBOARD_CONFIG, format: 'markdown' };
      const renderer = createDashboardRenderer(config);

      expect(renderer).toBeInstanceOf(TextDashboardRenderer);
    });
  });
});
