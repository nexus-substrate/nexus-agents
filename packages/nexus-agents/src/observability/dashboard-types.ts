/**
 * nexus-agents/observability - Dashboard Types
 *
 * Type definitions for the execution dashboard that visualizes
 * SwarmObserver data in real-time.
 *
 * @module observability/dashboard-types
 * (Source: Alignment Roadmap Phase 1, Issue #159)
 */

import { z } from 'zod';
import type {
  AgentId,
  AgentState,
  AgentEvent,
  AgentCluster,
  BottleneckInfo,
  ContributionScore,
  SwarmHealthMetrics,
  TraceId,
} from './swarm-observer-types.js';

/**
 * Output format for dashboard rendering.
 */
export type DashboardFormat = 'json' | 'text' | 'markdown' | 'compact';

/**
 * Dashboard configuration options.
 */
export interface DashboardConfig {
  /** Output format */
  readonly format: DashboardFormat;
  /** Maximum agents to show in summary */
  readonly maxAgentsShown: number;
  /** Maximum events to show in activity feed */
  readonly maxEventsShown: number;
  /** Whether to show interaction graph */
  readonly showGraph: boolean;
  /** Whether to show bottleneck warnings */
  readonly showBottlenecks: boolean;
  /** Whether to show cluster analysis */
  readonly showClusters: boolean;
  /** Whether to show contribution scores */
  readonly showContributions: boolean;
  /** Time window for recent activity (ms) */
  readonly timeWindowMs: number;
}

/**
 * Default dashboard configuration.
 */
export const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
  format: 'text',
  maxAgentsShown: 10,
  maxEventsShown: 20,
  showGraph: true,
  showBottlenecks: true,
  showClusters: true,
  showContributions: true,
  timeWindowMs: 60000, // 1 minute
};

/**
 * Zod schema for dashboard configuration.
 */
export const DashboardConfigSchema = z.object({
  format: z.enum(['json', 'text', 'markdown', 'compact']).default('text'),
  maxAgentsShown: z.number().int().positive().default(10),
  maxEventsShown: z.number().int().positive().default(20),
  showGraph: z.boolean().default(true),
  showBottlenecks: z.boolean().default(true),
  showClusters: z.boolean().default(true),
  showContributions: z.boolean().default(true),
  timeWindowMs: z.number().positive().default(60000),
});

/**
 * Agent status for dashboard display.
 */
export interface AgentStatus {
  readonly agentId: AgentId;
  readonly state: AgentState;
  readonly lastActivity: string;
  readonly messagesSent: number;
  readonly messagesReceived: number;
  readonly toolsInvoked: number;
  readonly errorCount: number;
  readonly isBottleneck: boolean;
}

/**
 * Simplified edge for graph display.
 */
export interface GraphEdgeDisplay {
  readonly from: AgentId;
  readonly to: AgentId;
  readonly count: number;
  readonly successRate: number;
  readonly avgLatencyMs: number;
}

/**
 * Graph summary for dashboard display.
 */
export interface GraphSummary {
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly density: number;
  readonly stronglyConnectedComponents: number;
  readonly topEdges: GraphEdgeDisplay[];
  readonly centralAgents: Array<{ agentId: AgentId; centrality: number }>;
}

/**
 * Activity feed item.
 */
export interface ActivityItem {
  readonly timestamp: string;
  readonly agentId: AgentId;
  readonly eventType: AgentEvent['eventType'];
  readonly summary: string;
  readonly severity: 'info' | 'warning' | 'error';
  readonly traceId: TraceId;
}

/**
 * Complete dashboard snapshot.
 */
export interface DashboardSnapshot {
  /** Snapshot timestamp */
  readonly timestamp: string;
  /** Swarm health summary */
  readonly health: SwarmHealthMetrics;
  /** Individual agent statuses */
  readonly agents: AgentStatus[];
  /** Interaction graph summary */
  readonly graph: GraphSummary;
  /** Recent activity feed */
  readonly activity: ActivityItem[];
  /** Current bottlenecks */
  readonly bottlenecks: BottleneckInfo[];
  /** Detected clusters */
  readonly clusters: AgentCluster[];
  /** Top contributors (if task context) */
  readonly contributions: ContributionScore[];
  /** Active traces */
  readonly activeTraces: TraceId[];
}

/**
 * Partial dashboard options for selective updates.
 */
export interface DashboardUpdateOptions {
  readonly includeHealth?: boolean | undefined;
  readonly includeAgents?: boolean | undefined;
  readonly includeGraph?: boolean | undefined;
  readonly includeActivity?: boolean | undefined;
  readonly includeBottlenecks?: boolean | undefined;
  readonly includeClusters?: boolean | undefined;
  readonly includeContributions?: boolean | undefined;
}

/**
 * Dashboard renderer interface.
 */
export interface IDashboardRenderer {
  /**
   * Render the dashboard snapshot to the configured format.
   */
  render(snapshot: DashboardSnapshot): string;

  /**
   * Render just the health section.
   */
  renderHealth(health: SwarmHealthMetrics): string;

  /**
   * Render the agent status table.
   */
  renderAgents(agents: AgentStatus[]): string;

  /**
   * Render the interaction graph.
   */
  renderGraph(graph: GraphSummary): string;

  /**
   * Render the activity feed.
   */
  renderActivity(activity: ActivityItem[]): string;

  /**
   * Render bottleneck warnings.
   */
  renderBottlenecks(bottlenecks: BottleneckInfo[]): string;

  /**
   * Render cluster analysis.
   */
  renderClusters(clusters: AgentCluster[]): string;
}

/**
 * Dashboard service interface.
 */
export interface IDashboard {
  /**
   * Get current dashboard snapshot.
   */
  getSnapshot(options?: DashboardUpdateOptions): DashboardSnapshot;

  /**
   * Render dashboard to string in configured format.
   */
  render(options?: DashboardUpdateOptions): string;

  /**
   * Get dashboard configuration.
   */
  getConfig(): DashboardConfig;

  /**
   * Update dashboard configuration.
   */
  updateConfig(config: Partial<DashboardConfig>): void;

  /**
   * Subscribe to dashboard updates.
   */
  subscribe(callback: (snapshot: DashboardSnapshot) => void): () => void;
}
