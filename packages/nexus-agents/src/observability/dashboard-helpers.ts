/**
 * nexus-agents/observability - Dashboard Helpers
 *
 * Helper functions for dashboard event summarization and processing.
 * Extracted from dashboard.ts to maintain file size limits.
 *
 * @module observability/dashboard-helpers
 */

import type { AgentEvent, AgentState, InteractionGraph, TraceId } from './swarm-observer-types.js';
import type { GraphEdgeDisplay, GraphSummary } from './dashboard-types.js';
import { getTimeProvider } from '../core/index.js';

/**
 * Extract state from a state_change event.
 */
export function extractState(event: AgentEvent): AgentState {
  if (event.payload.type === 'state_change') {
    return event.payload.newState;
  }
  return 'idle';
}

/**
 * Summarize a state change event.
 */
export function summarizeStateChange(event: AgentEvent): string {
  if (event.payload.type !== 'state_change') return '';
  return `${event.payload.previousState} → ${event.payload.newState}`;
}

/**
 * Summarize a message event.
 */
export function summarizeMessage(event: AgentEvent): string {
  if (event.payload.type !== 'message') return '';
  const { direction, messageType, targetAgentId, sourceAgentId } = event.payload;
  if (direction === 'sent') {
    return `sent ${messageType} to ${targetAgentId ?? 'unknown'}`;
  }
  return `recv ${messageType} from ${sourceAgentId ?? 'unknown'}`;
}

/**
 * Summarize a tool event.
 */
export function summarizeTool(event: AgentEvent): string {
  if (event.payload.type !== 'tool') return '';
  const { phase, toolName, success } = event.payload;
  if (phase === 'invoked') return `invoking ${toolName}`;
  return success === true ? `${toolName} succeeded` : `${toolName} failed`;
}

/**
 * Summarize a memory event.
 */
export function summarizeMemory(event: AgentEvent): string {
  if (event.payload.type !== 'memory') return '';
  return `${event.payload.operation} ${event.payload.memoryType}`;
}

/**
 * Summarize a task event.
 */
export function summarizeTask(event: AgentEvent): string {
  if (event.payload.type !== 'task') return '';
  const { phase, taskDescription, taskId, success } = event.payload;
  if (phase === 'started') return `started: ${taskDescription ?? taskId}`;
  return success === true ? `completed: ${taskId}` : `failed: ${taskId}`;
}

/**
 * Summarize an error event.
 */
export function summarizeError(event: AgentEvent): string {
  if (event.payload.type !== 'error') return '';
  return `error: ${event.payload.errorMessage.slice(0, 30)}`;
}

/**
 * Summarize any agent event into a human-readable string.
 */
export function summarizeEvent(event: AgentEvent): string {
  const summaryHandlers: Record<string, () => string> = {
    state_change: () => summarizeStateChange(event),
    message: () => summarizeMessage(event),
    tool: () => summarizeTool(event),
    memory: () => summarizeMemory(event),
    task: () => summarizeTask(event),
    error: () => summarizeError(event),
  };

  const handler = summaryHandlers[event.payload.type];
  return handler !== undefined ? handler() : event.eventType;
}

/**
 * Get severity level for an agent event.
 */
export function getEventSeverity(event: AgentEvent): 'info' | 'warning' | 'error' {
  if (event.eventType === 'error') {
    return 'error';
  }
  if (event.payload.type === 'tool' && event.payload.success === false) {
    return 'warning';
  }
  if (event.payload.type === 'task' && event.payload.success === false) {
    return 'warning';
  }
  if (event.payload.type === 'state_change' && event.payload.newState === 'error') {
    return 'error';
  }
  return 'info';
}

/**
 * Build top edges from interaction graph.
 */
export function buildTopEdges(graph: InteractionGraph): GraphEdgeDisplay[] {
  const edges = graph.getEdges();
  const edgeMap = new Map<
    string,
    { count: number; successes: number; totalLatency: number; timed: number }
  >();

  for (const edge of edges) {
    const key = `${edge.from}|${edge.to}`;
    const existing = edgeMap.get(key) ?? { count: 0, successes: 0, totalLatency: 0, timed: 0 };
    existing.count++;
    if (edge.outcome === 'success') {
      existing.successes++;
    }
    // `timed` tracks the latency denominator separately from `count` (#5782):
    // the sum was guarded on `durationMs !== undefined` while the divisor was
    // not, so an untimed edge pulled the pair's mean toward zero.
    if (edge.durationMs !== undefined) {
      existing.totalLatency += edge.durationMs;
      existing.timed++;
    }
    edgeMap.set(key, existing);
  }

  return Array.from(edgeMap.entries())
    .map(([key, stats]) => {
      const [from, to] = key.split('|');
      return {
        from: from ?? '',
        to: to ?? '',
        count: stats.count,
        successRate: stats.count > 0 ? stats.successes / stats.count : 0,
        avgLatencyMs: stats.timed > 0 ? stats.totalLatency / stats.timed : 0,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

/**
 * Build graph summary from interaction graph.
 */
export function buildGraphSummary(graph: InteractionGraph): GraphSummary {
  const nodes = graph.getNodes();
  const edges = graph.getEdges();
  const nodeCount = nodes.length;
  const edgeCount = edges.length;

  // Calculate density: actual edges / possible edges
  const possibleEdges = nodeCount * (nodeCount - 1);
  const density = possibleEdges > 0 ? edgeCount / possibleEdges : 0;

  // Get SCCs
  const sccs = graph.getStronglyConnectedComponents();

  // Get centrality
  const centrality = graph.getDegreeCentrality();
  const centralAgents = Array.from(centrality.entries())
    .map(([agentId, cent]) => ({ agentId, centrality: cent }))
    .sort((a, b) => b.centrality - a.centrality)
    .slice(0, 5);

  // Build top edges
  const topEdges = buildTopEdges(graph);

  return {
    nodeCount,
    edgeCount,
    density,
    stronglyConnectedComponents: sccs.length,
    topEdges,
    centralAgents,
  };
}

/**
 * Get active traces from graph edges within time window.
 */
export function getActiveTracesFromGraph(graph: InteractionGraph, timeWindowMs: number): TraceId[] {
  const edges = graph.getEdges();
  const traces = new Set<TraceId>();
  const cutoff = getTimeProvider().now() - timeWindowMs;

  for (const edge of edges) {
    if (new Date(edge.timestamp).getTime() > cutoff) {
      traces.add(edge.traceId);
    }
  }

  return Array.from(traces);
}
