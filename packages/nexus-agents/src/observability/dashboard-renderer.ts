/**
 * nexus-agents/observability - Dashboard Renderer
 *
 * Renders dashboard snapshots to various output formats (text, JSON, markdown).
 *
 * @module observability/dashboard-renderer
 * (Source: Alignment Roadmap Phase 1, Issue #159)
 */

import type {
  DashboardConfig,
  DashboardSnapshot,
  IDashboardRenderer,
  AgentStatus,
  GraphSummary,
  ActivityItem,
} from './dashboard-types.js';
import type { SwarmHealthMetrics, BottleneckInfo, AgentCluster } from './swarm-observer-types.js';
import { formatPercentage } from '../core/index.js';

/**
 * Text-based dashboard renderer for terminal output.
 */
export class TextDashboardRenderer implements IDashboardRenderer {
  private readonly config: DashboardConfig;

  constructor(config: DashboardConfig) {
    this.config = config;
  }

  render(snapshot: DashboardSnapshot): string {
    const sections: string[] = [];

    sections.push(this.renderHeader(snapshot.timestamp));
    sections.push(this.renderHealth(snapshot.health));

    if (this.config.showBottlenecks && snapshot.bottlenecks.length > 0) {
      sections.push(this.renderBottlenecks(snapshot.bottlenecks));
    }

    sections.push(this.renderAgents(snapshot.agents));

    if (this.config.showGraph) {
      sections.push(this.renderGraph(snapshot.graph));
    }

    if (this.config.showClusters && snapshot.clusters.length > 0) {
      sections.push(this.renderClusters(snapshot.clusters));
    }

    sections.push(this.renderActivity(snapshot.activity));

    return sections.join('\n\n');
  }

  private renderHeader(timestamp: string): string {
    const line = '═'.repeat(60);
    return `${line}\n  NEXUS AGENTS EXECUTION DASHBOARD\n  ${timestamp}\n${line}`;
  }

  renderHealth(health: SwarmHealthMetrics): string {
    const lines: string[] = ['┌─ SWARM HEALTH ─────────────────────────────────────────┐'];

    const successPct = formatPercentage(health.successRate, 1);
    const healthBar = this.renderBar(health.successRate, 20);

    lines.push(
      `│  Agents: ${String(health.activeAgents).padStart(3)}/${String(health.totalAgents).padEnd(3)} active    Errors: ${String(health.errorAgents).padStart(3)}              │`
    );
    lines.push(
      `│  Interactions: ${String(health.totalInteractions).padStart(5)}       Latency: ${health.avgLatencyMs.toFixed(0).padStart(5)}ms         │`
    );
    lines.push(`│  Success Rate: ${healthBar} ${successPct.padStart(6)}         │`);
    lines.push('└────────────────────────────────────────────────────────┘');

    return lines.join('\n');
  }

  renderAgents(agents: AgentStatus[]): string {
    if (agents.length === 0) {
      return '┌─ AGENTS ─┐\n│ No agents registered │\n└──────────┘';
    }

    const lines: string[] = ['┌─ AGENTS ────────────────────────────────────────────────┐'];
    lines.push('│  ID              STATE      MSG↑  MSG↓  TOOLS  ERR  │');
    lines.push('│  ─────────────── ────────── ───── ───── ────── ──── │');

    const shown = agents.slice(0, this.config.maxAgentsShown);
    for (const agent of shown) {
      const stateIcon = this.getStateIcon(agent.state);
      const bottleneckFlag = agent.isBottleneck ? '⚠' : ' ';
      const id = agent.agentId.slice(0, 15).padEnd(15);
      const state = `${stateIcon} ${agent.state}`.padEnd(10);
      const sent = String(agent.messagesSent).padStart(5);
      const recv = String(agent.messagesReceived).padStart(5);
      const tools = String(agent.toolsInvoked).padStart(6);
      const errs = String(agent.errorCount).padStart(4);

      lines.push(`│${bottleneckFlag} ${id} ${state} ${sent} ${recv} ${tools} ${errs} │`);
    }

    if (agents.length > this.config.maxAgentsShown) {
      lines.push(
        `│  ... and ${String(agents.length - this.config.maxAgentsShown)} more agents                              │`
      );
    }

    lines.push('└────────────────────────────────────────────────────────┘');
    return lines.join('\n');
  }

  renderGraph(graph: GraphSummary): string {
    const lines: string[] = ['┌─ INTERACTION GRAPH ─────────────────────────────────────┐'];

    lines.push(
      `│  Nodes: ${String(graph.nodeCount).padStart(3)}  Edges: ${String(graph.edgeCount).padStart(4)}  Density: ${graph.density.toFixed(2).padStart(5)}  SCCs: ${String(graph.stronglyConnectedComponents).padStart(2)} │`
    );

    if (graph.centralAgents.length > 0) {
      lines.push('│  ─── Most Central Agents ───                           │');
      const topAgents = graph.centralAgents.slice(0, 3);
      for (const agent of topAgents) {
        const id = agent.agentId.slice(0, 20).padEnd(20);
        const bar = this.renderBar(agent.centrality, 15);
        lines.push(`│    ${id} ${bar} ${(agent.centrality * 100).toFixed(0).padStart(3)}%      │`);
      }
    }

    if (graph.topEdges.length > 0) {
      lines.push('│  ─── Busiest Connections ───                           │');
      const topEdges = graph.topEdges.slice(0, 3);
      for (const edge of topEdges) {
        const from = edge.from.slice(0, 8);
        const to = edge.to.slice(0, 8);
        const successPct = (edge.successRate * 100).toFixed(0);
        lines.push(
          `│    ${from} → ${to}: ${String(edge.count).padStart(3)} msgs, ${successPct.padStart(3)}% ok, ${edge.avgLatencyMs.toFixed(0).padStart(4)}ms │`
        );
      }
    }

    lines.push('└────────────────────────────────────────────────────────┘');
    return lines.join('\n');
  }

  renderActivity(activity: ActivityItem[]): string {
    if (activity.length === 0) {
      return '┌─ ACTIVITY ─┐\n│ No recent activity │\n└────────────┘';
    }

    const lines: string[] = ['┌─ RECENT ACTIVITY ───────────────────────────────────────┐'];

    const shown = activity.slice(0, this.config.maxEventsShown);
    for (const item of shown) {
      const icon = this.getSeverityIcon(item.severity);
      const time = item.timestamp.slice(11, 19); // HH:MM:SS
      const agent = item.agentId.slice(0, 10).padEnd(10);
      const summary = item.summary.slice(0, 30).padEnd(30);
      lines.push(`│ ${icon} ${time} ${agent} ${summary} │`);
    }

    if (activity.length > this.config.maxEventsShown) {
      lines.push(
        `│ ... and ${String(activity.length - this.config.maxEventsShown)} more events                                    │`
      );
    }

    lines.push('└────────────────────────────────────────────────────────┘');
    return lines.join('\n');
  }

  renderBottlenecks(bottlenecks: BottleneckInfo[]): string {
    const lines: string[] = ['┌─ ⚠ BOTTLENECKS ─────────────────────────────────────────┐'];

    for (const bn of bottlenecks) {
      const severityIcon = this.getSeverityIcon(
        bn.severity === 'critical' ? 'error' : bn.severity === 'high' ? 'warning' : 'info'
      );
      const id = bn.agentId.slice(0, 15).padEnd(15);
      lines.push(
        `│ ${severityIcon} ${id} queued: ${String(bn.queuedMessages).padStart(3)} wait: ${bn.avgWaitTimeMs.toFixed(0).padStart(5)}ms blocked: ${String(bn.blockedAgents).padStart(2)} │`
      );
    }

    lines.push('└────────────────────────────────────────────────────────┘');
    return lines.join('\n');
  }

  renderClusters(clusters: AgentCluster[]): string {
    const lines: string[] = ['┌─ AGENT CLUSTERS ────────────────────────────────────────┐'];

    for (const cluster of clusters) {
      const cohesionBar = this.renderBar(cluster.cohesion, 10);
      const agents = cluster.agents.slice(0, 3).join(', ');
      const more = cluster.agents.length > 3 ? ` +${String(cluster.agents.length - 3)}` : '';
      lines.push(
        `│  ${cluster.clusterId.slice(0, 10).padEnd(10)} [${cohesionBar}] ${agents}${more}`.padEnd(
          57
        ) + '│'
      );
      lines.push(
        `│    internal: ${String(cluster.internalInteractions).padStart(4)} external: ${String(cluster.externalInteractions).padStart(4)} pattern: ${(cluster.dominantPattern ?? 'mixed').slice(0, 10)}   │`
      );
    }

    lines.push('└────────────────────────────────────────────────────────┘');
    return lines.join('\n');
  }

  private renderBar(value: number, width: number): string {
    // Clamped for the same reason as `renderProgressBar`: a value outside
    // [0, 1] made `empty` negative and `'░'.repeat(-8)` threw, killing the
    // whole render. Centrality was the source (fixed in interaction-graph.ts);
    // the clamp is what stops the next unbounded metric doing it again.
    const filled = Math.min(width, Math.max(0, Math.round(value * width)));
    const empty = width - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }

  private getStateIcon(state: string): string {
    switch (state) {
      case 'idle':
        return '○';
      case 'thinking':
        return '◐';
      case 'executing':
        return '●';
      case 'waiting':
        return '◑';
      case 'error':
        return '✖';
      default:
        return '?';
    }
  }

  private getSeverityIcon(severity: string): string {
    switch (severity) {
      case 'error':
        return '✖';
      case 'warning':
        return '⚠';
      case 'info':
        return '○';
      default:
        return ' ';
    }
  }
}

/**
 * JSON dashboard renderer for programmatic consumption.
 */
export class JsonDashboardRenderer implements IDashboardRenderer {
  render(snapshot: DashboardSnapshot): string {
    return JSON.stringify(snapshot, null, 2);
  }

  renderHealth(health: SwarmHealthMetrics): string {
    return JSON.stringify(health, null, 2);
  }

  renderAgents(agents: AgentStatus[]): string {
    return JSON.stringify(agents, null, 2);
  }

  renderGraph(graph: GraphSummary): string {
    return JSON.stringify(graph, null, 2);
  }

  renderActivity(activity: ActivityItem[]): string {
    return JSON.stringify(activity, null, 2);
  }

  renderBottlenecks(bottlenecks: BottleneckInfo[]): string {
    return JSON.stringify(bottlenecks, null, 2);
  }

  renderClusters(clusters: AgentCluster[]): string {
    return JSON.stringify(clusters, null, 2);
  }
}

/**
 * Compact single-line renderer for logging.
 */
export class CompactDashboardRenderer implements IDashboardRenderer {
  render(snapshot: DashboardSnapshot): string {
    const h = snapshot.health;
    return (
      `[${snapshot.timestamp}] ` +
      `agents=${String(h.activeAgents)}/${String(h.totalAgents)} ` +
      `interactions=${String(h.totalInteractions)} ` +
      `success=${(h.successRate * 100).toFixed(0)}% ` +
      `latency=${h.avgLatencyMs.toFixed(0)}ms ` +
      `bottlenecks=${String(h.bottlenecks.length)} ` +
      `clusters=${String(h.clusters.length)}`
    );
  }

  renderHealth(health: SwarmHealthMetrics): string {
    return `health: active=${String(health.activeAgents)}/${String(health.totalAgents)} success=${(health.successRate * 100).toFixed(0)}%`;
  }

  renderAgents(agents: AgentStatus[]): string {
    return `agents: ${agents.map((a) => `${a.agentId}:${a.state}`).join(' ')}`;
  }

  renderGraph(graph: GraphSummary): string {
    return `graph: nodes=${String(graph.nodeCount)} edges=${String(graph.edgeCount)} density=${graph.density.toFixed(2)}`;
  }

  renderActivity(activity: ActivityItem[]): string {
    return `activity: ${String(activity.length)} events`;
  }

  renderBottlenecks(bottlenecks: BottleneckInfo[]): string {
    return `bottlenecks: ${bottlenecks.map((b) => `${b.agentId}(${b.severity})`).join(' ')}`;
  }

  renderClusters(clusters: AgentCluster[]): string {
    return `clusters: ${clusters.map((c) => `${c.clusterId}(${String(c.agents.length)})`).join(' ')}`;
  }
}

/**
 * Create a dashboard renderer for the specified format.
 */
export function createDashboardRenderer(config: DashboardConfig): IDashboardRenderer {
  switch (config.format) {
    case 'json':
      return new JsonDashboardRenderer();
    case 'compact':
      return new CompactDashboardRenderer();
    case 'text':
    case 'markdown':
    default:
      return new TextDashboardRenderer(config);
  }
}
